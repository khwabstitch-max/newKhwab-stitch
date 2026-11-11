import { beforeEach, describe, expect, it } from "vitest";
import {
  createDraft,
  saveDraft,
  loadDraft,
  listLocalDrafts,
  deriveComponentSteps,
  resolveMeasurementFields,
  convertMeasurements,
  requestReturnTo,
  DRAFT_RETENTION_MS,
  clearPrivateDrafts,
} from "../lib/drafts";

describe("recoverable request drafts", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("preserves a complete draft through same-tab authentication without putting private data in persistent storage", () => {
    const draft = createDraft({
      measurements: { unit: "cm", values: { bust: 91 }, method: "body" },
      customer: { name: "Private person", phone: "9999999999" },
      configuration: {
        source: "reference",
        mode: "custom",
        components: {
          sleeve: {
            source: "reference",
            referenceMediaId: "private-media-id",
            notes: "private component note",
          },
          neck: { source: "option", optionId: "public-option-id" },
        },
      },
      logistics: {
        inbound: { method: "business", address: { line1: "Private address" } },
      },
    });
    const saved = saveDraft(draft, { now: 1000 });
    expect(saved.ok).toBe(true);
    const restored = loadDraft(draft.id, { now: 2000 });
    expect(restored.measurements.values.bust).toBe(91);
    expect(restored.configuration.components.sleeve.referenceMediaId).toBe(
      "private-media-id",
    );
    expect(restored.submissionKey).toBe(draft.submissionKey);
    const persisted = localStorage.getItem(localStorage.key(0));
    for (const secret of [
      "Private person",
      "9999999999",
      "private-media-id",
      "private component note",
      "Private address",
      "bust",
    ]) {
      expect(persisted).not.toContain(secret);
    }
  });

  it("restores ordinary choices after the session ends while clearly flagging absent private context", () => {
    const draft = createDraft({
      configuration: {
        source: "reference",
        mode: "custom",
        components: {
          sleeve: { source: "reference", referenceMediaId: "secret" },
          neck: { source: "option", optionId: "option1" },
        },
      },
    });
    saveDraft(draft);
    sessionStorage.clear();
    const restored = loadDraft(draft.id);
    expect(restored.sensitiveDataUnavailable).toBe(true);
    expect(restored.configuration.components.sleeve.needsReference).toBe(true);
    expect(
      restored.configuration.components.sleeve.referenceMediaId,
    ).toBeUndefined();
    expect(restored.configuration.components.neck.optionId).toBe("option1");
    expect(restored.measurements.values).toEqual({});
  });

  it("rejects stale tab saves rather than silently overwriting another edit", () => {
    const draft = createDraft();
    expect(saveDraft(draft).revision).toBe(1);
    const first = loadDraft(draft.id);
    const stale = loadDraft(draft.id);
    first.quantity = 2;
    expect(saveDraft(first).revision).toBe(2);
    stale.quantity = 3;
    expect(saveDraft(stale)).toEqual({
      ok: false,
      reason: "conflict",
      revision: 2,
    });
    expect(loadDraft(draft.id).quantity).toBe(2);
  });

  it("keeps multiple drafts independent and expires browser records after retention", () => {
    const first = createDraft({ garment: "blouse" });
    const second = createDraft({ garment: "kurti" });
    saveDraft(first, { now: 100 });
    saveDraft(second, { now: 200 });
    expect(listLocalDrafts({ now: 300 }).map((draft) => draft.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(loadDraft(first.id, { now: DRAFT_RETENTION_MS + 101 })).toBeNull();
    expect(
      loadDraft(second.id, { now: DRAFT_RETENTION_MS + 101 }).garment,
    ).toBe("kurti");
  });

  it("surfaces storage failures without falling back to persistent private data", () => {
    const throwing = {
      setItem() {
        throw new Error("Storage unavailable");
      },
    };
    const result = saveDraft(createDraft(), { sessionStorage: throwing });
    expect(result).toMatchObject({ ok: false, reason: "storage" });
    expect(localStorage.length).toBe(0);
  });
});

describe("design branching and measurements", () => {
  it("skips component steps for exact catalogue copies and only opens requested custom groups", () => {
    expect(
      deriveComponentSteps({
        source: "catalogue",
        mode: "exact",
        changedParts: ["sleeve"],
      }),
    ).toEqual([]);
    expect(
      deriveComponentSteps({
        source: "catalogue",
        mode: "custom",
        changedParts: ["back"],
      }),
    ).toEqual(["back"]);
    expect(
      deriveComponentSteps({ source: "reference", mode: "custom" }),
    ).toEqual(["sleeve", "neck", "back"]);
  });

  it("removes sleeve length for sleeveless and adds configured design fields", () => {
    const fields = resolveMeasurementFields(
      "blouse",
      {
        components: {
          sleeve: { source: "option", optionId: "sleeveless" },
          neck: { source: "option", optionId: "deep" },
        },
      },
      [
        { _id: "sleeveless", name: "Sleeveless" },
        { _id: "deep", measurementFields: ["frontNeckDepth"] },
      ],
    );
    expect(fields).not.toContain("sleeveLength");
    expect(fields).toContain("frontNeckDepth");
    expect(fields).toContain("underbust");
  });

  it("restores missing empty containers in earlier cloud records without discarding existing values", () => {
    const draft = createDraft({
      configuration: { source: "catalogue", mode: "exact" },
      measurements: { unit: "in", method: "body", notes: "Keep this note" },
      customer: { name: "Customer" },
    });
    expect(draft.configuration.components).toEqual({});
    expect(draft.measurements.values).toEqual({});
    expect(draft.measurements.notes).toBe("Keep this note");
    expect(draft.customer.name).toBe("Customer");
  });
  it("explicit sign-out removes private tab copies while retaining only ordinary design recovery", () => {
    const draft = createDraft({
      designId: "a".repeat(24),
      customer: { name: "Private customer", phone: "9876543210" },
      measurements: { unit: "in", method: "body", values: { bust: 36 } },
    });
    expect(saveDraft(draft).ok).toBe(true);
    expect(clearPrivateDrafts()).toBe(true);
    const restored = loadDraft(draft.id);
    expect(restored.designId).toBe(draft.designId);
    expect(restored.customer.name).toBe("");
    expect(restored.measurements.values).toEqual({});
    expect(restored.sensitiveDataUnavailable).toBe(true);
  });
  it("converts existing values rather than reinterpreting units and retains unset values", () => {
    expect(
      convertMeasurements({ bust: 36, shoulder: "", hip: null }, "in", "cm"),
    ).toEqual({ bust: 91.44, shoulder: "", hip: null });
    expect(convertMeasurements({ bust: 91.44 }, "cm", "in")).toEqual({
      bust: 36,
    });
  });

  it("creates only internal return routes containing opaque draft IDs", () => {
    expect(requestReturnTo("https://evil.test")).toBe("/request");
    expect(requestReturnTo("abc123abc123", "//evil.test")).toBe(
      "/request?draft=abc123abc123&step=review",
    );
  });
});
