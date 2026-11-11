import { test } from "node:test";
import assert from "node:assert/strict";
import { draftReferenceIds, fenceNewReferences, snapshotMeasurementGuide, orderPublicMediaPins } from "../src/reference-integrity.js";

const optionId = "abcdef0123456789abcdef01", guideId = "abcdef0123456789abcdef02";
test("draft reference inventory deduplicates and canonicalizes parked options, additions and guide IDs", () => {
  const data = { configuration: { components: { sleeve: { source: "option", optionId: optionId.toUpperCase() } }, addonIds: [optionId] }, measurements: { guideIds: [guideId, guideId.toUpperCase()] } };
  assert.deepEqual(draftReferenceIds(data), { optionIds: [optionId], guideIds: [guideId] });
});
test("new references write target fences while unchanged stale draft IDs remain recoverable", async () => {
  const writes = [], ctx = { models: {
    DesignOption: { updateOne: async (...args) => { writes.push(args); return { modifiedCount: 1 }; } },
    MeasurementGuide: { updateOne: async (...args) => { writes.push(args); return { modifiedCount: 1 }; } },
  } }, session = { fixture: true };
  await fenceNewReferences(ctx, { optionIds: [optionId], guideIds: [guideId] }, {}, session);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], [{ _id: optionId }, { $inc: { referenceFence: 1 } }, { session }]);
  writes.length = 0;
  await fenceNewReferences(ctx, { optionIds: [optionId] }, { optionIds: [optionId.toUpperCase()] }, session);
  assert.equal(writes.length, 0);
});
test("a newly chosen missing option or guide returns a meaningful recoverable conflict", async () => {
  const missing = { updateOne: async () => ({ modifiedCount: 0 }) }, ctx = { models: { DesignOption: missing, MeasurementGuide: missing } };
  await assert.rejects(() => fenceNewReferences(ctx, { optionIds: [optionId] }), error => error.status === 409 && error.code === "OPTION_CHANGED");
  await assert.rejects(() => fenceNewReferences(ctx, { guideIds: [guideId] }), error => error.status === 409 && error.code === "GUIDE_CHANGED");
});
test("measurement guide snapshots retain original instructions and image metadata after configuration changes", () => {
  const guide = { _id: guideId, code: "MG-ORIGINAL", revision: 2, name: "Original guide", garment: "kurti", method: "body", language: "en", instructions: "Original instructions", measurementFields: ["bust"], imageMediaIds: [optionId] };
  const snapshot = snapshotMeasurementGuide(guide, [{ _id: optionId, width: 300, height: 400 }]);
  guide.instructions = "New instructions"; guide.measurementFields.push("waist"); guide.imageMediaIds.length = 0;
  assert.equal(snapshot.instructions, "Original instructions");
  assert.deepEqual(snapshot.measurementFields, ["bust"]);
  assert.deepEqual(snapshot.images, [{ mediaId: optionId, width: 300, height: 400 }]);
});

test("public pins are unique within each category while a shared option/guide image remains pinned twice", () => {
  const pins = orderPublicMediaPins({ publicMediaPins: { optionImages: [optionId, optionId], guideImages: [optionId, guideId, guideId] } });
  assert.deepEqual(pins, { optionImages: [optionId], guideImages: [optionId, guideId] });
  assert.equal([...pins.optionImages, ...pins.guideImages].filter(id => id === optionId).length, 2);
  const fallback = orderPublicMediaPins({ estimate: { components: { neck: { imageMediaIds: [optionId] }, back: { imageMediaIds: [optionId] } }, addons: [] }, guideSnapshots: [{ imageMediaIds: [guideId] }] });
  assert.deepEqual(fallback, { optionImages: [optionId], guideImages: [guideId] });
});
