import { fail } from "./errors.js";
import { pinMedia, releaseMedia, publicDesigns } from "./route-utils.js";
import { mediaUrl } from "./media-storage.js";
import { homepageInput, homepageSlideInput, safeHomepageHref } from "./homepage-input.js";

const ids = values => [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(value => String(value).toLowerCase()).filter(value => /^[a-f\d]{24}$/.test(value)))];
const mediaIds = homepage => ids([homepage?.hero?.imageMediaId, ...(Array.isArray(homepage?.slides) ? homepage.slides : []).map(slide => slide?.imageMediaId)]);
const activeAt = (value, now) => (!value.startsAt || new Date(value.startsAt) <= now) && (!value.endsAt || new Date(value.endsAt) > now);
const hasText = value => typeof value === "string" && Boolean(value.trim());
export function publicOfferAvailable(offer, settings, now = new Date()) {
  return Boolean(settings?.enabled === true && settings.offersEnabled === true && hasText(settings.terms) && hasText(settings.termsHi) &&
    offer?.status === "published" && activeAt(offer, now) && ["fixed", "percentage"].includes(offer.type) &&
    Number.isSafeInteger(offer.value) && offer.value > 0 && (offer.type !== "percentage" || offer.value <= 10000) &&
    Number.isSafeInteger(offer.usedCount ?? 0) && (offer.usedCount ?? 0) >= 0 &&
    (offer.totalUseLimit === null || offer.totalUseLimit === undefined || (Number.isSafeInteger(offer.totalUseLimit) && offer.totalUseLimit > 0 && (offer.usedCount ?? 0) < offer.totalUseLimit)));
}

// Reference writes share the existing settings transaction and media pin fence.
// An unchanged historical selection can remain stored while being hidden publicly.
export async function validateHomepage(ctx, next, previous, session) {
  if (next === undefined) return;
  const beforeMedia = new Set(mediaIds(previous)), afterMedia = new Set(mediaIds(next));
  await pinMedia(ctx, [...afterMedia].filter(id => !beforeMedia.has(id)), session, { private: false, purposes: ["banner", "catalogue"] });
  await releaseMedia(ctx, [...beforeMedia].filter(id => !afterMedia.has(id)), session);
  const beforeDesigns = new Set(ids(previous?.featuredDesignIds));
  for (const id of ids(next.featuredDesignIds).filter(id => !beforeDesigns.has(id))) {
    const result = await ctx.models.Design.updateOne({ _id: id, status: "published" }, { $inc: { referenceFence: 1 } }, { session });
    if (result.modifiedCount !== 1) fail(409, "FEATURED_DESIGN_CHANGED", "Choose a published design before featuring it on the homepage.");
  }
  const active = next.slides.filter(slide => slide.active);
  const checkedMedia = ids([next.hero?.imageMediaId, ...active.map(slide => slide.imageMediaId)]);
  if (checkedMedia.length) {
    const count = await ctx.models.MediaAsset.countDocuments({ _id: { $in: checkedMedia }, private: false, purpose: { $in: ["banner", "catalogue"] }, deletingAt: null }).session(session);
    if (count !== checkedMedia.length) fail(400, "INVALID_MEDIA", "Choose an available public image before publishing.");
  }
  for (const slide of active) {
    const slug = /^\/designs\/([a-z0-9-]+)$/.exec(new URL(slide.href, "https://khwab.invalid").pathname)?.[1];
    if (slug && !await ctx.models.Design.exists({ slug, status: "published" }).session(session))
      fail(409, "BANNER_DESIGN_CHANGED", "This banner links to an unavailable design. Choose a published design or a catalogue page.");
  }
  const offerSlides = active.filter(slide => slide.kind === "offer");
  if (!offerSlides.length) return;
  const settings = await ctx.models.CommerceSettings.findOne({ key: "main" }).session(session).lean();
  if (!settings?.enabled || !settings.offersEnabled || !settings.terms?.trim() || !settings.termsHi?.trim())
    fail(409, "OFFER_PROMOTION_UNAVAILABLE", "Enable offers and save English and Hindi programme terms before publishing an offer banner.");
  for (const slide of offerSlides) {
    const offer = await ctx.models.CommerceOffer.findOne({ _id: slide.offerId, status: "published" }).session(session).lean();
    if (!offer) fail(409, "OFFER_PROMOTION_UNAVAILABLE", "Choose a published offer before publishing its banner.");
    const start = Math.max(slide.startsAt ? Date.parse(slide.startsAt) : 0, offer.startsAt ? new Date(offer.startsAt).getTime() : 0);
    const end = Math.min(slide.endsAt ? Date.parse(slide.endsAt) : Infinity, offer.endsAt ? new Date(offer.endsAt).getTime() : Infinity);
    if (start >= end) fail(400, "OFFER_SCHEDULE_MISMATCH", "The banner and offer schedules must overlap.");
  }
}

// Public settings contain only current, published records and public image URLs.
// Anonymous offer availability is distinct from a customer's quote eligibility.
export async function publicHomepage(ctx, homepage, now = new Date()) {
  if (!homepage || typeof homepage !== "object" || Array.isArray(homepage)) return undefined;
  // Historical Mixed records are not trusted to match today's validated input.
  const slides = (Array.isArray(homepage.slides) ? homepage.slides : []).flatMap(slide => {
    const parsed = homepageSlideInput.safeParse(slide);
    return parsed.success && parsed.data.active && activeAt(parsed.data, now) && safeHomepageHref(parsed.data.href) ? [parsed.data] : [];
  });
  const requestedIds = ids(homepage.featuredDesignIds);
  const linkedSlugs = [...new Set(slides.flatMap(slide => {
    const match = /^\/designs\/([a-z0-9-]+)$/.exec(new URL(slide.href, "https://khwab.invalid").pathname);
    return match ? [match[1]] : [];
  }))];
  const publicMedia = mediaIds({ hero: homepage.hero, slides });
  const [assets, designs, linkedDesigns, settings, offers] = await Promise.all([
    publicMedia.length ? ctx.models.MediaAsset.find({ _id: { $in: publicMedia }, private: false, purpose: { $in: ["banner", "catalogue"] }, deletingAt: null }).lean() : [],
    requestedIds.length ? ctx.models.Design.find({ _id: { $in: requestedIds }, status: "published" }).lean() : [],
    linkedSlugs.length ? ctx.models.Design.find({ slug: { $in: linkedSlugs }, status: "published" }).select("slug").lean() : [],
    slides.some(slide => slide.kind === "offer") ? ctx.models.CommerceSettings.findOne({ key: "main" }).lean() : null,
    slides.some(slide => slide.kind === "offer") ? ctx.models.CommerceOffer.find({ _id: { $in: ids(slides.map(slide => slide.offerId)) }, status: "published" }).lean() : [],
  ]);
  const assetsById = new Map(assets.map(asset => [String(asset._id), asset]));
  const designsById = new Map(designs.map(design => [String(design._id), design]));
  const validSlugs = new Set(linkedDesigns.map(design => design.slug));
  const offersById = new Map(offers.map(offer => [String(offer._id), offer]));
  const visible = [];
  for (const slide of slides) {
    const asset = assetsById.get(String(slide.imageMediaId));
    if (!asset) continue;
    const linked = /^\/designs\/([a-z0-9-]+)$/.exec(new URL(slide.href, "https://khwab.invalid").pathname)?.[1];
    if (linked && !validSlugs.has(linked)) continue;
    const offer = slide.kind === "offer" ? offersById.get(String(slide.offerId)) : null;
    if (slide.kind === "offer" && !publicOfferAvailable(offer, settings, now)) continue;
    const { imageMediaId: _image, offerId: _offer, ...copy } = slide;
    visible.push({ ...copy, imageUrl: mediaUrl(ctx.images, asset, 3600), imageWidth: asset.width, imageHeight: asset.height,
      ...(offer ? { offer: { available: true, code: offer.code, type: offer.type, value: offer.value, minimumStitchingPaise: offer.minimumStitchingPaise, maxDiscountPaise: offer.maxDiscountPaise, garments: offer.garments, perCustomerLimit: offer.perCustomerLimit, programmeTerms: settings.terms, programmeTermsHi: settings.termsHi } } : {}),
    });
  }
  const featuredDesigns = await publicDesigns(ctx, requestedIds.filter(id => designsById.has(id)).map(id => designsById.get(id)));
  const copy = {};
  for (const field of ["hero", "help", "footer", "process"]) {
    const parsed = homepageInput.shape[field].safeParse(homepage[field]);
    if (parsed.success && parsed.data !== undefined && (field !== "process" || parsed.data.length === 4)) copy[field] = parsed.data;
  }
  if (copy.hero?.imageMediaId) {
    const heroAsset = assetsById.get(String(copy.hero.imageMediaId));
    if (heroAsset) {
      copy.hero = {
        ...copy.hero,
        imageUrl: mediaUrl(ctx.images, heroAsset, 3600),
        imageWidth: heroAsset.width,
        imageHeight: heroAsset.height,
      };
    }
  }
  return { ...copy, featuredDesignIds: featuredDesigns.map(design => String(design._id)), slides: visible.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)), featuredDesigns };
}
