import { z } from "zod";
import { GARMENTS, objectId, revisionSchema } from "./domain.js";

const paise = z.number().int().min(0).max(100000000);
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,39}$/);
export const commerceSelectionInput = z.object({
  offerCode: code.or(z.literal("")).default(""),
  creditPaise: paise.default(0),
}).strict();
export const quoteBenefitsInput = commerceSelectionInput.extend({
  orderId: objectId, revision: revisionSchema, quoteVersion: z.number().int().positive(),
}).strict();
export const commerceSettingsInput = z.object({
  enabled: z.boolean(), offersEnabled: z.boolean(), creditsEnabled: z.boolean(),
  referralsEnabled: z.boolean(), loyaltyEnabled: z.boolean(),
  maxCreditBps: z.number().int().min(0).max(10000),
  referralRewardPaise: paise, referredRewardPaise: paise, qualifyingStitchingPaise: paise,
  milestones: z.array(z.object({ code, orders: z.number().int().min(1).max(10000), rewardPaise: paise.refine(value => value > 0) }).strict()).max(20),
  terms: z.string().trim().max(2500).default(""), termsHi: z.string().trim().max(2500).default(""),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.milestones.map(item => item.code)).size !== value.milestones.length) ctx.addIssue({ code: "custom", path: ["milestones"], message: "Each milestone needs a unique stable code." });
  if (value.enabled && value.creditsEnabled && !value.maxCreditBps) ctx.addIssue({ code: "custom", path: ["maxCreditBps"], message: "Configure a positive redemption limit before enabling credits." });
  if (value.enabled && (value.offersEnabled || value.creditsEnabled || value.referralsEnabled || value.loyaltyEnabled) && !value.terms) ctx.addIssue({ code: "custom", path: ["terms"], message: "Publish the programme terms before enabling benefits." });
});
export const commerceOfferInput = z.object({
  code, name: z.string().trim().min(2).max(120), nameHi: z.string().trim().max(120).default(""),
  description: z.string().trim().max(1000).default(""), descriptionHi: z.string().trim().max(1000).default(""),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  type: z.enum(["fixed", "percentage"]), value: z.number().int().min(1).max(100000000),
  maxDiscountPaise: paise.refine(value => value > 0).nullable().default(null),
  minimumStitchingPaise: paise.default(0), garments: z.array(z.enum(GARMENTS)).min(1).max(4),
  startsAt: z.iso.datetime().nullable().default(null), endsAt: z.iso.datetime().nullable().default(null),
  totalUseLimit: z.number().int().min(1).max(10000000).nullable().default(null),
  perCustomerLimit: z.number().int().min(1).max(10000).default(1), displayOrder: z.number().int().min(-10000).max(10000).default(0),
}).strict().superRefine((value, ctx) => {
  if (value.type === "percentage" && value.value > 10000) ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage discounts use basis points from 1 to 10000." });
  if (value.startsAt && value.endsAt && value.startsAt >= value.endsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must follow the start." });
});
export const creditAdjustmentInput = z.object({
  owner: objectId, clientId: z.uuid(), deltaPaise: z.number().int().min(-100000000).max(100000000).refine(value => value !== 0),
  reason: z.string().trim().min(5).max(300),
}).strict();
export const commerceDefaults = Object.freeze({
  enabled: false, offersEnabled: false, creditsEnabled: false, referralsEnabled: false, loyaltyEnabled: false,
  maxCreditBps: 0, referralRewardPaise: 0, referredRewardPaise: 0, qualifyingStitchingPaise: 0,
  milestones: [], terms: "", termsHi: "", revision: 0,
});
