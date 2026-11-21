import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { calculateEstimate, estimateInput } from "../src/pricing.js";
import { deliveryPricingInput, parcelInput, courierDeliveryCharge, COURIER_PENDING_REASON, COURIER_PARCEL_REASON, COURIER_EXPIRED_REASON } from "../src/delivery-pricing.js";
import { logisticsInput } from "../src/workflow-input.js";
import { createModels } from "../src/models.js";

const now = Date.parse("2026-11-20T10:00:00Z");
const parcel = { weightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 10, declaredValuePaise: 50000 };
const config = (extra = {}) => ({ mode: "courier", courierProvider: "shiprocket", originPin: "110001", ...extra });
const quote = (direction, extra = {}) => ({
  provider: "shiprocket", currency: "INR", totalPaise: direction === "inbound" ? 8000 : 13000,
  originPin: direction === "inbound" ? "110002" : "110001", destinationPin: direction === "inbound" ? "110001" : "110003",
  parcel: { ...parcel }, chargeableWeightGrams: 1500, courierId: "carrier-1", courierName: "Fixture courier", service: "surface",
  quotedAt: "2026-11-20T09:59:00Z", validUntil: "2026-11-20T10:04:00Z", ...extra,
});
const address = pin => ({ line1: "A customer address", city: "Delhi", state: "Delhi", pin });
const input = extra => ({ garment: "kurti", quantity: 3, configuration: { source: "catalogue", mode: "exact", components: {}, addonIds: [] },
  logistics: { inbound: { method: "business", address: address("110002"), parcel: { ...parcel } }, outbound: { method: "business", address: address("110003"), parcel: { ...parcel } } }, ...extra });
const design = { _id: "b".repeat(24), garment: "kurti", title: "Fixture kurti", startingPricePaise: 10000, defaultComponents: {} };
const priced = (extra = {}, request = input()) => calculateEstimate(request, { design, now, settings: { deliveryPricing: config() }, transportQuotes: { inbound: quote("inbound"), outbound: quote("outbound") }, ...extra });

test("courier configuration needs provider and origin but does not invent or require a minimum/per-kilometre rate", () => {
  const parsed = deliveryPricingInput.parse(config());
  assert.equal(parsed.courierProvider, "shiprocket"); assert.equal(parsed.inbound, undefined);
  assert.equal(deliveryPricingInput.safeParse(config({ courierProvider: undefined })).success, false);
  assert.equal(deliveryPricingInput.safeParse(config({ originPin: undefined })).success, false);
  assert.equal(deliveryPricingInput.safeParse(config({ courierProvider: "unknown" })).success, false);
  for (const provider of ["shiprocket", "delhivery", "bluedart"]) assert.equal(deliveryPricingInput.safeParse(config({ courierProvider: provider })).success, true);
  assert.equal(deliveryPricingInput.safeParse(config({ inbound: { minimumChargePaise: null, perKmPaise: 50000 } })).success, true);
});

test("parcel fields remain optional for legacy requests and require bounded complete measurements when present", () => {
  assert.deepEqual(parcelInput.parse(parcel), parcel);
  for (const change of [{ weightGrams: 0 }, { weightGrams: 30001 }, { weightGrams: 0.5 }, { heightCm: 0 }, { lengthCm: 201 }, { widthCm: Infinity }, { heightCm: undefined }, { declaredValuePaise: 0 }, { declaredValuePaise: 100000001 }])
    assert.equal(parcelInput.safeParse({ ...parcel, ...change }).success, false);
  const legacy = { inbound: { method: "dropoff" }, outbound: { method: "collect" } };
  assert.deepEqual(logisticsInput.parse(legacy), legacy);
  assert.deepEqual(logisticsInput.parse(input().logistics).inbound.parcel, parcel);
  assert.equal(estimateInput.safeParse({ ...input(), transportQuotes: { inbound: quote("inbound") } }).success, false);
});

test("trusted carrier quotes are charged per shipment with optional minimum adjustments shown separately", () => {
  const settings = { deliveryPricing: config({ inbound: { minimumChargePaise: 10000, perKmPaise: 999999 }, outbound: { minimumChargePaise: 5000 } }) };
  const result = priced({ settings }), legs = result.lineItems.filter(item => item.scope === "shipment");
  assert.equal(result.knownGarmentSubtotalPaise, 30000); assert.equal(result.knownTransportSubtotalPaise, 23000);
  assert.deepEqual(legs.map(item => item.quantity), [1, 1]);
  assert.deepEqual(legs.map(item => item.carrierQuotePaise), [8000, 13000]);
  assert.deepEqual(legs.map(item => item.minimumAdjustmentPaise), [2000, 0]);
  assert.deepEqual(legs.map(item => item.amountPaise), [10000, 13000]);
  assert.equal(legs[0].originPin, "110002"); assert.equal(legs[0].destinationPin, "110001");
  assert.equal(legs[1].originPin, "110001"); assert.equal(legs[1].destinationPin, "110003");
  assert.deepEqual(legs[0].parcel, parcel); assert.equal(legs[0].chargeableWeightGrams, 1500);
  const exact = courierDeliveryCharge(config(), "inbound", "110002", parcel, quote("inbound"), now);
  assert.equal(exact.amountPaise, 8000); assert.equal(exact.details.minimumAdjustmentPaise, 0); assert.equal(exact.details.minimumChargePaise, undefined);
});

test("missing parcel or provider quote stays pending and never uses flat zones, per-kilometre rates or an invented zero", () => {
  const settings = { deliveryPricing: config({ inbound: { minimumChargePaise: 5000, perKmPaise: 1000 } }), serviceAreas: [{ name: "Ignored zone", pinPrefixes: ["110"], enabled: true, inboundPaise: 100, outboundPaise: 100 }] };
  const missing = priced({ settings, transportQuotes: {} });
  assert.equal(missing.knownTransportSubtotalPaise, 0);
  assert.equal(missing.lineItems.some(item => item.scope === "shipment"), false);
  assert.equal(missing.pendingItems.find(item => item.code === "transport:inbound").reason, COURIER_PENDING_REASON);
  const noParcel = input(); delete noParcel.logistics.inbound.parcel;
  const result = priced({ settings }, noParcel);
  assert.equal(result.pendingItems.find(item => item.code === "transport:inbound").reason, COURIER_PARCEL_REASON);
  assert.equal(result.lineItems.some(item => item.code === "transport:inbound"), false);
});

test("quote provider, route, parcel, currency and billable weight must match the requested shipment", () => {
  for (const change of [{ provider: "delhivery" }, { currency: "USD" }, { originPin: "110001" }, { destinationPin: "400001" },
    { parcel: { ...parcel, lengthCm: 31 } }, { parcel: { ...parcel, declaredValuePaise: 60000 } }, { totalPaise: NaN }, { totalPaise: 80.5 }, { totalPaise: -1 },
    { chargeableWeightGrams: 100 }, { courierId: "" }, { courierName: "" }, { service: "" }]) {
    const result = courierDeliveryCharge(config(), "inbound", "110002", parcel, quote("inbound", change), now);
    assert.equal(result.amountPaise, null, JSON.stringify(change));
  }
});

test("expired, future and malformed quote times are rejected while valid snapshots retain audit times", () => {
  const expired = courierDeliveryCharge(config(), "inbound", "110002", parcel, quote("inbound", { validUntil: "2026-11-20T09:59:30Z" }), now);
  assert.equal(expired.amountPaise, null); assert.equal(expired.reason, COURIER_EXPIRED_REASON);
  for (const change of [{ quotedAt: "invalid" }, { validUntil: "invalid" }, { quotedAt: "2026-11-20T10:01:00Z" }, { quotedAt: "2026-11-20T10:03:00Z", validUntil: "2026-11-20T10:02:00Z" }])
    assert.equal(courierDeliveryCharge(config(), "inbound", "110002", parcel, quote("inbound", change), now).amountPaise, null);
  assert.equal(courierDeliveryCharge(config(), "inbound", "110002", parcel, quote("inbound"), now).details.validUntil, "2026-11-20T10:04:00.000Z");
});

test("fresh equivalent quotes share a fingerprint while actual prices, service and minimum changes invalidate it", () => {
  const first = priced().configurationVersion;
  const refreshed = { inbound: quote("inbound", { quotedAt: "2026-11-20T10:00:00Z", validUntil: "2026-11-20T10:05:00Z", courierName: "New marketing name", requestId: "new-provider-request" }), outbound: quote("outbound") };
  assert.equal(priced({ transportQuotes: refreshed }).configurationVersion, first);
  for (const change of [{ totalPaise: 8001 }, { service: "express" }, { courierId: "carrier-2" }])
    assert.notEqual(priced({ transportQuotes: { inbound: quote("inbound", change), outbound: quote("outbound") } }).configurationVersion, first);
  assert.notEqual(priced({ settings: { deliveryPricing: config({ inbound: { minimumChargePaise: 9000 } }) } }).configurationVersion, first);
});

test("courier and distance modes preserve alteration review-only work and do not mutate quote/config inputs", () => {
  const settings = { deliveryPricing: config() }, quotes = { inbound: quote("inbound"), outbound: quote("outbound") }, before = structuredClone({ settings, quotes });
  const result = priced({ design: { ...design, garment: "alteration", startingPricePaise: 15000 }, settings, transportQuotes: quotes }, input({ garment: "alteration" }));
  assert.equal(result.knownGarmentSubtotalPaise, 0); assert.equal(result.knownTransportSubtotalPaise, 21000); assert.equal(result.estimatedTotalPaise, null);
  assert.ok(result.pendingItems.some(item => item.code === "alteration:assessment")); assert.deepEqual({ settings, quotes }, before);
});

test("courier connection model stores encrypted fields only and reserves a unique provider identity", async () => {
  const connection = mongoose.createConnection(), models = createModels(connection);
  try {
    const saved = new models.CourierConnection({ provider: "shiprocket", encryptedCredentials: { ciphertext: "encrypted-fixture", iv: "base64-iv", tag: "base64-tag", keyVersion: 1 }, updatedBy: new mongoose.Types.ObjectId() });
    await saved.validate(); assert.equal(saved.toObject().encryptedCredentials.keyVersion, 1);
    assert.equal(saved.toObject().apiToken, undefined); assert.equal(models.CourierConnection.schema.path("encryptedCredentials").options.select, false);
    assert.ok(models.CourierConnection.schema.indexes().some(([keys, options]) => keys.provider === 1 && options.unique));
    const missing = new models.CourierConnection({ provider: "shiprocket" }); await assert.rejects(missing.validate(), /encryptedCredentials/);
    const invalid = new models.CourierConnection({ provider: "unregistered", encryptedCredentials: { ciphertext: "x", iv: "x", tag: "x", keyVersion: 0 } }); await assert.rejects(invalid.validate());
    assert.throws(() => new models.CourierConnection({ provider: "shiprocket", apiToken: "must-not-persist", encryptedCredentials: { ciphertext: "x", iv: "x", tag: "x", keyVersion: 1 } }), /strict/i);
  } finally { await connection.close(); }
});

test("Shiprocket pickup needs an explicit declared value while other quote directions can omit it", () => {
  const withoutValue = { ...parcel }; delete withoutValue.declaredValuePaise;
  const pickup = courierDeliveryCharge(config(), "inbound", "110002", withoutValue, quote("inbound", { parcel: withoutValue }), now);
  assert.equal(pickup.amountPaise, null); assert.match(pickup.reason, /declared value/);
  const forward = courierDeliveryCharge(config(), "outbound", "110003", withoutValue, quote("outbound", { parcel: withoutValue }), now);
  assert.equal(forward.amountPaise, 13000);
  const otherProvider = courierDeliveryCharge(config({ courierProvider: "delhivery" }), "inbound", "110002", withoutValue, quote("inbound", { provider: "delhivery", parcel: withoutValue }), now);
  assert.equal(otherProvider.amountPaise, 8000);
});
