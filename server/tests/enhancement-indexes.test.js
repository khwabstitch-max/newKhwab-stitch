import { test } from "node:test";
import assert from "node:assert/strict";
import { assertEnhancementIndexes } from "../src/enhancement-indexes.js";
const model = (indexes) => ({
  schema: { indexes: () => [[{ owner: 1, clientId: 1 }, { unique: true }]] },
  collection: { indexes: async () => indexes },
});
test("enhancement startup accepts the durable unique retry index", async () => {
  await assertEnhancementIndexes({
    Draft: model([{ key: { owner: 1, clientId: 1 }, unique: true }]),
  });
});
test("enhancement startup refuses missing uniqueness before accepting retryable writes", async () => {
  await assert.rejects(
    assertEnhancementIndexes({
      Draft: model([{ key: { owner: 1, clientId: 1 } }]),
    }),
    /run npm run db:indexes/,
  );
});
test("enhancement startup refuses a partial index that would leave some draft owners unprotected", async () => {
  await assert.rejects(
    assertEnhancementIndexes({
      Draft: model([
        {
          key: { owner: 1, clientId: 1 },
          unique: true,
          partialFilterExpression: { active: true },
        },
      ]),
    }),
    /incompatible/,
  );
});
