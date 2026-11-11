import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublishedOptionRecord, publicOptionFilter, planOptionRepair } from "../src/option-maintenance.js";

test("only published and established legacy active options can be selected", () => {
  for (const status of [undefined, null, "published"]) assert.equal(isPublishedOptionRecord({ active: true, status }), true);
  for (const status of ["draft", "archived", "unpublished", "Draft", "unknown"]) assert.equal(isPublishedOptionRecord({ active: true, status }), false);
  assert.equal(isPublishedOptionRecord({ active: false, status: "published" }), false);
  assert.equal(isPublishedOptionRecord({ status: "published" }), false);
  const filter = publicOptionFilter({ kind: "sleeve", garment: "kurti" });
  assert.deepEqual(filter.status, { $in: ["published", null] });
  assert.equal(filter.garments, "kurti");
  assert.equal(filter.kind, "sleeve");
});

test("legacy normalization is idempotent and preserves publication and uncertain suitability", () => {
  const original = { _id: "a", revision: 2, kind: "Sleeve_Design", garments: [" Kurti ", "kurti"], active: false, status: "draft", compatibleLengthStyles: [] };
  const plan = planOptionRepair(original);
  assert.deepEqual(plan.changes, { kind: "sleeve", garments: ["kurti"] });
  assert.ok(plan.review.some(message => message.includes("compatibility")));
  assert.equal(original.kind, "Sleeve_Design");
  assert.deepEqual(planOptionRepair({ ...original, ...plan.changes }).changes, {});
  assert.equal("active" in plan.changes, false);
  assert.equal("status" in plan.changes, false);
  const uncertain = planOptionRepair({ kind: "sleeve", garments: ["unconfirmed"], active: true, status: "mystery" });
  assert.deepEqual(uncertain.changes, {});
  assert.ok(uncertain.review.length >= 2);
});

test("length normalization never applies a numeric length, changes historical quotes, or retains fees", () => {
  const plan = planOptionRepair({ kind: "sleeve_length", garments: [], active: false, status: "draft", amountPaise: 5000 });
  assert.deepEqual(plan.changes, { kind: "sleeveLength", priceMode: "included", amountPaise: 0, replacementAdjustmentPaise: 0 });
  assert.equal("lengthStyle" in plan.changes, false);
  assert.equal("compatibleLengthStyles" in plan.changes, false);
  assert.ok(plan.review.some(message => message.includes("Applicable garments")));
});
