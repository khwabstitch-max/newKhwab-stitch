import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  responseDeadline,
  ticketInput,
  messageInput,
  ticketTransitions,
} from "../src/support-domain.js";
import { applicationInput } from "../src/routes-workers.js";
import { reviewInput } from "../src/routes-reviews.js";
import { measurementProfileInput } from "../src/routes-account.js";
import { hashRequest } from "../src/extension-utils.js";
import { serviceInput, supportedService } from "../src/routes-services.js";

const schedule = {
  timezone: "Asia/Kolkata",
  responseHours: 6,
  startHour: 10,
  endHour: 18,
  weekdays: [1, 2, 3, 4, 5],
};
const body = {
  clientId: randomUUID(),
  kind: "assistance",
  category: "measurement",
  subject: "Measurement help",
  description: "How do I measure the shoulder?",
  context: { step: "measurements", garment: "kurti" },
};
test("support response deadlines use configured timezone and skip weekends", () => {
  assert.equal(
    responseDeadline(new Date("2026-11-06T10:30:00Z"), schedule).toISOString(),
    "2026-11-09T08:30:00.000Z",
  );
});
test("support does not invent a deadline without configured valid support hours", () => {
  assert.equal(responseDeadline(new Date(), undefined), null);
  assert.equal(
    responseDeadline(new Date(), { ...schedule, timezone: "invalid" }),
    null,
  );
  assert.equal(
    responseDeadline(new Date(), { ...schedule, weekdays: [] }),
    null,
  );
});
test("support deadline begins at next opening when submitted after hours", () => {
  assert.equal(
    responseDeadline(new Date("2026-11-06T15:00:00Z"), schedule).toISOString(),
    "2026-11-09T10:30:00.000Z",
  );
});
test("assistance shares only explicitly authorized non-sensitive context", () => {
  assert.deepEqual(ticketInput.parse(body).context, {});
  assert.deepEqual(
    ticketInput.parse({ ...body, contextShared: true }).context,
    body.context,
  );
  assert.equal(
    ticketInput.safeParse({
      ...body,
      contextShared: true,
      context: { measurements: { bust: 36 } },
    }).success,
    false,
  );
  assert.equal(
    ticketInput.safeParse({
      ...body,
      contextShared: true,
      context: { address: { line1: "private" } },
    }).success,
    false,
  );
});
test("support cannot claim unsupported callback and live chat methods", () => {
  assert.equal(
    ticketInput.safeParse({ ...body, preferredContact: "live_chat" }).success,
    false,
  );
  assert.equal(
    ticketInput.safeParse({ ...body, preferredContact: "callback" }).success,
    false,
  );
});
test("messages reject empty content, duplicate attachments and role fields", () => {
  assert.equal(
    messageInput.safeParse({ clientId: randomUUID(), text: "" }).success,
    false,
  );
  assert.equal(
    messageInput.safeParse({
      clientId: randomUUID(),
      text: "Hello",
      role: "admin",
    }).success,
    false,
  );
  assert.equal(
    messageInput.safeParse({
      clientId: randomUUID(),
      attachmentIds: ["a".repeat(24), "a".repeat(24)],
    }).success,
    false,
  );
});
test("support acknowledgement and resolution have distinct transitions", () => {
  assert.equal(ticketTransitions.open.includes("resolved"), false);
  assert.ok(ticketTransitions.open.includes("acknowledged"));
  assert.ok(ticketTransitions.resolved.includes("open"));
  assert.ok(ticketTransitions.closed.includes("open"));
});
test("reviews reject publication attempts and preserve strict integer ratings", () => {
  const review = {
    orderId: "a".repeat(24),
    rating: 4,
    text: "Customer feedback",
    consent: true,
  };
  assert.equal(
    reviewInput.safeParse({ ...review, status: "published" }).success,
    false,
  );
  assert.equal(
    reviewInput.safeParse({ ...review, rating: 4.5 }).success,
    false,
  );
  assert.equal(reviewInput.safeParse({ ...review, rating: 0 }).success, false);
});
test("measurement profiles accept unusual finite positive values without invented standards", () => {
  const profile = {
    name: "Custom fit",
    garments: ["kurti"],
    unit: "in",
    method: "body",
    values: { bust: 110 },
    notes: "Needs review",
  };
  assert.equal(measurementProfileInput.safeParse(profile).success, true);
  assert.equal(
    measurementProfileInput.safeParse({ ...profile, values: { bust: NaN } })
      .success,
    false,
  );
  assert.equal(
    measurementProfileInput.safeParse({ ...profile, values: { bust: -1 } })
      .success,
    false,
  );
  assert.equal(
    measurementProfileInput.safeParse({ ...profile, owner: "b".repeat(24) })
      .success,
    false,
  );
});
test("worker applications do not allow self-approval or staff permission injection", () => {
  const application = {
    clientId: randomUUID(),
    name: "Test applicant",
    phone: "9876543210",
    city: "Delhi",
    skills: ["stitching"],
    garments: ["kurti"],
    experience: "Five years",
    availability: "Weekdays",
    introduction: "Application for assessment",
    termsVersion: "assessment-consent-v1",
  };
  assert.equal(applicationInput.safeParse(application).success, true);
  assert.equal(
    applicationInput.safeParse({ ...application, status: "approved" }).success,
    false,
  );
  assert.equal(
    applicationInput.safeParse({ ...application, assistancePermission: true })
      .success,
    false,
  );
});
test("retry request hashing is stable across object key order", () => {
  assert.equal(
    hashRequest({ a: 1, nested: { x: 3, y: 4 } }),
    hashRequest({ nested: { y: 4, x: 3 }, a: 1 }),
  );
  assert.notEqual(hashRequest({ a: 1 }), hashRequest({ a: 2 }));
});
test("service activation validates tested adapters, material handling and unique template keys", () => {
  const definition = {
    code: "test",
    name: "Test service",
    serviceType: "knitting",
    audiences: ["unisex"],
    itemTypes: ["scarf"],
    active: false,
    materials: "review",
  };
  assert.equal(serviceInput.safeParse(definition).success, true);
  assert.equal(
    serviceInput.safeParse({ ...definition, active: true }).success,
    false,
  );
  assert.equal(supportedService(definition), false);
  assert.equal(
    serviceInput.safeParse({
      ...definition,
      workflowStages: [
        { key: "review", label: "Review" },
        { key: "review", label: "Duplicate" },
      ],
    }).success,
    false,
  );
});
