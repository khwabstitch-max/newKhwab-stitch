import { beforeEach, expect, it } from "vitest";
import {
  effectiveLengthStyle,
  extraMaterialLabel,
  isEnabledAddon,
  optionCompatibility,
} from "../lib/customization";
import { setLanguage } from "../i18n/core";
import { findLengthGuide } from "../data/tailoringDesignGuide";

beforeEach(() => setLanguage("en", false));
const length = { _id: "length", kind: "sleeveLength", lengthStyle: "short" };
const sleeve = {
  _id: "sleeve",
  kind: "sleeve",
  sleeveStyle: "full",
  compatibleLengthStyles: ["short", "full"],
};
const catalogue = { source: "catalogue", mode: "custom", components: {} };
const design = {
  defaultComponents: { sleeve: "sleeve", sleeveLength: "length" },
};

it("keeps canonical three-quarter illustrations distinct from short quarter sleeves", () => {
  for (const style of ["sleeveless", "short", "elbow", "three_quarter", "full"]) expect(findLengthGuide(style)?.id).toBe(style);
  expect(findLengthGuide("three-quarter sleeve").id).toBe("three_quarter");
  expect(findLengthGuide("three quarter sleeve").id).toBe("three_quarter");
  expect(findLengthGuide("quarter sleeve").id).toBe("short");
  expect(findLengthGuide("custom")).toBeNull();
});

it("resolves explicit/original length independently of design and rejects stale estimate snapshots", () => {
  expect(effectiveLengthStyle(catalogue, design, [length, sleeve])).toBe(
    "short",
  );
  expect(
    effectiveLengthStyle(
      {
        ...catalogue,
        components: { sleeveLength: { source: "option", optionId: "new" } },
      },
      design,
      [length, sleeve],
      { sleeveLength: { optionId: "length", lengthStyle: "sleeveless" } },
    ),
  ).toBeNull();
  expect(
    effectiveLengthStyle(
      {
        ...catalogue,
        components: { sleeveLength: { source: "option", optionId: "new" } },
      },
      design,
      [],
      { sleeveLength: { optionId: "new", lengthStyle: "full" } },
    ),
  ).toBe("full");
  expect(
    effectiveLengthStyle(
      { ...catalogue, components: { sleeveLength: { source: "reference" } } },
      design,
      [length, sleeve],
    ),
  ).toBeNull();
  expect(
    effectiveLengthStyle(
      {
        ...catalogue,
        mode: "exact",
        components: { sleeveLength: { source: "option", optionId: "other" } },
      },
      design,
      [length, sleeve],
    ),
  ).toBe("short");
});

it("reads legacy length metadata without treating an unspecified value as a new configured combination", () => {
  const legacyDesign = { defaultComponents: { sleeve: "old" } };
  expect(
    effectiveLengthStyle(catalogue, legacyDesign, [
      { _id: "old", sleeveStyle: "sleeveless" },
    ]),
  ).toBe("sleeveless");
  expect(
    effectiveLengthStyle(catalogue, legacyDesign, [
      { _id: "old", sleeveStyle: "other" },
    ]),
  ).toBeNull();
});

it("requires explicit sleeve/length compatibility and never permits a sleeve charge for Sleeveless", () => {
  expect(optionCompatibility(sleeve, { lengthStyle: "short" }).compatible).toBe(
    true,
  );
  expect(optionCompatibility(sleeve, { lengthStyle: "elbow" }).compatible).toBe(
    false,
  );
  expect(
    optionCompatibility(
      { ...sleeve, compatibleLengthStyles: [] },
      { lengthStyle: "full" },
    ).compatible,
  ).toBe(false);
  expect(
    optionCompatibility(
      { ...sleeve, compatibleLengthStyles: ["sleeveless"] },
      { lengthStyle: "sleeveless" },
    ),
  ).toEqual({
    compatible: false,
    reason: expect.stringContaining("previous sleeve choice is kept"),
  });
  expect(
    optionCompatibility(
      { ...sleeve, status: "draft" },
      { lengthStyle: "short" },
    ).compatible,
  ).toBe(false);
});

it("explains incompatible front/back pairs in either direction without mutating either selection", () => {
  const front = {
    _id: "front",
    kind: "neck",
    incompatibleOptionIds: ["closed"],
  };
  const back = { _id: "back", kind: "back", incompatibleOptionIds: ["front"] };
  const initial = JSON.stringify([front, back]);
  expect(
    optionCompatibility(front, { oppositeOptionId: "closed" }).compatible,
  ).toBe(false);
  expect(
    optionCompatibility(front, {
      oppositeOptionId: "back",
      oppositeOption: back,
    }).compatible,
  ).toBe(false);
  expect(
    optionCompatibility(front, { oppositeOptionId: "different" }).compatible,
  ).toBe(true);
  expect(JSON.stringify([front, back])).toBe(initial);
});

it("offers only enabled stitching add-ons and accurately labels material coverage", () => {
  const addon = { kind: "extra", garments: ["kurti"] };
  expect(isEnabledAddon(addon, "kurti")).toBe(true);
  expect(isEnabledAddon({ ...addon, serviceType: "embroidery" }, "kurti")).toBe(
    false,
  );
  expect(isEnabledAddon({ ...addon, serviceType: "painting" }, "kurti")).toBe(
    false,
  );
  expect(isEnabledAddon({ ...addon, status: "draft" }, "kurti")).toBe(false);
  expect(isEnabledAddon(addon, "blouse")).toBe(false);
  expect(extraMaterialLabel(addon)).toBe(
    "Stitching labor only; materials are not supplied.",
  );
  expect(
    extraMaterialLabel({
      materialCoverage: "labor_and_materials",
      materialNotes: "Buttons supplied",
    }),
  ).toBe(
    "Includes stitching labor and the materials listed by the atelier. Buttons supplied",
  );
  expect(extraMaterialLabel({ materialCoverage: "review" })).toContain(
    "after tailor review",
  );
});
