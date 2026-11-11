import { z } from "zod";
import { rateLimitFor } from "./rate-limits.js";
import { objectId, revisionSchema, GARMENTS, phoneSchema } from "./domain.js";
import { fail, requireFound } from "./errors.js";
import {
  idOf,
  pageQuery,
  pageResult,
  pinMedia,
  releaseMedia,
  audit,
  sameId,
} from "./route-utils.js";
import {
  hashRequest,
  revised,
  assertAdmin,
  notify,
  publicApplication,
} from "./extension-utils.js";
import { attachments, retryId, assertRetry } from "./support-domain.js";
import { mediaUrl } from "./media-storage.js";

export const applicationInput = z
  .object({
    clientId: retryId,
    name: z.string().trim().min(2).max(100),
    phone: phoneSchema,
    city: z.string().trim().min(2).max(100),
    skills: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
    garments: z.array(z.enum(GARMENTS)).min(1).max(4),
    experience: z.string().trim().min(2).max(1000),
    availability: z.string().trim().min(2).max(500),
    capacity: z.string().trim().max(300).default(""),
    equipment: z.string().trim().max(1000).default(""),
    introduction: z.string().trim().min(10).max(2000),
    portfolioMediaIds: attachments,
    termsVersion: z.string().trim().min(1).max(80),
    status: z.enum(["draft", "submitted"]).default("submitted"),
  })
  .strict();
const assignmentInput = z
  .object({
    orderId: objectId,
    worker: objectId,
    requirements: z.string().trim().min(3).max(3000),
    deadline: z.iso.datetime().optional(),
  })
  .strict();
const applicationDraftInput = z
  .object({
    clientId: retryId,
    name: z.string().trim().max(100).default(""),
    phone: z.union([z.literal(""), phoneSchema]).default(""),
    city: z.string().trim().max(100).default(""),
    skills: z.array(z.string().trim().min(2).max(80)).max(20).default([]),
    garments: z.array(z.enum(GARMENTS)).max(4).default([]),
    experience: z.string().trim().max(1000).default(""),
    availability: z.string().trim().max(500).default(""),
    capacity: z.string().trim().max(300).default(""),
    equipment: z.string().trim().max(1000).default(""),
    introduction: z.string().trim().max(2000).default(""),
    portfolioMediaIds: attachments,
    termsVersion: z.string().trim().max(80).default(""),
    status: z.literal("draft"),
  })
  .strict();
const applicationTransitions = {
  draft: ["submitted", "withdrawn"],
  submitted: ["under_review", "withdrawn"],
  under_review: ["information_requested", "approved", "rejected", "withdrawn"],
  information_requested: ["under_review", "withdrawn"],
  approved: [],
  rejected: [],
  withdrawn: [],
};
const workerOrder = (order) => ({
  _id: order._id,
  orderNumber: order.orderNumber,
  garment: order.garment,
  quantity: order.quantity,
  status: order.status,
  design: order.designSnapshot
    ? {
        title: order.designSnapshot.title,
        code: order.designSnapshot.code,
        designDetails: order.designSnapshot.designDetails,
      }
    : null,
  configuration: order.configuration,
  preferences: order.preferences,
  measurements: order.measurements,
  referenceMediaIds: order.referenceMediaIds,
});
const safeJob = (job) => {
  const {
    requestHash: _hash,
    idempotencyKey: _key,
    createdBy: _creator,
    ...safe
  } = job?.toObject ? job.toObject() : job;
  return safe;
};
async function approvedWorker(ctx, userId, session) {
  return requireFound(
    await ctx.models.WorkerProfile.findOne({
      owner: userId,
      active: true,
    }).session(session || null),
    "Approved worker access is required.",
  );
}
async function ownedJob(ctx, req, id, session) {
  await approvedWorker(ctx, req.user._id, session);
  return requireFound(
    await ctx.models.WorkAssignment.findOne({
      _id: objectId.parse(String(id)),
      worker: req.user._id,
      active: true,
    }).session(session || null),
    "Assigned work not found.",
  );
}
export function workerRoutes(app, ctx, auth) {
  const { models } = ctx;
  const writes = rateLimitFor(ctx, "worker-write", {
    windowMs: 60 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ctx.limitHandler,
  });
  app.get("/api/applications", auth, async (req, res) => {
    const q = pageQuery(req.query);
    const filter = { owner: req.user._id };
    const [items, total] = await Promise.all([
      models.WorkerApplication.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.WorkerApplication.countDocuments(filter),
    ]);
    res.json(pageResult(items.map(publicApplication), total, q));
  });
  app.post("/api/applications", auth, writes, async (req, res) => {
    const body = (
      req.body.status === "draft" ? applicationDraftInput : applicationInput
    ).parse(req.body);
    let replay = false;
    const result = await ctx.transaction(async (session) => {
      const existing = await models.WorkerApplication.findOne({
        owner: req.user._id,
        clientId: body.clientId,
      }).session(session);
      if (existing) {
        replay = true;
        return assertRetry(existing, body);
      }
      await pinMedia(ctx, body.portfolioMediaIds, session, {
        owner: req.user._id,
        private: true,
        purposes: ["reference"],
      });
      const [application] = await models.WorkerApplication.create(
        [
          {
            ...body,
            owner: req.user._id,
            requestHash: hashRequest(body),
            timeline: [
              {
                status: body.status,
                at: new Date(),
                actor: String(req.user._id),
              },
            ],
          },
        ],
        { session },
      );
      const [conversation] = await models.Conversation.create(
        [
          {
            owner: req.user._id,
            kind: "application",
            contextId: application._id,
          },
        ],
        { session },
      );
      application.conversationId = conversation._id;
      await application.save({ session });
      await audit(
        ctx,
        req,
        "application.created",
        "workerApplication",
        application._id,
        session,
      );
      return application;
    });
    res.status(replay ? 200 : 201).json({ data: publicApplication(result) });
  });
  app.get("/api/applications/:id", auth, async (req, res) => {
    const application = requireFound(
      await models.WorkerApplication.findOne({
        _id: idOf(req),
        ...(req.user.role === "admin" ? {} : { owner: req.user._id }),
      }),
    );
    res.json({ data: publicApplication(application) });
  });
  app.patch("/api/applications/:id", auth, writes, async (req, res) => {
    const schema =
      req.body.status === "draft" ? applicationDraftInput : applicationInput;
    const { revision, ...body } = schema
      .omit({ clientId: true })
      .extend({ revision: revisionSchema })
      .parse(req.body);
    const result = await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.WorkerApplication.findOne({
          _id: idOf(req),
          owner: req.user._id,
        }).session(session),
      );
      const updatedHash = hashRequest({ ...body, clientId: current.clientId });
      if (current.status === "submitted" && current.requestHash === updatedHash)
        return current;
      if (!["draft", "information_requested"].includes(current.status))
        fail(
          409,
          "APPLICATION_LOCKED",
          "This application is under assessment and cannot be edited now.",
        );
      const added = body.portfolioMediaIds.filter(
        (id) => !current.portfolioMediaIds.some((old) => sameId(old, id)),
      );
      const removed = current.portfolioMediaIds.filter(
        (id) => !body.portfolioMediaIds.includes(String(id)),
      );
      await pinMedia(ctx, added, session, {
        owner: req.user._id,
        private: true,
        purposes: ["reference"],
      });
      await releaseMedia(ctx, removed, session);
      const status =
        current.status === "information_requested" && body.status === "draft"
          ? "information_requested"
          : body.status;
      return revised(
        ctx,
        req,
        models.WorkerApplication,
        current,
        revision,
        { ...body, status, requestHash: updatedHash },
        "application.updated",
        session,
        {
          $push: {
            timeline: { status, at: new Date(), actor: String(req.user._id) },
          },
        },
      );
    });
    res.json({ data: publicApplication(result) });
  });
  app.post("/api/applications/:id/withdraw", auth, writes, async (req, res) => {
    const { revision } = z
      .object({ revision: revisionSchema })
      .strict()
      .parse(req.body);
    const result = await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.WorkerApplication.findOne({
          _id: idOf(req),
          owner: req.user._id,
        }).session(session),
      );
      if (!applicationTransitions[current.status]?.includes("withdrawn"))
        fail(
          409,
          "APPLICATION_LOCKED",
          "This application cannot be withdrawn at its current stage. Contact the team if you need assistance.",
        );
      return revised(
        ctx,
        req,
        models.WorkerApplication,
        current,
        revision,
        { status: "withdrawn" },
        "application.withdrawn",
        session,
        {
          $push: {
            timeline: {
              status: "withdrawn",
              at: new Date(),
              actor: String(req.user._id),
            },
          },
        },
      );
    });
    res.json({ data: publicApplication(result) });
  });
  app.get("/api/admin/applications", auth, async (req, res) => {
    assertAdmin(req);
    const q = pageQuery(req.query, { status: z.string().max(40).optional() });
    const filter = q.status
      ? { status: q.status }
      : { status: { $ne: "draft" } };
    const [items, total] = await Promise.all([
      models.WorkerApplication.find(filter)
        .select("+internalNotes")
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.WorkerApplication.countDocuments(filter),
    ]);
    res.json(
      pageResult(
        items.map(({ requestHash: _hash, clientId: _client, ...safe }) => safe),
        total,
        q,
      ),
    );
  });
  app.patch("/api/admin/applications/:id", auth, writes, async (req, res) => {
    assertAdmin(req);
    const body = z
      .object({
        revision: revisionSchema,
        status: z.enum([
          "under_review",
          "information_requested",
          "approved",
          "rejected",
        ]),
        reason: z.string().trim().max(2000).default(""),
        internalNotes: z.string().trim().max(4000).default(""),
      })
      .strict()
      .parse(req.body);
    if (
      ["information_requested", "rejected"].includes(body.status) &&
      !body.reason
    )
      fail(
        400,
        "REASON_REQUIRED",
        "Provide a specific reason or information request.",
      );
    const result = await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.WorkerApplication.findById(idOf(req)).session(session),
      );
      if (!applicationTransitions[current.status]?.includes(body.status))
        fail(
          409,
          "INVALID_TRANSITION",
          "Review the application before approving or rejecting it.",
        );
      const updated = await revised(
        ctx,
        req,
        models.WorkerApplication,
        current,
        body.revision,
        {
          status: body.status,
          reason: body.reason,
          internalNotes: body.internalNotes,
        },
        "application." + body.status,
        session,
        {
          $push: {
            timeline: {
              status: body.status,
              note: body.reason,
              at: new Date(),
              actor: String(req.user._id),
            },
          },
        },
      );
      if (body.status === "approved") {
        requireFound(
          await models.User.findOne({
            _id: current.owner,
            disabled: false,
          }).session(session),
          "The applicant account is unavailable.",
        );
        // Worker access is additive. Never change the account role or order owner.
        await models.WorkerProfile.findOneAndUpdate(
          { owner: current.owner },
          {
            $set: {
              applicationId: current._id,
              skills: current.skills,
              garments: current.garments,
              active: true,
              assistancePermission: false,
            },
          },
          {
            upsert: true,
            returnDocument: "after",
            session,
            runValidators: true,
          },
        );
      }
      await notify(
        ctx,
        current.owner,
        "application_update",
        current._id,
        session,
      );
      return updated;
    });
    res.json({ data: publicApplication(result) });
  });
  app.get("/api/admin/workers", auth, async (req, res) => {
    assertAdmin(req);
    const q = pageQuery(req.query);
    const [items, total] = await Promise.all([
      models.WorkerProfile.find()
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.WorkerProfile.countDocuments(),
    ]);
    res.json(pageResult(items.map(safeJob), total, q));
  });
  app.patch("/api/admin/workers/:id", auth, writes, async (req, res) => {
    assertAdmin(req);
    const body = z
      .object({
        revision: revisionSchema,
        active: z.boolean(),
        assistancePermission: z.boolean(),
      })
      .strict()
      .parse(req.body);
    const result = await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.WorkerProfile.findById(idOf(req)).session(session),
      );
      return revised(
        ctx,
        req,
        models.WorkerProfile,
        current,
        body.revision,
        {
          active: body.active,
          assistancePermission: body.assistancePermission,
        },
        "worker.permissions_updated",
        session,
      );
    });
    res.json({ data: result });
  });
  app.get("/api/admin/assignments", auth, async (req, res) => {
    assertAdmin(req);
    const q = pageQuery(req.query, { orderId: objectId.optional() });
    const filter = q.orderId ? { orderId: q.orderId } : {};
    const [items, total] = await Promise.all([
      models.WorkAssignment.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.WorkAssignment.countDocuments(filter),
    ]);
    res.json(pageResult(items.map(safeJob), total, q));
  });
  app.post("/api/admin/assignments", auth, writes, async (req, res) => {
    assertAdmin(req);
    const body = assignmentInput.parse(req.body);
    const idempotencyKey = req.get("Idempotency-Key")
      ? retryId.parse(req.get("Idempotency-Key"))
      : undefined;
    let replay = false;
    const result = await ctx.transaction(async (session) => {
      if (idempotencyKey) {
        const existing = await models.WorkAssignment.findOne({
          createdBy: req.user._id,
          idempotencyKey,
        }).session(session);
        if (existing) {
          replay = true;
          return assertRetry(existing, body);
        }
      }
      await approvedWorker(ctx, body.worker, session);
      requireFound(
        await models.User.findOne({
          _id: body.worker,
          disabled: false,
        }).session(session),
        "Worker account is unavailable.",
      );
      const order = requireFound(
        await models.Order.findById(body.orderId).session(session),
      );
      if (["cancelled", "rejected", "delivered"].includes(order.status))
        fail(409, "ORDER_CLOSED", "Closed orders cannot be assigned.");
      // Serialize assignment changes on the order without advancing its stage.
      await models.Order.updateOne(
        { _id: order._id },
        { $inc: { revision: 1 } },
        { session },
      );
      await models.WorkAssignment.updateMany(
        { orderId: body.orderId, active: true },
        {
          $set: { active: false },
          $inc: { revision: 1 },
          $push: {
            history: {
              action: "reassigned",
              actor: String(req.user._id),
              at: new Date(),
            },
          },
        },
        { session },
      );
      const [job] = await models.WorkAssignment.create(
        [
          {
            ...body,
            createdBy: req.user._id,
            idempotencyKey,
            requestHash: hashRequest(body),
            deadline: body.deadline ? new Date(body.deadline) : undefined,
            history: [
              {
                action: "assigned",
                actor: String(req.user._id),
                at: new Date(),
              },
            ],
          },
        ],
        { session },
      );
      const [conversation] = await models.Conversation.create(
        [{ owner: body.worker, kind: "assignment", contextId: job._id }],
        { session },
      );
      job.conversationId = conversation._id;
      await job.save({ session });
      await audit(
        ctx,
        req,
        "work.assigned",
        "workAssignment",
        job._id,
        session,
      );
      await notify(ctx, body.worker, "work_assigned", job._id, session);
      return job;
    });
    res.status(replay ? 200 : 201).json({ data: safeJob(result) });
  });
  app.patch("/api/admin/assignments/:id", auth, writes, async (req, res) => {
    assertAdmin(req);
    const body = z
      .object({
        revision: revisionSchema,
        active: z.boolean(),
        requirements: z.string().trim().min(3).max(3000),
        deadline: z.iso.datetime().nullable().optional(),
      })
      .strict()
      .parse(req.body);
    const result = await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.WorkAssignment.findById(idOf(req)).session(session),
      );
      if (body.active) {
        await approvedWorker(ctx, current.worker, session);
        if (
          await models.WorkAssignment.exists({
            orderId: current.orderId,
            active: true,
            _id: { $ne: current._id },
          }).session(session)
        )
          fail(
            409,
            "ACTIVE_ASSIGNMENT",
            "Another worker has the active assignment. Reassign the order instead.",
          );
      }
      return revised(
        ctx,
        req,
        models.WorkAssignment,
        current,
        body.revision,
        {
          active: body.active,
          requirements: body.requirements,
          ...(body.deadline !== undefined
            ? { deadline: body.deadline ? new Date(body.deadline) : null }
            : {}),
        },
        "work.updated",
        session,
        {
          $push: {
            history: {
              action: body.active ? "updated" : "unassigned",
              actor: String(req.user._id),
              at: new Date(),
            },
          },
        },
      );
    });
    res.json({ data: result });
  });
  app.get("/api/worker/profile", auth, async (req, res) =>
    res.json({ data: await approvedWorker(ctx, req.user._id) }),
  );
  app.get("/api/worker/jobs", auth, async (req, res) => {
    await approvedWorker(ctx, req.user._id);
    const q = pageQuery(req.query);
    const filter = { worker: req.user._id, active: true };
    const [items, total] = await Promise.all([
      models.WorkAssignment.find(filter)
        .sort({ deadline: 1, _id: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.WorkAssignment.countDocuments(filter),
    ]);
    res.json(pageResult(items.map(safeJob), total, q));
  });
  app.get("/api/worker/jobs/:id", auth, async (req, res) => {
    const job = await ownedJob(ctx, req, idOf(req));
    const order = requireFound(await models.Order.findById(job.orderId));
    res.json({ data: { ...safeJob(job), order: workerOrder(order) } });
  });
  app.post("/api/worker/jobs/:id/progress", auth, writes, async (req, res) => {
    const body = z
      .object({
        revision: revisionSchema,
        clientId: retryId,
        stage: z.enum([
          "cutting",
          "stitching",
          "quality_check",
          "ready_for_review",
          "blocked",
        ]),
        note: z.string().trim().min(3).max(2000),
      })
      .strict()
      .parse(req.body);
    const result = await ctx.transaction(async (session) => {
      const job = await ownedJob(ctx, req, idOf(req), session);
      const existing = job.progress.find(
        (item) => item.clientId === body.clientId,
      );
      if (existing) {
        if (existing.stage !== body.stage || existing.note !== body.note)
          fail(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This retry key was used for different progress.",
          );
        return job;
      }
      return revised(
        ctx,
        req,
        models.WorkAssignment,
        job,
        body.revision,
        {},
        "work.progress_proposed",
        session,
        {
          $push: {
            progress: {
              clientId: body.clientId,
              stage: body.stage,
              note: body.note,
              at: new Date(),
              actor: String(req.user._id),
              adminConfirmationRequired: true,
            },
          },
        },
      );
    });
    res.json({ data: safeJob(result) });
  });
  app.get(
    "/api/worker/jobs/:id/attachments/:mediaId",
    auth,
    async (req, res) => {
      const job = await ownedJob(ctx, req, idOf(req));
      const mediaId = objectId.parse(req.params.mediaId);
      const order = requireFound(
        await models.Order.findOne({
          _id: job.orderId,
          referenceMediaIds: mediaId,
        }),
      );
      const media = requireFound(
        await models.MediaAsset.findOne({
          _id: mediaId,
          owner: order.owner,
          private: true,
          deletingAt: null,
        }),
      );
      res.json({
        data: { url: mediaUrl(ctx.images, media, 300), expiresIn: 300 },
      });
    },
  );
}
