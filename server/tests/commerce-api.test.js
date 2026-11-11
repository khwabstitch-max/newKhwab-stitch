import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import pino from "pino";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { createModels, transaction } from "../src/models.js";
import { tokenService } from "../src/auth.js";
import { commerceDefaults } from "../src/commerce-input.js";
import { completeCommerceOrder, releaseCommittedBenefits } from "../src/commerce-service.js";

let replica, connection, models, context, app, customerA, customerB, admin, tokenA, tokenB, tokenAdmin;
const database = "khwab-commerce-" + randomBytes(10).toString("hex");
const auth = (method, path, token = tokenA) => request(app)[method](path).set("Authorization", "Bearer " + token);
const currentQuote = () => ({ version: 1, amountPaise: 45000, deliveryDate: "2099-12-01", notes: "Isolated test quote", lineItems: [{ label: "Stitching", amountPaise: 40000, scope: "garment", quantity: 1 }, { label: "Transport", amountPaise: 5000, scope: "shipment", quantity: 1 }] });
const offerBody = () => ({ code: "FIXTURE", name: "Isolated fixture offer", status: "published", type: "fixed", value: 5000, garments: ["kurti"], perCustomerLimit: 1 });
const settingsBody = () => {
  const { revision: _revision, ...settings } = commerceDefaults;
  return { ...settings, enabled: true, offersEnabled: true, creditsEnabled: true, maxCreditBps: 10000, terms: "Isolated test programme only." };
};
async function enable(patch = {}) {
  const current = await models.CommerceSettings.findOne({ key: "main" });
  const response = await auth("patch", "/api/admin/commerce/settings", tokenAdmin).send({ ...settingsBody(), ...patch, revision: current?.revision || 0 });
  assert.equal(response.status, 200);
}
async function grant(user, deltaPaise) {
  const response = await auth("post", "/api/admin/commerce/credits", tokenAdmin).send({ owner: String(user._id), deltaPaise, clientId: randomUUID(), reason: "Isolated fixture balance" });
  assert.equal(response.status, 200); return response;
}
async function createQuote(owner = customerA, patch = {}) {
  return models.Order.create({ orderNumber: "TEST-" + randomUUID(), owner: owner._id, idempotencyKey: randomUUID(), requestHash: "fixture", garment: "kurti", quantity: 1, preferences: {}, measurements: { unit: "in", method: "assistance", values: {} }, referenceMediaIds: [], customer: { name: "Isolated test customer", phone: "919876543210" }, fabricAcknowledged: true, quotes: [currentQuote()], status: "quote_sent", timeline: [], ...patch });
}
async function saveBenefits(order, selection, token = tokenA) {
  return auth("post", "/api/commerce/quote-benefits", token).send({ orderId: String(order._id), revision: order.revision, quoteVersion: order.quotes.at(-1).version, offerCode: "", creditPaise: 0, ...selection });
}
async function accept(order, revision, token = tokenA) {
  return auth("post", `/api/orders/${order._id}/quote-response`, token).send({ revision, quoteVersion: 1, decision: "accept" });
}

before(async () => {
  if (process.env.NODE_ENV !== "test" || process.env.TEST_MONGODB_URI || process.env.MONGOMS_SYSTEM_BINARY) throw Error("Commerce integration requires the repository-isolated local fixture.");
  replica = await MongoMemoryReplSet.create({ binary: { downloadDir: fileURLToPath(new URL("../node_modules/.cache/mongodb-memory-server/", import.meta.url)) }, replSet: { count: 1, storageEngine: "wiredTiger" } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: database, autoIndex: true, bufferCommands: false }).asPromise();
  models = createModels(connection); await Promise.all(Object.values(models).map(model => model.init()));
  [customerA, customerB, admin] = await models.User.create([
    { email: "commerce-a@example.test", name: "Isolated A", passwordHash: "not-a-real-login-hash" },
    { email: "commerce-b@example.test", name: "Isolated B", passwordHash: "not-a-real-login-hash" },
    { email: "commerce-admin@example.test", name: "Isolated admin", role: "admin", passwordHash: "not-a-real-login-hash" },
  ]);
  const config = { NODE_ENV: "test", JWT_SECRET: randomBytes(64).toString("base64url"), origins: ["http://127.0.0.1"], LOG_LEVEL: "silent", TRUST_PROXY_HOPS: 0 };
  [tokenA, tokenB, tokenAdmin] = [customerA, customerB, admin].map(user => tokenService(config).issue(user).token);
  context = { models, config, transaction: work => transaction(work, connection), logger: pino({ level: "silent" }), images: { url: () => "https://images.example.test/fixture.webp" }, dbReady: () => connection.readyState === 1 };
  app = createApp(context);
}, { timeout: 180000 });
beforeEach(async () => {
  if (!models) return;
  for (const [name, Model] of Object.entries(models)) if (name.startsWith("Commerce") || name === "Order" || name === "AuditEvent") await Model.deleteMany({});
});
after(async () => {
  if (connection) {
    if (connection.name !== database || !/^khwab-commerce-[a-f0-9]{20}$/.test(database)) throw Error("Refusing cleanup outside the exact isolated commerce database.");
    await connection.dropDatabase(); await connection.close();
  }
  if (replica) await replica.stop();
});

test("programmes start disabled and customers cannot call administrative money or offer APIs", async () => {
  const capabilities = await request(app).get("/api/commerce/capabilities");
  assert.equal(capabilities.body.data.enabled, false);
  assert.deepEqual((await request(app).get("/api/commerce/offers")).body.data, []);
  assert.equal((await auth("post", "/api/admin/commerce/credits").send({})).status, 403);
  assert.equal((await auth("post", "/api/admin/commerce/offers").send(offerBody())).status, 403);
  assert.equal((await auth("patch", "/api/admin/commerce/settings").send({})).status, 403);
});
test("admin credit adjustments are idempotent, changed replay conflicts and ledger projection is private", async () => {
  const body = { owner: String(customerA._id), clientId: randomUUID(), deltaPaise: 12345, reason: "One approved test adjustment" };
  assert.equal((await auth("post", "/api/admin/commerce/credits", tokenAdmin).send(body)).status, 200);
  assert.equal((await auth("post", "/api/admin/commerce/credits", tokenAdmin).send(body)).status, 200);
  assert.equal((await auth("post", "/api/admin/commerce/credits", tokenAdmin).send({ ...body, deltaPaise: 12346 })).status, 409);
  assert.equal((await models.CommerceWallet.findOne({ owner: customerA._id })).balancePaise, 12345);
  assert.equal(await models.CommerceLedger.countDocuments({ owner: customerA._id }), 1);
  const own = await auth("get", "/api/commerce/ledger");
  assert.equal(own.body.data.length, 1);
  for (const key of ["owner", "actor", "requestHash", "orderId", "eventKey"]) assert.equal(own.body.data[0][key], undefined);
  assert.equal((await auth("get", "/api/commerce/ledger", tokenB)).body.data.length, 0);
  assert.equal((await auth("get", `/api/commerce/ledger?owner=${customerA._id}`, tokenB)).status, 400);
});
test("saved benefits do not spend credit until current quote acceptance snapshots net and original amounts", async () => {
  await enable(); await grant(customerA, 10000);
  assert.equal((await auth("post", "/api/admin/commerce/offers", tokenAdmin).send(offerBody())).status, 201);
  const order = await createQuote();
  assert.equal((await auth("get", `/api/commerce/quote-benefits/${order._id}`, tokenB)).status, 404);
  const selected = await saveBenefits(order, { offerCode: "FIXTURE", creditPaise: 10000 });
  assert.equal(selected.status, 200); assert.equal(selected.body.data.preview.amountPaise, 30000);
  assert.equal((await models.CommerceWallet.findOne({ owner: customerA._id })).balancePaise, 10000);
  const accepted = await accept(order, selected.body.data.revision);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.acceptedQuote.amountPaise, 30000);
  assert.equal(accepted.body.data.acceptedQuote.grossAmountPaise, 45000);
  assert.equal(accepted.body.data.acceptedQuote.benefits.discountPaise, 5000);
  assert.equal((await models.CommerceWallet.findOne({ owner: customerA._id })).balancePaise, 0);
  assert.equal(await models.CommerceOfferUse.countDocuments({ state: "used" }), 1);
  assert.equal((await models.CommerceOffer.findOne({ code: "FIXTURE" })).usedCount, 1);
  await models.CommerceOffer.updateOne({ code: "FIXTURE" }, { $set: { value: 9999, status: "archived" }, $inc: { revision: 1 } });
  assert.equal((await auth("get", `/api/orders/${order._id}`)).body.data.acceptedQuote.amountPaise, 30000);
});
test("two concurrent accepted quotes cannot spend the same wallet balance twice", async () => {
  await enable(); await grant(customerA, 10000);
  const first = await createQuote(), second = await createQuote();
  const a = await saveBenefits(first, { creditPaise: 8000 }), b = await saveBenefits(second, { creditPaise: 8000 });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const results = await Promise.all([accept(first, a.body.data.revision), accept(second, b.body.data.revision)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal((await models.CommerceWallet.findOne({ owner: customerA._id })).balancePaise, 2000);
  assert.equal(await models.CommerceLedger.countDocuments({ kind: "redemption" }), 1);
  assert.equal(await models.Order.countDocuments({ status: "customer_accepted" }), 1);
});
test("a global one-use offer cannot be consumed by two customers concurrently", async () => {
  await enable();
  assert.equal((await auth("post", "/api/admin/commerce/offers", tokenAdmin).send({ ...offerBody(), totalUseLimit: 1 })).status, 201);
  const a = await createQuote(customerA), b = await createQuote(customerB);
  const sa = await saveBenefits(a, { offerCode: "FIXTURE" }), sb = await saveBenefits(b, { offerCode: "FIXTURE" }, tokenB);
  assert.equal(sa.status, 200); assert.equal(sb.status, 200);
  const results = await Promise.all([accept(a, sa.body.data.revision), accept(b, sb.body.data.revision, tokenB)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(await models.CommerceOfferUse.countDocuments({ state: "used" }), 1);
  assert.equal((await models.CommerceOffer.findOne({ code: "FIXTURE" })).usedCount, 1);
});
test("cancellation restores committed credit and offer capacity exactly once", async () => {
  await enable(); await grant(customerA, 10000);
  await auth("post", "/api/admin/commerce/offers", tokenAdmin).send(offerBody());
  const order = await createQuote(), saved = await saveBenefits(order, { offerCode: "FIXTURE", creditPaise: 10000 });
  const accepted = await accept(order, saved.body.data.revision); assert.equal(accepted.status, 200);
  const cancelled = await auth("patch", `/api/admin/orders/${order._id}/status`, tokenAdmin).send({ revision: accepted.body.data.revision, status: "cancelled", note: "Isolated cancellation" });
  assert.equal(cancelled.status, 200);
  await context.transaction(session => releaseCommittedBenefits(context, order, session));
  assert.equal((await models.CommerceWallet.findOne({ owner: customerA._id })).balancePaise, 10000);
  assert.equal(await models.CommerceLedger.countDocuments({ kind: "reversal" }), 1);
  assert.equal((await models.CommerceOffer.findOne({ code: "FIXTURE" })).usedCount, 0);
});
test("changed offer terms require renewed selection and disabled programmes still allow clearing", async () => {
  await enable(); await grant(customerA, 10000);
  await auth("post", "/api/admin/commerce/offers", tokenAdmin).send(offerBody());
  const order = await createQuote(), saved = await saveBenefits(order, { offerCode: "FIXTURE", creditPaise: 10000 });
  await models.CommerceOffer.updateOne({ code: "FIXTURE" }, { $set: { value: 4999 }, $inc: { revision: 1 } });
  assert.equal((await auth("get", `/api/commerce/quote-benefits/${order._id}`)).body.data.valid, false);
  assert.equal((await accept(order, saved.body.data.revision)).status, 409);
  await enable({ enabled: false });
  const cleared = await saveBenefits({ ...order.toObject(), revision: saved.body.data.revision }, {});
  assert.equal(cleared.status, 200);
  const accepted = await accept(order, cleared.body.data.revision); assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.acceptedQuote.amountPaise, 45000);
  assert.equal((await models.CommerceWallet.findOne({ owner: customerA._id })).balancePaise, 10000);
});
test("referrals and loyalty reward one actual delivery only and self-referrals are rejected", async () => {
  await enable({ referralsEnabled: true, loyaltyEnabled: true, referralRewardPaise: 5000, referredRewardPaise: 1000, milestones: [{ code: "FIRST", orders: 1, rewardPaise: 2000 }] });
  const code = (await auth("post", "/api/commerce/referral-code").send({})).body.data.referralCode;
  assert.equal((await auth("post", "/api/commerce/referrals").send({ code })).status, 400);
  assert.equal((await auth("post", "/api/commerce/referrals", tokenB).send({ code })).status, 201);
  assert.equal((await auth("post", "/api/commerce/referrals", tokenB).send({ code })).status, 201);
  const order = await createQuote(customerB), accepted = await accept(order, 0, tokenB); assert.equal(accepted.status, 200);
  let current = accepted.body.data;
  for (const status of ["fabric_received", "stitching", "ready", "dispatched", "delivered"]) {
    const response = await auth("patch", `/api/admin/orders/${order._id}/status`, tokenAdmin).send({ revision: current.revision, status, note: "Isolated actual test transition" });
    assert.equal(response.status, 200); current = response.body.data;
  }
  const final = await models.Order.findById(order._id);
  await context.transaction(session => completeCommerceOrder(context, final, session));
  await context.transaction(session => completeCommerceOrder(context, final, session));
  assert.equal((await models.CommerceWallet.findOne({ owner: customerA._id })).balancePaise, 5000);
  assert.equal((await models.CommerceWallet.findOne({ owner: customerB._id })).balancePaise, 3000);
  assert.equal(await models.CommerceCompletion.countDocuments({ orderId: order._id }), 1);
  assert.equal(await models.CommerceMilestone.countDocuments({ owner: customerB._id }), 1);
  assert.equal(await models.CommerceLedger.countDocuments({ kind: "referral" }), 2);
  assert.equal((await models.CommerceReferral.findOne({ referredOwner: customerB._id })).state, "qualified");
});
