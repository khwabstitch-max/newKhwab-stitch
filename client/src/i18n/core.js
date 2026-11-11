import { messages } from "./catalog";
export const LANGUAGE_KEY = "khwab.language";
// Extend the shared catalogue so existing translations and reverse lookups stay intact.
import { enhancements } from "./enhancements";
import { commerceMessages } from "./commerce";
const catalogue = { ...enhancements, ...messages, ...commerceMessages };
const supported = new Set(["en", "hi"]);
let language = "en";
try {
  const stored = globalThis.localStorage?.getItem(LANGUAGE_KEY);
  if (supported.has(stored)) language = stored;
} catch {
  /* Language still works when storage is blocked. */
}
const listeners = new Set();
export const getLanguage = () => language;
export const getLocale = () => (language === "hi" ? "hi-IN" : "en-IN");
export const subscribeLanguage = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};
export function setLanguage(next, persist = true) {
  if (!supported.has(next)) return false;
  if (persist) {
    try {
      globalThis.localStorage?.setItem(LANGUAGE_KEY, next);
    } catch {
      /* In-memory fallback. */
    }
  }
  if (next === language) return true;
  language = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  for (const listener of listeners) listener();
  return true;
}
const reverse = Object.fromEntries(
  Object.entries(catalogue).map(([en, hi]) => [hi, en]),
);
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templateEntries = Object.entries(catalogue)
  .filter(([en]) => /\{\d+\}/.test(en))
  .flatMap(([en, hi]) =>
    [en, hi].map((source) => {
      const order = [];
      const fragments = source
        .split(/(\{\d+\})/)
        .map((part) =>
          /^\{\d+\}$/.test(part)
            ? (order.push(part.slice(1, -1)), "(.+?)")
            : escape(part),
        );
      return {
        english: en,
        order,
        regex: new RegExp("^" + fragments.join("") + "$", "u"),
      };
    }),
  );
export function t(value, parameters = {}, selected = language) {
  if (typeof value !== "string" || !value.trim()) return value;
  const leading = value.match(/^\s*/)[0],
    trailing = value.match(/\s*$/)[0];
  const canonical = value.trim().replace(/\s+/g, " ");
  let english = Object.hasOwn(catalogue, canonical)
    ? canonical
    : reverse[canonical] || canonical;
  let params = parameters;
  if (!Object.hasOwn(catalogue, english)) {
    for (const entry of templateEntries) {
      const match = entry.regex.exec(canonical);
      if (match) {
        english = entry.english;
        params = {
          ...Object.fromEntries(
            entry.order.map((key, index) => [key, match[index + 1]]),
          ),
          ...parameters,
        };
        break;
      }
    }
  }
  const translated =
    selected === "hi" ? catalogue[english] || english : english;
  return (
    leading +
    translated.replace(/\{([^{}]+)\}/g, (all, key) =>
      Object.hasOwn(params, key) ? String(params[key]) : all,
    ) +
    trailing
  );
}
const tokens = {
  request_received: "Request Received",
  under_review: "Under Review",
  quote_sent: "Quote Sent",
  customer_accepted: "Customer Accepted",
  fabric_received: "Fabric Received",
  stitching: "Stitching",
  ready: "Ready",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
  kurti: "Kurti",
  suit: "Suit",
  blouse: "Blouse",
  alteration: "Alteration",
  body: "Body",
  garment: "Garment",
  assistance: "Assistance",
  in: "In",
  cm: "Cm",
  neck: "Neck",
  sleeve: "Sleeve",
  back: "Back",
  fit: "Fit",
  extra: "Extra",
  reference: "Reference",
  measurement: "Measurement",
  catalogue: "Catalogue",
  banner: "Banner",
  customer: "Customer",
  admin: "Admin",
  draft: "Draft",
  published: "Published",
  archived: "Archived",
  deleted: "Deleted",
};
export function labelToken(value) {
  return typeof value === "string" ? t(tokens[value] || value) : value;
}
export function localize(record, field) {
  if (!record) return "";
  const hindi = record[field + "Hi"];
  if (language === "hi" && typeof hindi === "string" && hindi.trim())
    return hindi;
  return t(record[field] || "");
}
const fields = {
  name: "Name",
  email: "Email",
  password: "Password",
  phone: "WhatsApp / phone",
  garment: "Garment",
  quantity: "Quantity",
  title: "Design title",
  description: "Stitching description",
  code: "Design code",
  slug: "URL slug",
  category: "Category",
  startingPricePaise: "Stitching starting price (INR)",
  amountPaise: "Total stitching price (INR)",
  deliveryDate: "Proposed delivery date",
  preferredDate: "Preferred date",
  line1: "Address line 1",
  line2: "Address line 2 (optional)",
  city: "City",
  state: "State",
  pin: "PIN code",
  bust: "Bust",
  underbust: "Underbust",
  waist: "Waist",
  hip: "Hip",
  shoulder: "Shoulder",
  length: "Length",
  sleeveLength: "Sleeve Length",
  unit: "Measurement unit",
  method: "Measurement method",
  notes: "Instructions",
  fabricAcknowledged: "Fabric provided by customer.",
  referenceMediaIds: "Reference images",
  mediaIds: "Design images",
  coverMediaId: "Cover",
  revision: "Review",
  titleHi: "Hindi title (optional)",
  descriptionHi: "Hindi description (optional)",
  nameHi: "Hindi name (optional)",
  notesHi: "Hindi quote notes (optional)",
  noteHi: "Hindi progress note (optional)",
  note: "Progress note",
  status: "Next status",
  taglineHi: "Hindi tagline (optional)",
  announcementHi: "Hindi announcement (optional)",
  aboutHi: "Hindi about text (optional)",
  questionHi: "Hindi question (optional)",
  answerHi: "Hindi answer (optional)",
};
function validationMessage(message) {
  if (language === "en") return message;
  const translated = t(message);
  if (translated !== message) return translated;
  let match = /Enter between ([\d.]+) and ([\d.]+) (in|cm)\./.exec(message);
  if (match)
    return t("Enter a value between {0} and {1} {2}.", {
      0: match[1],
      1: match[2],
      2: labelToken(match[3]),
    });
  match = /(?:at least|>=)(\s*)(\d+)/i.exec(message);
  if (match)
    return t(
      /number/i.test(message)
        ? "Enter a value of at least {0}."
        : /array|items/i.test(message)
          ? "Select at least {0} items."
          : "This field must contain at least {0} characters.",
      { 0: match[2] },
    );
  match = /(?:at most|<=)(\s*)(\d+)/i.exec(message);
  if (match)
    return t(
      /number/i.test(message)
        ? "Enter a value no greater than {0}."
        : /array|items/i.test(message)
          ? "Select no more than {0} items."
          : "This field must contain at most {0} characters.",
      { 0: match[2] },
    );
  if (/email/i.test(message)) return t("Please enter a valid email address.");
  if (/required|undefined/i.test(message))
    return t("Please fill out this field.");
  if (/enum|option/i.test(message)) return t("Please choose a valid option.");
  return t("Please enter a valid value.");
}
export function translateError(error) {
  if (!error) return "";
  if (typeof error === "string") return t(error);
  const message =
    error.message ||
    "Request could not be completed. Please review the details and try again.";
  let result = t(message);
  if (language === "hi" && result === message)
    result = t(
      "Request could not be completed. Please review the details and try again.",
    );
  if (Array.isArray(error.details))
    result +=
      " " +
      error.details
        .slice(0, 5)
        .map((detail) => {
          const key = String(detail.path || "")
            .split(".")
            .at(-1);
          return (
            t(fields[key] || "Field") +
            ": " +
            validationMessage(detail.message || "Please enter a valid value.")
          );
        })
        .join(" ");
  return result;
}
