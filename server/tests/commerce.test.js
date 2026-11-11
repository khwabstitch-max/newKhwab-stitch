import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateQuoteBenefits, changeCommerceCredit, quoteStitchingPaise } from "../src/commerce-service.js";
import { commerceDefaults, commerceOfferInput, commerceSelectionInput, commerceSettingsInput, creditAdjustmentInput } from "../src/commerce-input.js";

const quote = { version: 3, amountPaise: 45000, lineItems: [
  { label: "Stitching and selected details", amountPaise: 40000, scope: "garment", quantity: 1 },
  { label: "Pickup and return", amountPaise: 5000, scope: "shipment", quantity: 1 },
] };
const settings = { ...commerceDefaults, enabled: true, offersEnabled: true, creditsEnabled: true, maxCreditBps: 10000, revision: 2 };
const offer = { _id: "a".repeat(24), code: "TEST", type: "fixed", value: 5000, status: "published", garments: ["kurti"], minimumStitchingPaise: 0, totalUseLimit: null, perCustomerLimit: 1, usedCount: 0, revision: 1 };
const calculate = (overrides = {}) => calculateQuoteBenefits({ quote, garment: "kurti", settings, selection: { offerCode: "TEST", creditPaise: 10000 }, offer, walletBalancePaise: 10000, ...overrides });
const errorCode = code => error => error.code === code;

test("programmes default disabled and a quote without selected benefits remains unchanged", () => {
  assert.equal(commerceDefaults.enabled, false);
  const result = calculate({ settings: commerceDefaults, selection: {} });
  assert.equal(result.amountPaise, 45000);
  assert.equal(result.creditPaise, 0);
  assert.throws(() => calculate({ settings: commerceDefaults }), errorCode("BENEFITS_UNAVAILABLE"));
});
test("discounts and credit redemption apply only to stitching with explicit independent rows", () => {
  const result = calculate();
  assert.equal(result.grossAmountPaise, 45000);
  assert.equal(result.stitchingPaise, 40000);
  assert.equal(result.discountPaise, 5000);
  assert.equal(result.creditPaise, 10000);
  assert.equal(result.amountPaise, 30000);
});
test("even a full stitching discount cannot make pickup and return free", () => {
  const result = calculate({ selection: { offerCode: "TEST", creditPaise: 0 }, offer: { ...offer, value: 10000000 } });
  assert.equal(result.discountPaise, 40000);
  assert.equal(result.amountPaise, 5000);
  assert.equal(result.maximumCreditPaise, 0);
});
test("unitemized or inconsistent quotes require review instead of guessing the eligible amount", () => {
  assert.equal(quoteStitchingPaise({ ...quote, lineItems: undefined }), null);
  assert.equal(quoteStitchingPaise({ ...quote, amountPaise: 1 }), null);
  assert.throws(() => calculate({ quote: { ...quote, lineItems: undefined } }), errorCode("ITEMIZED_QUOTE_REQUIRED"));
});
test("basis-point percentages round down once and respect the configured maximum", () => {
  const result = calculate({ quote: { ...quote, amountPaise: 45001, lineItems: [{ amountPaise: 40001, scope: "garment" }, { amountPaise: 5000, scope: "shipment" }] }, selection: { offerCode: "TEST" }, offer: { ...offer, type: "percentage", value: 3333, maxDiscountPaise: 20000 } });
  assert.equal(result.discountPaise, Math.floor(40001 * 3333 / 10000));
  assert.equal(calculate({ selection: { offerCode: "TEST" }, offer: { ...offer, type: "percentage", value: 5000, maxDiscountPaise: 6000 } }).discountPaise, 6000);
});
test("draft, wrong-garment, expired, depleted and repeated offers are rejected", () => {
  for (const patch of [{ status: "draft" }, { garments: ["blouse"] }, { endsAt: "2000-01-01T00:00:00.000Z" }, { startsAt: "2999-01-01T00:00:00.000Z" }, { totalUseLimit: 1, usedCount: 1 }, { minimumStitchingPaise: 40001 }]) assert.throws(() => calculate({ offer: { ...offer, ...patch } }), errorCode("OFFER_INELIGIBLE"));
  assert.throws(() => calculate({ offerUses: 1 }), errorCode("OFFER_INELIGIBLE"));
});
test("credit redemption checks the wallet and percentage cap after the discount", () => {
  assert.throws(() => calculate({ walletBalancePaise: 9999 }), errorCode("INSUFFICIENT_CREDITS"));
  assert.throws(() => calculate({ settings: { ...settings, maxCreditBps: 2500 } }), errorCode("INSUFFICIENT_CREDITS"));
  assert.equal(calculate({ settings: { ...settings, maxCreditBps: 2500 }, selection: { offerCode: "TEST", creditPaise: 8750 } }).creditPaise, 8750);
});
test("disabled subprogrammes reject saved values and clearing benefits remains possible", () => {
  assert.throws(() => calculate({ settings: { ...settings, offersEnabled: false } }), errorCode("OFFERS_UNAVAILABLE"));
  assert.throws(() => calculate({ settings: { ...settings, creditsEnabled: false } }), errorCode("CREDITS_UNAVAILABLE"));
  assert.equal(calculate({ settings: commerceDefaults, selection: { offerCode: "", creditPaise: 0 } }).amountPaise, 45000);
});
test("browser-supplied totals and credit ownership cannot be mass-assigned", () => {
  assert.equal(commerceSelectionInput.safeParse({ offerCode: "TEST", creditPaise: 1, amountPaise: 0 }).success, false);
  assert.equal(creditAdjustmentInput.safeParse({ owner: "a".repeat(24), clientId: "b".repeat(24), deltaPaise: 1, reason: "Valid reason", role: "admin" }).success, false);
  assert.equal(commerceSelectionInput.safeParse({ creditPaise: 0.5 }).success, false);
});
test("admin configuration requires terms, bounded percentages and stable unique milestone codes", () => {
  assert.equal(commerceSettingsInput.safeParse(commerceDefaults).success, false); // revision belongs to the envelope
  const { revision: _revision, ...base } = commerceDefaults;
  assert.equal(commerceSettingsInput.safeParse(base).success, true);
  assert.equal(commerceSettingsInput.safeParse({ ...base, enabled: true, creditsEnabled: true, maxCreditBps: 10000 }).success, false);
  assert.equal(commerceSettingsInput.safeParse({ ...base, milestones: [{ code: "STEP1", orders: 1, rewardPaise: 1 }, { code: "STEP1", orders: 2, rewardPaise: 2 }] }).success, false);
  assert.equal(commerceOfferInput.safeParse({ code: "TEST", name: "Fixture", type: "percentage", value: 10001, garments: ["kurti"] }).success, false);
});

function atomicStore(balancePaise) {
  const wallet = { balancePaise, revision: 0 }, entries = new Map();
  const query = value => ({ session: () => ({ lean: async () => value }) });
  const ctx = { models: {
    CommerceWallet: { findOneAndUpdate: async (_filter, update) => {
      if (update.$setOnInsert) return { ...wallet };
      if (wallet.balancePaise < _filter.balancePaise.$gte || wallet.balancePaise > _filter.balancePaise.$lte) return null;
      wallet.balancePaise += update.$inc.balancePaise; wallet.revision++;
      return { ...wallet };
    } },
    CommerceLedger: {
      findOne: ({ eventKey }) => query(entries.get(eventKey) || null),
      create: async ([entry]) => { if (entries.has(entry.eventKey)) throw Error("Duplicate simulated event."); entries.set(entry.eventKey, entry); return [entry]; },
    },
  } };
  return { ctx, wallet, entries };
}
test("two concurrent spends cannot both pass the conditional balance guard in a simulated atomic store", async () => {
  const { ctx, wallet, entries } = atomicStore(10000);
  const spend = eventKey => changeCommerceCredit(ctx, { owner: "a".repeat(24), eventKey, deltaPaise: -8000, kind: "redemption", reason: "Test spend" }, null);
  const results = await Promise.allSettled([spend("order:one"), spend("order:two")]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.code, "INSUFFICIENT_CREDITS");
  assert.equal(wallet.balancePaise, 2000);
  assert.equal(entries.size, 1);
});
test("replaying an identical adjustment returns its original ledger event while changed details conflict", async () => {
  const { ctx, wallet, entries } = atomicStore(0);
  const event = { owner: "a".repeat(24), eventKey: "admin:one", deltaPaise: 12345, kind: "admin", reason: "Test adjustment" };
  const original = await changeCommerceCredit(ctx, event, null);
  assert.deepEqual(await changeCommerceCredit(ctx, event, null), original);
  assert.equal(wallet.balancePaise, 12345); assert.equal(entries.size, 1);
  await assert.rejects(changeCommerceCredit(ctx, { ...event, deltaPaise: 12346 }, null), errorCode("CREDIT_EVENT_CONFLICT"));
});
