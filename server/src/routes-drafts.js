import { z } from "zod";
import { objectId, revisionSchema } from "./domain.js";
import { fail, requireFound } from "./errors.js";
import { draftReferenceIds, fenceNewReferences } from "./reference-integrity.js";
import {
  pageQuery,
  pageResult,
  idOf,
  checkRevision,
  pinMedia,
  releaseMedia,
  audit,
} from "./route-utils.js";

const draftData = z
  .record(z.string(), z.json())
  .refine(
    (data) => JSON.stringify(data).length <= 60000,
    "Draft is too large.",
  );
const createInput = z
  .object({
    clientId: z.string().uuid(),
    title: z.string().trim().max(150).default("Saved stitching request"),
    data: draftData,
  })
  .strict();
const updateInput = z
  .object({
    revision: revisionSchema,
    title: z.string().trim().max(150).optional(),
    data: draftData,
  })
  .strict();
export function draftMediaIds(data) {
  const ids = [
    ...(Array.isArray(data?.referenceMediaIds) ? data.referenceMediaIds : []),
    ...Object.values(data?.configuration?.components || {})
      .map((component) => component?.referenceMediaId)
      .filter(Boolean),
  ];
  return [...new Set(z.array(objectId).max(15).parse(ids))];
}
const ownDraft = (ctx, req, session = null) =>
  ctx.models.Draft.findOne({ _id: idOf(req), owner: req.user._id }).session(
    session,
  );
export function draftRoutes(app, ctx, auth) {
  app.get("/api/drafts", auth, async (req, res) => {
    const q = pageQuery(req.query),
      filter = { owner: req.user._id, status: "draft" };
    const [items, total] = await Promise.all([
      ctx.models.Draft.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      ctx.models.Draft.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q));
  });
  app.post("/api/drafts", auth, async (req, res) => {
    const body = createInput.parse(req.body),
      filter = { owner: req.user._id, clientId: body.clientId };
    let replay = await ctx.models.Draft.findOne(filter);
    if (replay) return res.json({ data: replay });
    let draft;
    try {
      draft = await ctx.transaction(async (session) => {
        const account = await ctx.models.User.updateOne(
          { _id: req.user._id, disabled: false },
          { $inc: { mutationFence: 1 } },
          { session },
        );
        if (!account.modifiedCount)
          fail(403, "ACCOUNT_DISABLED", "This account is unavailable.");
        await fenceNewReferences(ctx, draftReferenceIds(body.data), {}, session);
        await pinMedia(ctx, draftMediaIds(body.data), session, {
          owner: req.user._id,
          private: true,
          purposes: ["reference", "measurement"],
        });
        const [created] = await ctx.models.Draft.create(
          [{ ...body, ...filter }],
          { session },
        );
        await audit(ctx, req, "draft.created", "draft", created._id, session);
        return created;
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      replay = await ctx.models.Draft.findOne(filter);
      if (!replay) throw error;
      return res.json({ data: replay });
    }
    res.status(201).json({ data: draft });
  });
  app.get("/api/drafts/:id", auth, async (req, res) =>
    res.json({
      data: requireFound(await ownDraft(ctx, req), "Draft not found."),
    }),
  );
  app.patch("/api/drafts/:id", auth, async (req, res) => {
    const body = updateInput.parse(req.body);
    const draft = await ctx.transaction(async (session) => {
      const current = requireFound(
        await ownDraft(ctx, req, session),
        "Draft not found.",
      );
      checkRevision(current, body.revision);
      if (current.status !== "draft")
        fail(409, "DRAFT_SUBMITTED", "This draft has already been submitted.");
      await fenceNewReferences(ctx, draftReferenceIds(body.data), draftReferenceIds(current.data), session);
      const before = draftMediaIds(current.data),
        after = draftMediaIds(body.data);
      await pinMedia(
        ctx,
        after.filter((id) => !before.includes(id)),
        session,
        {
          owner: req.user._id,
          private: true,
          purposes: ["reference", "measurement"],
        },
      );
      await releaseMedia(
        ctx,
        before.filter((id) => !after.includes(id)),
        session,
      );
      const updated = await ctx.models.Draft.findOneAndUpdate(
        {
          _id: current._id,
          owner: req.user._id,
          revision: body.revision,
          status: "draft",
        },
        {
          $set: {
            data: body.data,
            ...(body.title !== undefined ? { title: body.title } : {}),
          },
          $inc: { revision: 1 },
        },
        { returnDocument: "after", session, runValidators: true },
      );
      if (!updated)
        fail(
          409,
          "REVISION_CONFLICT",
          "This draft changed in another tab. Reload before saving.",
        );
      return updated;
    });
    res.json({ data: draft });
  });
  app.delete("/api/drafts/:id", auth, async (req, res) => {
    const { revision } = z
      .object({ revision: revisionSchema })
      .strict()
      .parse(req.body);
    await ctx.transaction(async (session) => {
      const current = requireFound(
        await ownDraft(ctx, req, session),
        "Draft not found.",
      );
      checkRevision(current, revision);
      if (current.status === "draft")
        await releaseMedia(ctx, draftMediaIds(current.data), session);
      const deleted = await ctx.models.Draft.deleteOne(
        { _id: current._id, owner: req.user._id, revision },
        { session },
      );
      if (!deleted.deletedCount)
        fail(
          409,
          "REVISION_CONFLICT",
          "This draft changed. Reload before deleting.",
        );
      await audit(ctx, req, "draft.deleted", "draft", current._id, session);
    });
    res.json({ data: { deleted: true } });
  });
}
