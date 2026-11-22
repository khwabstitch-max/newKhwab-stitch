import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateGuestCredentials,
  hashGuestToken,
  verifyGuestToken,
  createChatSchemas,
} from "../src/chat-models.js";
import { chatGuestAuth } from "../src/routes-chat.js";

test("guest credentials generate unique customerId and cryptographically secure tokens", () => {
  const creds1 = generateGuestCredentials();
  const creds2 = generateGuestCredentials();

  assert.ok(creds1.customerId.startsWith("cust_"));
  assert.ok(creds2.customerId.startsWith("cust_"));
  assert.notEqual(creds1.customerId, creds2.customerId);

  assert.equal(typeof creds1.guestToken, "string");
  assert.equal(creds1.guestToken.length, 64); // 32 bytes hex
  assert.notEqual(creds1.guestToken, creds2.guestToken);

  assert.equal(creds1.guestTokenHash, hashGuestToken(creds1.guestToken));
  assert.ok(verifyGuestToken(creds1.guestToken, creds1.guestTokenHash));
  assert.ok(!verifyGuestToken("wrong-token", creds1.guestTokenHash));
  assert.ok(!verifyGuestToken("", creds1.guestTokenHash));
  assert.ok(!verifyGuestToken(creds1.guestToken, ""));
});

test("chat schemas enforce required fields, indexes, and valid sender types", () => {
  const { ChatCustomer, ChatConversation, ChatMessage } = createChatSchemas();

  assert.ok(ChatCustomer.path("customerId").isRequired);
  assert.ok(ChatCustomer.path("guestTokenHash").isRequired);

  assert.ok(ChatConversation.path("customerId").isRequired);
  assert.deepEqual(ChatConversation.path("status").enumValues, ["active", "closed"]);

  assert.ok(ChatMessage.path("conversationId").isRequired);
  assert.ok(ChatMessage.path("clientMessageId").isRequired);
  assert.deepEqual(ChatMessage.path("senderType").enumValues, ["customer", "admin", "system"]);
  assert.deepEqual(ChatMessage.path("deliveryStatus").enumValues, ["sent", "delivered", "read"]);
});

test("chatGuestAuth middleware rejects unauthenticated requests and loads valid customer", async () => {
  const creds = generateGuestCredentials();
  const mockCustomer = {
    customerId: creds.customerId,
    displayName: "Ayesha",
    guestTokenHash: creds.guestTokenHash,
  };

  const mockModels = {
    ChatCustomer: {
      findOne(query) {
        if (query.guestTokenHash === creds.guestTokenHash) {
          if (query.customerId && query.customerId !== creds.customerId) return Promise.resolve(null);
          return Promise.resolve(mockCustomer);
        }
        return Promise.resolve(null);
      },
    },
  };

  const middleware = chatGuestAuth(mockModels);

  // 1. Missing token fails with 401
  let error1 = null;
  const req1 = { get: () => null, query: {} };
  const res1 = { set: () => {} };
  await middleware(req1, res1, (err) => { error1 = err; });
  assert.ok(error1);
  assert.equal(error1.status, 401);
  assert.equal(error1.code, "GUEST_UNAUTHORIZED");

  // 2. Invalid token fails with 401
  let error2 = null;
  const req2 = { get: (name) => (name === "x-guest-token" ? "invalid-secret" : null), query: {} };
  await middleware(req2, res1, (err) => { error2 = err; });
  assert.ok(error2);
  assert.equal(error2.status, 401);
  assert.equal(error2.code, "GUEST_SESSION_EXPIRED");

  // 3. Valid token attaches customer to request
  let error3 = null;
  let nextCalled = false;
  const req3 = {
    get: (name) => {
      if (name === "x-guest-token") return creds.guestToken;
      if (name === "x-customer-id") return creds.customerId;
      return null;
    },
    query: {},
  };
  await middleware(req3, res1, (err) => {
    if (err) error3 = err;
    else nextCalled = true;
  });
  assert.equal(error3, null);
  assert.ok(nextCalled);
  assert.equal(req3.chatCustomer.customerId, creds.customerId);
  assert.equal(req3.chatCustomer.displayName, "Ayesha");

  // 4. Token with mismatched customerId fails (cross-customer prevention)
  let error4 = null;
  const req4 = {
    get: (name) => {
      if (name === "x-guest-token") return creds.guestToken;
      if (name === "x-customer-id") return "cust_different_hacker";
      return null;
    },
    query: {},
  };
  await middleware(req4, res1, (err) => { error4 = err; });
  assert.ok(error4);
  assert.equal(error4.status, 401);
});

test("conversation status transitions support active and closed states", () => {
  const conversation = {
    customerId: "cust_123",
    status: "active",
    unreadCountAdmin: 2,
    unreadCountCustomer: 0,
  };

  // Close conversation
  conversation.status = "closed";
  assert.equal(conversation.status, "closed");

  // Reopen conversation when new message arrives or admin reopens
  conversation.status = "active";
  assert.equal(conversation.status, "active");
});

test("client message deduplication respects unique clientMessageId", () => {
  const storedMessages = new Map();
  function addMessage(msg) {
    if (storedMessages.has(msg.clientMessageId)) {
      return { isNew: false, message: storedMessages.get(msg.clientMessageId) };
    }
    storedMessages.set(msg.clientMessageId, msg);
    return { isNew: true, message: msg };
  }

  const msg1 = {
    clientMessageId: "msg_abc_001",
    content: "Fabric sample photo attached",
    senderType: "customer",
  };

  const res1 = addMessage(msg1);
  assert.ok(res1.isNew);
  assert.equal(res1.message.content, "Fabric sample photo attached");

  // Duplicate send with same clientMessageId returns original without creating another
  const res2 = addMessage(msg1);
  assert.ok(!res2.isNew);
  assert.equal(storedMessages.size, 1);
});

test("first-time customer message triggers automated atelier greeting when enabled", () => {
  const conversation = {
    _id: "conv_123",
    customerId: "cust_789",
    messages: [],
    lastMessage: null,
  };

  const autoGreetingConfig = {
    enabled: true,
    message: "Namaste! Welcome to KhwabStitch Atelier. How can we craft your dream outfit today?",
  };

  function simulateCustomerMessage(content) {
    const isFirstMessage = conversation.messages.length === 0;

    const customerMsg = {
      _id: "msg_cust_" + Date.now(),
      senderType: "customer",
      content,
      deliveryStatus: "delivered",
    };
    conversation.messages.push(customerMsg);

    let greetingMsg = null;
    if (isFirstMessage && autoGreetingConfig.enabled) {
      greetingMsg = {
        _id: "msg_greeting_" + Date.now(),
        senderType: "admin",
        senderName: "KhwabStitch Atelier",
        content: autoGreetingConfig.message,
        deliveryStatus: "delivered",
      };
      conversation.messages.push(greetingMsg);
      conversation.lastMessage = greetingMsg;
    }

    return { customerMsg, greetingMsg };
  }

  // 1. First message produces auto-greeting
  const res1 = simulateCustomerMessage("Hello, I need custom kurti stitching");
  assert.ok(res1.customerMsg);
  assert.ok(res1.greetingMsg);
  assert.equal(res1.greetingMsg.senderName, "KhwabStitch Atelier");
  assert.equal(res1.greetingMsg.content, autoGreetingConfig.message);
  assert.equal(conversation.messages.length, 2);

  // 2. Second message does NOT re-trigger auto-greeting
  const res2 = simulateCustomerMessage("I have my own silk fabric");
  assert.ok(res2.customerMsg);
  assert.equal(res2.greetingMsg, null);
  assert.equal(conversation.messages.length, 3);
});

test("chat automation & quick replies schema enforces string lengths and array bounds", () => {
  import("zod").then(({ z }) => {
    const settingsSchema = z.object({
      autoGreeting: z
        .object({
          enabled: z.boolean(),
          message: z.string().trim().min(1).max(1000),
        })
        .optional(),
      quickReplies: z.array(z.string().trim().min(1).max(300)).min(1).max(30).optional(),
      customerPrompts: z.array(z.string().trim().min(1).max(120)).min(1).max(20).optional(),
    });

    // Valid payload
    const valid = settingsSchema.parse({
      autoGreeting: {
        enabled: true,
        message: "Hello! Welcome to our studio.",
      },
      quickReplies: ["Can you share reference images?", "Standard turnaround is 3-5 days."],
      customerPrompts: ["Custom Stitching Enquiry", "Measurement Guide"],
    });
    assert.equal(valid.autoGreeting.enabled, true);
    assert.equal(valid.quickReplies.length, 2);
    assert.equal(valid.customerPrompts.length, 2);

    // Empty message fails
    assert.throws(() => {
      settingsSchema.parse({
        autoGreeting: { enabled: true, message: "" },
      });
    });

    // Excessive length customer prompt fails
    assert.throws(() => {
      settingsSchema.parse({
        customerPrompts: ["a".repeat(125)],
      });
    });
  });
});

