import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import pino from "pino";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createModels, transaction } from "../src/models.js";
import { createApp } from "../src/app.js";
import { tokenService } from "../src/auth.js";
import { defaultSettings, settingsInput } from "../src/domain.js";

const databaseName = "khwab-courier-tests-" + randomUUID().replaceAll("-", "").slice(0, 20);
const secret = "isolated-courier-token-" + randomUUID();
const parcel = { weightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 10, declaredValuePaise: 50000 };
const basePricing = { mode: "courier", courierProvider: "shiprocket", originPin: "110001", inbound: { minimumChargePaise: 10000 }, outbound: { minimumChargePaise: 5000 } };
let repl, connection, models, context, app, tokenAdmin, tokenCustomer, calls, providerFails, inboundFee, outboundFee;
const quoteRequest = (direction = "outbound") => ({ originPin: direction === "inbound" ? "110002" : "110001", destinationPin: direction === "inbound" ? "110001" : "110003", direction, parcel });
const estimateBody = () => ({ garment: "alteration", quantity: 2, logistics: {
  inbound: { method: "business", address: { line1: "Customer pickup address", city: "Delhi", state: "Delhi", pin: "110002" }, parcel: { ...parcel } },
  outbound: { method: "business", address: { line1: "Customer delivery address", city: "Delhi", state: "Delhi", pin: "110003" }, parcel: { ...parcel } },
} });
function api(method, path, token = tokenAdmin, target = app) {
  const call = request(target)[method](path);
  return token ? call.set("Authorization", "Bearer " + token) : call;
}
function saveAccount(token = secret, target = app) {
  return api("put", "/api/admin/courier-connections/shiprocket", tokenAdmin, target).send({ credentials: { apiToken: token } });
}
async function configure(pricing = basePricing) {
  const record = await models.SiteSettings.findOne({ key: "main" }).lean();
  const values = { ...structuredClone(defaultSettings), ...record, deliveryPricing: pricing };
  const fields = Object.fromEntries(Object.keys(settingsInput.shape).filter(key => values[key] !== undefined).map(key => [key, values[key]]));
  return api("patch", "/api/admin/settings").send({ ...fields, revision: record?.revision || 0 }).expect(200);
}
before(async () => {
  if (process.env.NODE_ENV === "production") throw Error("Refusing courier tests in production.");
  if (process.env.TEST_MONGODB_URI) throw Error("Courier integration tests require their own in-memory database.");
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  connection = await mongoose.createConnection(repl.getUri(), { dbName: databaseName, autoIndex: true, bufferCommands: false }).asPromise();
  models = createModels(connection); await Promise.all(Object.values(models).map(model => model.init()));
  const [admin, customer] = await models.User.create([
    { role: "admin", email: "courier-admin@example.test", name: "Courier admin", passwordHash: "isolated-fixture-not-login" },
    { email: "courier-customer@example.test", name: "Courier customer", passwordHash: "isolated-fixture-not-login" },
  ]);
  const config = { NODE_ENV: "test", JWT_SECRET: randomBytes(64).toString("base64url"), origins: ["http://localhost:5173"], LOG_LEVEL: "silent" };
  tokenAdmin = tokenService(config).issue(admin).token; tokenCustomer = tokenService(config).issue(customer).token;
  context = { models, config, transaction: work => transaction(work, connection), logger: pino({ level: "silent" }), dbReady: () => connection.readyState === 1,
    courierQuote: async shipment => {
      calls.push(structuredClone(shipment));
      if (providerFails) throw Error("Untrusted provider text " + secret);
      const timestamp = Date.now(), sequence = calls.length;
      return { available: true, provider: shipment.provider, currency: "INR", totalPaise: shipment.direction === "inbound" ? inboundFee : outboundFee,
        originPin: shipment.originPin, destinationPin: shipment.destinationPin, parcel: { ...shipment.parcel }, chargeableWeightGrams: 1500,
        courierId: "fixture-carrier", courierName: "Fixture carrier", service: "Surface",
        quotedAt: new Date(timestamp - 1000 + sequence).toISOString(), validUntil: new Date(timestamp + 300000 + sequence).toISOString() };
    },
  };
  app = createApp(context);
}, { timeout: 120000 });
beforeEach(async () => {
  calls = []; providerFails = false; inboundFee = 8000; outboundFee = 13000;
  await models.CourierConnection.deleteMany({}); await models.SiteSettings.deleteMany({});
});
after(async () => {
  if (connection?.readyState === 1) {
    if (connection.name !== databaseName || !/^khwab-courier-tests-[a-f0-9]{20}$/.test(connection.name)) throw Error("Refusing cleanup outside the exact isolated courier database.");
    await connection.dropDatabase(); await connection.close();
  }
  await repl?.stop();
});

test("courier account REST endpoints require administrator identity and accept browser PUT preflights", async () => {
  for (const [method, path] of [["get", "/api/admin/courier-connections"], ["put", "/api/admin/courier-connections/shiprocket"], ["delete", "/api/admin/courier-connections/shiprocket"], ["post", "/api/admin/courier-connections/shiprocket/test"]]) {
    const body = method === "put" ? { credentials: { apiToken: secret } } : method === "post" ? quoteRequest() : {};
    await api(method, path, null).send(body).expect(401);
    await api(method, path, tokenCustomer).send(body).expect(403);
  }
  const preflight = await request(app).options("/api/admin/courier-connections/shiprocket").set("Origin", "http://localhost:5173").set("Access-Control-Request-Method", "PUT").set("Access-Control-Request-Headers", "Authorization,Content-Type").expect(204);
  assert.ok(preflight.headers["access-control-allow-methods"].split(",").includes("PUT"));
  assert.equal(await models.CourierConnection.countDocuments(), 0); assert.equal(calls.length, 0);
});

test("saving credentials records configured versus verified state without exposing plaintext or ciphertext", async () => {
  const saved = await saveAccount().expect(200);
  assert.equal(saved.body.data.configured, true); assert.equal(saved.body.data.verified, false); assert.equal(calls.length, 0);
  const ordinary = await models.CourierConnection.findOne({ provider: "shiprocket" }).lean();
  assert.equal(ordinary.encryptedCredentials, undefined);
  const encrypted = await models.CourierConnection.findOne({ provider: "shiprocket" }).select("+encryptedCredentials").lean();
  assert.equal(encrypted.encryptedCredentials.keyVersion, 1); assert.notEqual(encrypted.encryptedCredentials.ciphertext, secret);
  assert.equal(JSON.stringify(encrypted).includes(secret), false);
  const status = await api("get", "/api/admin/courier-connections").expect(200);
  assert.equal(status.headers["cache-control"], "private, no-store");
  const account = status.body.data.providers.find(item => item.provider === "shiprocket");
  assert.equal(account.configured, true); assert.equal(account.verified, false); assert.equal(account.requiresReconnect, false);
  for (const response of [saved, status, await api("get", "/api/admin/settings").expect(200), await request(app).get("/api/settings").expect(200)]) {
    const text = JSON.stringify(response.body); assert.equal(text.includes(secret), false); assert.equal(text.includes(encrypted.encryptedCredentials.ciphertext), false); assert.equal(text.includes("encryptedCredentials"), false);
  }
  const audits = await models.AuditEvent.find({ resourceType: "CourierConnection" }).lean();
  assert.equal(JSON.stringify(audits).includes(secret), false); assert.equal(JSON.stringify(audits).includes(encrypted.encryptedCredentials.ciphertext), false);
});

test("a live injected test quote verifies the account and disconnect prevents cached quotes from returning", async () => {
  await saveAccount().expect(200);
  const tested = await api("post", "/api/admin/courier-connections/shiprocket/test").send(quoteRequest()).expect(200);
  assert.equal(tested.body.data.quote.totalPaise, 13000); assert.equal(calls[0].credentials.apiToken, secret);
  assert.equal(JSON.stringify(tested.body).includes(secret), false);
  const status = (await api("get", "/api/admin/courier-connections").expect(200)).body.data.providers.find(item => item.provider === "shiprocket");
  assert.equal(status.verified, true); assert.ok(status.lastCheckedAt); assert.ok(status.lastVerifiedAt);
  await api("post", "/api/admin/courier-connections/shiprocket/test").send(quoteRequest()).expect(200); assert.equal(calls.length, 1);
  await api("delete", "/api/admin/courier-connections/shiprocket").send({}).expect(200);
  await api("post", "/api/admin/courier-connections/shiprocket/test").send(quoteRequest()).expect(422);
  assert.equal(calls.length, 1); assert.equal(await models.CourierConnection.countDocuments(), 0);
});

test("production missing storage key, invalid credentials and unsupported direct contracts fail closed", async () => {
  const production = createApp({ ...context, config: { ...context.config, NODE_ENV: "production", COURIER_CREDENTIALS_KEY: undefined } });
  const failure = await saveAccount(secret, production).expect(503);
  assert.equal(failure.body.error.code, "COURIER_STORAGE_UNAVAILABLE"); assert.equal(await models.CourierConnection.countDocuments(), 0);
  await api("put", "/api/admin/courier-connections/shiprocket").send({ credentials: { apiToken: "" } }).expect(400);
  await api("put", "/api/admin/courier-connections/shiprocket").send({ credentials: { apiToken: secret, endpoint: "https://invalid.example" } }).expect(400);
  const unsupported = await api("put", "/api/admin/courier-connections/bluedart").send({ credentials: { apiToken: secret } }).expect(409);
  assert.equal(unsupported.body.error.code, "COURIER_CONTRACT_REQUIRED"); assert.equal(calls.length, 0);
});

test("public estimates use actual connected quotes with both real leg PIN directions and transparent minimum adjustments", async () => {
  await saveAccount().expect(200); await configure();
  const result = (await request(app).post("/api/pricing/estimate").send(estimateBody()).expect(200)).body.data;
  assert.equal(result.knownGarmentSubtotalPaise, 0); assert.equal(result.knownTransportSubtotalPaise, 23000); assert.equal(result.estimatedTotalPaise, null);
  const legs = result.lineItems.filter(item => item.scope === "shipment");
  assert.deepEqual(legs.map(item => item.carrierQuotePaise), [8000, 13000]); assert.deepEqual(legs.map(item => item.minimumAdjustmentPaise), [2000, 0]);
  assert.deepEqual(legs.map(item => [item.originPin, item.destinationPin]), [["110002", "110001"], ["110001", "110003"]]);
  assert.ok(legs.every(item => item.provider === "shiprocket" && item.chargeableWeightGrams === 1500));
  assert.ok(legs.every(item => item.quotedAt && item.validUntil && item.parcel.declaredValuePaise === 50000));
  assert.equal(calls.length, 2); assert.deepEqual(calls.map(item => item.direction).sort(), ["inbound", "outbound"]);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("missing parcel, missing account and provider errors stay pending without invented shipping amounts or leaked messages", async () => {
  await configure();
  const unavailable = (await request(app).post("/api/pricing/estimate").send(estimateBody()).expect(200)).body.data;
  assert.equal(unavailable.knownTransportSubtotalPaise, 0); assert.equal(unavailable.lineItems.some(item => item.scope === "shipment"), false); assert.equal(calls.length, 0);
  await saveAccount().expect(200);
  const missing = estimateBody(); delete missing.logistics.inbound.parcel; delete missing.logistics.outbound.parcel;
  const noParcel = (await request(app).post("/api/pricing/estimate").send(missing).expect(200)).body.data;
  assert.equal(noParcel.knownTransportSubtotalPaise, 0); assert.equal(calls.length, 0);
  const noDeclaredValue = estimateBody(); delete noDeclaredValue.logistics.inbound.parcel.declaredValuePaise; noDeclaredValue.logistics.outbound = { method: "collect" };
  const incomplete = (await request(app).post("/api/pricing/estimate").send(noDeclaredValue).expect(200)).body.data;
  assert.match(incomplete.pendingItems.find(item => item.code === "transport:inbound").reason, /declared value/); assert.equal(calls.length, 0);
  providerFails = true;
  const failed = await request(app).post("/api/pricing/estimate").send(estimateBody()).expect(200);
  assert.equal(failed.body.data.knownTransportSubtotalPaise, 0); assert.equal(JSON.stringify(failed.body).includes(secret), false);
  assert.equal(calls.length, 2);
});

test("fresh same-fare carrier quotes keep estimate identity and configured floor changes invalidate it", async () => {
  await saveAccount().expect(200); await configure();
  const first = (await request(app).post("/api/pricing/estimate").send(estimateBody()).expect(200)).body.data;
  await saveAccount(secret).expect(200);
  const fresh = (await request(app).post("/api/pricing/estimate").send(estimateBody()).expect(200)).body.data;
  assert.notEqual(fresh.lineItems.find(item => item.code === "transport:inbound").quotedAt, first.lineItems.find(item => item.code === "transport:inbound").quotedAt);
  assert.equal(fresh.configurationVersion, first.configurationVersion); assert.equal(calls.length, 4);
  await configure({ ...basePricing, inbound: { minimumChargePaise: 11000 } });
  const changed = (await request(app).post("/api/pricing/estimate").send(estimateBody()).expect(200)).body.data;
  assert.notEqual(changed.configurationVersion, first.configurationVersion); assert.equal(changed.knownTransportSubtotalPaise, 24000);
  assert.equal(calls.length, 4);
});

test("a courier-priced submitted request preserves both shipment quotes and customer parcel choices", async () => {
  await saveAccount().expect(200); await configure();
  const chosen = estimateBody(), estimate = (await request(app).post("/api/pricing/estimate").send(chosen).expect(200)).body.data;
  const orderInput = { ...chosen, address: { ...chosen.logistics.outbound.address }, preferences: {}, measurements: { unit: "in", method: "assistance", values: {}, notes: "Review garment fitting" }, referenceMediaIds: [], customer: { name: "Courier customer", phone: "9876543210" }, fabricAcknowledged: true, estimateVersion: estimate.configurationVersion };
  const saved = (await api("post", "/api/orders", tokenCustomer).set("Idempotency-Key", randomUUID()).send(orderInput).expect(201)).body.data;
  assert.equal(saved.estimate.knownTransportSubtotalPaise, 23000); assert.equal(saved.estimate.knownGarmentSubtotalPaise, 0);
  assert.equal(saved.estimate.lineItems.filter(item => item.pricingMode === "courier").length, 2);
  assert.deepEqual(saved.logistics.inbound.parcel, parcel); assert.equal(calls.length, 2);
});
