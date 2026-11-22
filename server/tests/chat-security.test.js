import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { z } from "zod";
import { generateGuestCredentials } from "../src/chat-models.js";
import { chatGuestAuth, parseCookies } from "../src/routes-chat.js";

test("Customer A cannot access Customer B data via chatGuestAuth", async () => {
  const customerA = generateGuestCredentials();
  const customerB = generateGuestCredentials();

  const mockDb = [
    {
      customerId: customerA.customerId,
      guestTokenHash: customerA.guestTokenHash,
      displayName: "Customer A",
      notes: "Private tailor notes for A - strictly confidential",
    },
    {
      customerId: customerB.customerId,
      guestTokenHash: customerB.guestTokenHash,
      displayName: "Customer B",
      notes: "Private tailor notes for B - VIP client",
    },
  ];

  const mockModels = {
    ChatCustomer: {
      async findOne(query) {
        return (
          mockDb.find((c) => {
            if (query.guestTokenHash && c.guestTokenHash !== query.guestTokenHash) return false;
            if (query.customerId && c.customerId !== query.customerId) return false;
            return true;
          }) || null
        );
      },
    },
  };

  const middleware = chatGuestAuth(mockModels);

  // Attempt 1: Customer A provides their own token and asks for Customer B's customerId
  let error1 = null;
  const req1 = {
    headers: {},
    get: (h) => {
      if (h === "x-guest-token") return customerA.guestToken;
      if (h === "x-customer-id") return customerB.customerId;
      return null;
    },
    query: {},
  };
  const res1 = { set: () => {} };

  await middleware(req1, res1, (err) => {
    error1 = err;
  });

  // Must reject because token does not match customer B
  assert.ok(error1);
  assert.equal(error1.status, 401);
  assert.equal(error1.code, "GUEST_SESSION_EXPIRED");

  // Attempt 2: Customer A uses their own valid credentials
  let error2 = null;
  let nextCalled = false;
  const req2 = {
    headers: {},
    get: (h) => {
      if (h === "x-guest-token") return customerA.guestToken;
      if (h === "x-customer-id") return customerA.customerId;
      return null;
    },
    query: {},
  };

  await middleware(req2, res1, (err) => {
    if (err) error2 = err;
    else nextCalled = true;
  });

  assert.equal(error2, null);
  assert.ok(nextCalled);
  assert.equal(req2.chatCustomer.customerId, customerA.customerId);
  assert.notEqual(req2.chatCustomer.customerId, customerB.customerId);
});

test("parseCookies extracts httpOnly khwab_guest_token and authenticates session", async () => {
  const creds = generateGuestCredentials();
  const mockCustomer = {
    customerId: creds.customerId,
    displayName: "Cookie Customer",
    guestTokenHash: creds.guestTokenHash,
  };

  const mockModels = {
    ChatCustomer: {
      async findOne(query) {
        if (query.guestTokenHash === creds.guestTokenHash) return mockCustomer;
        return null;
      },
    },
  };

  const cookieHeader = `sessionId=xyz; khwab_guest_token=${creds.guestToken}; theme=light`;
  const cookies = parseCookies({ headers: { cookie: cookieHeader } });
  assert.equal(cookies.khwab_guest_token, creds.guestToken);

  const middleware = chatGuestAuth(mockModels);
  const req = {
    headers: { cookie: cookieHeader },
    get: () => null,
    query: {},
  };
  const res = { set: () => {} };

  let nextCalled = false;
  await middleware(req, res, (err) => {
    if (!err) nextCalled = true;
  });

  assert.ok(nextCalled);
  assert.equal(req.chatCustomer.customerId, creds.customerId);
});

test("Transcript generation strictly excludes private admin notes", () => {
  const customer = {
    customerId: "cust_12345678",
    displayName: "Ananya",
    notes: "PRIVATE NOTE: DO NOT EXPOSE. Customer requested high discount.",
  };

  const messages = [
    {
      senderType: "customer",
      senderName: "Ananya",
      content: "Hello! Can you tailor a velvet kurti?",
      createdAt: new Date("2026-11-22T10:00:00Z"),
    },
    {
      senderType: "admin",
      senderName: "KhwabStitch Atelier",
      content: "Yes, we have royal velvet in emerald and navy.",
      createdAt: new Date("2026-11-22T10:05:00Z"),
    },
  ];

  let transcript = `============================================================\n`;
  transcript += `KHWABSTITCH ATELIER - CONVERSATION TRANSCRIPT\n`;
  transcript += `Customer: ${customer.displayName} (${customer.customerId})\n`;
  transcript += `============================================================\n\n`;

  for (const msg of messages) {
    const time = new Date(msg.createdAt).toISOString().replace("T", " ").replace(/\..+/, " UTC");
    const sender = msg.senderType === "customer" ? customer.displayName : msg.senderName;
    transcript += `[${time}] ${sender}:\n  ${msg.content}\n\n`;
  }

  // Verify content
  assert.ok(transcript.includes("Hello! Can you tailor a velvet kurti?"));
  assert.ok(transcript.includes("royal velvet in emerald and navy"));

  // Verify private notes are strictly absent
  assert.ok(!transcript.includes("PRIVATE NOTE"));
  assert.ok(!transcript.includes("high discount"));
  assert.ok(!transcript.includes("DO NOT EXPOSE"));
});

test("Configurable quick replies schema enforces limits and array bounds", () => {
  const quickRepliesSchema = z.object({
    quickReplies: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  });

  // 1. Valid replies pass
  const valid = quickRepliesSchema.safeParse({
    quickReplies: [
      "Hello! How can we help?",
      "Please share your preferred fabric and neck design.",
    ],
  });
  assert.ok(valid.success);

  // 2. Empty array fails
  const empty = quickRepliesSchema.safeParse({ quickReplies: [] });
  assert.ok(!empty.success);

  // 3. Excess entries (>20) fails
  const excess = quickRepliesSchema.safeParse({
    quickReplies: Array.from({ length: 25 }, (_, i) => `Phrase ${i}`),
  });
  assert.ok(!excess.success);

  // 4. Overlong single phrase (>300 chars) fails
  const overlong = quickRepliesSchema.safeParse({
    quickReplies: ["A".repeat(350)],
  });
  assert.ok(!overlong.success);
});

test("Sharp image processor enforces pixel limits and webp normalization", async () => {
  // Generate a valid 100x100 PNG test buffer
  const validPng = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 20, g: 93, b: 88, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const input = sharp(validPng, {
    limitInputPixels: 24_000_000,
    failOn: "warning",
  });
  const meta = await input.metadata();

  assert.ok(["jpeg", "png", "webp"].includes(meta.format));

  const processed = await input
    .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  assert.equal(processed.info.format, "webp");
  assert.ok(processed.data.length > 0);
  assert.ok(processed.info.width <= 100);
});
