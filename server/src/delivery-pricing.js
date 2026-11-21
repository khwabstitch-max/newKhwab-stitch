import { z } from "zod";

export const COURIER_PROVIDERS = Object.freeze(["shiprocket", "delhivery", "bluedart"]);
export const parcelInput = z.object({
  weightGrams: z.number().int().positive().max(30000),
  lengthCm: z.number().positive().max(200),
  widthCm: z.number().positive().max(200),
  heightCm: z.number().positive().max(200),
  declaredValuePaise: z.number().int().positive().max(100000000).optional(),
}).strict();
const pin = z.string().trim().regex(/^[1-9]\d{5}$/);
const money = maximum => z.number().int().min(0).max(maximum);
const directionRate = z.object({
  minimumChargePaise: money(10000000).nullable().optional(),
  perKmPaise: money(1000000).nullable().optional(),
}).strict();
export const deliveryPricingInput = z.object({
  mode: z.enum(["service_areas", "distance", "courier"]),
  courierProvider: z.enum(COURIER_PROVIDERS).optional(),
  distanceBasis: z.enum(["pin_area", "road"]).default("pin_area"),
  formula: z.enum(["base_plus_distance", "minimum_fare"]).default("base_plus_distance"),
  originPin: z.preprocess(value => typeof value === "string" && !value.trim() ? undefined : value, pin.optional()),
  inbound: directionRate.optional(),
  outbound: directionRate.optional(),
}).strict().superRefine((value, context) => {
  if (!["distance", "courier"].includes(value.mode)) return;
  if (!value.originPin) context.addIssue({ code: "custom", path: ["originPin"], message: "Enter the atelier's six-digit PIN code for delivery pricing." });
  if (value.mode === "courier") {
    if (!value.courierProvider) context.addIssue({ code: "custom", path: ["courierProvider"], message: "Choose the connected courier provider." });
    return;
  }
  if (value.distanceBasis !== "pin_area") context.addIssue({ code: "custom", path: ["distanceBasis"], message: "Choose PIN-area distance for per-kilometre pricing." });
  for (const direction of ["inbound", "outbound"]) for (const field of ["minimumChargePaise", "perKmPaise"])
    if (typeof value[direction]?.[field] !== "number") context.addIssue({ code: "custom", path: [direction, field], message: "Enter an explicit minimum charge and per-kilometre rate for pickup and delivery." });
});

export const DISTANCE_PENDING_REASON = "Pickup or delivery charges are pending until we can confirm the distance between the atelier PIN and your PIN.";
const sourceText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
export function distanceDeliveryCharge(rawSettings, direction, destinationPin, resolved) {
  const parsed = deliveryPricingInput.safeParse(rawSettings);
  const baseDetails = {
    pricingMode: "distance", distanceBasis: rawSettings?.distanceBasis || "pin_area",
    formula: rawSettings?.formula || "base_plus_distance",
    originPin: typeof rawSettings?.originPin === "string" ? rawSettings.originPin : "",
    destinationPin: destinationPin || "",
  };
  const pending = { amountPaise: null, details: baseDetails };
  if (!parsed.success || parsed.data.mode !== "distance" || !["inbound", "outbound"].includes(direction)) return pending;
  const settings = parsed.data;
  if (!resolved || typeof resolved.distanceMeters !== "number" || !Number.isFinite(resolved.distanceMeters) ||
      resolved.distanceMeters < 0 || resolved.distanceMeters > 50000000 ||
      resolved.basis !== settings.distanceBasis || resolved.originPin !== settings.originPin || resolved.destinationPin !== destinationPin ||
      !sourceText(resolved.source, 120) || !sourceText(resolved.sourceVersion, 200)) return pending;
  const billableKm = Math.ceil(resolved.distanceMeters / 1000);
  const rate = settings[direction], distanceChargePaise = billableKm * rate.perKmPaise;
  const amountPaise = settings.formula === "minimum_fare" ? Math.max(rate.minimumChargePaise, distanceChargePaise) : rate.minimumChargePaise + distanceChargePaise;
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) return pending;
  return { amountPaise, details: {
    ...baseDetails, distanceMeters: resolved.distanceMeters, billableKm,
    minimumChargePaise: rate.minimumChargePaise, perKmPaise: rate.perKmPaise, distanceChargePaise,
    distanceSource: resolved.source, distanceSourceVersion: resolved.sourceVersion,
  } };
}

export const COURIER_PENDING_REASON = "The connected courier's shipping rate is not available yet. We will confirm the transport charge before stitching.";
export const COURIER_PARCEL_REASON = "Enter parcel weight and dimensions to check the connected courier's pickup or delivery charge.";
export const COURIER_DECLARED_VALUE_REASON = "Enter the fabric or garment's declared value to check the courier pickup charge.";
export const COURIER_EXPIRED_REASON = "The courier quote has expired. Check the shipping rate again before submitting.";
const sameParcel = (left, right) => ["weightGrams", "lengthCm", "widthCm", "heightCm", "declaredValuePaise"].every(key => left?.[key] === right?.[key]);
export function courierDeliveryCharge(rawSettings, direction, customerPin, parcel, quote, now = Date.now()) {
  const parsed = deliveryPricingInput.safeParse(rawSettings);
  const details = { pricingMode: "courier", provider: rawSettings?.courierProvider || "",
    originPin: direction === "inbound" ? customerPin || "" : rawSettings?.originPin || "",
    destinationPin: direction === "inbound" ? rawSettings?.originPin || "" : customerPin || "",
  };
  const pending = reason => ({ amountPaise: null, details, reason });
  if (!parsed.success || parsed.data.mode !== "courier" || !["inbound", "outbound"].includes(direction))
    return pending(COURIER_PENDING_REASON);
  const checkedParcel = parcelInput.safeParse(parcel);
  if (!checkedParcel.success) return pending(COURIER_PARCEL_REASON);
  details.parcel = checkedParcel.data;
  if (parsed.data.courierProvider === "shiprocket" && direction === "inbound" && !checkedParcel.data.declaredValuePaise) return pending(COURIER_DECLARED_VALUE_REASON);
  if (!quote || quote.provider !== parsed.data.courierProvider || quote.currency !== "INR" ||
      quote.originPin !== details.originPin || quote.destinationPin !== details.destinationPin ||
      !sameParcel(checkedParcel.data, quote.parcel) ||
      !Number.isSafeInteger(quote.totalPaise) || quote.totalPaise < 0 || quote.totalPaise > 100000000 ||
      !Number.isSafeInteger(quote.chargeableWeightGrams) || quote.chargeableWeightGrams < checkedParcel.data.weightGrams || quote.chargeableWeightGrams > 1000000 ||
      !sourceText(String(quote.courierId || ""), 120) || !sourceText(quote.courierName, 150) || !sourceText(quote.service, 150))
    return pending(COURIER_PENDING_REASON);
  const current = now instanceof Date ? now.getTime() : Number(now);
  const quotedAt = typeof quote.quotedAt === "string" ? Date.parse(quote.quotedAt) : NaN;
  const validUntil = typeof quote.validUntil === "string" ? Date.parse(quote.validUntil) : NaN;
  if (!Number.isFinite(current) || !Number.isFinite(quotedAt) || !Number.isFinite(validUntil) ||
      quotedAt > current + 30000 || validUntil <= quotedAt) return pending(COURIER_PENDING_REASON);
  if (validUntil <= current) return pending(COURIER_EXPIRED_REASON);
  const minimum = parsed.data[direction]?.minimumChargePaise;
  const minimumAdjustmentPaise = typeof minimum === "number" ? Math.max(0, minimum - quote.totalPaise) : 0;
  return { amountPaise: quote.totalPaise + minimumAdjustmentPaise, details: {
    ...details, currency: "INR", carrierQuotePaise: quote.totalPaise, minimumAdjustmentPaise,
    ...(typeof minimum === "number" ? { minimumChargePaise: minimum } : {}),
    chargeableWeightGrams: quote.chargeableWeightGrams, courierId: String(quote.courierId),
    courierName: quote.courierName, service: quote.service,
    quotedAt: new Date(quotedAt).toISOString(), validUntil: new Date(validUntil).toISOString(),
  } };
}
// Expiry and request IDs are audit metadata. Equal fresh carrier quotes from
// separate instances must produce the same customer estimate fingerprint.
export function transportPriceFingerprint(item) {
  if (item.pricingMode !== "courier") return item;
  const keys = ["code", "scope", "direction", "method", "postalCode", "pricingMode", "provider", "courierId", "service",
    "originPin", "destinationPin", "parcel", "chargeableWeightGrams", "carrierQuotePaise", "minimumChargePaise",
    "minimumAdjustmentPaise", "unitAmountPaise", "amountPaise", "quantity"];
  return Object.fromEntries(keys.filter(key => item[key] !== undefined).map(key => [key, item[key]]));
}
