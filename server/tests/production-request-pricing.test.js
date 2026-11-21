import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateEstimate, matchingServiceArea } from "../src/pricing.js";
import { needsEnteredMeasurements, serviceAreaInput } from "../src/workflow-input.js";
import { orderInput } from "../src/domain.js";
import mongoose from "mongoose";
import { createModels } from "../src/models.js";

const ids = { design: "800000000000000000000001", sleeve: "800000000000000000000002", neck: "800000000000000000000003", back: "800000000000000000000004", replacement: "800000000000000000000005", addon: "800000000000000000000006" };
const original = (key, kind) => ({ _id: ids[key], code: key, name: key, kind, garments: ["kurti"], status: "published", active: true, priceMode: "additional", amountPaise: 5000, imageMediaIds: ["800000000000000000000010"] });
const options = [original("sleeve", "sleeve"), original("neck", "neck"), original("back", "back"), original("replacement", "sleeve"), original("addon", "extra")];
const design = { _id: ids.design, code: "K-0", title: "Embroidered kurti", garment: "kurti", startingPricePaise: 30000, defaultComponents: { sleeve: ids.sleeve, neck: ids.neck, back: ids.back } };
const ownTransport = { inbound: { method: "dropoff" }, outbound: { method: "collect" } };
const input = (changes = {}) => ({ garment: "kurti", quantity: 1, designId: ids.design, configuration: { source: "catalogue", mode: "exact", components: {}, addonIds: [] }, logistics: ownTransport, ...changes });
const priced = (value = input(), changes = {}) => calculateEstimate(value, { design, options, ...changes });
const address = pin => ({ line1: "123 Test road", city: "Delhi", state: "Delhi", pin });
const serviceAreas = [
  { name: "Broad area", pinPrefixes: ["11"], enabled: true, inboundPaise: 10000, outboundPaise: 11000 },
  { name: "Local area", nameHi: "स्थानीय क्षेत्र", pinPrefixes: ["1100"], enabled: true, inboundPaise: 8000, outboundPaise: 15000 },
];

test("PIN-specific pickup and return charges are independent and charged once per shipment", () => {
  const result = priced(input({ quantity: 4, logistics: { inbound: { method: "business", address: address("110001") }, outbound: { method: "business", address: address("110002") } } }), { settings: { serviceAreas } });
  assert.equal(result.knownGarmentSubtotalPaise, 120000);
  assert.equal(result.knownTransportSubtotalPaise, 23000);
  assert.equal(result.knownSubtotalPaise, 143000);
  const transport = result.lineItems.filter(line => line.scope === "shipment");
  assert.deepEqual(transport.map(line => line.quantity), [1, 1]);
  assert.deepEqual(transport.map(line => line.unitAmountPaise), [8000, 15000]);
  assert.equal(transport[0].postalCode, "110001");
  assert.equal(transport[0].serviceAreaNameHi, "स्थानीय क्षेत्र");
  assert.equal(transport[0].direction, "inbound");
  assert.equal(transport[1].direction, "outbound");
});

test("more specific pending transport rates do not fall back to an unrelated cheaper zone", () => {
  const areas = [...serviceAreas, { name: "Confirm locally", pinPrefixes: ["110001"], enabled: true, inboundPaise: null, outboundPaise: 12000 }];
  const result = priced(input({ logistics: { inbound: { method: "business", address: address("110001") }, outbound: { method: "collect" } } }), { settings: { serviceAreas: areas } });
  assert.equal(result.knownTransportSubtotalPaise, 0);
  assert.equal(result.estimatedTotalPaise, null);
  assert.equal(result.pendingItems.find(item => item.code === "transport:inbound").postalCode, "110001");
});

test("unconfigured PINs and malformed legacy service-area data remain pending without crashing", () => {
  assert.equal(matchingServiceArea("not an area list", "110001"), null);
  assert.equal(matchingServiceArea(serviceAreas, "110"), null);
  assert.equal(matchingServiceArea([{ enabled: true, pinPrefixes: "110" }, null], "110001"), null);
  const result = priced(input({ logistics: { inbound: { method: "business", address: address("560001") }, outbound: { method: "collect" } } }), { settings: { serviceAreas } });
  assert.equal(result.estimatedTotalPaise, null);
  assert.equal(result.lineItems.some(line => line.code === "transport:inbound"), false);
});

test("an explicitly configured zero transport rate is kept while missing rates stay pending", () => {
  const result = priced(input({ logistics: { inbound: { method: "business", address: address("110001") }, outbound: { method: "collect" } } }), { settings: { serviceAreas: [{ name: "Complimentary local pickup", pinPrefixes: ["110001"], enabled: true, inboundPaise: 0, outboundPaise: null }] } });
  assert.equal(result.lineItems.find(line => line.code === "transport:inbound").amountPaise, 0);
  assert.equal(result.hasPending, false);
});

test("customer-arranged couriers add no atelier charge and retain the direct-payment explanation", () => {
  const result = priced(input({ logistics: { inbound: { method: "customer_courier" }, outbound: { method: "customer_courier" } } }));
  assert.equal(result.knownTransportSubtotalPaise, 0);
  assert.ok(result.lineItems.filter(line => line.scope === "shipment").every(line => line.method === "customer_courier" && line.label.includes("customer pays their courier directly")));
});

test("uploaded designs never use a garment base fallback or publish selected styling costs as a final quote", () => {
  const value = input({ designId: undefined, configuration: { source: "reference", mode: "custom", components: { sleeve: { source: "option", optionId: ids.replacement }, neck: { source: "option", optionId: ids.neck }, back: { source: "option", optionId: ids.back } }, addonIds: [ids.addon] }, logistics: { inbound: { method: "business", address: address("110001") }, outbound: { method: "collect" } } });
  const result = priced(value, { design: null, settings: { garmentBasePrices: { kurti: 30000 }, serviceAreas } });
  assert.equal(result.knownSubtotalPaise, 8000);
  assert.equal(result.knownGarmentSubtotalPaise, 0);
  assert.equal(result.knownTransportSubtotalPaise, 8000);
  assert.equal(result.estimatedTotalPaise, null);
  assert.equal(result.uploadedDesignReviewRequired, true);
  assert.ok(result.pendingItems.some(item => item.code === "stitching"));
  assert.ok(result.pendingItems.some(item => item.code === "extra:" + ids.addon));
  assert.deepEqual(result.components.sleeve.imageMediaIds, options[0].imageMediaIds);
});

test("uploaded references do not inherit archived included add-ons from a stale catalogue identity", () => {
  const value = input({ configuration: { source: "reference", mode: "custom", components: {}, addonIds: [ids.addon] } });
  assert.throws(() => priced(value, { design: { ...design, includedAddonIds: [ids.addon] }, options: options.map(option => option.kind === "extra" ? { ...option, active: false, status: "archived" } : option) }), /unavailable/);
});

test("unchanged catalogue parts are included once and unresolved originals use customer-facing review text", () => {
  const result = priced();
  assert.equal(result.knownSubtotalPaise, 30000);
  assert.ok(result.lineItems.filter(line => line.included).every(line => line.amountPaise === 0));
  const unresolved = priced(input(), { design: { ...design, defaultComponents: {}, designDetails: { sleeve: "Bishop sleeve", sleeveHi: "बिशप आस्तीन" } } });
  assert.equal(unresolved.components.sleeve.nameHi, "बिशप आस्तीन");
  assert.ok(unresolved.pendingItems.every(item => !/admin|invented/i.test(item.reason)));
});

test("alterations request a garment assessment without irrelevant sleeve and neckline defaults", () => {
  const result = priced(input({ garment: "alteration" }), { design: { _id: ids.design, title: "Fit adjustments", garment: "alteration", startingPricePaise: 15000, defaultComponents: {} }, options: [] });
  assert.equal(result.knownSubtotalPaise, 0);
  assert.equal(result.knownGarmentSubtotalPaise, 0);
  assert.equal(result.lineItems.some(item => item.scope === "garment"), false);
  assert.equal(result.estimatedTotalPaise, null);
  assert.deepEqual(result.components, {});
  assert.deepEqual(result.pendingItems.map(item => item.code), ["alteration:assessment"]);
});

test("an alteration cannot receive unpriced garment-style customizations through a forged payload", () => {
  const value = input({ garment: "alteration", configuration: { source: "catalogue", mode: "custom", components: { neck: { source: "option", optionId: ids.neck } }, addonIds: [] } });
  assert.throws(() => priced(value, { design: { ...design, garment: "alteration" } }), /not available for an alteration/);
});

test("physical sample garments and online help bypass entered measurements while self entry still requires them", () => {
  assert.equal(needsEnteredMeasurements({ takenBy: "sample", method: "garment" }), false);
  assert.equal(needsEnteredMeasurements({ takenBy: "assistance", method: "body" }), false);
  assert.equal(needsEnteredMeasurements({ takenBy: "self", method: "body" }), true);
  assert.equal(needsEnteredMeasurements({ takenBy: "tailor", method: "garment" }), true);
});

test("transport settings accept bilingual names and preserve integer paise validation", () => {
  assert.equal(serviceAreaInput.safeParse(serviceAreas[1]).success, true);
  assert.equal(serviceAreaInput.safeParse({ ...serviceAreas[1], inboundPaise: 8.5 }).success, false);
});

const order = changes => ({
  ...input(), preferences: {}, measurements: { unit: "in", method: "assistance", values: {} },
  referenceMediaIds: [], customer: { name: "Test customer", phone: "9876543210" }, fabricAcknowledged: true, ...changes,
});

test("sample garments require explicit confirmation and accept a request without typed measurements", () => {
  const measurements = { unit: "in", method: "garment", takenBy: "sample", sampleGarmentIncluded: true, values: {}, reconfirmFields: ["bust"] };
  assert.equal(orderInput.safeParse(order({ measurements })).success, true);
  assert.equal(orderInput.safeParse(order({ measurements: { ...measurements, sampleGarmentIncluded: false } })).success, false);
  assert.equal(orderInput.safeParse(order({ measurements: { ...measurements, method: "body" } })).success, false);
  assert.equal(orderInput.safeParse(order({ measurements: { ...measurements, values: { bust: 36 } } })).success, false);
});

test("optional preferred-date reasons are trimmed and preserved without changing legacy absent-field request hashes", async () => {
  const legacy = orderInput.parse(order());
  assert.equal(Object.hasOwn(legacy, "preferredDateReason"), false);
  assert.equal(Object.hasOwn(legacy.measurements, "sampleGarmentIncluded"), false);
  const body = orderInput.parse(order({ preferredDate: "2099-12-31", preferredDateReason: "  Family wedding  " }));
  assert.equal(body.preferredDateReason, "Family wedding");
  assert.equal(orderInput.safeParse(order({ preferredDateReason: "x".repeat(1001) })).success, false);
  const connection = mongoose.createConnection();
  const models = createModels(connection);
  const saved = new models.Order({ ...body, owner: new mongoose.Types.ObjectId(), orderNumber: "TEST-PREFERRED", idempotencyKey: "preferred-date-test", requestHash: "unit-fixture" });
  await saved.validate();
  assert.equal(saved.toObject().preferredDateReason, "Family wedding");
  await connection.close();
});

test("alteration assessment ignores legacy catalogue and service base prices while charging only configured PIN transport", () => {
  const logistics = { inbound: { method: "business", address: address("110001") }, outbound: { method: "business", address: address("110002") } };
  for (const base of [undefined, 0, 15000, 99000]) {
    const result = calculateEstimate({ garment: "alteration", quantity: 4, logistics }, { settings: { garmentBasePrices: { alteration: base }, serviceAreas } });
    assert.equal(result.knownGarmentSubtotalPaise, 0); assert.equal(result.knownTransportSubtotalPaise, 23000);
    assert.equal(result.knownSubtotalPaise, 23000); assert.equal(result.estimatedTotalPaise, null);
    assert.equal(result.hasPending, true); assert.ok(result.pendingItems.some(item => item.code === "alteration:assessment"));
    assert.ok(result.lineItems.every(item => item.scope === "shipment"));
  }
});
test("configured alteration fit and add-on fees remain pending before garment review", () => {
  const fit = { ...original("sleeve", "fit"), garments: ["alteration"], priceMode: "additional", amountPaise: 7000 };
  const extra = { ...original("addon", "extra"), garments: ["alteration"], priceMode: "replacement", replacementAdjustmentPaise: 8000 };
  const alterationDesign = { ...design, garment: "alteration", startingPricePaise: 15000, defaultComponents: {}, includedAddonIds: [] };
  const value = input({ garment: "alteration", configuration: { source: "catalogue", mode: "custom", components: { fit: { source: "option", optionId: fit._id } }, addonIds: [extra._id] } });
  const result = calculateEstimate(value, { design: alterationDesign, options: [fit, extra] });
  assert.equal(result.knownGarmentSubtotalPaise, 0); assert.equal(result.knownSubtotalPaise, 0);
  assert.equal(result.estimatedTotalPaise, null); assert.ok(result.lineItems.every(item => item.scope === "shipment"));
  assert.deepEqual(result.pendingItems.map(item => item.code), ["alteration:assessment", "fit:" + fit._id, "extra:" + extra._id]);
  assert.equal(result.components.fit.optionId, fit._id); assert.equal(result.addons[0].optionId, extra._id);
  const exact = calculateEstimate({ ...value, configuration: { source: "catalogue", mode: "exact", components: {}, addonIds: [] } }, { design: { ...alterationDesign, defaultComponents: { fit: fit._id }, includedAddonIds: [extra._id] }, options: [fit, extra] });
  assert.equal(exact.knownGarmentSubtotalPaise, 0); assert.equal(exact.estimatedTotalPaise, null);
  assert.ok(exact.lineItems.every(item => item.scope === "shipment"));
});
