import { t } from "../i18n/core";

export const BUSINESS_TIMEZONE = "Asia/Kolkata";
const digits = value => String(value ?? "").replace(/[०-९]/g, digit => String("०१२३४५६७८९".indexOf(digit)));

export function amountInput(value) {
  if (value === null || value === undefined) return "";
  if (!Number.isSafeInteger(value)) throw new Error(t("admin.validation.money"));
  const absolute = Math.abs(value);
  return `${value < 0 ? "-" : ""}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function parseAmount(value, { signed = false, optional = false } = {}) {
  const text = digits(value).trim();
  if (!text && optional) return null;
  if (!(signed ? /^-?(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/ : /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/).test(text))
    throw new Error(t("admin.validation.money"));
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const integer = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0"));
  if (integer > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(t("admin.validation.money"));
  return Number(integer) * (negative ? -1 : 1);
}

export function parsePercentage(value) {
  const amount = parseAmount(value);
  if (amount > 10000) throw new Error(t("admin.validation.percent"));
  return amount;
}

export function businessDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function businessDateIso(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error(t("admin.validation.date"));
  const date = new Date(`${value}:00+05:30`);
  if (!Number.isFinite(date.getTime()) || businessDateInput(date.toISOString()) !== value)
    throw new Error(t("admin.validation.date"));
  return date.toISOString();
}

export const garmentChoices = [["kurti", "admin.garment.kurti"], ["suit", "admin.garment.suit"], ["blouse", "admin.garment.blouse"], ["alteration", "admin.garment.alteration"]];
export const measurementChoices = [
  ["bust", "admin.measurement.bust"], ["underbust", "admin.measurement.underbust"], ["waist", "admin.measurement.waist"], ["hip", "admin.measurement.hip"],
  ["shoulder", "admin.measurement.shoulder"], ["length", "admin.measurement.length"], ["arm", "admin.measurement.arm"], ["armhole", "admin.measurement.armhole"],
  ["sleeveLength", "admin.measurement.sleeveLength"], ["sleeveOpening", "admin.measurement.sleeveOpening"],
  ["frontNeckDepth", "admin.measurement.frontNeckDepth"], ["frontNeckWidth", "admin.measurement.frontNeckWidth"],
  ["backNeckDepth", "admin.measurement.backNeckDepth"], ["backNeckWidth", "admin.measurement.backNeckWidth"],
];
export const componentChoices = [["neck", "Front Neck Design"], ["back", "Back Neck Design"], ["sleeve", "Sleeve Design"], ["sleeveLength", "Sleeve Length"], ["fit", "Fit"], ["extra", "Extra Add-ons"]];
