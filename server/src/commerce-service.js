import { randomBytes } from "node:crypto";
import { requestHash } from "./domain.js";
import { fail } from "./errors.js";
import { commerceDefaults, commerceSelectionInput } from "./commerce-input.js";

export async function loadCommerceSettings(ctx, session = null) {
  return await ctx.models.CommerceSettings.findOne({ key: "main" }).session(session).lean() || { ...commerceDefaults };
}
export async function commerceActorFence(ctx, owner, session) {
  const result = await ctx.models.User.updateOne({ _id: owner, disabled: false }, { $inc: { mutationFence: 1 } }, { session });
  if (result.modifiedCount !== 1) fail(403, "ACCOUNT_DISABLED", "This account is unavailable.");
}
export async function ensureCommerceWallet(ctx, owner, session) {
  return ctx.models.CommerceWallet.findOneAndUpdate({ owner }, {
    $setOnInsert: { owner, balancePaise: 0, referralCode: "KS-" + randomBytes(8).toString("hex").toUpperCase() },
  }, { upsert: true, returnDocument: "after", session, runValidators: true });
}

// A quote must identify stitching separately. Credits never pay transport, and
// an unitemized final quote must not guess its eligible portion from an estimate.
export function quoteStitchingPaise(quote) {
  if (!Array.isArray(quote?.lineItems) || !quote.lineItems.length) return null;
  if (quote.lineItems.some(line => !Number.isSafeInteger(line.amountPaise) || line.amountPaise < 0)) return null;
  if (quote.lineItems.reduce((total, line) => total + line.amountPaise, 0) !== quote.amountPaise) return null;
  return quote.lineItems.filter(line => line.scope === "garment").reduce((total, line) => total + line.amountPaise, 0);
}
export function calculateQuoteBenefits({ quote, garment, selection, settings, offer = null, walletBalancePaise = 0, offerUses = 0, now = new Date() }) {
  const chosen = commerceSelectionInput.parse(selection || {});
  const grossAmountPaise = quote.amountPaise;
  const base = { grossAmountPaise, stitchingPaise: quoteStitchingPaise(quote), discountPaise: 0, creditPaise: 0, amountPaise: grossAmountPaise, offerCode: "", offerId: null, quoteVersion: quote.version, settingsRevision: settings.revision || 0, offerRevision: null, maximumCreditPaise: 0 };
  if (!chosen.offerCode && !chosen.creditPaise) return base;
  if (!settings.enabled) fail(409, "BENEFITS_UNAVAILABLE", "Stitching benefits are currently unavailable. Clear this selection or contact the atelier.");
  if (base.stitchingPaise === null) fail(409, "ITEMIZED_QUOTE_REQUIRED", "Ask the atelier to itemize stitching and transport before applying an offer or stitching credits.");
  let discountPaise = 0;
  if (chosen.offerCode) {
    if (!settings.offersEnabled) fail(409, "OFFERS_UNAVAILABLE", "Offers are currently unavailable.");
    if (!offer || offer.status !== "published" || offer.code !== chosen.offerCode || !offer.garments.includes(garment) || (offer.startsAt && new Date(offer.startsAt) > now) || (offer.endsAt && new Date(offer.endsAt) <= now) || (offer.totalUseLimit !== null && offer.totalUseLimit !== undefined && offer.usedCount >= offer.totalUseLimit) || offerUses >= offer.perCustomerLimit || base.stitchingPaise < offer.minimumStitchingPaise) fail(409, "OFFER_INELIGIBLE", "This offer is unavailable or does not apply to this quote.");
    discountPaise = offer.type === "percentage" ? Math.floor(base.stitchingPaise * offer.value / 10000) : offer.value;
    discountPaise = Math.min(base.stitchingPaise, discountPaise, offer.maxDiscountPaise ?? Number.MAX_SAFE_INTEGER);
  }
  const maximumCreditPaise = settings.creditsEnabled ? Math.min(walletBalancePaise, Math.floor((base.stitchingPaise - discountPaise) * settings.maxCreditBps / 10000)) : 0;
  if (chosen.creditPaise && !settings.creditsEnabled) fail(409, "CREDITS_UNAVAILABLE", "Credit redemption is currently unavailable.");
  if (chosen.creditPaise > maximumCreditPaise) fail(409, "INSUFFICIENT_CREDITS", "The requested credit amount exceeds your available balance or this quote's stitching-credit limit.");
  return { ...base, discountPaise, creditPaise: chosen.creditPaise, amountPaise: grossAmountPaise - discountPaise - chosen.creditPaise, offerCode: offer?.code || "", offerId: offer ? String(offer._id) : null, offerRevision: offer?.revision ?? null, maximumCreditPaise };
}
const pricingSnapshot = preview => {
  const { maximumCreditPaise: _maximum, ...snapshot } = preview;
  return snapshot;
};
export async function previewOrderBenefits(ctx, order, quote, selection, session = null) {
  const chosen = commerceSelectionInput.parse(selection || {});
  const [settings, wallet, offer] = await Promise.all([
    loadCommerceSettings(ctx, session),
    ctx.models.CommerceWallet.findOne({ owner: order.owner }).session(session).lean(),
    chosen.offerCode ? ctx.models.CommerceOffer.findOne({ code: chosen.offerCode }).session(session).lean() : null,
  ]);
  const uses = offer ? await ctx.models.CommerceOfferUse.countDocuments({ owner: order.owner, offerId: offer._id, state: "used" }).session(session) : 0;
  return calculateQuoteBenefits({ quote, garment: order.garment, selection: chosen, settings, offer, walletBalancePaise: wallet?.balancePaise || 0, offerUses: uses });
}

// All callers must provide the existing Mongo transaction. The owner fence
// serializes concurrent wallet/offer-limit changes for one account.
export async function changeCommerceCredit(ctx, { owner, eventKey, deltaPaise, kind, reason, orderId = null, actor = null, hash }, session) {
  if (!Number.isSafeInteger(deltaPaise) || deltaPaise === 0 || Math.abs(deltaPaise) > 100000000) fail(400, "INVALID_CREDIT", "Use a nonzero integer credit amount within the configured bound.");
  const digest = hash || requestHash({ owner: String(owner), eventKey, deltaPaise, kind, reason, orderId: orderId ? String(orderId) : null });
  const old = await ctx.models.CommerceLedger.findOne({ owner, eventKey }).session(session).lean();
  if (old) {
    if (old.requestHash !== digest) fail(409, "CREDIT_EVENT_CONFLICT", "This credit event was already used for different details.");
    return old;
  }
  await ensureCommerceWallet(ctx, owner, session);
  const wallet = await ctx.models.CommerceWallet.findOneAndUpdate({ owner, balancePaise: { $gte: deltaPaise < 0 ? -deltaPaise : 0, $lte: 100000000 - Math.max(deltaPaise, 0) } }, { $inc: { balancePaise: deltaPaise, revision: 1 } }, { session, returnDocument: "after", runValidators: true });
  if (!wallet) fail(409, "INSUFFICIENT_CREDITS", "The available credit balance changed. Review it before trying again.");
  const [entry] = await ctx.models.CommerceLedger.create([{ owner, eventKey, deltaPaise, kind, reason, orderId, actor, requestHash: digest, balancePaise: wallet.balancePaise }], { session });
  return entry;
}

export async function commitOrderBenefits(ctx, order, quote, session) {
  const reservation = await ctx.models.CommerceReservation.findOne({ orderId: order._id, quoteVersion: quote.version }).session(session);
  if (!reservation) return null;
  if (reservation.state === "committed") return pricingSnapshot(reservation.preview);
  if (reservation.state !== "pending") fail(409, "BENEFITS_RELEASED", "These benefits were released. Review the current quote again.");
  if (!reservation.selection.offerCode && !reservation.selection.creditPaise) return null;
  await commerceActorFence(ctx, order.owner, session);
  const current = await previewOrderBenefits(ctx, order, quote, reservation.selection, session);
  if (requestHash(pricingSnapshot(current)) !== requestHash(pricingSnapshot(reservation.preview))) fail(409, "BENEFITS_CHANGED", "The offer or credit terms changed. Review and save your benefits again before accepting.");
  if (current.offerId) {
    const offer = await ctx.models.CommerceOffer.findById(current.offerId).session(session);
    const changed = await ctx.models.CommerceOffer.updateOne({ _id: offer._id, revision: current.offerRevision, status: "published", ...(offer.totalUseLimit !== null ? { usedCount: { $lt: offer.totalUseLimit } } : {}) }, { $inc: { usedCount: 1 } }, { session });
    if (changed.modifiedCount !== 1) fail(409, "OFFER_INELIGIBLE", "This offer changed or reached its use limit. Review your quote benefits.");
    await ctx.models.CommerceOfferUse.create([{ owner: order.owner, offerId: current.offerId, orderId: order._id, quoteVersion: quote.version }], { session });
  }
  if (current.creditPaise) await changeCommerceCredit(ctx, { owner: order.owner, eventKey: `spend:${order._id}:${quote.version}`, deltaPaise: -current.creditPaise, kind: "redemption", reason: "Stitching credit applied to an accepted quote.", orderId: order._id }, session);
  const changed = await ctx.models.CommerceReservation.updateOne({ _id: reservation._id, state: "pending" }, { $set: { state: "committed", committedAt: new Date() } }, { session });
  if (changed.modifiedCount !== 1) fail(409, "BENEFITS_CHANGED", "The quote benefits changed. Refresh before accepting.");
  return pricingSnapshot(current);
}

export async function releaseCommittedBenefits(ctx, order, session) {
  const reservations = await ctx.models.CommerceReservation.find({ orderId: order._id, state: "committed" }).session(session);
  for (const reservation of reservations) {
    await commerceActorFence(ctx, reservation.owner, session);
    const changed = await ctx.models.CommerceReservation.updateOne({ _id: reservation._id, state: "committed" }, { $set: { state: "released", releasedAt: new Date() } }, { session });
    if (!changed.modifiedCount) continue;
    const amount = reservation.preview.creditPaise;
    if (amount) await changeCommerceCredit(ctx, { owner: reservation.owner, eventKey: `restore:${order._id}:${reservation.quoteVersion}`, deltaPaise: amount, kind: "reversal", reason: "Stitching credit restored after order cancellation.", orderId: order._id }, session);
    const use = await ctx.models.CommerceOfferUse.findOneAndUpdate({ orderId: order._id, quoteVersion: reservation.quoteVersion, state: "used" }, { $set: { state: "released" } }, { returnDocument: "before", session });
    if (use) await ctx.models.CommerceOffer.updateOne({ _id: use.offerId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
  }
}

export async function completeCommerceOrder(ctx, order, session) {
  if (order.status !== "delivered") return;
  const settings = await loadCommerceSettings(ctx, session);
  if (!settings.enabled || (!settings.referralsEnabled && !settings.loyaltyEnabled)) return;
  const quote = order.acceptedQuote;
  const stitchingPaise = quote?.benefits?.stitchingPaise ?? quoteStitchingPaise(quote);
  if (stitchingPaise === null || stitchingPaise === undefined || stitchingPaise < settings.qualifyingStitchingPaise) return;
  await commerceActorFence(ctx, order.owner, session);
  if (await ctx.models.CommerceCompletion.exists({ orderId: order._id }).session(session)) return;
  await ctx.models.CommerceCompletion.create([{ owner: order.owner, orderId: order._id, stitchingPaise }], { session });
  if (settings.loyaltyEnabled) {
    const count = await ctx.models.CommerceCompletion.countDocuments({ owner: order.owner }).session(session);
    for (const milestone of settings.milestones) {
      if (count < milestone.orders || await ctx.models.CommerceMilestone.exists({ owner: order.owner, code: milestone.code }).session(session)) continue;
      await ctx.models.CommerceMilestone.create([{ owner: order.owner, code: milestone.code, orderId: order._id, rewardPaise: milestone.rewardPaise }], { session });
      await changeCommerceCredit(ctx, { owner: order.owner, eventKey: `milestone:${milestone.code}`, deltaPaise: milestone.rewardPaise, kind: "loyalty", reason: "Configured delivered-order milestone: " + milestone.code, orderId: order._id }, session);
    }
  }
  if (settings.referralsEnabled) {
    const referral = await ctx.models.CommerceReferral.findOne({ referredOwner: order.owner, state: "claimed" }).session(session);
    if (referral) {
      const referrer = await ctx.models.User.findOne({ _id: referral.referrerOwner, disabled: false }).session(session);
      if (referrer) {
        await commerceActorFence(ctx, referrer._id, session);
        await ctx.models.CommerceReferral.updateOne({ _id: referral._id, state: "claimed" }, { $set: { state: "qualified", qualifiedAt: new Date(), qualifiedOrderId: order._id } }, { session });
        if (settings.referralRewardPaise) await changeCommerceCredit(ctx, { owner: referrer._id, eventKey: `referral:${referral._id}`, deltaPaise: settings.referralRewardPaise, kind: "referral", reason: "Configured referral completed a qualifying delivered order.", orderId: order._id }, session);
        if (settings.referredRewardPaise) await changeCommerceCredit(ctx, { owner: order.owner, eventKey: `referred:${referral._id}`, deltaPaise: settings.referredRewardPaise, kind: "referral", reason: "Configured new-customer referral reward.", orderId: order._id }, session);
      }
    }
  }
}

export async function assertCommerceDeletionAllowed(ctx, owner, session = null) {
  const wallet = await ctx.models.CommerceWallet.findOne({ owner }).session(session).lean();
  if (wallet?.balancePaise > 0) fail(409, "CREDIT_SETTLEMENT_REQUIRED", "Resolve the remaining stitching-credit balance before completing account deletion.");
}
