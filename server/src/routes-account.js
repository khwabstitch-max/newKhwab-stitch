import { z } from "zod";
import { GARMENTS, objectId, revisionSchema } from "./domain.js";
import { requireFound, fail } from "./errors.js";
import {
  idOf,
  pageQuery,
  pageResult,
  audit,
  checkRevision,
} from "./route-utils.js";
import { revised } from "./extension-utils.js";

const addressInput = z
  .object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(60),
    line1: z.string().trim().min(5).max(200),
    line2: z.string().trim().max(200).default(""),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    pin: z.string().regex(/^[1-9]\d{5}$/),
  })
  .strict();
export const measurementProfileInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    garments: z.array(z.enum(GARMENTS)).min(1).max(4),
    unit: z.enum(["in", "cm"]),
    method: z.enum(["body", "garment"]),
    values: z
      .record(
        z.string().regex(/^[a-z][a-zA-Z]{0,39}$/),
        z.number().finite().positive().max(10000),
      )
      .refine(
        (v) => Object.keys(v).length > 0 && Object.keys(v).length <= 40,
        "Provide between one and forty measurements.",
      ),
    notes: z.string().trim().max(1000).default(""),
  })
  .strict();

export function accountRoutes(app, ctx, auth) {
  const { models } = ctx;
  app.get("/api/account/overview", auth, async (req, res) => {
    const owner = req.user._id;
    const [
      activeOrders,
      quotesAwaitingApproval,
      savedDrafts,
      openTickets,
      unreadNotifications,
      recentOrders,
      applications,
      worker,
    ] = await Promise.all([
      models.Order.countDocuments({
        owner,
        status: { $nin: ["delivered", "cancelled", "rejected"] },
      }),
      models.Order.countDocuments({ owner, status: "quote_sent" }),
      models.Draft
        ? models.Draft.countDocuments({ owner, status: "draft" })
        : 0,
      models.SupportTicket.countDocuments({
        owner,
        status: { $nin: ["resolved", "closed"] },
      }),
      models.Notification.countDocuments({ owner, readAt: null }),
      models.Order.find({ owner })
        .select(
          "orderNumber garment quantity status revision acceptedQuote createdAt updatedAt timeline",
        )
        .sort({ createdAt: -1, _id: -1 })
        .limit(5)
        .lean(),
      models.WorkerApplication.countDocuments({
        owner,
        status: { $nin: ["rejected", "withdrawn"] },
      }),
      models.WorkerProfile.findOne({ owner, active: true })
        .select("_id skills garments assistancePermission")
        .lean(),
    ]);
    res.json({
      data: {
        activeOrders,
        quotesAwaitingApproval,
        savedDrafts,
        openTickets,
        unreadNotifications,
        applications,
        recentOrders,
        worker: worker || null,
        actionsNeeded:
          quotesAwaitingApproval +
          (await models.SupportTicket.countDocuments({
            owner,
            status: "awaiting_customer",
          })),
      },
    });
  });
  app.get("/api/account/preferences", auth, async (req, res) =>
    res.json({
      data: (await models.AccountPreferences.findOne({
        owner: req.user._id,
      }).lean()) || {
        revision: 0,
        addresses: [],
        communications: { orderUpdates: true, marketing: false },
      },
    }),
  );
  app.patch("/api/account/preferences", auth, async (req, res) => {
    const body = z
      .object({
        revision: revisionSchema,
        addresses: z
          .array(addressInput)
          .max(10)
          .refine(
            (items) => new Set(items.map((v) => v.id)).size === items.length,
            "Address identifiers must be unique.",
          ),
        communications: z
          .object({ orderUpdates: z.boolean(), marketing: z.boolean() })
          .strict(),
      })
      .strict()
      .parse(req.body);
    const result = await ctx.transaction(async (session) => {
      let current = await models.AccountPreferences.findOne({
        owner: req.user._id,
      }).session(session);
      if (!current) {
        if (body.revision !== 0)
          fail(
            409,
            "REVISION_CONFLICT",
            "Refresh your preferences before editing.",
          );
        [current] = await models.AccountPreferences.create(
          [{ owner: req.user._id }],
          { session },
        );
      }
      return revised(
        ctx,
        req,
        models.AccountPreferences,
        current,
        body.revision,
        { addresses: body.addresses, communications: body.communications },
        "account.preferences_updated",
        session,
      );
    });
    res.json({ data: result });
  });
  app.get("/api/measurements", auth, async (req, res) => {
    const q = pageQuery(req.query, { garment: z.enum(GARMENTS).optional() });
    const filter = {
      owner: req.user._id,
      ...(q.garment ? { garments: q.garment } : {}),
    };
    const [items, total] = await Promise.all([
      models.MeasurementProfile.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.MeasurementProfile.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q));
  });
  app.post("/api/measurements", auth, async (req, res) => {
    const body = measurementProfileInput.parse(req.body);
    const result = await ctx.transaction(async (session) => {
      if (
        (await models.MeasurementProfile.countDocuments({
          owner: req.user._id,
        }).session(session)) >= 20
      )
        fail(
          409,
          "PROFILE_LIMIT",
          "You can save up to twenty measurement profiles.",
        );
      const [created] = await models.MeasurementProfile.create(
        [{ ...body, owner: req.user._id }],
        { session },
      );
      await audit(
        ctx,
        req,
        "measurements.created",
        "measurementProfile",
        created._id,
        session,
      );
      return created;
    });
    res.status(201).json({ data: result });
  });
  app.patch("/api/measurements/:id", auth, async (req, res) => {
    const { revision, ...body } = measurementProfileInput
      .extend({ revision: revisionSchema })
      .parse(req.body);
    const result = await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.MeasurementProfile.findOne({
          _id: idOf(req),
          owner: req.user._id,
        }).session(session),
      );
      return revised(
        ctx,
        req,
        models.MeasurementProfile,
        current,
        revision,
        body,
        "measurements.updated",
        session,
      );
    });
    res.json({ data: result });
  });
  app.delete("/api/measurements/:id", auth, async (req, res) => {
    const { revision } = z
      .object({ revision: revisionSchema })
      .strict()
      .parse(req.body);
    await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.MeasurementProfile.findOne({
          _id: idOf(req),
          owner: req.user._id,
        }).session(session),
      );
      checkRevision(current, revision);
      const removed = await models.MeasurementProfile.deleteOne(
        { _id: current._id, owner: req.user._id, revision },
        { session },
      );
      if (!removed.deletedCount)
        fail(409, "REVISION_CONFLICT", "This profile changed. Refresh it.");
      await audit(
        ctx,
        req,
        "measurements.deleted",
        "measurementProfile",
        current._id,
        session,
      );
    });
    res.json({ data: { deleted: true } });
  });
  app.get("/api/notifications", auth, async (req, res) => {
    const q = pageQuery(req.query, {
      unread: z.enum(["true", "false"]).optional(),
    });
    const filter = {
      owner: req.user._id,
      ...(q.unread === "true" ? { readAt: null } : {}),
    };
    const [items, total] = await Promise.all([
      models.Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.Notification.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q));
  });
  app.post("/api/notifications/:id/read", auth, async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    const result = requireFound(
      await models.Notification.findOneAndUpdate(
        { _id: objectId.parse(req.params.id), owner: req.user._id },
        { $set: { readAt: new Date() } },
        { returnDocument: "after" },
      ),
    );
    res.json({ data: result });
  });
}
