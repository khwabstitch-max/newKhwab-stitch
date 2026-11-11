import { z } from "zod";
import { adminOnly } from "./auth.js";
import { objectId, requestHash, revisionSchema, GARMENTS } from "./domain.js";
import { fail, requireFound } from "./errors.js";
import { audit, checkRevision, idOf, pageQuery, pageResult } from "./route-utils.js";
import { commerceDefaults, commerceOfferInput, commerceSettingsInput, creditAdjustmentInput, quoteBenefitsInput } from "./commerce-input.js";
import { changeCommerceCredit, commerceActorFence, ensureCommerceWallet, loadCommerceSettings, previewOrderBenefits } from "./commerce-service.js";

const capabilities = settings => ({
  enabled: settings.enabled, offersEnabled: settings.enabled && settings.offersEnabled,
  creditsEnabled: settings.enabled && settings.creditsEnabled, referralsEnabled: settings.enabled && settings.referralsEnabled,
  loyaltyEnabled: settings.enabled && settings.loyaltyEnabled,
  maxCreditBps: settings.maxCreditBps, terms: settings.terms, termsHi: settings.termsHi,
  milestones: settings.milestones, revision: settings.revision,
});
const publicOffer = ({ _id, code, name, nameHi, description, descriptionHi, type, value, maxDiscountPaise, minimumStitchingPaise, garments, startsAt, endsAt, perCustomerLimit }) => ({ _id, code, name, nameHi, description, descriptionHi, type, value, maxDiscountPaise, minimumStitchingPaise, garments, startsAt, endsAt, perCustomerLimit });

export function registerCommerceRoutes(app, ctx, auth) {
  const { models } = ctx;
  app.get("/api/commerce/capabilities", async (_req, res) => res.set("Cache-Control", "no-store").json({ data: capabilities(await loadCommerceSettings(ctx)) }));
  app.get("/api/commerce/offers", async (req, res) => {
    const q = pageQuery(req.query, { garment: z.enum(GARMENTS).optional() });
    const settings = await loadCommerceSettings(ctx);
    if (!settings.enabled || !settings.offersEnabled) return res.json(pageResult([], 0, q));
    const now = new Date(), filter = { status: "published", ...(q.garment ? { garments: q.garment } : {}), $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
      { $or: [{ totalUseLimit: null }, { $expr: { $lt: ["$usedCount", "$totalUseLimit"] } }] },
    ] };
    const [items, total] = await Promise.all([models.CommerceOffer.find(filter).sort({ displayOrder: 1, _id: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), models.CommerceOffer.countDocuments(filter)]);
    res.json(pageResult(items.map(publicOffer), total, q));
  });
  app.get("/api/commerce/account", auth, async (req, res) => {
    const [settings, wallet, referral, deliveredOrders] = await Promise.all([
      loadCommerceSettings(ctx), models.CommerceWallet.findOne({ owner: req.user._id }).lean(),
      models.CommerceReferral.findOne({ referredOwner: req.user._id }).select("code state createdAt").lean(),
      models.CommerceCompletion.countDocuments({ owner: req.user._id }),
    ]);
    res.json({ data: { ...capabilities(settings), balancePaise: wallet?.balancePaise || 0, referralCode: settings.enabled && settings.referralsEnabled ? wallet?.referralCode || null : null, referral, deliveredOrders } });
  });
  app.get("/api/commerce/ledger", auth, async (req, res) => {
    const q = pageQuery(req.query), filter = { owner: req.user._id };
    const [items, total] = await Promise.all([models.CommerceLedger.find(filter).select("kind deltaPaise balancePaise reason createdAt").sort({ createdAt: -1, _id: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), models.CommerceLedger.countDocuments(filter)]);
    res.json(pageResult(items, total, q));
  });
  app.post("/api/commerce/referral-code", auth, async (req, res) => {
    z.object({}).strict().parse(req.body || {});
    const wallet = await ctx.transaction(async session => {
      await commerceActorFence(ctx, req.user._id, session);
      const settings = await loadCommerceSettings(ctx, session);
      if (!settings.enabled || !settings.referralsEnabled) fail(409, "REFERRALS_UNAVAILABLE", "Referrals are currently unavailable.");
      return ensureCommerceWallet(ctx, req.user._id, session);
    });
    res.json({ data: { referralCode: wallet.referralCode } });
  });
  app.post("/api/commerce/referrals", auth, async (req, res) => {
    const body = z.object({ code: z.string().trim().toUpperCase().regex(/^KS-[A-F0-9]{16}$/) }).strict().parse(req.body);
    const data = await ctx.transaction(async session => {
      await commerceActorFence(ctx, req.user._id, session);
      const settings = await loadCommerceSettings(ctx, session);
      if (!settings.enabled || !settings.referralsEnabled || req.user.role !== "customer") fail(409, "REFERRALS_UNAVAILABLE", "Referrals are currently unavailable for this account.");
      const old = await models.CommerceReferral.findOne({ referredOwner: req.user._id }).session(session);
      if (old) {
        if (old.code !== body.code) fail(409, "REFERRAL_ALREADY_SET", "A referral was already recorded for this account.");
        return { code: old.code, state: old.state };
      }
      if (await models.Order.exists({ owner: req.user._id, status: { $nin: ["cancelled", "rejected"] } }).session(session)) fail(409, "REFERRAL_NOT_ELIGIBLE", "Record a referral before submitting your first active stitching request.");
      const wallet = requireFound(await models.CommerceWallet.findOne({ referralCode: body.code }).session(session), "This referral code is unavailable.");
      if (String(wallet.owner) === String(req.user._id)) fail(400, "SELF_REFERRAL", "You cannot use your own referral code.");
      const referrer = await models.User.findOne({ _id: wallet.owner, disabled: false, role: "customer" }).session(session);
      if (!referrer) fail(409, "REFERRAL_NOT_ELIGIBLE", "This referral code is unavailable.");
      await models.CommerceReferral.create([{ referredOwner: req.user._id, referrerOwner: wallet.owner, code: body.code }], { session });
      await audit(ctx, req, "commerce.referral_claimed", "commerceReferral", req.user._id, session);
      return { code: body.code, state: "claimed" };
    });
    res.status(201).json({ data });
  });
  app.get("/api/commerce/quote-benefits/:id", auth, async (req, res) => {
    const order = requireFound(await models.Order.findOne({ _id: idOf(req), owner: req.user._id }).lean(), "Request not found.");
    const quote = order.quotes.at(-1);
    const reservation = quote ? await models.CommerceReservation.findOne({ orderId: order._id, quoteVersion: quote.version }).lean() : null;
    let valid = true, validationMessage = "";
    if (reservation?.state === "pending" && (reservation.selection.offerCode || reservation.selection.creditPaise)) {
      try {
        const current = await previewOrderBenefits(ctx, order, quote, reservation.selection);
        const { maximumCreditPaise: _oldMaximum, ...oldSnapshot } = reservation.preview;
        const { maximumCreditPaise: _newMaximum, ...newSnapshot } = current;
        if (requestHash(oldSnapshot) !== requestHash(newSnapshot)) { valid = false; validationMessage = "The offer or credit terms changed. Review and save your benefits again before accepting."; }
      } catch (error) {
        if (![400, 404, 409].includes(error.status)) throw error;
        valid = false; validationMessage = error.message;
      }
    }
    res.json({ data: { orderId: String(order._id), revision: order.revision, quoteVersion: quote?.version || null, state: reservation?.state || null, selection: reservation?.selection || { offerCode: "", creditPaise: 0 }, preview: reservation?.preview || null, valid, validationMessage } });
  });
  app.post("/api/commerce/quote-benefits", auth, async (req, res) => {
    const body = quoteBenefitsInput.parse(req.body);
    const data = await ctx.transaction(async session => {
      await commerceActorFence(ctx, req.user._id, session);
      const order = requireFound(await models.Order.findOne({ _id: body.orderId, owner: req.user._id }).session(session), "Request not found.");
      checkRevision(order, body.revision);
      const quote = order.quotes.at(-1);
      if (order.status !== "quote_sent" || quote?.version !== body.quoteVersion) fail(409, "QUOTE_CHANGED", "The quote changed. Open the current quote before choosing benefits.");
      const selection = { offerCode: body.offerCode, creditPaise: body.creditPaise };
      const preview = await previewOrderBenefits(ctx, order, quote, selection, session);
      const current = await models.CommerceReservation.findOne({ orderId: order._id, quoteVersion: quote.version }).session(session);
      if (current && current.state !== "pending") fail(409, "QUOTE_CHANGED", "These quote benefits have already been processed.");
      await models.CommerceReservation.findOneAndUpdate({ orderId: order._id, quoteVersion: quote.version }, { $set: { owner: req.user._id, selection, preview, state: "pending" } }, { upsert: true, session, runValidators: true });
      const changed = await models.Order.updateOne({ _id: order._id, owner: req.user._id, revision: body.revision, status: "quote_sent" }, { $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) fail(409, "QUOTE_CHANGED", "The quote changed. Refresh it before saving benefits.");
      await audit(ctx, req, "commerce.benefits_selected", "order", order._id, session, { quoteVersion: quote.version });
      return { preview, revision: body.revision + 1, quoteVersion: quote.version, state: "pending", selection };
    });
    res.json({ data });
  });

  const admin = [auth, adminOnly];
  app.get("/api/admin/commerce/settings", ...admin, async (_req, res) => res.json({ data: await loadCommerceSettings(ctx) }));
  app.patch("/api/admin/commerce/settings", ...admin, async (req, res) => {
    const { revision, ...raw } = req.body, expected = revisionSchema.parse(revision), body = commerceSettingsInput.parse(raw);
    const record = await ctx.transaction(async session => {
      await commerceActorFence(ctx, req.user._id, session);
      const current = await models.CommerceSettings.findOne({ key: "main" }).session(session);
      if (current) checkRevision(current, expected);
      else if (expected !== commerceDefaults.revision) fail(409, "REVISION_CONFLICT", "Refresh the programme settings.");
      const value = await models.CommerceSettings.findOneAndUpdate({ key: "main", ...(current ? { revision: expected } : {}) }, { $set: body, $inc: { revision: 1 } }, { upsert: !current, returnDocument: "after", runValidators: true, session });
      if (!value) fail(409, "REVISION_CONFLICT", "The programme settings changed. Refresh them.");
      await audit(ctx, req, "commerce.settings_updated", "commerceSettings", value._id, session);
      return value;
    });
    res.json({ data: record });
  });
  app.get("/api/admin/commerce/offers", ...admin, async (req, res) => {
    const q = pageQuery(req.query), [items, total] = await Promise.all([models.CommerceOffer.find().sort({ displayOrder: 1, _id: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), models.CommerceOffer.countDocuments()]);
    res.json(pageResult(items, total, q));
  });
  app.post("/api/admin/commerce/offers", ...admin, async (req, res) => {
    const body = commerceOfferInput.parse(req.body);
    const offer = await ctx.transaction(async session => {
      await commerceActorFence(ctx, req.user._id, session);
      const [record] = await models.CommerceOffer.create([body], { session });
      await audit(ctx, req, "commerce.offer_created", "commerceOffer", record._id, session);
      return record;
    });
    res.status(201).json({ data: offer });
  });
  app.patch("/api/admin/commerce/offers/:id", ...admin, async (req, res) => {
    const { revision, ...raw } = req.body, expected = revisionSchema.parse(revision), body = commerceOfferInput.parse(raw);
    const offer = await ctx.transaction(async session => {
      await commerceActorFence(ctx, req.user._id, session);
      const current = requireFound(await models.CommerceOffer.findById(idOf(req)).session(session));
      checkRevision(current, expected);
      if (body.code !== current.code && current.usedCount) fail(409, "OFFER_CODE_LOCKED", "Keep the stable code for an offer that has been used; archive it and create a new offer instead.");
      const record = await models.CommerceOffer.findOneAndUpdate({ _id: current._id, revision: expected }, { $set: body, $inc: { revision: 1 } }, { session, returnDocument: "after", runValidators: true });
      if (!record) fail(409, "REVISION_CONFLICT", "The offer changed. Refresh it.");
      await audit(ctx, req, "commerce.offer_updated", "commerceOffer", current._id, session);
      return record;
    });
    res.json({ data: offer });
  });
  app.delete("/api/admin/commerce/offers/:id", ...admin, async (req, res) => {
    const { revision } = z.object({ revision: revisionSchema }).strict().parse(req.body);
    await ctx.transaction(async session => {
      await commerceActorFence(ctx, req.user._id, session);
      const current = requireFound(await models.CommerceOffer.findById(idOf(req)).session(session));
      checkRevision(current, revision);
      await models.CommerceOffer.updateOne({ _id: current._id, revision }, { $set: { status: "archived" }, $inc: { revision: 1 } }, { session });
      await audit(ctx, req, "commerce.offer_archived", "commerceOffer", current._id, session);
    });
    res.json({ data: { archived: true } });
  });
  app.post("/api/admin/commerce/credits", ...admin, async (req, res) => {
    const body = creditAdjustmentInput.parse(req.body);
    const entry = await ctx.transaction(async session => {
      await commerceActorFence(ctx, req.user._id, session);
      await commerceActorFence(ctx, objectId.parse(body.owner), session);
      const result = await changeCommerceCredit(ctx, { ...body, eventKey: `admin:${body.clientId}`, kind: "admin", actor: req.user._id, hash: requestHash({ ...body, actor: String(req.user._id) }) }, session);
      await audit(ctx, req, "commerce.credit_adjusted", "commerceLedger", result._id, session);
      return result;
    });
    res.json({ data: { id: entry._id, balancePaise: entry.balancePaise, deltaPaise: entry.deltaPaise } });
  });
}
