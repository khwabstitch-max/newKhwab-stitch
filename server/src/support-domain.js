import { z } from "zod";
import { objectId, revisionSchema, GARMENTS } from "./domain.js";
import { fail } from "./errors.js";
import { hashRequest } from "./extension-utils.js";

export const retryId = z.string().uuid();
export const attachments = z
  .array(objectId)
  .max(5)
  .default([])
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Duplicate images are not allowed.",
  );
export const ticketStatuses = [
  "open",
  "acknowledged",
  "under_review",
  "awaiting_customer",
  "correction_proposed",
  "in_progress",
  "resolved",
  "closed",
];
export const ticketTransitions = {
  open: ["acknowledged", "under_review", "awaiting_customer"],
  acknowledged: ["under_review", "awaiting_customer"],
  under_review: [
    "awaiting_customer",
    "correction_proposed",
    "in_progress",
    "resolved",
  ],
  awaiting_customer: [
    "under_review",
    "correction_proposed",
    "in_progress",
    "resolved",
  ],
  correction_proposed: [
    "awaiting_customer",
    "under_review",
    "in_progress",
    "resolved",
  ],
  in_progress: ["awaiting_customer", "under_review", "resolved"],
  resolved: ["open", "closed"],
  closed: ["open"],
};
export const ticketInput = z
  .object({
    clientId: retryId,
    kind: z.enum(["assistance", "complaint"]),
    category: z.enum([
      "design",
      "measurement",
      "fabric",
      "transport",
      "pricing",
      "stitching",
      "other",
    ]),
    subject: z.string().trim().min(3).max(160),
    description: z.string().trim().min(5).max(4000),
    orderId: objectId.optional(),
    draftId: z.union([objectId, z.string().uuid()]).optional(),
    contextShared: z.boolean().default(false),
    context: z
      .object({
        step: z.string().trim().max(50).optional(),
        component: z.string().trim().max(50).optional(),
        designId: objectId.optional(),
        garment: z.enum(GARMENTS).optional(),
      })
      .strict()
      .default({}),
    preferredContact: z.literal("in_app").default("in_app"),
    callbackAvailability: z.string().trim().max(300).default(""),
    attachmentIds: attachments,
  })
  .strict()
  .transform((value) => ({
    ...value,
    context: value.contextShared ? value.context : {},
  }));
export const messageInput = z
  .object({
    clientId: retryId,
    text: z.string().trim().max(4000).default(""),
    attachmentIds: attachments,
  })
  .strict()
  .refine(
    (v) => v.text.length || v.attachmentIds.length,
    "Write a message or attach an image.",
  );
export const ticketStatusInput = z
  .object({
    revision: revisionSchema,
    status: z.enum(ticketStatuses),
    note: z.string().trim().max(2000).default(""),
  })
  .strict();
export function assertRetry(existing, body) {
  if (existing.requestHash !== hashRequest(body))
    fail(
      409,
      "IDEMPOTENCY_CONFLICT",
      "This retry key was used for different content.",
    );
  return existing;
}

// Add elapsed business minutes while evaluating the configured calendar in its own
// timezone. UTC stepping naturally handles offsets and daylight-saving changes.
export function responseDeadline(now, support) {
  if (!support) return null;
  const { timezone, responseHours, startHour, endHour, weekdays } = support;
  if (!(
    responseHours > 0 &&
    responseHours <= 168 &&
    startHour >= 0 &&
    endHour <= 24 &&
    startHour < endHour &&
    weekdays?.length
  ))
    return null;
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return null;
  }
  const days = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  let remaining = Math.ceil(responseHours * 60);
  let cursor = Math.ceil(new Date(now).getTime() / 60000) * 60000;
  const limit = cursor + 366 * 24 * 60 * 60000;
  while (remaining && cursor < limit) {
    const parts = Object.fromEntries(
      formatter.formatToParts(cursor).map((p) => [p.type, p.value]),
    );
    const hour = Number(parts.hour) + Number(parts.minute) / 60;
    if (
      weekdays.includes(days[parts.weekday]) &&
      hour >= startHour &&
      hour < endHour
    )
      remaining--;
    cursor += 60000;
  }
  return remaining ? null : new Date(cursor);
}
