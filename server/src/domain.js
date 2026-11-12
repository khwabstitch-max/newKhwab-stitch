import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { homepageInput } from "./homepage-input.js";
import { fail } from "./errors.js";
import {
  configurationInput,
  logisticsInput,
  measurementKeys,
  serviceAreaInput,
  policiesInput,
  supportSettingsInput,
  OPTION_KINDS,
  SLEEVE_LENGTH_STYLES,
} from "./workflow-input.js";
export const businessDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const GARMENTS = ["kurti", "suit", "blouse", "alteration"];
export const STATUSES = [
  "request_received",
  "under_review",
  "quote_sent",
  "customer_accepted",
  "fabric_received",
  "stitching",
  "ready",
  "dispatched",
  "delivered",
  "cancelled",
  "rejected",
];
export const ADMIN_TRANSITIONS = {
  request_received: ["under_review", "cancelled", "rejected"],
  under_review: ["cancelled", "rejected"],
  quote_sent: ["under_review", "cancelled", "rejected"],
  customer_accepted: ["fabric_received", "cancelled"],
  fabric_received: ["stitching"],
  stitching: ["ready"],
  ready: ["dispatched"],
  dispatched: ["delivered"],
  delivered: [],
  cancelled: [],
  rejected: [],
};
export const MEASUREMENT_FIELDS = {
  kurti: ["bust", "waist", "hip", "shoulder", "length", "sleeveLength"],
  suit: ["bust", "waist", "hip", "shoulder", "length", "sleeveLength"],
  blouse: ["bust", "underbust", "waist", "shoulder", "length", "sleeveLength"],
  alteration: ["bust", "waist", "hip", "shoulder", "length", "sleeveLength"],
};
export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid resource ID.");
const short = z.string().trim().max(120);
export const revisionSchema = z.number().int().nonnegative();
const dateOnly = z.iso.date().refine((s) => {
  const d = new Date(s);
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === s;
}, "Use a valid YYYY-MM-DD date.");
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()+-]/g, ""))
  .refine(
    (v) => /^(?:91)?[6-9]\d{9}$/.test(v),
    "Enter a valid Indian mobile number.",
  )
  .transform((v) => (v.length === 10 ? "91" + v : v));
export const orderInput = z
  .object({
    garment: z.enum(GARMENTS),
    quantity: z.number().int().min(1).max(10),
    designId: objectId.optional(),
    configuration: configurationInput.optional(),
    logistics: logisticsInput.optional(),
    draftId: objectId.optional(),
    draftRevision: revisionSchema.optional(),
    estimateVersion: z
      .string()
      .regex(/^[a-f\d]{64}$/)
      .optional(),
    policyVersion: z.string().trim().max(50).optional(),
    preferences: z
      .object({
        neck: short.default(""),
        sleeve: short.default(""),
        back: short.default(""),
        fit: short.default(""),
        length: short.default(""),
        extraWork: z.string().trim().max(1000).default(""),
      })
      .strict(),
    measurements: z
      .object({
        unit: z.enum(["in", "cm"]),
        method: z.enum(["body", "garment", "assistance"]),
        takenBy: z.enum(["self", "tailor", "assistance"]).optional(),
        guideIds: z.array(objectId).max(5).optional(),
        values: z.record(z.string(), z.number().finite()).default({}),
        notes: z.string().trim().max(1000).default(""),
        reconfirmFields: z.array(z.enum(measurementKeys)).max(measurementKeys.length).optional(),
      })
      .strict(),
    referenceMediaIds: z.array(objectId).max(5).default([]),
    customer: z
      .object({ name: z.string().trim().min(2).max(100), phone: phoneSchema })
      .strict(),
    address: z
      .object({
        line1: z.string().trim().min(5).max(200),
        line2: z.string().trim().max(200).default(""),
        city: z.string().trim().min(2).max(100),
        state: z.string().trim().min(2).max(100),
        pin: z.string().regex(/^[1-9]\d{5}$/, "Enter a six-digit PIN."),
      })
      .strict()
      .optional(),
    preferredDate: dateOnly.optional(),
    notes: z.string().trim().max(2000).default(""),
    fabricDetails: z.string().trim().max(1000).optional(),
    fabricAcknowledged: z.literal(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.configuration && !v.address)
      ctx.addIssue({
        code: "custom",
        path: ["address"],
        message: "An address is required for this request.",
      });
    const f = v.configuration
      ? [...new Set([...MEASUREMENT_FIELDS[v.garment], ...measurementKeys])]
      : MEASUREMENT_FIELDS[v.garment];
    for (const [key, value] of Object.entries(v.measurements.values)) {
      if (!f.includes(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["measurements", "values", key],
          message: "This field is not applicable to the garment.",
        });
        continue;
      }
      const inches = v.measurements.unit === "cm" ? value / 2.54 : value;
      const min =
        key === "sleeveLength"
          ? 0.25
          : key === "shoulder"
            ? 4
            : key === "length"
              ? 4
              : 10;
      const max =
        key === "sleeveLength"
          ? 40
          : key === "shoulder"
            ? 32
            : key === "length"
              ? 80
              : 100;
      if (
        v.configuration
          ? inches <= 0 || inches > 1000
          : inches < min || inches > max
      )
        ctx.addIssue({
          code: "custom",
          path: ["measurements", "values", key],
          message: `Enter between ${v.measurements.unit === "cm" ? (min * 2.54).toFixed(1) : min} and ${v.measurements.unit === "cm" ? (max * 2.54).toFixed(1) : max} ${v.measurements.unit}.`,
        });
    }
    if (v.measurements.method !== "assistance" && v.measurements.takenBy !== "assistance" && v.garment !== "alteration")
      for (const key of MEASUREMENT_FIELDS[v.garment].filter(
        (k) => k !== "sleeveLength",
      ))
        if (v.measurements.values[key] === undefined)
          ctx.addIssue({
            code: "custom",
            path: ["measurements", "values", key],
            message: "Measurement is required, or choose assistance.",
          });
    if (v.garment === "alteration" && !v.measurements.notes.trim())
      ctx.addIssue({
        code: "custom",
        path: ["measurements", "notes"],
        message: "Describe the alteration needed.",
      });
    if (new Set(v.referenceMediaIds).size !== v.referenceMediaIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["referenceMediaIds"],
        message: "Duplicate images are not allowed.",
      });
    if (v.configuration?.source === "catalogue" && !v.designId)
      ctx.addIssue({
        code: "custom",
        path: ["designId"],
        message: "Choose the catalogue design.",
      });
    if (v.configuration?.source === "reference" && !v.referenceMediaIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["referenceMediaIds"],
        message: "Upload a reference, or choose a catalogue design.",
      });
    for (const [kind, component] of Object.entries(
      v.configuration?.components || {},
    )) {
      if (
        component.source === "reference" &&
        v.configuration?.mode !== "exact" &&
        !(kind === "sleeve" && v.configuration?.components?.sleeveLength?.optionId) &&
        !v.referenceMediaIds.includes(component.referenceMediaId)
      )
        ctx.addIssue({
          code: "custom",
          path: ["configuration", "components", kind],
          message: "This component must use one of your attached references.",
        });
    }
    if (
      v.measurements.method !== "assistance" && v.measurements.takenBy !== "assistance" &&
      v.measurements.reconfirmFields?.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["measurements"],
        message:
          "Reconfirm measurements affected by your design changes, or request assistance.",
      });
    for (const direction of ["inbound", "outbound"])
      if (
        v.logistics?.[direction].method === "business" &&
        !v.logistics[direction].address
      )
        ctx.addIssue({
          code: "custom",
          path: ["logistics", direction, "address"],
          message: "Enter the address for arranged transport.",
        });
  });
const cropInput = z
  .object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    width: z.number().min(5).max(100),
    height: z.number().min(5).max(100),
  })
  .strict()
  .superRefine((crop, ctx) => {
    if (crop.x + crop.width > 100.00001 || crop.y + crop.height > 100.00001)
      ctx.addIssue({
        code: "custom",
        message: "Keep the preview crop inside the image.",
      });
  });
export const designDetailsInput = z
  .object(
    Object.fromEntries(
      [
        "neck",
        "neckHi",
        "sleeve",
        "sleeveHi",
        "back",
        "backHi",
        "style",
        "styleHi",
        "fabric",
        "fabricHi",
        "fabricRequirement",
        "fabricRequirementHi",
        "turnaround",
        "turnaroundHi",
      ].map((key) => [key, z.string().trim().max(300).optional()]),
    ),
  )
  .strict();
export const designInput = z
  .object({
    title: z.string().trim().min(2).max(120),
    titleHi: z.string().trim().max(120).optional(),
    descriptionHi: z.string().trim().max(4000).optional(),
    searchLabels: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    searchLabelsHi: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{2,30}$/),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    garment: z.enum(GARMENTS),
    description: z.string().trim().min(10).max(4000),
    designDetails: designDetailsInput.optional(),
    defaultComponents: z
      .object({
        sleeve: objectId.optional(),
        sleeveLength: objectId.optional(),
        neck: objectId.optional(),
        back: objectId.optional(),
        fit: objectId.optional(),
      })
      .strict()
      .optional(),
    includedAddonIds: z.array(objectId).max(12).optional(),
    serviceNotes: z.string().trim().max(1500).optional(),
    serviceNotesHi: z.string().trim().max(1500).optional(),
    priceOptions: z
      .array(
        z
          .object({
            label: z.string().trim().min(2).max(100),
            labelHi: z.string().trim().max(100).optional(),
            amountPaise: z.number().int().min(0).max(100000000),
            isStartingPrice: z.boolean().default(false),
          })
          .strict(),
      )
      .max(6)
      .optional(),
    imageViews: z
      .array(
        z
          .object({
            mediaId: objectId,
            label: z.string().trim().min(2).max(80),
            labelHi: z.string().trim().max(80).optional(),
            crop: cropInput.nullable().optional(),
          })
          .strict(),
      )
      .max(16)
      .optional(),
    category: objectId.nullable().optional().default(null),
    startingPricePaise: z.number().int().min(0).max(100000000),
    mediaIds: z.array(objectId).max(8).default([]),
    coverMediaId: objectId.nullable().optional().default(null),
    status: z.enum(["draft", "published", "archived"]).default("draft"),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.includedAddonIds || []).size !== (v.includedAddonIds || []).length)
      ctx.addIssue({ code: "custom", path: ["includedAddonIds"], message: "Duplicate included additions are not allowed." });
    if (new Set(v.mediaIds).size !== v.mediaIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["mediaIds"],
        message: "Duplicate images are not allowed.",
      });
    for (const [index, view] of (v.imageViews || []).entries())
      if (!v.mediaIds.includes(view.mediaId))
        ctx.addIssue({
          code: "custom",
          path: ["imageViews", index, "mediaId"],
          message: "Preview images must be attached to this design.",
        });
    if (
      v.priceOptions?.length &&
      v.startingPricePaise !==
        Math.min(...v.priceOptions.map((price) => price.amountPaise))
    )
      ctx.addIssue({
        code: "custom",
        path: ["startingPricePaise"],
        message: "Starting price must match the lowest stitching option.",
      });
    if (v.coverMediaId && !v.mediaIds.includes(v.coverMediaId))
      ctx.addIssue({
        code: "custom",
        path: ["coverMediaId"],
        message: "Cover must be one of the design images.",
      });
  });
export const categoryInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    nameHi: z.string().trim().max(80).optional(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    active: z.boolean().default(true),
  })
  .strict();
export const sourceCropsInput = z.array(z.object({ sourceFilename: z.string().max(250), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), crop: z.object({ left: z.number().int().min(0), top: z.number().int().min(0), width: z.number().int().positive(), height: z.number().int().positive() }).strict(), notes: z.string().max(1000).optional() }).strict()).max(20).optional();
export const optionInput = z
  .object({
    code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{1,49}$/).optional(),
    name: z.string().trim().min(2).max(80),
    nameHi: z.string().trim().max(80).optional(),
    kind: z.enum(OPTION_KINDS),
    garments: z.array(z.enum(GARMENTS)).max(4),
    description: z.string().trim().max(1000).optional(),
    descriptionHi: z.string().trim().max(1000).optional(),
    imageMediaId: objectId.nullable().optional(),
    imageMediaIds: z.array(objectId).max(8).optional(),
    importKey: z.string().trim().min(8).max(180).optional(),
    sourceCrops: sourceCropsInput,
    imageAlt: z.string().trim().max(250).optional(),
    imageAltHi: z.string().trim().max(250).optional(),
    displayOrder: z.number().int().min(-10000).max(10000).optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    lengthStyle: z.enum(SLEEVE_LENGTH_STYLES).optional(),
    compatibleLengthStyles: z.array(z.enum(SLEEVE_LENGTH_STYLES)).max(SLEEVE_LENGTH_STYLES.length).optional(),
    incompatibleOptionIds: z.array(objectId).max(100).optional(),
    sleevePricingMode: z.enum(["separate", "combined"]).optional(),
    combinedLengthPrices: z.array(z.object({ lengthStyle: z.enum(SLEEVE_LENGTH_STYLES), amountPaise: z.number().int().min(0).max(100000000) }).strict()).max(SLEEVE_LENGTH_STYLES.length).optional(),
    materialCoverage: z.enum(["labor_only", "labor_and_materials", "review"]).optional(),
    materialNotes: z.string().trim().max(1000).optional(),
    serviceType: z.enum(["stitching", "embroidery", "painting", "knitting", "other"]).optional(),
    priceMode: z
      .enum(["included", "additional", "replacement", "pending"])
      .optional(),
    amountPaise: z.number().int().min(0).max(100000000).optional(),
    replacementAdjustmentPaise: z
      .number()
      .int()
      .min(0)
      .max(100000000)
      .optional(),
    measurementFields: z.array(z.enum(measurementKeys)).max(measurementKeys.length).optional(),
    sleeveStyle: z
      .enum(["sleeveless", "short", "elbow", "three_quarter", "full", "other"])
      .optional(),
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((option, ctx) => {
    if (option.status !== "draft" && option.status !== "archived" && option.active && !option.garments.length)
      ctx.addIssue({ code: "custom", path: ["garments"], message: "Configure applicable garments before publication." });
    if (option.kind === "sleeveLength" && !option.lengthStyle)
      ctx.addIssue({ code: "custom", path: ["lengthStyle"], message: "Choose the sleeve length preference." });
    for (const field of ["compatibleLengthStyles", "incompatibleOptionIds"])
      if (new Set(option[field] || []).size !== (option[field] || []).length)
        ctx.addIssue({ code: "custom", path: [field], message: "Duplicate compatibility values are not allowed." });
    if (new Set((option.combinedLengthPrices || []).map((rule) => rule.lengthStyle)).size !== (option.combinedLengthPrices || []).length)
      ctx.addIssue({ code: "custom", path: ["combinedLengthPrices"], message: "Configure one combined price for each length." });
    if (option.kind !== "sleeve" && (option.compatibleLengthStyles?.length || option.combinedLengthPrices?.length || option.sleevePricingMode === "combined"))
      ctx.addIssue({ code: "custom", path: ["kind"], message: "Sleeve compatibility and combined prices belong to sleeve designs." });
    if (option.kind === "extra" && option.active && !["draft", "archived"].includes(option.status) && (option.serviceType || "stitching") !== "stitching")
      ctx.addIssue({ code: "custom", path: ["serviceType"], message: "Future craft services cannot be published as active finishing additions." });
    if (option.kind === "extra" && option.active && !["draft", "archived"].includes(option.status) && option.materialCoverage === "labor_and_materials" && !option.materialNotes?.trim())
      ctx.addIssue({ code: "custom", path: ["materialNotes"], message: "Name the materials explicitly included in this addition's price." });
  }).transform((option) => option.kind === "sleeveLength" ? { ...option, priceMode: "included", amountPaise: 0, replacementAdjustmentPaise: 0 } : option);
export const profileInput = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    phone: phoneSchema.optional(),
  })
  .strict();
export const settingsInput = z
  .object({
    businessName: z.string().trim().min(2).max(100),
    homepage: homepageInput.optional(),
    serviceAreas: z.array(serviceAreaInput).max(100).optional(),
    garmentBasePrices: z
      .object(
        Object.fromEntries(
          GARMENTS.map((key) => [
            key,
            z.number().int().min(0).max(100000000).optional(),
          ]),
        ),
      )
      .strict()
      .optional(),
    policies: policiesInput.optional(),
    support: supportSettingsInput.optional(),
    welcome: z
      .object({
        title: z.string().trim().max(150),
        tagline: z.string().trim().max(200),
        description: z.string().trim().max(1500),
      })
      .strict()
      .optional(),
    features: z
      .object({
        workerApplications: z.boolean().optional(),
        reviews: z.boolean().optional(),
        customerWorkerMessaging: z.literal(false).optional(),
      })
      .strict()
      .optional(),
    facebook: z
      .union([
        z.literal(""),
        z.url().refine((value) => {
          const u = new URL(value);
          return (
            u.protocol === "https:" &&
            ["facebook.com", "www.facebook.com"].includes(u.hostname)
          );
        }, "Use an HTTPS Facebook profile URL."),
      ])
      .optional(),
    tagline: z.string().trim().max(180),
    taglineHi: z.string().trim().max(180).optional(),
    announcementHi: z.string().trim().max(300).optional(),
    aboutHi: z.string().trim().max(3000).optional(),
    whatsapp: z.union([z.literal(""), phoneSchema]),
    instagram: z.union([
      z.literal(""),
      z
        .string()
        .url()
        .refine((v) => {
          const u = new URL(v);
          return (
            u.protocol === "https:" &&
            ["instagram.com", "www.instagram.com"].includes(u.hostname)
          );
        }, "Use an HTTPS Instagram profile URL."),
    ]),
    contactEmail: z.union([z.email(), z.literal("")]),
    announcement: z.string().trim().max(300),
    about: z.string().trim().max(3000),
    faqs: z
      .array(
        z
          .object({
            question: z.string().trim().min(3).max(200),
            questionHi: z.string().trim().max(200).optional(),
            answerHi: z.string().trim().max(2000).optional(),
            answer: z.string().trim().min(3).max(2000),
          })
          .strict(),
      )
      .max(20),
    bannerMediaId: objectId.nullable().optional().default(null),
  })
  .strict();
export const quoteInput = z
  .object({
    revision: revisionSchema,
    notesHi: z.string().trim().max(2000).optional(),
    amountPaise: z.number().int().min(100).max(100000000),
    lineItems: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(180),
            amountPaise: z.number().int().min(0).max(100000000),
            scope: z.enum(["garment", "shipment", "order"]),
            quantity: z.number().int().min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(30)
      .optional(),
    deliveryDate: dateOnly.refine(
      (v) => v >= businessDate(),
      "Delivery date cannot be in the past.",
    ),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.lineItems &&
      value.lineItems.reduce((sum, item) => sum + item.amountPaise, 0) !==
        value.amountPaise
    )
      ctx.addIssue({
        code: "custom",
        path: ["lineItems"],
        message: "Quote line totals must add up to the final quote amount.",
      });
    if (
      value.lineItems?.some(
        (item) => item.scope !== "garment" && item.quantity !== 1,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["lineItems"],
        message: "Shipment and order charges must have quantity one.",
      });
  });
export const statusInput = z
  .object({
    revision: revisionSchema,
    status: z.enum(STATUSES),
    note: z.string().trim().max(1000).default(""),
    noteHi: z.string().trim().max(1000).optional(),
  })
  .strict();
export const quoteResponseInput = z
  .object({
    revision: revisionSchema,
    quoteVersion: z.number().int().positive(),
    decision: z.enum(["accept", "reject"]),
  })
  .strict();
export const cancelInput = z.object({ revision: revisionSchema }).strict();
export const paginationInput = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
export const defaultSettings = {
  key: "main",
  businessName: "Khwab Stitch",
  tagline: "Where fabric becomes art.",
  taglineHi: "जहाँ कपड़ा बने कला।",
  announcementHi: "आपके लिए, आपके पसंदीदा कपड़े से।",
  aboutHi:
    "घर से चलने वाला हमारा स्टूडियो आपकी पसंद के अनुसार सिलाई और अल्टरेशन करता है। आपका कपड़ा, आपकी फिटिंग, आपकी कहानी।",
  whatsapp: "919368136683",
  instagram: "https://instagram.com/khwabstitch",
  contactEmail: "",
  announcement: "Made for you. With fabric you love.",
  about:
    "A home-based atelier for thoughtful custom stitching and alterations. Your fabric, your fit, your story.",
  faqs: [
    {
      question: "Do you provide fabric?",
      answer:
        "Please provide your own fabric. We help you turn it into a garment made for you.",
    },
    {
      question: "Is my request a confirmed order?",
      answer:
        "No. We review your design, measurements and fabric before sending a final quote and delivery date.",
    },
  ],
  bannerMediaId: null,
  revision: 0,
};
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export const requestHash = (body) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(body)))
    .digest("hex");
export const orderNumber = () =>
  "KS-" +
  new Date().getUTCFullYear() +
  "-" +
  randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
export function checkTransition(current, next) {
  if (!ADMIN_TRANSITIONS[current]?.includes(next))
    fail(
      409,
      "INVALID_TRANSITION",
      "This status change is not allowed. Review the current order first.",
    );
}
