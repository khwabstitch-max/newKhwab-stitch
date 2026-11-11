import { z } from "zod";
import { rateLimitFor } from "./rate-limits.js";
import { objectId, revisionSchema } from "./domain.js";
import { fail, requireFound } from "./errors.js";
import { idOf, pageQuery, pageResult, audit } from "./route-utils.js";
import { revised, assertAdmin } from "./extension-utils.js";

export const reviewInput = z
  .object({
    orderId: objectId,
    rating: z.number().int().min(1).max(5),
    text: z.string().trim().min(5).max(2000),
    consent: z.boolean(),
  })
  .strict();
export function reviewRoutes(app, ctx, auth) {
  const { models } = ctx;
  const writes = rateLimitFor(ctx, "review-write", {
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ctx.limitHandler,
  });
  app.get("/api/reviews", async (req, res) => {
    const q = pageQuery(req.query);
    const filter = { status: "published", consent: true };
    const [items, total] = await Promise.all([
      models.Review.find(filter)
        .select("_id rating text createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.Review.countDocuments(filter),
    ]);
    res.json({
      ...pageResult(items, total, q),
      notice:
        "Selected customer reviews, moderated before public display. This is not the complete review history.",
    });
  });
  app.get("/api/account/reviews", auth, async (req, res) => {
    const q = pageQuery(req.query);
    const filter = { owner: req.user._id };
    const [items, total] = await Promise.all([
      models.Review.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.Review.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q));
  });
  app.post("/api/account/reviews", auth, writes, async (req, res) => {
    const body = reviewInput.parse(req.body);
    let replay = false;
    const result = await ctx.transaction(async (session) => {
      requireFound(
        await models.Order.findOne({
          _id: body.orderId,
          owner: req.user._id,
          status: "delivered",
        }).session(session),
        "An eligible completed request is required to leave a review.",
      );
      const existing = await models.Review.findOne({
        orderId: body.orderId,
      }).session(session);
      if (existing) {
        if (
          existing.rating !== body.rating ||
          existing.text !== body.text ||
          existing.consent !== body.consent
        )
          fail(409, "REVIEW_EXISTS", "You have already reviewed this request.");
        replay = true;
        return existing;
      }
      const [review] = await models.Review.create(
        [{ ...body, owner: req.user._id, status: "pending" }],
        { session },
      );
      await audit(ctx, req, "review.created", "review", review._id, session);
      return review;
    });
    res.status(replay ? 200 : 201).json({ data: result });
  });
  app.get("/api/admin/reviews", auth, async (req, res) => {
    assertAdmin(req);
    const q = pageQuery(req.query, {
      status: z.enum(["pending", "published", "hidden", "rejected"]).optional(),
    });
    const filter = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      models.Review.find(filter)
        .select("+moderationReason")
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.Review.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q));
  });
  app.patch("/api/admin/reviews/:id", auth, writes, async (req, res) => {
    assertAdmin(req);
    const body = z
      .object({
        revision: revisionSchema,
        status: z.enum(["pending", "published", "hidden", "rejected"]),
        reason: z.string().trim().max(1000).default(""),
      })
      .strict()
      .parse(req.body);
    if (["hidden", "rejected"].includes(body.status) && !body.reason)
      fail(
        400,
        "MODERATION_REASON_REQUIRED",
        "Record a moderation reason. Do not hide a review solely because it is critical.",
      );
    const result = await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.Review.findById(idOf(req)).session(session),
      );
      if (body.status === "published" && !current.consent)
        fail(
          409,
          "CONSENT_REQUIRED",
          "This customer did not consent to public display.",
        );
      return revised(
        ctx,
        req,
        models.Review,
        current,
        body.revision,
        { status: body.status, moderationReason: body.reason },
        "review.moderated",
        session,
      );
    });
    res.json({ data: result });
  });
}
