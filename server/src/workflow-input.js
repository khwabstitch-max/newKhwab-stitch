import { z } from "zod";

const id = z.string().regex(/^[a-f\d]{24}$/i);
export const COMPONENT_KINDS = ["sleeve", "sleeveLength", "neck", "back", "fit"];
export const SLEEVE_LENGTH_STYLES = ["sleeveless", "short", "elbow", "three_quarter", "full", "custom"];
export const OPTION_KINDS = [...COMPONENT_KINDS, "extra"];
export const measurementKeys = [
  "bust",
  "underbust",
  "waist",
  "hip",
  "shoulder",
  "length",
  "sleeveLength",
  "frontNeckDepth",
  "frontNeckWidth",
  "backNeckDepth",
  "backNeckWidth",
  "armhole",
  "sleeveOpening",
];
export const componentInput = z
  .object({
    source: z.enum(["original", "option", "reference", "help"]),
    optionId: id.optional(),
    referenceMediaId: id.optional(),
    notes: z.string().trim().max(1000).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source === "option" && !value.optionId)
      ctx.addIssue({
        code: "custom",
        path: ["optionId"],
        message: "Choose an option.",
      });
    if (value.source === "reference" && !value.referenceMediaId)
      ctx.addIssue({
        code: "custom",
        path: ["referenceMediaId"],
        message: "Choose the reference for this part.",
      });
  });
export const configurationInput = z
  .object({
    source: z.enum(["catalogue", "reference"]),
    mode: z.enum(["exact", "custom"]),
    components: z
      .object(
        Object.fromEntries(
          COMPONENT_KINDS.map((key) => [key, componentInput.optional()]),
        ),
      )
      .strict()
      .default({}),
    addonIds: z.array(id).max(12).default([]),
    addonsChanged: z.boolean().optional(),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source === "reference" && value.mode === "exact")
      ctx.addIssue({
        code: "custom",
        message: "Uploaded references require tailor review.",
      });
    if (new Set(value.addonIds).size !== value.addonIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["addonIds"],
        message: "Duplicate add-ons are not allowed.",
      });
  });
export const addressInput = z
  .object({
    line1: z.string().trim().min(5).max(200),
    line2: z.string().trim().max(200).default(""),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    pin: z.string().regex(/^[1-9]\d{5}$/),
  })
  .strict();
const leg = (methods) =>
  z
    .object({ method: z.enum(methods), address: addressInput.optional() })
    .strict();
export const logisticsInput = z
  .object({
    inbound: leg(["dropoff", "customer_courier", "business"]),
    outbound: leg(["collect", "customer_courier", "business"]),
  })
  .strict();
export const serviceAreaInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    pinPrefixes: z
      .array(z.string().regex(/^[1-9]\d{0,5}$/))
      .min(1)
      .max(30),
    enabled: z.boolean().default(true),
    inboundPaise: z.number().int().min(0).max(10000000).nullable(),
    outboundPaise: z.number().int().min(0).max(10000000).nullable(),
    notes: z.string().trim().max(500).default(""),
  })
  .strict();
export const policiesInput = z
  .object({
    version: z.string().trim().min(1).max(50),
    assurance: z.string().trim().max(2500),
    assuranceHi: z.string().trim().max(2500).optional(),
    alterationMargin: z.string().trim().max(1500),
    alterationMarginHi: z.string().trim().max(1500).optional(),
    correctionTransport: z.string().trim().max(1500),
    correctionTransportHi: z.string().trim().max(1500).optional(),
  })
  .strict();
export const supportSettingsInput = z
  .object({
    timezone: z.literal("Asia/Kolkata").default("Asia/Kolkata"),
    responseHours: z.number().int().min(1).max(72),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  })
  .strict()
  .refine(
    (value) => value.endHour > value.startHour,
    "Support closing time must follow opening time.",
  );
