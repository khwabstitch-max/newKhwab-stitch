import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createModels } from "../src/models.js";
import { assertDeploymentIndexes } from "../src/deployment-indexes.js";

function fixture() {
  // Read real schemas without opening a database or creating/changing indexes.
  const connection = mongoose.createConnection();
  const models = Object.fromEntries(Object.entries(createModels(connection)).map(([name, model]) => {
    const indexes = model.schema.indexes().map(([key, options]) => ({ key, ...options }));
    return [name, { schema: model.schema, indexes, collection: { listIndexes: () => ({ toArray: async () => indexes }) } }];
  }));
  return models;
}
const keysEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

test("deployment startup accepts all committed model indexes without database mutations", async () => {
  await assertDeploymentIndexes(fixture());
});
for (const [name, keys] of [
  ["Order", { owner: 1, idempotencyKey: 1 }],
  ["Order", { orderNumber: 1 }],
  ["User", { emailReservation: 1 }],
  ["Design", { code: 1 }],
  ["MediaAsset", { fileId: 1 }],
  ["SiteSettings", { key: 1 }],
  ["CourierConnection", { provider: 1 }],
  ["ChatCustomer", { customerId: 1 }],
  ["ChatConversation", { customerId: 1 }],
  ["ChatMessage", { conversationId: 1, clientMessageId: 1 }],
]) {
  test(`deployment startup refuses missing ${name} uniqueness for ${Object.keys(keys).join("/")}`, async () => {
    const models = fixture();
    const index = models[name].indexes.find(index => keysEqual(index.key, keys));
    assert.ok(index, "The expected production invariant must remain in the schema.");
    delete index.unique;
    await assert.rejects(assertDeploymentIndexes(models), new RegExp(`Required ${name} indexes.*db:indexes`));
  });
}
for (const change of [{ sparse: true }, { partialFilterExpression: { active: true } }]) {
  test(`deployment startup rejects weakened order retry index: ${Object.keys(change)[0]}`, async () => {
    const models = fixture();
    Object.assign(models.Order.indexes.find(index => keysEqual(index.key, { owner: 1, idempotencyKey: 1 })), change);
    await assert.rejects(assertDeploymentIndexes(models), /Required Order indexes/);
  });
}
test("deployment startup rejects incompatible required TTL retention", async () => {
  const models = fixture();
  models.User.indexes.find(index => keysEqual(index.key, { purgeAfter: 1 })).expireAfterSeconds = 3600;
  await assert.rejects(assertDeploymentIndexes(models), /Required User indexes/);
});
test("deployment startup checks unique indexes for new models without a hardcoded feature list", async () => {
  const models = fixture();
  models.FutureFeature = { schema: { indexes: () => [[{ retryKey: 1 }, { unique: true }]] }, collection: { listIndexes: () => ({ toArray: async () => [] }) } };
  await assert.rejects(assertDeploymentIndexes(models), /Required FutureFeature indexes/);
});
test("deployment startup retains the minimum required shared rate-limit model", async () => {
  const models = fixture();
  delete models.RequestLimit;
  await assert.rejects(assertDeploymentIndexes(models), /Required RequestLimit indexes/);
});
test("deployment startup reports missing collections as an operator migration requirement", async () => {
  const models = fixture();
  models.ChatMessage.collection.listIndexes = () => ({ toArray: async () => { throw Error("NamespaceNotFound"); } });
  await assert.rejects(assertDeploymentIndexes(models), /Required ChatMessage indexes.*db:indexes/);
});
