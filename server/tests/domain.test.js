import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orderInput,
  designInput,
  requestHash,
  checkTransition,
  businessDate,
  quoteInput,
} from "../src/domain.js";
import { loadConfig } from "../src/config.js";
export const validOrder = () => ({
  garment: "kurti",
  quantity: 1,
  preferences: {
    neck: "Round neck",
    sleeve: "Three-quarter",
    back: "Simple",
    fit: "Comfort",
    length: "Knee",
    extraWork: "",
  },
  measurements: {
    unit: "in",
    method: "body",
    values: { bust: 36, waist: 30, hip: 38, shoulder: 14, length: 40 },
    notes: "",
  },
  referenceMediaIds: [],
  customer: { name: "Test customer", phone: "9876543210" },
  address: {
    line1: "Test address only",
    line2: "",
    city: "Delhi",
    state: "Delhi",
    pin: "110001",
  },
  notes: "Test only",
  fabricAcknowledged: true,
});
test("body measurements are validated and phone is normalized", () => {
  const value = orderInput.parse(validOrder());
  assert.equal(value.customer.phone, "919876543210");
});
test("body and garment methods require all relevant fields", () => {
  const v = validOrder();
  delete v.measurements.values.bust;
  assert.equal(orderInput.safeParse(v).success, false);
  v.measurements.method = "garment";
  assert.equal(orderInput.safeParse(v).success, false);
});
test("assistance preserves method and permits omitted measurements", () => {
  const v = validOrder();
  v.measurements = {
    unit: "cm",
    method: "assistance",
    values: {},
    notes: "Need help",
  };
  assert.equal(orderInput.parse(v).measurements.method, "assistance");
});
test("centimetre values are checked after conversion", () => {
  const v = validOrder();
  v.measurements.unit = "cm";
  v.measurements.values = {
    bust: 91.44,
    waist: 76.2,
    hip: 96.52,
    shoulder: 35.56,
    length: 101.6,
  };
  assert.ok(orderInput.safeParse(v).success);
  v.measurements.values.bust = 5;
  assert.equal(orderInput.safeParse(v).success, false);
});
test("unknown measurements and client-controlled statuses are rejected", () => {
  const v = validOrder();
  v.measurements.values.secret = 30;
  assert.equal(orderInput.safeParse(v).success, false);
  delete v.measurements.values.secret;
  v.status = "delivered";
  assert.equal(orderInput.safeParse(v).success, false);
});
test("alterations require a description", () => {
  const v = validOrder();
  v.garment = "alteration";
  v.measurements.values = {};
  assert.equal(orderInput.safeParse(v).success, false);
  v.measurements.notes = "Shorten hem by one inch";
  assert.ok(orderInput.safeParse(v).success);
});
test("fabric acknowledgement and finite numeric inputs are mandatory", () => {
  const v = validOrder();
  v.fabricAcknowledged = false;
  assert.equal(orderInput.safeParse(v).success, false);
  v.fabricAcknowledged = true;
  v.measurements.values.bust = Infinity;
  assert.equal(orderInput.safeParse(v).success, false);
});
test("hash canonicalization ignores object key ordering but not changed values", () => {
  assert.equal(requestHash({ a: 1, b: 2 }), requestHash({ b: 2, a: 1 }));
  assert.notEqual(requestHash({ a: 1 }), requestHash({ a: 2 }));
});
test("state machine disallows skipping customer acceptance", () => {
  assert.throws(() => checkTransition("under_review", "customer_accepted"), {
    code: "INVALID_TRANSITION",
  });
  assert.throws(() => checkTransition("quote_sent", "fabric_received"), {
    code: "INVALID_TRANSITION",
  });
  assert.doesNotThrow(() =>
    checkTransition("customer_accepted", "fabric_received"),
  );
});
test("design validation rejects private URL and arbitrary role fields", () => {
  const d = {
    title: "Test design",
    code: "T01",
    slug: "test-design",
    garment: "kurti",
    description: "A test stitching service.",
    startingPricePaise: 50000,
    mediaIds: [],
    status: "draft",
  };
  assert.ok(designInput.safeParse(d).success);
  assert.equal(
    designInput.safeParse({ ...d, imageUrl: "https://attacker.test/x" })
      .success,
    false,
  );
});
test("current business date is stable format and old quote delivery date fails", () => {
  assert.match(businessDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(
    quoteInput.safeParse({
      revision: 0,
      amountPaise: 1000,
      deliveryDate: "2020-01-01",
    }).success,
    false,
  );
});
test("configuration rejects wildcard CORS and insecure production origins", () => {
  const c = {
    MONGODB_URI: "mongodb://localhost/test",
    CORS_ORIGINS: "*",
    JWT_SECRET: Buffer.alloc(64, 5).toString("base64url"),
  };
  assert.throws(() => loadConfig(c));
  assert.throws(() =>
    loadConfig({
      ...c,
      NODE_ENV: "production",
      CORS_ORIGINS: "http://example.test",
    }),
  );
});

test("optional privacy opt-in remains exact while mandatory startup settings remain strict", () => {
  const config = { MONGODB_URI: "mongodb://localhost/isolated", CORS_ORIGINS: "https://example.test", JWT_SECRET: Buffer.alloc(48, 7).toString("base64url") };
  for (const flag of [undefined, "false", "true"]) {
    const parsed = loadConfig({ ...config, IMAGEKIT_PRIVATE_POLICY_VERIFIED: flag });
    assert.equal(parsed.IMAGEKIT_PRIVATE_POLICY_VERIFIED, flag === "true" ? "true" : "false");
    assert.deepEqual(parsed.configurationWarnings, []);
  }
  for (const field of ["MONGODB_URI", "CORS_ORIGINS", "JWT_SECRET"]) {
    assert.throws(() => loadConfig({ ...config, [field]: "invalid", IMAGEKIT_PRIVATE_POLICY_VERIFIED: "" }));
  }
});
