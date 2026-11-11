import { z } from "zod";
import { releaseCommittedBenefits, completeCommerceOrder } from "./commerce-service.js";
import {
  designInput,
  categoryInput,
  optionInput,
  settingsInput,
  defaultSettings,
  quoteInput,
  statusInput,
  checkTransition,
  revisionSchema,
  STATUSES,
  GARMENTS,
} from "./domain.js";
import { fail, requireFound } from "./errors.js";
import { imageIds, publicImages } from "./visual-catalogue.js";
import { fenceNewReferences } from "./reference-integrity.js";
import {
  idOf,
  pageQuery,
  pageResult,
  plain,
  checkRevision,
  changeCategory,
  pinMedia,
  releaseMedia,
  sameId,
  audit,
  safeOrder,
  ownedOrder,
  searchField,
  escaped,
} from "./route-utils.js";
const revisionBody = (schema, body) => {
  const parsed = z
    .object({ revision: revisionSchema })
    .passthrough()
    .parse(body);
  const { revision, ...fields } = parsed;
  return { revision, fields: schema.parse(fields) };
};
const difference = (left, right) =>
  left.filter((x) => !right.some((y) => sameId(x, y)));
async function validateDefaults(ctx, fields, session, previous = {}) {
  await fenceNewReferences(ctx, { optionIds: [...Object.values(fields.defaultComponents || {}), ...(fields.includedAddonIds || [])] }, { optionIds: [...Object.values(previous.defaultComponents || {}), ...(previous.includedAddonIds || [])] }, session);
  for (const [kind, id] of Object.entries(fields.defaultComponents || {})) {
    const valid = await ctx.models.DesignOption.exists({
      _id: id,
      kind,
      active: true,
      status: { $nin: ["draft", "archived"] },
      garments: fields.garment,
    }).session(session);
    if (!valid)
      fail(
        400,
        "INVALID_COMPONENT",
        "Catalogue defaults must use active compatible component options.",
      );
  }
  for (const id of fields.includedAddonIds || []) {
    const option = await ctx.models.DesignOption.findOne({ _id: id, kind: "extra", active: true, status: { $nin: ["draft", "archived"] }, garments: fields.garment }).session(session).lean();
    if (!option || (option.serviceType || "stitching") !== "stitching")
      fail(400, "INVALID_INCLUDED_ADDON", "Included additions must use published, compatible finishing options; future craft services are unavailable.");
  }
  const defaults = await ctx.models.DesignOption.find({ _id: { $in: [...Object.values(fields.defaultComponents || {}), ...(fields.includedAddonIds || [])] } }).session(session).lean();
  const sleeve = defaults.find((item) => item.kind === "sleeve"), length = defaults.find((item) => item.kind === "sleeveLength");
  if (sleeve && length && length.lengthStyle !== "sleeveless" && !sleeve.compatibleLengthStyles?.includes(length.lengthStyle))
    fail(400, "INVALID_COMPONENT_PAIR", "Configure the original sleeve design as compatible with its original sleeve length before mapping this pair.");
  for (const left of defaults) for (const right of defaults)
    if (String(left._id) !== String(right._id) && left.incompatibleOptionIds?.some((id) => sameId(id, right._id)))
      fail(400, "INVALID_COMPONENT_PAIR", "Catalogue defaults and included additions contain an explicitly incompatible pair.");
}
export function adminRoutes(app, ctx, auth, admin) {
  const { models } = ctx;
  const base = "/api/admin";
  app.use(base, auth, admin);
  app.get(base + "/dashboard", async (_req, res) => {
    const [
      totalOrders,
      pendingReview,
      activeOrders,
      designs,
      customers,
      recentOrders,
      counts,
    ] = await Promise.all([
      models.Order.countDocuments(),
      models.Order.countDocuments({
        status: { $in: ["request_received", "under_review"] },
      }),
      models.Order.countDocuments({
        status: { $nin: ["delivered", "cancelled", "rejected"] },
      }),
      models.Design.countDocuments(),
      models.User.countDocuments({ role: "customer" }),
      models.Order.find().sort({ createdAt: -1, _id: -1 }).limit(6).lean(),
      models.Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    res.json({
      data: {
        counts: {
          totalOrders,
          pendingReview,
          activeOrders,
          designs,
          customers,
        },
        recentOrders: recentOrders.map(safeOrder),
        statusCounts: counts.map((c) => ({ status: c._id, count: c.count })),
      },
    });
  });
  app.get(base + "/designs", async (req, res) => {
    const q = pageQuery(req.query, {
      status: z.enum(["draft", "published", "archived"]).optional(),
      garment: z.enum(GARMENTS).optional(),
      search: searchField,
    });
    const filter = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.garment ? { garment: q.garment } : {}),
      ...(q.search
        ? {
            $or: ["title", "titleHi"].map((field) => ({
              [field]: { $regex: escaped(q.search), $options: "i" },
            })),
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      models.Design.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.Design.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q));
  });
  app.get(base + "/designs/:id", async (req, res) =>
    res.json({
      data: requireFound(await models.Design.findById(idOf(req)).lean()),
    }),
  );
  app.post(base + "/designs", async (req, res) => {
    const body = designInput.parse(req.body);
    const design = await ctx.transaction(async (session) => {
      await validateDefaults(ctx, body, session);
      await changeCategory(ctx, null, body.category, session);
      await pinMedia(ctx, body.mediaIds, session, {
        private: false,
        purposes: ["catalogue"],
      });
      const [created] = await models.Design.create([body], { session });
      await audit(ctx, req, "design.created", "design", created._id, session, {
        status: created.status,
      });
      return created;
    });
    res.status(201).json({ data: design });
  });
  app.patch(base + "/designs/:id", async (req, res) => {
    const { revision, fields } = revisionBody(designInput, req.body);
    const design = await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.Design.findById(idOf(req)).session(session),
      );
      checkRevision(current, revision);
      await validateDefaults(ctx, fields, session, current);
      await changeCategory(ctx, current.category, fields.category, session);
      await pinMedia(
        ctx,
        difference(fields.mediaIds, current.mediaIds),
        session,
        { private: false, purposes: ["catalogue"] },
      );
      await releaseMedia(
        ctx,
        difference(current.mediaIds, fields.mediaIds),
        session,
      );
      const updated = await models.Design.findOneAndUpdate(
        { _id: current._id, revision },
        { $set: fields, $inc: { revision: 1 } },
        { returnDocument: "after", session, runValidators: true },
      );
      if (!updated)
        fail(409, "REVISION_CONFLICT", "This design changed. Refresh it.");
      await audit(ctx, req, "design.updated", "design", current._id, session, {
        status: updated.status,
      });
      return updated;
    });
    res.json({ data: design });
  });
  app.delete(base + "/designs/:id", async (req, res) => {
    const { revision } = z
      .object({ revision: revisionSchema })
      .strict()
      .parse(req.body);
    await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.Design.findById(idOf(req)).session(session),
      );
      checkRevision(current, revision);
      if (current.status !== "draft" || current.usedCount > 0)
        fail(
          409,
          "DESIGN_IN_USE",
          "Only unused drafts can be deleted. Archive used designs instead.",
        );
      await changeCategory(ctx, current.category, null, session);
      await releaseMedia(ctx, current.mediaIds, session);
      const removed = await models.Design.deleteOne(
        { _id: current._id, revision, usedCount: 0, status: "draft" },
        { session },
      );
      if (!removed.deletedCount)
        fail(409, "REVISION_CONFLICT", "The design changed. Refresh it.");
      await audit(ctx, req, "design.deleted", "design", current._id, session);
    });
    res.json({ data: { deleted: true } });
  });
  for (const [name, Model, schema] of [
    ["categories", models.Category, categoryInput],
    ["options", models.DesignOption, optionInput],
  ]) {
    app.get(base + "/" + name, async (req, res) => {
      const q = pageQuery(req.query);
      const [items, total] = await Promise.all([
        Model.find()
          .sort(name === "options" ? { kind: 1, displayOrder: 1, name: 1, _id: 1 } : { name: 1, _id: 1 })
          .skip((q.page - 1) * q.limit)
          .limit(q.limit)
          .lean(),
        Model.countDocuments(),
      ]);
      const data = name === "options" ? await Promise.all(items.map(async item => {
        const images = await publicImages(ctx, item);
        return { ...item, images, imageUrl: images[0]?.url || null };
      })) : items;
      res.json(pageResult(data, total, q));
    });
    app.post(base + "/" + name, async (req, res) => {
      const body = schema.parse(req.body);
      const record = await ctx.transaction(async (session) => {
        if (name === "options") await fenceNewReferences(ctx, { optionIds: body.incompatibleOptionIds || [] }, {}, session);
        if (name === "options" && imageIds(body).length)
          await pinMedia(ctx, imageIds(body), session, {
            private: false,
            purposes: ["catalogue"],
          });
        const [created] = await Model.create([body], { session });
        await audit(ctx, req, name + ".created", name, created._id, session);
        return created;
      });
      res.status(201).json({ data: record });
    });
    app.patch(base + "/" + name + "/:id", async (req, res) => {
      const { revision, fields } = revisionBody(schema, req.body);
      const record = await ctx.transaction(async (session) => {
        const current = requireFound(
          await Model.findById(idOf(req)).session(session),
        );
        checkRevision(current, revision);
        if (name === "options") await fenceNewReferences(ctx, { optionIds: fields.incompatibleOptionIds || [] }, { optionIds: current.incompatibleOptionIds || [] }, session);
        if (
          name === "options" &&
          (fields.imageMediaId !== undefined || fields.imageMediaIds !== undefined)
        ) {
          const before = imageIds(current), after = imageIds({ ...current.toObject(), ...fields });
          if (after.some(id => !before.includes(id)))
            await pinMedia(ctx, after.filter(id => !before.includes(id)), session, {
              private: false,
              purposes: ["catalogue"],
            });
          await releaseMedia(ctx, before.filter(id => !after.includes(id)), session);
        }
        const updated = await Model.findOneAndUpdate(
          { _id: current._id, revision },
          { $set: fields, $inc: { revision: 1 } },
          { returnDocument: "after", session, runValidators: true },
        );
        if (!updated)
          fail(409, "REVISION_CONFLICT", "This record changed. Refresh it.");
        await audit(ctx, req, name + ".updated", name, current._id, session);
        return updated;
      });
      res.json({ data: record });
    });
    app.delete(base + "/" + name + "/:id", async (req, res) => {
      const { revision } = z
        .object({ revision: revisionSchema })
        .strict()
        .parse(req.body);
      await ctx.transaction(async (session) => {
        const current = requireFound(
          await Model.findById(idOf(req)).session(session),
        );
        checkRevision(current, revision);
        if (name === "options") {
          const archived = await Model.updateOne(
            { _id: current._id, revision },
            { $set: { active: false }, $inc: { revision: 1 } },
            { session },
          );
          if (!archived.modifiedCount)
            fail(409, "REVISION_CONFLICT", "This option changed. Refresh it.");
          await audit(
            ctx,
            req,
            "options.archived",
            "options",
            current._id,
            session,
          );
          return;
        }
        if (name === "categories" && current.designRefs > 0)
          fail(
            409,
            "CATEGORY_IN_USE",
            "This category is used by designs. Reassign those designs before deleting it.",
          );
        const removed = await Model.deleteOne(
          {
            _id: current._id,
            revision,
            ...(name === "categories" ? { designRefs: 0 } : {}),
          },
          { session },
        );
        if (!removed.deletedCount)
          fail(409, "REVISION_CONFLICT", "This record changed. Refresh it.");
        await audit(ctx, req, name + ".deleted", name, current._id, session);
      });
      res.json({
        data: name === "options" ? { archived: true } : { deleted: true },
      });
    });
  }
  app.get(base + "/orders", async (req, res) => {
    const q = pageQuery(req.query, {
      status: z.enum(STATUSES).optional(),
      search: searchField,
    });
    const filter = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? { orderNumber: { $regex: escaped(q.search), $options: "i" } }
        : {}),
    };
    const [items, total] = await Promise.all([
      models.Order.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.Order.countDocuments(filter),
    ]);
    res.json(pageResult(items.map(safeOrder), total, q));
  });
  app.get(base + "/orders/:id", async (req, res) =>
    res.json({ data: safeOrder(await ownedOrder(ctx, req)) }),
  );
  app.post(base + "/orders/:id/quotes", async (req, res) => {
    const body = quoteInput.parse(req.body);
    const order = await ctx.transaction(async (session) => {
      const current = await ownedOrder(ctx, req, session);
      checkRevision(current, body.revision);
      if (!["under_review", "quote_sent"].includes(current.status))
        fail(
          409,
          "QUOTE_UNAVAILABLE",
          "Review the request before sending a quote. Accepted or active orders cannot be requoted.",
        );
      if (
        body.lineItems?.some(
          (item) =>
            item.scope === "garment" && item.quantity !== current.quantity,
        )
      )
        fail(
          400,
          "QUOTE_QUANTITY",
          "Garment quote lines must match the request quantity.",
        );
      const quote = {
        version: (current.quotes.at(-1)?.version || 0) + 1,
        amountPaise: body.amountPaise,
        currency: "INR",
        deliveryDate: body.deliveryDate,
        notes: body.notes,
        notesHi: body.notesHi || "",
        ...(body.lineItems ? { lineItems: body.lineItems } : {}),
        createdAt: new Date(),
        createdBy: String(req.user._id),
      };
      const updated = await models.Order.findOneAndUpdate(
        { _id: current._id, revision: body.revision, status: current.status },
        {
          $set: { status: "quote_sent", acceptedQuote: null },
          $inc: { revision: 1 },
          $push: {
            quotes: quote,
            timeline: {
              status: "quote_sent",
              actor: String(req.user._id),
              at: new Date(),
              note: "Quote version " + quote.version + " sent.",
            },
          },
        },
        { returnDocument: "after", session },
      );
      if (!updated)
        fail(409, "REVISION_CONFLICT", "The request changed. Refresh it.");
      await audit(ctx, req, "quote.sent", "order", current._id, session, {
        quoteVersion: quote.version,
        amountPaise: quote.amountPaise,
      });
      return updated;
    });
    res.json({ data: safeOrder(order) });
  });
  app.patch(base + "/orders/:id/fulfilment", async (req, res) => {
    const transportStatus = z.enum([
      "not_arranged",
      "quote_pending",
      "awaiting_confirmation",
      "confirmed",
      "in_transit",
      "received",
      "collected",
      "delivered",
      "cancelled",
    ]);
    const schema = z
      .object({
        revision: revisionSchema,
        inboundStatus: transportStatus.optional(),
        outboundStatus: transportStatus.optional(),
        trackingUrl: z
          .union([
            z.literal(""),
            z.url().refine((value) => {
              const url = new URL(value);
              return (
                url.protocol === "https:" && !url.username && !url.password
              );
            }, "Use a public HTTPS courier tracking URL."),
          ])
          .optional(),
        estimatedCompletionDate: z
          .union([z.iso.date(), z.literal(""), z.null()])
          .transform((value) => value || null)
          .optional(),
        delayNote: z.string().trim().max(1500).optional(),
        alterationMargin: z
          .object({
            confirmed: z.boolean(),
            description: z.string().trim().max(1500),
            exceptions: z.string().trim().max(1500).default(""),
          })
          .strict()
          .optional(),
        outboundReconfirmedAt: z.iso.datetime().nullable().optional(),
      })
      .strict()
      .refine(
        (value) => Object.keys(value).length > 1,
        "Choose a fulfilment detail to update.",
      );
    const { revision, ...fields } = schema.parse(req.body);
    const order = await ctx.transaction(async (session) => {
      const current = await ownedOrder(ctx, req, session);
      checkRevision(current, revision);
      const at = new Date(),
        fulfilment = {
          ...(current.fulfilment || {}),
          ...fields,
          updatedAt: at,
          updatedBy: String(req.user._id),
          history: [
            ...(current.fulfilment?.history || []),
            { at, actor: String(req.user._id), fields },
          ],
        };
      const updated = await models.Order.findOneAndUpdate(
        { _id: current._id, revision },
        {
          $set: { fulfilment },
          $inc: { revision: 1 },
          $push: {
            timeline: {
              status: current.status,
              actor: String(req.user._id),
              at,
              note: "Transport or garment review details updated by the atelier.",
            },
          },
        },
        { returnDocument: "after", session, runValidators: true },
      );
      if (!updated)
        fail(
          409,
          "REVISION_CONFLICT",
          "This request changed. Refresh before updating fulfilment.",
        );
      await audit(
        ctx,
        req,
        "order.fulfilment_updated",
        "order",
        current._id,
        session,
        { fields: Object.keys(fields) },
      );
      return updated;
    });
    res.json({ data: safeOrder(order) });
  });
  app.patch(base + "/orders/:id/status", async (req, res) => {
    const body = statusInput.parse(req.body);
    const order = await ctx.transaction(async (session) => {
      const current = await ownedOrder(ctx, req, session);
      checkRevision(current, body.revision);
      checkTransition(current.status, body.status);
      const updated = await models.Order.findOneAndUpdate(
        { _id: current._id, revision: body.revision, status: current.status },
        {
          $set: { status: body.status },
          $inc: { revision: 1 },
          $push: {
            timeline: {
              status: body.status,
              actor: String(req.user._id),
              at: new Date(),
              note: body.note,
              noteHi: body.noteHi || "",
            },
          },
        },
        { returnDocument: "after", session },
      );
      if (!updated)
        fail(409, "REVISION_CONFLICT", "The request changed. Refresh it.");
      if (["cancelled", "rejected"].includes(body.status)) await releaseCommittedBenefits(ctx, updated, session);
      if (body.status === "delivered") await completeCommerceOrder(ctx, updated, session);
      await audit(
        ctx,
        req,
        "order.status_changed",
        "order",
        current._id,
        session,
        { from: current.status, to: body.status },
      );
      return updated;
    });
    res.json({ data: safeOrder(order) });
  });
  app.get(base + "/customers", async (req, res) => {
    const q = pageQuery(req.query, { search: searchField });
    const filter = {
      role: "customer",
      ...(q.search
        ? {
            $or: [
              { name: { $regex: escaped(q.search), $options: "i" } },
              { email: { $regex: escaped(q.search), $options: "i" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      models.User.find(filter)
        .select("_id name email phone disabled deletionRequestedAt createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.User.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q));
  });
  app.get(base + "/settings", async (_req, res) =>
    res.json({
      data:
        (await models.SiteSettings.findOne({ key: "main" }).lean()) ||
        defaultSettings,
    }),
  );
  app.patch(base + "/settings", async (req, res) => {
    const { revision, fields } = revisionBody(settingsInput, req.body);
    const settings = await ctx.transaction(async (session) => {
      let current = await models.SiteSettings.findOne({ key: "main" }).session(
        session,
      );
      if (!current) {
        const [created] = await models.SiteSettings.create([defaultSettings], {
          session,
        });
        current = created;
      }
      checkRevision(current, revision);
      if (!sameId(current.bannerMediaId, fields.bannerMediaId)) {
        if (fields.bannerMediaId)
          await pinMedia(ctx, [fields.bannerMediaId], session, {
            private: false,
            purposes: ["banner"],
          });
        if (current.bannerMediaId)
          await releaseMedia(ctx, [current.bannerMediaId], session);
      }
      const updated = await models.SiteSettings.findOneAndUpdate(
        { _id: current._id, revision },
        { $set: fields, $inc: { revision: 1 } },
        { returnDocument: "after", session },
      );
      if (!updated)
        fail(409, "REVISION_CONFLICT", "Settings changed. Refresh them.");
      await audit(
        ctx,
        req,
        "settings.updated",
        "settings",
        current._id,
        session,
      );
      return updated;
    });
    res.json({ data: plain(settings) });
  });
  app.get(base + "/audit", async (req, res) => {
    const q = pageQuery(req.query, {
      action: searchField,
      resourceType: z.string().max(50).optional(),
    });
    const filter = {
      ...(q.action ? { action: q.action } : {}),
      ...(q.resourceType ? { resourceType: q.resourceType } : {}),
    };
    const [items, total] = await Promise.all([
      models.AuditEvent.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.AuditEvent.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q));
  });
}
