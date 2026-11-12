import { test } from "node:test";
import assert from "node:assert/strict";
import { homepageInput, safeHomepageHref } from "../src/homepage-input.js";
import { publicHomepage, publicOfferAvailable } from "../src/homepage.js";

const now = new Date("2026-11-12T06:00:00Z");
const imageId = "a".repeat(24), designA = "b".repeat(24), designB = "c".repeat(24), draftId = "d".repeat(24), offerId = "e".repeat(24);
const banner = (changes = {}) => ({ id: "featured-one", kind: "featured", active: true, title: "Choose a design", titleHi: "डिज़ाइन चुनें", description: "Custom stitching using your fabric.", descriptionHi: "आपके कपड़े पर सिलाई।", actionLabel: "View designs", actionLabelHi: "डिज़ाइन देखें", href: "/catalogue", imageMediaId: imageId, ...changes });
const offer = (changes = {}) => ({ _id: offerId, code: "UNIT15", type: "percentage", value: 1500, status: "published", usedCount: 0, totalUseLimit: null, perCustomerLimit: 1, ...changes });
const programme = (changes = {}) => ({ enabled: true, offersEnabled: true, terms: "Review the current quote.", termsHi: "वर्तमान कोटेशन देखें।", ...changes });
const matches = (record, filter) => Object.entries(filter).every(([key, value]) => value && typeof value === "object" && "$in" in value ? value.$in.some(id => String(id) === String(record[key])) : value === null ? record[key] == null : record[key] === value);
function fixture({ assets = [{ _id: imageId, private: false, purpose: "banner", filePath: "/khwab/public/unit-banner.webp", width: 800, height: 500 }], designs = [], offers = [], settings = programme() } = {}) {
  const query = (records, filter) => ({ select() { return this; }, async lean() { return records.filter(record => matches(record, filter)); } });
  return { models: {
    MediaAsset: { find: filter => query(assets, filter) },
    Design: { find: filter => query(designs, filter) },
    CommerceOffer: { find: filter => query(offers, filter) },
    CommerceSettings: { findOne: () => ({ async lean() { return settings; } }) },
  }, images: { url: path => "https://images.example.test" + path } };
}

test("active homepage banners require complete English/Hindi copy and public-image selection", () => {
  assert.equal(homepageInput.safeParse({ slides: [banner()] }).success, true);
  for (const changes of [{ titleHi: "" }, { descriptionHi: "" }, { actionLabelHi: "" }, { imageMediaId: null }])
    assert.equal(homepageInput.safeParse({ slides: [banner(changes)] }).success, false);
  assert.equal(homepageInput.safeParse({ slides: [banner({ active: false, titleHi: "", imageMediaId: null })] }).success, true);
});

test("homepage input rejects duplicate slide/design IDs and incomplete process shapes", () => {
  assert.equal(homepageInput.safeParse({ slides: [banner(), banner()] }).success, false);
  assert.equal(homepageInput.safeParse({ featuredDesignIds: [designA, designA.toUpperCase()] }).success, false);
  assert.equal(homepageInput.safeParse({ process: [{ title: "Only one" }] }).success, false);
});

test("homepage actions stay on approved public routes and schedules are ordered", () => {
  for (const href of ["/catalogue?garment=kurti", "/request?source=reference", "/designs/cotton-daydream", "/terms"]) assert.equal(safeHomepageHref(href), true);
  for (const href of ["https://elsewhere.example", "//elsewhere.example", "/admin", "/catalogue?token=private", "/\\elsewhere.example", "/catalogue%2fevil"]) assert.equal(safeHomepageHref(href), false);
  assert.equal(homepageInput.safeParse({ slides: [banner({ startsAt: "2026-11-13T00:00:00Z", endsAt: "2026-11-12T00:00:00Z" })] }).success, false);
});

test("offer availability requires both global flags, both language terms, publication and remaining quota", () => {
  assert.equal(publicOfferAvailable(offer(), programme(), now), true);
  for (const changes of [{ enabled: false }, { offersEnabled: false }, { enabled: "true" }, { terms: "" }, { termsHi: "" }, { termsHi: 3 }]) assert.equal(publicOfferAvailable(offer(), programme(changes), now), false);
  for (const changes of [{ status: "draft" }, { status: "archived" }, { totalUseLimit: 1, usedCount: 1 }, { usedCount: -1 }, { value: 10001 }, { value: undefined }]) assert.equal(publicOfferAvailable(offer(changes), programme(), now), false);
});

test("offer windows include their start and exclude their exact expiry", () => {
  assert.equal(publicOfferAvailable(offer({ startsAt: now, endsAt: new Date(now.getTime() + 1) }), programme(), now), true);
  for (const changes of [{ startsAt: new Date(now.getTime() + 1) }, { endsAt: now }, { endsAt: "invalid-date" }]) assert.equal(publicOfferAvailable(offer(changes), programme(), now), false);
});

test("public homepage filters inactive/future/expired/raw invalid slides and orders surviving records", async () => {
  const input = { slides: [banner({ id: "later", displayOrder: 5 }), banner({ id: "earlier", displayOrder: 1 }), banner({ id: "inactive", active: false }), banner({ id: "future", startsAt: "2026-11-13T00:00:00Z" }), banner({ id: "expired", endsAt: now.toISOString() }), banner({ id: "missing-hindi", titleHi: "" }), banner({ id: "raw-extra", privateInternalNote: "never-public" }), null], featuredDesignIds: ["not-an-object-id"] };
  const result = await publicHomepage(fixture(), input, now);
  assert.deepEqual(result.slides.map(slide => slide.id), ["earlier", "later"]);
  assert.ok(result.slides.every(slide => slide.imageUrl.startsWith("https://images.example.test/khwab/public/")));
  assert.equal(result.slides[0].imageMediaId, undefined);
  assert.deepEqual(result.featuredDesignIds, []);
});

test("public homepage hides private, deleted and missing banner assets", async () => {
  for (const assets of [[], [{ _id: imageId, private: true, purpose: "reference" }], [{ _id: imageId, private: false, purpose: "banner", deletingAt: now }]]) {
    assert.deepEqual((await publicHomepage(fixture({ assets }), { slides: [banner()] }, now)).slides, []);
  }
});

test("featured designs preserve owner order while removing drafts, unavailable IDs and raw metadata", async () => {
  const designs = [designA, designB, draftId].map((_id, index) => ({ _id, status: index === 2 ? "draft" : "published", title: "Design " + index, mediaIds: [], internalNote: "never-public" }));
  const result = await publicHomepage(fixture({ designs }), { featuredDesignIds: [designB, "not-an-id", draftId, designA], privateNote: "never-public", hero: { headline: "Private injected", unknown: "never-public" } }, now);
  assert.deepEqual(result.featuredDesignIds, [designB, designA]);
  assert.deepEqual(result.featuredDesigns.map(design => String(design._id)), [designB, designA]);
  assert.equal(JSON.stringify(result).includes("never-public"), false);
  assert.equal(result.hero, undefined);
});

test("public offer summaries require available programmes and never expose provider or owner metadata", async () => {
  const slide = banner({ kind: "offer", offerId, terms: "Banner offer terms", termsHi: "ऑफ़र की शर्तें" });
  const result = await publicHomepage(fixture({ offers: [offer({ owner: "never-public", privateNote: "never-public" })] }), { slides: [slide] }, now);
  assert.equal(result.slides[0].offer.available, true);
  assert.equal(result.slides[0].offer.value, 1500);
  assert.equal(result.slides[0].offer.programmeTermsHi, programme().termsHi);
  assert.equal(result.slides[0].offerId, undefined);
  assert.equal(JSON.stringify(result).includes("never-public"), false);
  assert.deepEqual((await publicHomepage(fixture({ offers: [offer()], settings: programme({ termsHi: "" }) }), { slides: [slide] }, now)).slides, []);
});

test("public homepage handles absent and corrupt legacy containers without throwing", async () => {
  assert.equal(await publicHomepage(fixture(), null, now), undefined);
  assert.equal(await publicHomepage(fixture(), "corrupt", now), undefined);
  assert.deepEqual((await publicHomepage(fixture(), { slides: {}, featuredDesignIds: {} }, now)).slides, []);
});

test("hero copy accepts custom CTAs and publicHomepage resolves hero imageMediaId into public imageUrl", async () => {
  const input = {
    hero: {
      eyebrow: "CUSTOM STITCHING",
      eyebrowHi: "कस्टम सिलाई",
      headline: "Your fabric, your design.",
      headlineHi: "आपका कपड़ा, आपका डिज़ाइन।",
      description: "Tailored to your measurements.",
      descriptionHi: "आपकी सटीक नाप के अनुसार सिलाई।",
      primaryCtaLabel: "Choose a Design",
      primaryCtaLabelHi: "डिज़ाइन चुनें",
      secondaryCtaLabel: "Share Your Design",
      secondaryCtaLabelHi: "अपना डिज़ाइन भेजें",
      imageMediaId: imageId,
    },
  };
  assert.equal(homepageInput.safeParse(input).success, true);
  const result = await publicHomepage(fixture(), input, now);
  assert.equal(result.hero.primaryCtaLabel, "Choose a Design");
  assert.equal(result.hero.imageUrl, "https://images.example.test/khwab/public/unit-banner.webp");
  assert.equal(result.hero.imageWidth, 800);
  assert.equal(result.hero.imageHeight, 500);
});
