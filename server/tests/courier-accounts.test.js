import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  courierStorageKey, encryptCourierCredentials, decryptCourierCredentials,
  prepareCourierConnections, courierConnectionStatus, courierAccountQuote, resolveTransportQuotes,
} from "../src/courier-accounts.js";
import { geographicDistanceMeters, resolveTransportDistances } from "../src/pin-distance.js";

const development = { NODE_ENV: "test", JWT_SECRET: "isolated-courier-jwt-fixture" };
const production = { NODE_ENV: "production", COURIER_CREDENTIALS_KEY: Buffer.alloc(32, 17).toString("base64url") };
const token = "isolated-api-token.not-real";
const credentials = { apiToken: token };
const parcel = { weightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 10, declaredValuePaise: 50000 };
const request = (extra = {}) => ({ provider: "shiprocket", direction: "outbound", originPin: "110001", destinationPin: "400001", parcel: { ...parcel }, ...extra });
function quote(input = request(), changes = {}) {
  return { available: true, provider: input.provider, currency: "INR", totalPaise: 13550,
    originPin: input.originPin, destinationPin: input.destinationPin, parcel: input.parcel,
    courierId: "fixture-carrier", courierName: "Fixture carrier", service: "surface", chargeableWeightGrams: 1500,
    quotedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 60000).toISOString(), ...changes };
}
function fixture({ config = development, quoteImpl } = {}) {
  let record = { _id: randomUUID(), provider: "shiprocket", encryptedCredentials: encryptCourierCredentials(config, "shiprocket", credentials) };
  const calls = { quotes: [], updates: [], selects: [] };
  function chain(value) {
    return { select(fields) { calls.selects.push(fields); return this; }, session() { return this; }, async lean() { return value; } };
  }
  const Model = {
    find() { return chain(record ? [record] : []); },
    findOne() { return chain(record); },
    async updateOne(filter, update) { calls.updates.push({ filter, update }); return { modifiedCount: 1 }; },
  };
  const ctx = { config, models: { CourierConnection: Model }, courierQuote: async input => {
    calls.quotes.push(input); return quoteImpl ? quoteImpl(input) : quote(input);
  } };
  return { ctx, calls, get record() { return record; }, set record(value) { record = value; } };
}

test("courier credentials use randomized authenticated encryption without storing plaintext", () => {
  const first = encryptCourierCredentials(production, "shiprocket", credentials);
  const second = encryptCourierCredentials(production, "shiprocket", credentials);
  assert.deepEqual(Object.keys(first).sort(), ["ciphertext", "iv", "keyVersion", "tag"]);
  assert.equal(first.keyVersion, 1); assert.notEqual(first.iv, second.iv); assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(JSON.stringify(first).includes(token), false);
  assert.equal(Buffer.from(first.ciphertext, "base64url").includes(Buffer.from(token)), false);
  assert.deepEqual(decryptCourierCredentials(production, "shiprocket", first), credentials);
});

test("production storage fails closed while isolated development uses deterministic JWT-derived keys", () => {
  assert.equal(courierStorageKey({ NODE_ENV: "production", JWT_SECRET: "must-not-enable-production" }), null);
  assert.equal(courierStorageKey({ NODE_ENV: "test" }), null);
  for (const bad of ["not-a-key", Buffer.alloc(31).toString("base64url"), Buffer.alloc(32).toString("base64")])
    assert.equal(courierStorageKey({ ...development, COURIER_CREDENTIALS_KEY: bad }), null);
  assert.throws(() => encryptCourierCredentials({ NODE_ENV: "production" }, "shiprocket", credentials), { code: "COURIER_STORAGE_UNAVAILABLE" });
  assert.equal(courierStorageKey(development).length, 32);
  assert.deepEqual(courierStorageKey(development), courierStorageKey({ ...development }));
  assert.notDeepEqual(courierStorageKey(development), courierStorageKey({ ...development, JWT_SECRET: "different-fixture-key" }));
  assert.deepEqual(decryptCourierCredentials(development, "shiprocket", encryptCourierCredentials(development, "shiprocket", credentials)), credentials);
});

test("wrong keys, provider AAD, ciphertext/tag tampering and unknown key versions require reconnection", () => {
  const encrypted = encryptCourierCredentials(production, "shiprocket", credentials);
  assert.throws(() => decryptCourierCredentials({ ...production, COURIER_CREDENTIALS_KEY: Buffer.alloc(32, 18).toString("base64url") }, "shiprocket", encrypted));
  assert.throws(() => decryptCourierCredentials(production, "delhivery", encrypted));
  for (const field of ["ciphertext", "tag", "iv"]) {
    const bytes = Buffer.from(encrypted[field], "base64url"); bytes[0] ^= 1;
    assert.throws(() => decryptCourierCredentials(production, "shiprocket", { ...encrypted, [field]: bytes.toString("base64url") }));
  }
  assert.throws(() => decryptCourierCredentials(production, "shiprocket", { ...encrypted, keyVersion: 2 }), /reconnection/);
});

test("account status distinguishes configured, verified and unreadable credentials without exposing encryption or secrets", async () => {
  const f = fixture();
  let result = await courierConnectionStatus(f.ctx);
  assert.equal(result.storageReady, true);
  let account = result.providers.find(item => item.provider === "shiprocket");
  assert.equal(account.configured, true); assert.equal(account.verified, false); assert.equal(account.requiresReconnect, false);
  assert.equal(result.providers.find(item => item.provider === "bluedart").supported, false);
  assert.equal(result.providers.find(item => item.provider === "bluedart").reasonCode, "provider_contract_required");
  f.record.lastVerifiedAt = new Date(); f.record.lastCheckedAt = new Date();
  result = await courierConnectionStatus(f.ctx); account = result.providers.find(item => item.provider === "shiprocket");
  assert.equal(account.verified, true);
  f.record.lastErrorCode = "authentication_failed";
  assert.equal((await courierConnectionStatus(f.ctx)).providers.find(item => item.provider === "shiprocket").verified, false);
  f.record.lastErrorCode = null;
  f.ctx.config = { ...development, JWT_SECRET: "rotated-storage-fixture" };
  result = await courierConnectionStatus(f.ctx); account = result.providers.find(item => item.provider === "shiprocket");
  assert.equal(account.requiresReconnect, true); assert.equal(account.verified, false);
  for (const forbidden of [token, "ciphertext", "encryptedCredentials", f.record.encryptedCredentials.ciphertext])
    assert.equal(JSON.stringify(result).includes(forbidden), false);
  assert.ok(f.calls.selects.every(fields => fields === "+encryptedCredentials"));
});

test("quote requests deduplicate concurrent work and persist only sanitized account health", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ quoteImpl: async input => { await gate; return quote(input); } });
  const first = courierAccountQuote(f.ctx, request()), second = courierAccountQuote(f.ctx, request());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.quotes.length, 1); release();
  const results = await Promise.all([first, second]);
  assert.equal(results[0].totalPaise, 13550); assert.deepEqual(results[0], results[1]);
  assert.deepEqual(f.calls.quotes[0].credentials, credentials);
  assert.equal((await courierAccountQuote(f.ctx, request())).totalPaise, 13550); assert.equal(f.calls.quotes.length, 1);
  assert.equal(f.calls.updates.length, 1);
  const health = f.calls.updates[0].update.$set;
  assert.ok(health.lastCheckedAt instanceof Date); assert.ok(health.lastVerifiedAt instanceof Date); assert.equal(health.lastErrorCode, null);
  for (const forbidden of [token, "110001", "400001", "weightGrams", "totalPaise"])
    assert.equal(JSON.stringify(health).includes(forbidden), false);
});

test("disconnection and credential rotation cannot reuse an earlier account quote", async () => {
  const f = fixture(); await courierAccountQuote(f.ctx, request()); assert.equal(f.calls.quotes.length, 1);
  const saved = f.record; f.record = null;
  const disconnected = await courierAccountQuote(f.ctx, request());
  assert.equal(disconnected.available, false); assert.equal(disconnected.reasonCode, "account_not_configured");
  assert.equal(f.calls.quotes.length, 1);
  f.record = { ...saved, encryptedCredentials: encryptCourierCredentials(development, "shiprocket", { apiToken: "new-isolated-token" }) };
  await courierAccountQuote(f.ctx, request());
  assert.equal(f.calls.quotes.length, 2); assert.equal(f.calls.quotes[1].credentials.apiToken, "new-isolated-token");
});

test("unavailable accounts, unreadable credentials and unsupported direct contracts do not call a provider", async () => {
  const f = fixture();
  f.ctx.config = { NODE_ENV: "production" };
  assert.equal((await courierAccountQuote(f.ctx, request())).reasonCode, "credentials_unavailable");
  assert.equal(f.calls.quotes.length, 0);
  const blue = await courierAccountQuote(f.ctx, request({ provider: "bluedart" }));
  assert.equal(blue.reasonCode, "provider_contract_required"); assert.equal(f.calls.quotes.length, 0);
  assert.equal((await courierAccountQuote({ models: {}, config: development }, request())).reasonCode, "account_not_configured");
});

test("provider failures become generic account-health results instead of leaking thrown secrets", async () => {
  const f = fixture({ quoteImpl: async () => { throw Error("a private provider detail " + token); } });
  const result = await courierAccountQuote(f.ctx, request());
  assert.deepEqual(result, { available: false, provider: "shiprocket", reasonCode: "provider_unavailable" });
  assert.equal(f.calls.updates[0].update.$set.lastErrorCode, "provider_unavailable");
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("connection collection initialization is shared and retries after a failed index setup", async () => {
  let collections = 0, indexes = 0;
  const Model = { async createCollection() { collections++; }, async createIndexes() { indexes++; } };
  await Promise.all(Array.from({ length: 8 }, () => prepareCourierConnections(Model)));
  assert.equal(collections, 1); assert.equal(indexes, 1);
  let fail = true;
  const retry = { async createCollection() {}, async createIndexes() { if (fail) { fail = false; throw Error("isolated retry"); } } };
  await assert.rejects(prepareCourierConnections(retry), /isolated retry/);
  await prepareCourierConnections(retry);
});

test("transport quote resolution uses actual leg direction and skips unknown parcel/value inputs", async () => {
  const f = fixture(), calls = f.calls;
  const settings = { deliveryPricing: { mode: "courier", originPin: "110001", courierProvider: "shiprocket" } };
  const input = { logistics: { inbound: { method: "business", address: { pin: "400001" }, parcel }, outbound: { method: "business", address: { pin: "560001" }, parcel } } };
  const result = await resolveTransportQuotes(f.ctx, input, settings);
  assert.equal(result.inbound.originPin, "400001"); assert.equal(result.inbound.destinationPin, "110001");
  assert.equal(result.outbound.originPin, "110001"); assert.equal(result.outbound.destinationPin, "560001");
  assert.equal(calls.quotes.length, 2);
  const withoutValue = { ...parcel }; delete withoutValue.declaredValuePaise;
  const skipped = await resolveTransportQuotes(f.ctx, { logistics: { inbound: { method: "business", address: { pin: "400001" }, parcel: withoutValue }, outbound: { method: "collect" } } }, settings);
  assert.deepEqual(skipped, {}); assert.equal(calls.quotes.length, 2);
});

test("offline geographical distance is symmetric and PIN metadata identifies its approximate source", async () => {
  assert.equal(geographicDistanceMeters([0, 0], [0, 0]), 0);
  assert.equal(geographicDistanceMeters([0, 0], [0, 1]), 111195);
  assert.equal(geographicDistanceMeters([28.61, 77.21], [19.08, 72.88]), geographicDistanceMeters([19.08, 72.88], [28.61, 77.21]));
  assert.equal(geographicDistanceMeters([NaN, 0], [0, 0]), null);
  const dataset = { source: "Isolated postcode fixture", sourceVersion: "fixture-hash-v1", centroids: { "110001": [28.61, 77.21], "400001": [19.08, 72.88] } };
  const input = { logistics: { inbound: { method: "business", address: { pin: "110001" } }, outbound: { method: "business", address: { pin: "400001" } } } };
  const settings = { deliveryPricing: { mode: "distance", originPin: "110001", distanceBasis: "pin_area" } };
  const result = await resolveTransportDistances(input, settings, { dataset });
  assert.equal(result.inbound.distanceMeters, 0); assert.ok(result.outbound.distanceMeters > 1000000);
  assert.equal(result.outbound.source, dataset.source); assert.equal(result.outbound.sourceVersion, dataset.sourceVersion);
  assert.equal(result.outbound.basis, "pin_area");
  assert.deepEqual(await resolveTransportDistances(input, { deliveryPricing: { ...settings.deliveryPricing, originPin: "999999" } }, { dataset }), {});
  assert.deepEqual(await resolveTransportDistances(input, { deliveryPricing: { ...settings.deliveryPricing, mode: "courier" } }, { dataset }), {});
});
