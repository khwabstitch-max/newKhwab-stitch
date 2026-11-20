import { expect, it } from "vitest";
import { GARMENT_PHOTOGRAPHY, withDesignPhotography } from "../lib/design-photography";

const records = [
  { code: "DEMO-K01", slug: "demo-cotton-kurti", garment: "kurti", folder: "cotton-kurti" },
  { code: "DEMO-S01", slug: "demo-classic-suit", garment: "suit", folder: "classic-suit" },
  { code: "DEMO-B01", slug: "demo-celebration-blouse", garment: "blouse", folder: "celebration-blouse" },
  { code: "DEMO-A01", slug: "demo-alteration", garment: "alteration", folder: "alterations" },
];
const fixture = (changes = {}) => ({
  ...records[0],
  _id: "existing-design-id",
  title: "Customer fabric kurti",
  startingPricePaise: 65000,
  defaultComponents: { neck: "existing-neck" },
  images: [],
  views: [],
  coverView: null,
  coverImageUrl: null,
  ...changes,
});

it.each(records)("adds the matching photographic reference to $code without changing design identity or pricing", record => {
  const design = Object.freeze(fixture(record));
  const result = withDesignPhotography(design);
  expect(result).not.toBe(design);
  expect(result).toMatchObject({
    _id: design._id,
    code: record.code,
    slug: record.slug,
    garment: record.garment,
    title: design.title,
    startingPricePaise: design.startingPricePaise,
    defaultComponents: design.defaultComponents,
    coverImageUrl: "/atelier/catalogue/" + record.folder + (record.garment === "kurti" ? "/front.webp" : "/front-v2.webp"),
  });
  expect(design.images).toEqual([]);
  expect(design.views).toEqual([]);
});

it.each([
  { code: "UNRELATED" },
  { code: "constructor", slug: undefined, garment: undefined },
  { code: "__proto__", slug: undefined, garment: undefined },
  { slug: "another-cotton-kurti" },
  { garment: "blouse" },
  { code: "KS-TEAL-01", slug: "teal-floral-embroidered-kurti" },
])("does not invent photography for a mismatched record: %j", changes => {
  const design = fixture(changes);
  expect(withDesignPhotography(design)).toBe(design);
});

it.each([
  { coverView: { url: "/owner-cover.webp" } },
  { coverImageUrl: "/owner-cover.webp" },
  { coverMediaId: "owner-cover-id" },
  { images: [{ id: "owner-media", url: "/owner-image.webp" }] },
  { views: [{ label: "Original front", url: "/owner-front.webp" }] },
  { mediaIds: ["owner-media-id"] },
  { imageViews: [{ mediaId: "owner-media-id", label: "Original front" }] },
])("preserves existing uploaded and unresolved media: %j", media => {
  const design = fixture(media);
  expect(withDesignPhotography(design)).toBe(design);
});

it("keeps labelled garment and alterations views inside their matching photographic board", () => {
  for (const record of records) {
    const result = withDesignPhotography(fixture(record));
    const board = result.images[0];
    expect(result.images).toHaveLength(["suit", "blouse"].includes(record.garment) ? 2 : 1);
    expect(board).toMatchObject({ url: "/atelier/catalogue/" + record.folder + (record.garment === "kurti" ? "/board.webp" : "/board-v2.webp"), width: 1536, height: 1024 });
    expect(result.views).toHaveLength(record.garment === "alteration" ? 5 : 7);
    expect(result.coverView).toBe(result.views[0]);
    for (const view of result.views) {
      expect(result.images.some(image => image.url === view.url && image.id === view.id)).toBe(true);
      expect(view.label).toBeTruthy();
      expect(view.labelHi).toBeTruthy();
      if (view.crop) {
        expect(view.crop.x).toBeGreaterThanOrEqual(0);
        expect(view.crop.y).toBeGreaterThanOrEqual(0);
        expect(view.crop.x + view.crop.width).toBeLessThanOrEqual(100);
        expect(view.crop.y + view.crop.height).toBeLessThanOrEqual(100.000001);
      }
    }
    expect(result.views.at(-1).crop).toBeNull();
    expect(GARMENT_PHOTOGRAPHY[record.garment]).toBe("/atelier/catalogue/" + record.folder + (record.garment === "kurti" ? "/category.webp" : "/category-v2.webp"));
    if (record.garment === "alteration") {
      expect(result.views.slice(0, 4).map(view => view.label)).toEqual(["Waist fitting", "Sleeve adjustment", "Hem shortening", "Shoulder finish"]);
      expect(result.views.some(view => /front|side|back view/i.test(view.label))).toBe(false);
    } else {
      expect(result.views.slice(0, 3).map(view => view.label)).toEqual(["Front view", "Side view", "Back view"]);
    }
  }
});

it("is idempotent and leaves absent records unchanged", () => {
  const design = withDesignPhotography(fixture());
  expect(withDesignPhotography(design)).toBe(design);
  expect(withDesignPhotography(null)).toBeNull();
  expect(withDesignPhotography(undefined)).toBeUndefined();
});

const productionRecords = [
  { _id: "6aec91f75fea93612231bd80", code: "K-1", legacy: "DEMO-K01", slug: "demo-cotton-kurti", garment: "kurti" },
  { _id: "6aec91f75fea93612231bd81", code: "KS-0", legacy: "DEMO-S01", slug: "demo-classic-suit", garment: "suit" },
  { _id: "6aec91f75fea93612231bd82", code: "B-0", legacy: "DEMO-B01", slug: "demo-celebration-blouse", garment: "blouse" },
  { _id: "6aec91f75fea93612231bd83", code: "A-0", legacy: "DEMO-A01", slug: "demo-alteration", garment: "alteration" },
];
it.each(productionRecords)("retains matching photo identity after production code migration for $code", record => {
  const before = withDesignPhotography(fixture({ ...record, code: record.legacy }));
  const after = withDesignPhotography(fixture(record));
  expect(after.views.map(view => ({ id: view.id, url: view.url, crop: view.crop }))).toEqual(before.views.map(view => ({ id: view.id, url: view.url, crop: view.crop })));
  expect(after.code).toBe(record.code);
  expect(after._id).toBe(record._id);
});
it("does not assign a reference to an unrelated production record or mismatched code family", () => {
  const unrelated = fixture({ ...productionRecords[0], _id: "unrelated-production-id" });
  expect(withDesignPhotography(unrelated)).toBe(unrelated);
  const wrongFamily = fixture({ ...productionRecords[0], code: "B-7" });
  expect(withDesignPhotography(wrongFamily)).toBe(wrongFamily);
  const edited = fixture({ ...productionRecords[0], views: [{ url: "/owner-image.webp", label: "Owner photo" }] });
  expect(withDesignPhotography(edited)).toBe(edited);
});
