import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { deliveryPricingInput, distanceDeliveryCharge } from "../src/delivery-pricing.js";
import { calculateEstimate, estimateInput } from "../src/pricing.js";
import { settingsInput, defaultSettings } from "../src/domain.js";
import { createModels } from "../src/models.js";

const config = (extra = {}) => ({
  mode: "distance", originPin: "110001", distanceBasis: "pin_area", formula: "base_plus_distance",
  inbound: { minimumChargePaise: 5000, perKmPaise: 1000 },
  outbound: { minimumChargePaise: 3000, perKmPaise: 2000 }, ...extra,
});
const resolved = (destinationPin, distanceMeters, extra = {}) => ({
  distanceMeters, basis: "pin_area", originPin: "110001", destinationPin,
  source: "Isolated PIN-area fixture", sourceVersion: "fixture-v1", ...extra,
});
const address = pin => ({ line1: "A test address", city: "Delhi", state: "Delhi", pin });
const input = (extra = {}) => ({
  garment: "kurti", quantity: 4, configuration: { source: "catalogue", mode: "exact", components: {}, addonIds: [] },
  logistics: { inbound: { method: "business", address: address("110002") }, outbound: { method: "business", address: address("110003") } }, ...extra,
});
const design = { _id: "f".repeat(24), garment: "kurti", title: "Fixture kurti", startingPricePaise: 10000, defaultComponents: {} };
const distances = () => ({ inbound: resolved("110002", 2501), outbound: resolved("110003", 1500) });
const priced = (changes = {}) => calculateEstimate(input(), { design, settings: { deliveryPricing: config() }, transportDistances: distances(), ...changes });
const flatAreas = [{ name: "Existing flat PIN area", pinPrefixes: ["110"], enabled: true, inboundPaise: 800, outboundPaise: 900 }];

test("distance settings require explicit rates and an origin PIN while inactive mode preserves parked values", () => {
  assert.equal(deliveryPricingInput.safeParse(config()).success, true);
  const defaulted = deliveryPricingInput.parse({ ...config(), distanceBasis: undefined, formula: undefined });
  assert.equal(defaulted.distanceBasis, "pin_area"); assert.equal(defaulted.formula, "base_plus_distance");
  for (const change of [{ originPin: "110" }, { originPin: undefined }, { inbound: {} }, { outbound: { minimumChargePaise: null, perKmPaise: 0 } }, { inbound: { minimumChargePaise: 0, perKmPaise: 0.5 } }, { inbound: { minimumChargePaise: -1, perKmPaise: 10 } }, { outbound: { minimumChargePaise: 0, perKmPaise: 1000001 } }, { formula: "unconfigured" }, { distanceBasis: "unknown" }, { apiKey: "not-a-settings-field" }])
    assert.equal(deliveryPricingInput.safeParse(config(change)).success, false, JSON.stringify(change));
  assert.equal(deliveryPricingInput.safeParse(config({ mode: "service_areas", originPin: "", inbound: { minimumChargePaise: 5000, perKmPaise: null }, outbound: {} })).success, true);
  assert.equal(deliveryPricingInput.safeParse(config({ inbound: { minimumChargePaise: 0, perKmPaise: 0 } })).success, true);
  const legacySettings = Object.fromEntries(Object.keys(settingsInput.shape).filter(key => defaultSettings[key] !== undefined).map(key => [key, defaultSettings[key]]));
  assert.equal(Object.hasOwn(settingsInput.parse(legacySettings), "deliveryPricing"), false);
  assert.deepEqual(settingsInput.parse({ ...legacySettings, deliveryPricing: config() }).deliveryPricing, config());
});

test("minimum-plus-distance uses explicit whole-kilometre ceiling and independent per-shipment direction charges", () => {
  const value = priced();
  assert.equal(value.knownGarmentSubtotalPaise, 40000); assert.equal(value.knownTransportSubtotalPaise, 15000);
  const legs = value.lineItems.filter(item => item.scope === "shipment");
  assert.deepEqual(legs.map(item => item.amountPaise), [8000, 7000]); assert.deepEqual(legs.map(item => item.quantity), [1, 1]);
  assert.deepEqual(legs.map(item => item.billableKm), [3, 2]);
  assert.equal(legs[0].distanceMeters, 2501); assert.equal(legs[0].minimumChargePaise, 5000); assert.equal(legs[0].perKmPaise, 1000);
  assert.equal(legs[0].distanceChargePaise, 3000); assert.equal(legs[0].originPin, "110001"); assert.equal(legs[0].destinationPin, "110002");
  assert.equal(legs[0].distanceSourceVersion, "fixture-v1"); assert.equal(legs[0].distanceBasis, "pin_area");
});

test("minimum-fare applies a floor instead of adding it to distance charges", () => {
  const settings = config({ formula: "minimum_fare" });
  assert.equal(distanceDeliveryCharge(settings, "inbound", "110002", resolved("110002", 1000)).amountPaise, 5000);
  assert.equal(distanceDeliveryCharge(settings, "inbound", "110002", resolved("110002", 10001)).amountPaise, 11000);
  assert.equal(distanceDeliveryCharge(config(), "inbound", "110002", resolved("110002", 10001)).amountPaise, 16000);
});

test("zero distance keeps the explicitly configured minimum without inventing a kilometre", () => {
  const result = distanceDeliveryCharge(config(), "inbound", "110001", resolved("110001", 0));
  assert.equal(result.details.billableKm, 0); assert.equal(result.details.distanceChargePaise, 0); assert.equal(result.amountPaise, 5000);
  assert.equal(distanceDeliveryCharge(config({ inbound: { minimumChargePaise: 0, perKmPaise: 0 } }), "inbound", "110001", resolved("110001", 0)).amountPaise, 0);
});

test("missing, malformed, mismatched and unavailable distances stay pending without flat-zone fallback", () => {
  const cases = [undefined, resolved("110002", -1), resolved("110002", NaN), resolved("110002", Infinity), resolved("110002", "1000"), resolved("110002", 50000001), resolved("110002", 1000, { basis: "road" }), resolved("110002", 1000, { originPin: "400001" }), resolved("400001", 1000), resolved("110002", 1000, { sourceVersion: "" })];
  for (const entry of cases) {
    const result = calculateEstimate(input(), { design, settings: { deliveryPricing: config(), serviceAreas: flatAreas }, transportDistances: { inbound: entry } });
    assert.equal(result.knownTransportSubtotalPaise, 0);
    assert.equal(result.lineItems.some(item => item.code === "transport:inbound"), false);
    assert.ok(result.pendingItems.some(item => item.code === "transport:inbound")); assert.equal(result.estimatedTotalPaise, null);
  }
  const broken = priced({ settings: { deliveryPricing: { mode: "distance", originPin: "110001" }, serviceAreas: flatAreas } });
  assert.equal(broken.knownTransportSubtotalPaise, 0);
});

test("road configuration can be parked but cannot activate unsupported per-kilometre routing", () => {
  const parked = config({ mode: "service_areas", distanceBasis: "road" });
  assert.equal(deliveryPricingInput.safeParse(parked).success, true);
  assert.equal(deliveryPricingInput.safeParse({ ...parked, mode: "distance" }).success, false);
  assert.equal(distanceDeliveryCharge(config({ distanceBasis: "road" }), "outbound", "110003", resolved("110003", 7999, { basis: "road" })).amountPaise, null);
});

test("legacy service-area mode preserves configured flat rates and customer arrangements need no distance", () => {
  for (const deliveryPricing of [undefined, config({ mode: "service_areas", inbound: { minimumChargePaise: null, perKmPaise: null } })]) {
    const value = calculateEstimate(input(), { design, settings: { serviceAreas: flatAreas, ...(deliveryPricing ? { deliveryPricing } : {}) }, transportDistances: distances() });
    assert.equal(value.knownTransportSubtotalPaise, 1700);
  }
  const self = calculateEstimate(input({ logistics: { inbound: { method: "dropoff" }, outbound: { method: "customer_courier" } } }), { design, settings: { deliveryPricing: config() } });
  assert.equal(self.knownTransportSubtotalPaise, 0);
  assert.equal(self.pendingItems.some(item => item.code.startsWith("transport:")), false);
});

test("delivery configuration, resolved distance and provenance participate in the estimate fingerprint", () => {
  const original = priced().configurationVersion;
  assert.notEqual(original, priced({ settings: { deliveryPricing: config({ inbound: { minimumChargePaise: 6000, perKmPaise: 1000 } }) } }).configurationVersion);
  assert.notEqual(original, priced({ transportDistances: { ...distances(), inbound: resolved("110002", 2502) } }).configurationVersion);
  assert.notEqual(original, priced({ transportDistances: { ...distances(), inbound: resolved("110002", 2501, { sourceVersion: "fixture-v2" }) } }).configurationVersion);
  assert.notEqual(original, priced({ settings: { deliveryPricing: config({ distanceBasis: "road" }) } }).configurationVersion);
  assert.notEqual(original, priced({ settings: { deliveryPricing: config({ originPin: "400001" }) } }).configurationVersion);
  assert.equal(estimateInput.safeParse({ ...input(), transportDistances: distances() }).success, false);
});

test("alteration work remains pending while distance transport alone contributes known charges", () => {
  const result = calculateEstimate(input({ garment: "alteration" }), { design: { ...design, garment: "alteration", startingPricePaise: 15000 }, settings: { deliveryPricing: config() }, transportDistances: distances() });
  assert.equal(result.knownGarmentSubtotalPaise, 0); assert.equal(result.knownTransportSubtotalPaise, 15000);
  assert.equal(result.knownSubtotalPaise, 15000); assert.equal(result.estimatedTotalPaise, null);
  assert.ok(result.pendingItems.some(item => item.code === "alteration:assessment"));
});

test("Mongoose settings persist valid distance configuration and reject incomplete active rates without a database", async () => {
  const connection = mongoose.createConnection(), models = createModels(connection);
  try {
    const valid = new models.SiteSettings({ key: "main", deliveryPricing: config(), serviceAreas: flatAreas });
    await valid.validate(); assert.deepEqual(valid.deliveryPricing, config()); assert.equal(valid.serviceAreas[0].inboundPaise, 800);
    const invalid = new models.SiteSettings({ key: "main", deliveryPricing: config({ inbound: {} }) });
    await assert.rejects(invalid.validate(), /deliveryPricing/);
    const parked = new models.SiteSettings({ key: "main", deliveryPricing: config({ mode: "service_areas", inbound: { minimumChargePaise: null } }) });
    await parked.validate();
  } finally { await connection.close(); }
});
