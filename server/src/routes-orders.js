import { z } from "zod";
import {
  orderInput,
  requestHash,
  orderNumber,
  quoteResponseInput,
  cancelInput,
  businessDate,
} from "./domain.js";
import { fail, requireFound } from "./errors.js";
import { loadEstimate, submittedConfiguration } from "./pricing.js";
import { draftMediaIds } from "./routes-drafts.js";
import { assertOrderServiceEnabled } from "./routes-services.js";
import { commitOrderBenefits, releaseCommittedBenefits } from "./commerce-service.js";
import { snapshotMeasurementGuide } from "./reference-integrity.js";
import {
  pageQuery,
  pageResult,
  safeOrder,
  idOf,
  ownedOrder,
  checkRevision,
  pinMedia,
  releaseMedia,
  audit,
} from "./route-utils.js";
export function orderRoutes(app, ctx, auth, orderLimit) {
  const { models } = ctx;
  app.get("/api/orders", auth, async (req, res) => {
    const q = pageQuery(req.query, { status: z.string().max(40).optional() });
    const filter = {
      owner: req.user._id,
      ...(q.status ? { status: q.status } : {}),
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
  app.post("/api/orders", auth, orderLimit, async (req, res) => {
    const body = orderInput.parse(req.body);
    const {
      draftRevision: _draftRevision,
      estimateVersion: _estimateVersion,
      ...persistedBody
    } = body;
    const key = z
      .string()
      .min(16)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/)
      .parse(req.get("Idempotency-Key"));
    const hash = requestHash(body);
    const filter = { owner: req.user._id, idempotencyKey: key };
    const replay = await models.Order.findOne(filter);
    if (replay) {
      if (replay.requestHash !== hash)
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This retry key was already used for different request details.",
        );
      res.set("Idempotency-Replayed", "true");
      return res.json({ data: safeOrder(replay) });
    }
    if (body.preferredDate && body.preferredDate < businessDate())
      fail(
        400,
        "INVALID_PREFERRED_DATE",
        "Preferred date cannot be in the past.",
      );
    let order;
    try {
      order = await ctx.transaction(async (session) => {
        const account = await models.User.updateOne(
          { _id: req.user._id, disabled: false },
          { $inc: { mutationFence: 1 } },
          { session },
        );
        if (account.modifiedCount !== 1)
          fail(403, "ACCOUNT_DISABLED", "This account is unavailable.");
        await assertOrderServiceEnabled(ctx, body.garment, session);
        let design = null;
        if (body.designId) {
          design = requireFound(
            await models.Design.findOne({
              _id: body.designId,
              status: "published",
              garment: body.garment,
            }).session(session),
            "The selected design is unavailable.",
          );
          const locked = await models.Design.updateOne(
            { _id: design._id, status: "published" },
            { $inc: { usedCount: 1 } },
            { session },
          );
          if (locked.modifiedCount !== 1)
            fail(
              409,
              "DESIGN_CHANGED",
              "The selected design changed. Please review your request.",
            );
        }
        await pinMedia(ctx, body.referenceMediaIds, session, {
          owner: req.user._id,
          private: true,
          purposes: ["reference", "measurement"],
        });
        const estimate = await loadEstimate(ctx, body, session);
        const effectiveOptionIds = [...Object.values(estimate.components), ...(estimate.addons || [])].map(component=>component.optionId).filter(Boolean);
        await models.DesignOption.updateMany({_id:{$in:effectiveOptionIds}},{$inc:{usedCount:1}},{session});
        const selectedImageIds = [...new Set([...Object.values(estimate.components), ...(estimate.addons || [])].flatMap(component => component.imageMediaIds || []))];
        await pinMedia(ctx, selectedImageIds, session, { private: false, purposes: ["catalogue"] });
        let guideSnapshots = [];
        let guideImageIds = [];
        if (body.measurements.guideIds?.length) {
          const guides = await models.MeasurementGuide.find({ _id: { $in: body.measurements.guideIds }, status: "published", garment: body.garment, method: body.measurements.method }).session(session).lean();
          if (guides.length !== body.measurements.guideIds.length) fail(409,"GUIDE_CHANGED","A selected guide changed or does not match this garment and measurement method.");
          await models.MeasurementGuide.updateMany({_id:{$in:body.measurements.guideIds}},{$inc:{usedCount:1}},{session});
          guideImageIds = [...new Set(guides.flatMap(guide => guide.imageMediaIds).map(String))];
          await pinMedia(ctx,guideImageIds,session,{private:false,purposes:["catalogue"]});
          const guideImages = await models.MediaAsset.find({ _id: { $in: guideImageIds }, private: false, purpose: "catalogue", deletingAt: null }).session(session).lean();
          const guideMap = new Map(guides.map(guide => [String(guide._id), guide]));
          guideSnapshots = body.measurements.guideIds.map(id => snapshotMeasurementGuide(guideMap.get(id.toLowerCase()), guideImages));
        }
        for (const component of Object.values(estimate.components))
          if (component.source === "reference" && !body.referenceMediaIds.includes(component.referenceMediaId))
            fail(400, "INVALID_REFERENCE", "Each active component reference must be one of your attached private references.");
        if (
          body.estimateVersion &&
          body.estimateVersion !== estimate.configurationVersion
        )
          fail(
            409,
            "ESTIMATE_CHANGED",
            "Prices or available options changed. Review the updated estimate before submitting.",
          );
        if (body.configuration && body.measurements.method !== "assistance" && body.measurements.takenBy !== "assistance")
          for (const field of estimate.measurementFields)
            if (body.measurements.values[field] === undefined)
              fail(
                400,
                "MEASUREMENT_REQUIRED",
                `Please provide ${field}, or request measurement help.`,
              );
        const settings = await models.SiteSettings.findOne({
          key: "main",
        }).session(session);
        if (
          body.configuration &&
          settings?.policies?.version &&
          body.policyVersion !== settings.policies.version
        )
          fail(
            409,
            "POLICY_CHANGED",
            "Please review the current service terms before submitting.",
          );
        let draft = null;
        if (body.draftId) {
          draft = requireFound(
            await models.Draft.findOne({
              _id: body.draftId,
              owner: req.user._id,
              status: "draft",
            }).session(session),
            "Your draft is unavailable or has already been submitted.",
          );
          if (body.draftRevision !== undefined)
            checkRevision(draft, body.draftRevision);
        }
        // Preserve translated option labels without changing the canonical request or retry hash.
        const optionLabels = await models.DesignOption.find({
          active: true,
          garments: body.garment,
          name: { $in: Object.values(body.preferences) },
        })
          .session(session)
          .lean();
        const preferenceLabelsHi = Object.fromEntries(
          optionLabels
            .filter(
              (option) =>
                option.nameHi && body.preferences[option.kind] === option.name,
            )
            .map((option) => [option.kind, option.nameHi]),
        );
        const [created] = await models.Order.create(
          [
            {
              ...persistedBody,
              ...(body.configuration ? { configuration: submittedConfiguration(body.configuration, estimate) } : {}),
              ...filter,
              requestHash: hash,
              preferenceLabelsHi,
              estimate,
              publicMediaPins: { optionImages: selectedImageIds, guideImages: guideImageIds },
              ...(guideSnapshots.length ? { guideSnapshots } : {}),
              orderNumber: orderNumber(),
              status: "request_received",
              designSnapshot: design
                ? {
                    title: design.title,
                    titleHi: design.titleHi || "",
                    code: design.code,
                    slug: design.slug,
                    garment: design.garment,
                    startingPricePaise: design.startingPricePaise,
                    currency: "INR",
                    defaultComponents: design.defaultComponents || {},
                    includedAddonIds: design.includedAddonIds || [],
                    components: estimate.components,
                    addons: estimate.addons,
                    designDetails: design.designDetails || {},
                  }
                : null,
              timeline: [
                {
                  status: "request_received",
                  actor: String(req.user._id),
                  at: new Date(),
                  note: "Request received. Final quote and delivery are pending review.",
                },
              ],
            },
          ],
          { session },
        );
        if (draft) {
          const saved = await models.Draft.updateOne(
            {
              _id: draft._id,
              owner: req.user._id,
              status: "draft",
              revision: draft.revision,
            },
            {
              $set: { status: "submitted", orderId: created._id },
              $inc: { revision: 1 },
            },
            { session },
          );
          if (!saved.modifiedCount)
            fail(
              409,
              "DRAFT_CHANGED",
              "Your draft changed in another tab. Review it before submitting.",
            );
          await releaseMedia(ctx, draftMediaIds(draft.data), session);
          if (models.SupportTicket)
            await models.SupportTicket.updateMany(
              {
                owner: req.user._id,
                draftId: { $in: [String(draft._id), draft.clientId] },
              },
              { $set: { orderId: created._id } },
              { session },
            );
        }
        await audit(
          ctx,
          req,
          "order.requested",
          "order",
          created._id,
          session,
          { orderNumber: created.orderNumber },
        );
        return created;
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      const existing = await models.Order.findOne(filter);
      if (!existing) throw err;
      if (existing.requestHash !== hash)
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This retry key was already used for different request details.",
        );
      res.set("Idempotency-Replayed", "true");
      return res.json({ data: safeOrder(existing) });
    }
    res.status(201).json({ data: safeOrder(order) });
  });
  app.get("/api/orders/:id", auth, async (req, res) =>
    res.json({ data: safeOrder(await ownedOrder(ctx, req)) }),
  );
  app.post("/api/orders/:id/quote-response", auth, async (req, res) => {
    const body = quoteResponseInput.parse(req.body);
    const order = await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.Order.findOne({
          _id: idOf(req),
          owner: req.user._id,
        }).session(session),
        "Request not found.",
      );
      checkRevision(current, body.revision);
      const quote = current.quotes.at(-1);
      if (
        current.status !== "quote_sent" ||
        !quote ||
        quote.version !== body.quoteVersion
      )
        fail(
          409,
          "STALE_QUOTE",
          "This quote is no longer current. Refresh the request before responding.",
        );
      const status =
        body.decision === "accept" ? "customer_accepted" : "under_review";
      const benefits = body.decision === "accept" ? await commitOrderBenefits(ctx, current, quote, session) : null;
      const update = {
        $set: {
          status,
          acceptedQuote:
            body.decision === "accept"
              ? {
                  ...quote,
                  ...(benefits ? { amountPaise: benefits.amountPaise, grossAmountPaise: quote.amountPaise, benefits } : {}),
                  acceptedAt: new Date(),
                  acceptedBy: String(req.user._id),
                }
              : null,
        },
        $inc: { revision: 1 },
        $push: {
          timeline: {
            status,
            actor: String(req.user._id),
            at: new Date(),
            note:
              body.decision === "accept"
                ? "Customer accepted quote version " + quote.version + "."
                : "Customer declined quote version " + quote.version + ".",
          },
        },
      };
      const updated = await models.Order.findOneAndUpdate(
        { _id: current._id, revision: body.revision, status: "quote_sent" },
        update,
        { returnDocument: "after", session },
      );
      if (!updated)
        fail(
          409,
          "REVISION_CONFLICT",
          "The request changed. Please refresh it.",
        );
      await audit(
        ctx,
        req,
        "quote." + body.decision,
        "order",
        current._id,
        session,
        { quoteVersion: quote.version },
      );
      return updated;
    });
    res.json({ data: safeOrder(order) });
  });
  app.post("/api/orders/:id/cancel", auth, async (req, res) => {
    const body = cancelInput.parse(req.body);
    const order = await ctx.transaction(async (session) => {
      const current = requireFound(
        await models.Order.findOne({
          _id: idOf(req),
          owner: req.user._id,
        }).session(session),
        "Request not found.",
      );
      checkRevision(current, body.revision);
      await releaseCommittedBenefits(ctx, current, session);
      if (
        !["request_received", "under_review", "quote_sent"].includes(
          current.status,
        )
      )
        fail(
          409,
          "CANCELLATION_UNAVAILABLE",
          "Please contact the atelier to discuss cancellation at this stage.",
        );
      const updated = await models.Order.findOneAndUpdate(
        { _id: current._id, revision: body.revision, status: current.status },
        {
          $set: { status: "cancelled" },
          $inc: { revision: 1 },
          $push: {
            timeline: {
              status: "cancelled",
              actor: String(req.user._id),
              at: new Date(),
              note: "Cancelled by customer.",
            },
          },
        },
        { returnDocument: "after", session },
      );
      if (!updated)
        fail(
          409,
          "REVISION_CONFLICT",
          "The request changed. Please refresh it.",
        );
      await audit(ctx, req, "order.cancelled", "order", current._id, session);
      return updated;
    });
    res.json({ data: safeOrder(order) });
  });
}
