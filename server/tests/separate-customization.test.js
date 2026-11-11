import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateEstimate, estimateInput, submittedConfiguration } from "../src/pricing.js";
import { optionInput, designInput, orderInput } from "../src/domain.js";
import { componentInput } from "../src/workflow-input.js";
import { proposalMeasurementFields } from "../src/routes-proposals.js";
import mongoose from "mongoose";
import { createModels } from "../src/models.js";

const id = (number) => number.toString(16).padStart(24, "0");
const ids = { design: id(1), sleeve: id(2), puff: id(3), plain: id(4), neck: id(5), vneck: id(6), back: id(7), full: id(8), short: id(9), none: id(10), pocket: id(11), lace: id(12), ref: id(13) };
const option = (key, kind, fields = {}) => ({ _id: ids[key], name: key, kind, garments: ["kurti"], active: true, status: "published", priceMode: "included", measurementFields: [], ...fields });
const options = [
  option("sleeve", "sleeve", { compatibleLengthStyles: ["short", "full"], priceMode: "additional", amountPaise: 9000, measurementFields: ["sleeveLength", "armhole", "sleeveOpening"] }),
  option("puff", "sleeve", { compatibleLengthStyles: ["short"], priceMode: "additional", amountPaise: 12000, measurementFields: ["armhole"] }),
  option("plain", "sleeve", { compatibleLengthStyles: ["short", "full"], priceMode: "additional", amountPaise: 1000 }),
  option("neck", "neck", { measurementFields: ["frontNeckDepth", "frontNeckWidth"] }),
  option("vneck", "neck", { priceMode: "additional", amountPaise: 4000 }),
  option("back", "back", { measurementFields: ["backNeckWidth"] }),
  option("full", "sleeveLength", { lengthStyle: "full", priceMode: "additional", amountPaise: 3000, measurementFields: ["sleeveLength"] }),
  option("short", "sleeveLength", { lengthStyle: "short", priceMode: "additional", amountPaise: 2000, measurementFields: ["sleeveLength"] }),
  option("none", "sleeveLength", { lengthStyle: "sleeveless", measurementFields: ["sleeveLength", "armhole", "sleeveOpening"] }),
  option("pocket", "extra", { priceMode: "additional", amountPaise: 5000 }),
  option("lace", "extra", { priceMode: "additional", amountPaise: 8000, materialCoverage: "labor_and_materials", materialNotes: "Includes the configured lace only; garment fabric is customer supplied." }),
];
const design = { _id: ids.design, title: "Catalogue kurti", garment: "kurti", startingPricePaise: 65000, defaultComponents: { sleeve: ids.sleeve, sleeveLength: ids.full, neck: ids.neck, back: ids.back }, includedAddonIds: [] };
const input = (components = {}, fields = {}) => ({ garment: "kurti", quantity: 1, designId: ids.design, configuration: { source: "catalogue", mode: "custom", components, addonIds: [] }, logistics: { inbound: { method: "dropoff" }, outbound: { method: "collect" } }, ...fields });
const selected = (key) => ({ source: "option", optionId: ids[key] });
const priced = (value, changes = {}) => calculateEstimate(value, { design, options, settings: {}, ...changes });
const changedOptions = (key, fields) => options.map((record) => record._id === ids[key] ? { ...record, ...fields } : record);

test("review fixture uses 300 base plus 50 sleeve, zero length, 30 front and 20 back in integer paise", () => {
  const fixtureOptions = options.map(record => {
    const amountPaise = record._id === ids.plain ? 5000 : record._id === ids.vneck ? 3000 : record._id === ids.back ? 2000 : record.amountPaise;
    return { ...record, ...(record._id === ids.plain || record._id === ids.vneck || record._id === ids.back ? { priceMode: "additional", amountPaise } : {}) };
  });
  const result = calculateEstimate(input({ sleeve: selected("plain"), sleeveLength: selected("short"), neck: selected("vneck"), back: selected("back") }), {
    design: { ...design, startingPricePaise: 30000, defaultComponents: {} }, options: fixtureOptions, settings: {},
  });
  assert.equal(result.knownSubtotalPaise, 40000);
  assert.equal(result.estimatedTotalPaise, 40000);
  assert.equal(result.lineItems.find(line => line.code.startsWith("sleeveLength:")).amountPaise, 0);
  assert.equal(result.hasPending, false);
});

test("sleeve design and length are independent validated component keys; help needs no invented ID", () => {
  const value = input({ sleeve: selected("puff"), sleeveLength: selected("short"), neck: { source: "help", notes: "Please advise" } });
  assert.equal(estimateInput.safeParse(value).success, true);
  assert.equal(componentInput.safeParse({ source: "help" }).success, true);
  assert.equal(componentInput.safeParse({ source: "reference" }).success, false);
});

test("Mongoose stores the separate length and publication metadata without a database connection", async () => {
  const connection = mongoose.createConnection();
  const models = createModels(connection);
  const record = new models.DesignOption({ name: "Full sleeve length", kind: "sleeveLength", garments: ["kurti"], lengthStyle: "full", status: "published", displayOrder: 4, descriptionHi: "लंबाई", measurementFields: ["frontNeckWidth"] });
  await record.validate();
  assert.equal(record.toObject().lengthStyle, "full");
  assert.equal(record.toObject().displayOrder, 4);
});

test("submitted snapshots exclude parked sleeve/exact choices while leaving the recoverable draft untouched", () => {
  const value = input({ sleeve: { ...selected("puff"), notes: "Keep my parked choice" }, sleeveLength: selected("none") });
  const before = structuredClone(value);
  const normalized = submittedConfiguration(value.configuration, priced(value));
  assert.equal(normalized.components.sleeve, undefined);
  assert.equal(normalized.components.sleeveLength.optionId, ids.none);
  assert.deepEqual(value, before);
  value.configuration.mode = "exact"; value.configuration.addonIds = [ids.lace];
  const exact = submittedConfiguration(value.configuration, priced(value));
  assert.deepEqual(exact.components, {});
  assert.deepEqual(exact.addonIds, []);
  assert.equal(value.configuration.components.sleeve.optionId, ids.puff);
});

test("catalogue defaults accept a separate length and unique included finishing additions", () => {
  const record = { title: "Catalogue kurti", code: "K-01", slug: "catalogue-kurti", garment: "kurti", description: "A customer fabric stitching reference", defaultComponents: design.defaultComponents, includedAddonIds: [ids.pocket], startingPricePaise: 65000 };
  assert.equal(designInput.safeParse(record).success, true);
  assert.equal(designInput.safeParse({ ...record, includedAddonIds: [ids.pocket, ids.pocket] }).success, false);
});

test("included original sleeve and length are not charged again", () => {
  const value = priced(input());
  assert.equal(value.knownSubtotalPaise, 65000);
  assert.equal(value.components.sleeveLength.source, "original");
  assert.equal(value.components.sleeveLength.lengthStyle, "full");
  assert.equal(value.components.sleeveLength.included, true);
});

test("replacing a sleeve choice replaces its price while preserving length and neck selections", () => {
  const value = input({ sleeve: selected("puff"), sleeveLength: selected("short"), neck: selected("vneck") });
  assert.equal(priced(value).knownSubtotalPaise, 81000);
  value.configuration.components.sleeve = selected("plain");
  const result = priced(value);
  assert.equal(result.knownSubtotalPaise, 70000);
  assert.equal(result.components.neck.optionId, ids.vneck);
  assert.equal(result.components.sleeveLength.optionId, ids.short);
  assert.equal(result.lineItems.some((line) => line.code.includes(ids.puff)), false);
});

test("a length-only change ignores a legacy surcharge without changing the original design price", () => {
  const result = priced(input({ sleeveLength: selected("short") }));
  assert.equal(result.knownSubtotalPaise, 65000);
  assert.equal(result.lineItems.find(row=>row.code.startsWith("sleeveLength:")).amountPaise,0);
  assert.equal(result.components.sleeve.source, "original");
});

test("a separate non-sleeveless length wins over legacy style and always requires numeric sleeve length", () => {
  const records = options.map((record) => record._id === ids.sleeve ? { ...record, sleeveStyle: "sleeveless", measurementFields: [] }
    : record._id === ids.short ? { ...record, measurementFields: [] } : record);
  const result = priced(input({ sleeveLength: selected("short") }), { options: records });
  assert.ok(result.measurementFields.includes("sleeveLength"));
});

test("sleeveless ignores an unavailable parked sleeve, removes its charge and all sleeve measurements", () => {
  const value = input({ sleeve: { source: "option", optionId: id(9999), notes: "Keep for restoration" }, sleeveLength: selected("none") });
  const before = structuredClone(value);
  const result = priced(value);
  assert.equal(result.knownSubtotalPaise, 65000);
  assert.equal(result.components.sleeve.suppressed, true);
  assert.equal(result.measurementFields.some((field) => ["sleeveLength", "armhole", "sleeveOpening"].includes(field)), false);
  assert.ok(result.measurementFields.includes("frontNeckWidth"));
  assert.deepEqual(value, before);
});

test("switching back from sleeveless restores the parked compatible sleeve and its price", () => {
  const value = input({ sleeve: selected("puff"), sleeveLength: selected("none") });
  assert.equal(priced(value).knownSubtotalPaise, 65000);
  value.configuration.components.sleeveLength = selected("short");
  assert.equal(priced(value).knownSubtotalPaise, 77000);
  assert.equal(value.configuration.components.sleeve.optionId, ids.puff);
});

test("explicit unsupported sleeve/length pairs are rejected with both names", () => {
  assert.throws(() => priced(input({ sleeve: selected("puff") })), (error) => error.code === "INCOMPATIBLE_SLEEVE_LENGTH" && error.message.includes("puff") && error.message.includes("full"));
});

test("an unconfigured compatibility matrix remains pending instead of assuming universal support", () => {
  const result = priced(input({ sleeve: selected("plain") }), { options: changedOptions("plain", { compatibleLengthStyles: [] }) });
  assert.equal(result.estimatedTotalPaise, null);
  assert.ok(result.pendingItems.some((item) => item.code === "sleeve:compatibility"));
});

test("legacy designs without a separate length keep their old option behavior", () => {
  const result = priced(input({ sleeve: selected("plain") }), { design: { ...design, defaultComponents: { sleeve: ids.sleeve, neck: ids.neck, back: ids.back } }, options: changedOptions("plain", { compatibleLengthStyles: [] }) });
  assert.equal(result.knownSubtotalPaise, 66000);
  assert.equal(result.hasPending, false);
});

test("deprecated combined tables cannot alter the standalone sleeve-design charge", () => {
  const value = input({ sleeve: selected("puff"), sleeveLength: selected("short") }, { quantity: 2 });
  const result = priced(value, { options: changedOptions("puff", { sleevePricingMode: "combined", combinedLengthPrices: [{ lengthStyle: "short", amountPaise: 7000 }] }) });
  assert.equal(result.knownSubtotalPaise, 154000);
  assert.equal(result.lineItems.find(row=>row.code.includes(ids.puff)).amountPaise,24000);
  assert.equal(result.lineItems.find(row=>row.code.includes(ids.short)).amountPaise,0);
  assert.equal(result.lineItems.some(row=>row.code.includes(":combined")),false);
});

test("missing deprecated combined rules do not hide or increase a configured sleeve-design charge", () => {
  const result = priced(input({ sleeve: selected("puff"), sleeveLength: selected("short") }), { options: changedOptions("puff", { sleevePricingMode: "combined", combinedLengthPrices: [] }) });
  assert.equal(result.knownSubtotalPaise, 77000);
  assert.equal(result.pendingItems.some(row=>row.code === "sleeve:combined"),false);
});

test("an unchanged catalogue pair remains included even if its sleeve has combined pricing", () => {
  const result = priced(input(), { options: changedOptions("sleeve", { sleevePricingMode: "combined", combinedLengthPrices: [{ lengthStyle: "full", amountPaise: 99000 }] }) });
  assert.equal(result.knownSubtotalPaise, 65000);
});

test("reference work and master-tailor help remain price-after-review", () => {
  const result = priced(input({ neck: { source: "reference", referenceMediaId: ids.ref }, back: { source: "help" } }));
  assert.equal(result.estimatedTotalPaise, null);
  assert.equal(result.components.neck.referenceMediaId, ids.ref);
  assert.equal(result.components.back.source, "help");
  assert.equal(result.pendingItems.filter((row) => /Price after tailor review/.test(row.reason)).length, 2);
});

test("front and back incompatibility works in either direction and never mutates either selection", () => {
  const value = input({ neck: selected("vneck") }), before = structuredClone(value);
  assert.throws(() => priced(value, { options: changedOptions("vneck", { incompatibleOptionIds: [ids.back] }) }), (error) => error.code === "INCOMPATIBLE_OPTIONS");
  assert.throws(() => priced(value, { options: changedOptions("back", { incompatibleOptionIds: [ids.vneck] }) }), /neither neckline has been changed/);
  assert.deepEqual(value, before);
});

test("additions can be selected and removed individually, with labor/material scope in immutable estimates", () => {
  const value = input(); value.configuration.addonIds = [ids.pocket, ids.lace];
  let result = priced(value);
  assert.equal(result.knownSubtotalPaise, 78000);
  assert.equal(result.addons.find((item) => item.optionId === ids.pocket).materialCoverage, "labor_only");
  assert.equal(result.lineItems.find((item) => item.code.includes(ids.lace)).materialCoverage, "labor_and_materials");
  assert.match(result.addons.find((item) => item.optionId === ids.lace).materialNotes, /customer supplied/);
  value.configuration.addonIds = [ids.pocket];
  assert.equal(priced(value).knownSubtotalPaise, 70000);
});

test("exact configuration preserves included additions and ignores parked customization choices", () => {
  const value = input({ sleeve: selected("puff") });
  value.configuration.mode = "exact"; value.configuration.addonIds = [ids.lace];
  const result = priced(value, { design: { ...design, includedAddonIds: [ids.pocket] } });
  assert.equal(result.knownSubtotalPaise, 65000);
  assert.deepEqual(result.addons.map((item) => item.optionId), [ids.pocket]);
});

test("unrequested additions preserve catalogue defaults; explicitly empty custom additions remove them", () => {
  const value = input(); value.configuration.addonsChanged = false;
  const included = { design: { ...design, includedAddonIds: [ids.pocket] } };
  assert.deepEqual(priced(value, included).addons.map((item) => item.optionId), [ids.pocket]);
  value.configuration.addonsChanged = true;
  assert.deepEqual(priced(value, included).addons, []);
  value.configuration.addonIds = [ids.pocket, ids.lace];
  const result = priced(value, included);
  assert.equal(result.knownSubtotalPaise, 73000);
  assert.equal(result.addons.find((item) => item.optionId === ids.pocket).included, true);
});

test("draft/archived options and unsupported craft additions cannot be newly selected", () => {
  for (const status of ["draft", "archived"])
    assert.throws(() => priced(input({ sleeve: selected("plain") }), { options: changedOptions("plain", { status }) }), /unavailable/);
  const value = input(); value.configuration.addonIds = [ids.lace];
  for (const serviceType of ["embroidery", "painting", "knitting", "other"])
    assert.throws(() => priced(value, { options: changedOptions("lace", { serviceType }) }), /unavailable/);
});

test("option schema validates all six styles, explicit materials, and unique combined/compatibility values", () => {
  const base = { name: "Sleeve length", kind: "sleeveLength", garments: ["kurti"], status: "published" };
  for (const lengthStyle of ["sleeveless", "short", "elbow", "three_quarter", "full", "custom"])
    assert.equal(optionInput.safeParse({ ...base, lengthStyle }).success, true);
  assert.equal(optionInput.safeParse(base).success, false);
  assert.equal(optionInput.safeParse({ name: "Sleeve", kind: "sleeve", garments: ["kurti"], compatibleLengthStyles: ["short", "short"] }).success, false);
  assert.equal(optionInput.safeParse({ name: "Sleeve", kind: "sleeve", garments: ["kurti"], combinedLengthPrices: [{ lengthStyle: "short", amountPaise: 1 }, { lengthStyle: "short", amountPaise: 2 }] }).success, false);
  const extra = { name: "Lace", kind: "extra", garments: ["kurti"], materialCoverage: "labor_and_materials" };
  assert.equal(optionInput.safeParse(extra).success, false);
  assert.equal(optionInput.safeParse({ ...extra, materialNotes: "Includes this lace only" }).success, true);
  assert.equal(optionInput.safeParse({ ...extra, materialNotes: "Included lace", serviceType: "embroidery" }).success, false);
  assert.equal(optionInput.safeParse({ ...extra, status: "draft", serviceType: "embroidery" }).success, true);
});

test("front/back numeric widths are accepted later in measurement input, never in option choices", () => {
  const body = { ...input({ sleeve: { source: "reference", referenceMediaId: ids.ref }, sleeveLength: selected("none") }), preferences: {}, measurements: { unit: "in", method: "body", values: { bust: 36, waist: 30, hip: 38, shoulder: 14, length: 40, frontNeckWidth: 6, backNeckWidth: 5 } }, referenceMediaIds: [], customer: { name: "Test Customer", phone: "9876543210" }, fabricAcknowledged: true };
  assert.equal(orderInput.safeParse(body).success, true);
  body.measurements.values.frontNeckWidth = -1;
  assert.equal(orderInput.safeParse(body).success, false);
});

test("price fingerprints ignore unavailable parked sleeve revisions when sleeveless", () => {
  const value = input({ sleeve: selected("puff"), sleeveLength: selected("none") });
  assert.equal(priced(value).configurationVersion, priced(value, { options: changedOptions("puff", { revision: 99, active: false }) }).configurationVersion);
  assert.notEqual(priced(input({ sleeve: selected("plain") })).configurationVersion, priced(input({ sleeve: selected("plain") }), { options: changedOptions("plain", { revision: 2 }) }).configurationVersion);
});

test("length change proposals reconfirm only applicable measurements and retain unrelated stored values", () => {
  const data = { garment: "kurti", measurements: { reconfirmFields: ["frontNeckWidth"], values: { sleeveLength: 20, armhole: 15, frontNeckWidth: 5 } } };
  const before = priced(input()), after = priced(input({ sleeveLength: selected("none") }));
  assert.deepEqual(proposalMeasurementFields(data, before, after, ["sleeveLength"]), ["frontNeckWidth"]);
  assert.equal(data.measurements.values.sleeveLength, 20);
});
