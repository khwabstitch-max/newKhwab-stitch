import { z } from "zod";

const id = z.string().regex(/^[a-f\d]{24}$/i).transform(value => value.toLowerCase());
const copy = max => z.string().trim().max(max).default("");
const moment = z.iso.datetime().nullable().optional().default(null);
const localized = (names, max) => z.object(Object.fromEntries(names.flatMap(name => [[name, copy(max)], [name + "Hi", copy(max)]]))).strict();

export function safeHomepageHref(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || [...value].some(character => character === "\\" || character.charCodeAt(0) <= 32) || /%(?:2f|5c|00)/i.test(value)) return false;
  try {
    const url = new URL(value, "https://khwab.invalid");
    if (url.origin !== "https://khwab.invalid" || !/^(?:\/catalogue|\/request|\/how-it-works|\/contact|\/terms|\/designs\/[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(url.pathname)) return false;
    return [...url.searchParams.keys()].every(key => ["garment", "category", "q", "search", "design", "source", "bulk"].includes(key));
  } catch { return false; }
}

const slideInput = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  kind: z.enum(["featured", "seasonal", "offer", "bulk"]),
  title: copy(150), titleHi: copy(150), description: copy(700), descriptionHi: copy(700),
  actionLabel: copy(80), actionLabelHi: copy(80),
  href: z.string().trim().max(500).default("/catalogue").refine(safeHomepageHref, "Choose an existing public page for this banner."),
  imageMediaId: id.nullable().optional().default(null),
  offerId: id.nullable().optional().default(null),
  terms: copy(2500), termsHi: copy(2500),
  active: z.boolean().default(false),
  startsAt: moment, endsAt: moment,
  displayOrder: z.number().int().min(-10000).max(10000).default(0),
}).strict().superRefine((slide, context) => {
  if (slide.startsAt && slide.endsAt && slide.startsAt >= slide.endsAt)
    context.addIssue({ code: "custom", path: ["endsAt"], message: "The banner end must follow its start." });
  if (!slide.active) return;
  for (const field of ["title", "titleHi", "description", "descriptionHi", "actionLabel", "actionLabelHi"])
    if (!slide[field]) context.addIssue({ code: "custom", path: [field], message: "Add English and Hindi copy before publishing this banner." });
  if (!slide.imageMediaId) context.addIssue({ code: "custom", path: ["imageMediaId"], message: "Choose a public banner or catalogue image before publishing." });
  if (slide.kind === "offer") {
    if (!slide.offerId) context.addIssue({ code: "custom", path: ["offerId"], message: "Choose the published offer advertised by this banner." });
    for (const field of ["terms", "termsHi"])
      if (!slide[field]) context.addIssue({ code: "custom", path: [field], message: "Add English and Hindi offer conditions before publishing this banner." });
  }
});
export { slideInput as homepageSlideInput };

export const homepageInput = z.object({
  hero: z.object({
    eyebrow: copy(150), eyebrowHi: copy(150), headline: copy(200), headlineHi: copy(200),
    description: copy(1500), descriptionHi: copy(1500),
    primaryCtaLabel: copy(60), primaryCtaLabelHi: copy(60),
    secondaryCtaLabel: copy(60), secondaryCtaLabelHi: copy(60),
    imageMediaId: id.nullable().optional().default(null),
  }).strict().optional(),
  slides: z.array(slideInput).max(12).default([]),
  featuredDesignIds: z.array(id).max(12).default([]),
  process: z.array(localized(["title", "description"], 600)).max(4).default([]),
  help: localized(["title", "description"], 1500).optional(),
  footer: localized(["description"], 1500).optional(),
}).strict().superRefine((homepage, context) => {
  if (new Set(homepage.slides.map(slide => slide.id)).size !== homepage.slides.length)
    context.addIssue({ code: "custom", path: ["slides"], message: "Each banner needs its own automatically generated identifier." });
  if (new Set(homepage.featuredDesignIds).size !== homepage.featuredDesignIds.length)
    context.addIssue({ code: "custom", path: ["featuredDesignIds"], message: "Choose each featured design only once." });
  if (homepage.process.length && homepage.process.length !== 4)
    context.addIssue({ code: "custom", path: ["process"], message: "Use the complete four-step stitching explanation." });
});
