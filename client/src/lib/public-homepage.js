import { DEFAULT_HOMEPAGE } from "../data/homepage";

// Exact shipped templates may still be returned by saved website settings.
// Only these values are refreshed for display; owner edits and API records stay intact.
const previousHeroTemplates = {
  eyebrow: new Set([
    "CUSTOM STITCHING · EMBROIDERY · MADE TO ORDER",
    "WELCOME TO KHWAB STITCH • CUSTOM STITCHING ON YOUR FABRIC",
  ]),
  eyebrowHi: new Set([
    "कस्टम सिलाई · कढ़ाई · आपकी पसंद पर",
    "ख्वाब स्टिच में आपका स्वागत है • आपके कपड़े पर कस्टम सिलाई",
  ]),
  headline: new Set([
    "Stitching & embroidery, made for you.",
    "Your fabric, your design — stitched to your exact fit.",
  ]),
  headlineHi: new Set([
    "आपकी पसंद की सिलाई और कढ़ाई।",
    "आपका कपड़ा, आपकी पसंद का डिज़ाइन — आपके सटीक नाप की सिलाई।",
  ]),
  description: new Set([
    "Tailor-stitched on your fabric to your exact measurements, with doorstep pickup & delivery.",
  ]),
  descriptionHi: new Set([
    "आपके अपने कपड़े पर सटीक नाप की दर्ज़ी सिलाई — घर से पिकअप और डिलीवरी।",
  ]),
};
const previousFooterTemplates = {
  description: new Set([
    "Made-to-order stitching & embroidery. Your fabric, your personal touch.",
    "Custom stitching on your fabric. Design, measurements, price and delivery are confirmed before work begins.",
  ]),
  descriptionHi: new Set([
    "आपकी पसंद की सिलाई और कढ़ाई। आपका कपड़ा, आपके नाप की पोशाक।",
    "आपके कपड़े पर आपकी पसंद की सिलाई। काम शुरू होने से पहले डिज़ाइन, नाप, कीमत और डिलीवरी की पुष्टि की जाती है।",
  ]),
};

export function homepageText(record, field, language) {
  const value = record?.[field + (language === "hi" ? "Hi" : "")];
  return typeof value === "string" ? value.trim() : "";
}

// Prominent owner-written blocks use one complete language, never a mixture.
export function homepageBlock(record, fallback, fields, language) {
  const complete = fields.every((field) => homepageText(record, field, language));
  const source = complete ? record : fallback;
  const previousTemplates = fallback === DEFAULT_HOMEPAGE.hero ? previousHeroTemplates
    : fallback === DEFAULT_HOMEPAGE.footer ? previousFooterTemplates : null;
  return Object.fromEntries(fields.map((field) => {
    const value = homepageText(source, field, language);
    const key = field + (language === "hi" ? "Hi" : "");
    return [field, previousTemplates?.[key]?.has(value)
      ? homepageText(fallback, field, language) : value];
  }));
}

export function publicHref(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || [...value].some((character) => character === "\\" || character.charCodeAt(0) < 32)) return "";
  try {
    const parsed = new URL(value, "https://khwab.invalid");
    if (parsed.origin !== "https://khwab.invalid") return "";
    const allowed = ["/catalogue", "/request", "/contact", "/how-it-works", "/account/benefits", "/terms"];
    return allowed.includes(parsed.pathname) || /^\/designs\/[^/]+$/.test(parsed.pathname) ? value : "";
  } catch { return ""; }
}

export function eligibleHomepageSlides(slides, language, now = Date.now()) {
  return (Array.isArray(slides) ? slides : []).filter((slide) => {
    if (!slide || slide.active === false || !["featured", "seasonal", "offer", "bulk"].includes(slide.kind) || !publicHref(slide.href)) return false;
    if (!["title", "description", "actionLabel"].every((field) => homepageText(slide, field, language))) return false;
    for (const [key, before] of [["startsAt", true], ["endsAt", false]]) {
      if (!slide[key]) continue;
      const time = Date.parse(slide[key]);
      if (!Number.isFinite(time) || (before ? now < time : now >= time)) return false;
    }
    if (slide.kind === "offer") {
      const offer = slide.offer;
      if (offer?.available !== true || !homepageText(slide, "terms", language) || !homepageText(offer, "programmeTerms", language)) return false;
      if (!offer.code || !["fixed", "percentage"].includes(offer.type) || !Number.isSafeInteger(offer.value) || offer.value <= 0 || (offer.type === "percentage" && offer.value > 10000)) return false;
    }
    return true;
  }).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function formatHour(hour) {
  const h = Number(hour);
  if (!Number.isInteger(h) || h < 0 || h > 24) return "";
  const normalized = h % 24;
  const period = normalized >= 12 && h !== 24 ? "PM" : "AM";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display}:00 ${period}`;
}

export function formatSupportSummary(support, translate) {
  if (
    !support ||
    !Array.isArray(support.weekdays) ||
    !support.weekdays.length ||
    !Number.isInteger(support.startHour) ||
    !Number.isInteger(support.endHour)
  ) {
    return "";
  }
  const days = [...new Set(support.weekdays)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  if (!days.length) return "";
  const contiguous = days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const dayText = contiguous
    ? `${translate(SHORT_DAYS[days[0]])}–${translate(SHORT_DAYS[days[days.length - 1]])}`
    : days.map((d) => translate(SHORT_DAYS[d])).join(", ");
  return translate("public.footer.supportHours", {
    0: dayText,
    1: formatHour(support.startHour),
    2: formatHour(support.endHour),
  });
}
