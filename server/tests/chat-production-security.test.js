import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import jwt from "jsonwebtoken";
import { chatRoutes } from "../src/routes-chat.js";
import { adminChatRoutes } from "../src/routes-admin-chat.js";
import { generateGuestCredentials } from "../src/chat-models.js";
import { errorHandler } from "../src/errors.js";
import { createApp } from "../src/app.js";
import { initChatSocket, broadcastChatMessage } from "../src/chat-socket.js";
import { tokenService, JWT_ISSUER, JWT_AUDIENCE } from "../src/auth.js";

const requireClient = createRequire(new URL("../../client/package.json", import.meta.url));
const { io: connectSocket } = requireClient("socket.io-client");
const quiet = { info() {}, warn() {}, error() {} };
const customerA = generateGuestCredentials(), customerB = generateGuestCredentials();
const customer = { ...customerA, displayName: "Customer A" };
function query(value) {
  return { sort() { return this; }, limit() { return this; }, lean() { return Promise.resolve(value); }, then(ok, bad) { return Promise.resolve(value).then(ok, bad); } };
}
function document(value) { return { ...value, async save() {}, toObject() { const { save: _save, toObject: _toObject, ...result } = this; return result; } }; }
function fixture(verified = "true") {
  const attachments = new Map(), messages = [], signed = [], uploads = [], removed = [];
  const conversation = document({ _id: "conversation-a", customerId: customerA.customerId, unreadCountAdmin: 0, unreadCountCustomer: 0 });
  const ctx = {
    config: { NODE_ENV: "test", IMAGEKIT_PRIVATE_POLICY_VERIFIED: verified }, logger: quiet,
    images: {
      async upload(_buffer, options) { uploads.push(options); return { fileId: `upload-${uploads.length}`, filePath: `/khwab/private/chat/${options.owner}/photo.webp` }; },
      async remove(fileId) { removed.push(fileId); },
      url(path, seconds) { signed.push(path); return `https://images.example.test${path}?expires=${seconds}`; },
    },
    models: {
      ChatCustomer: { async findOne(filter) { return filter.guestTokenHash === customerA.guestTokenHash ? customer : null; } },
      ChatConversation: { findOne() { return query(conversation); } },
      ChatMessage: {
        find() { return query(messages); },
        async findOne(filter) { return messages.find(message => message.clientMessageId === filter.clientMessageId) || null; },
        async create(value) { const result = document({ ...value, _id: `message-${messages.length}`, createdAt: new Date() }); messages.push(result); return result; },
        async countDocuments() { return 1; },
      },
      ChatAttachment: {
        async create(value) { attachments.set(value._id, value); return value; },
        async findOneAndUpdate(filter, update) {
          const value = attachments.get(filter._id);
          if (!value || value.owner !== filter.owner || !value.private || !filter.customerId.$in.includes(value.customerId)) return null;
          Object.assign(value, update.$set); return value;
        },
        find(filter) { return query([...attachments.values()].filter(value => filter._id.$in.includes(value._id) && value.customerId === filter.customerId && value.private)); },
      },
    },
  };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.log = quiet; next(); });
  chatRoutes(app, ctx);
  adminChatRoutes(app, ctx, (req, _res, next) => { req.user = { _id: "admin-a" }; next(); }, (_req, _res, next) => next());
  app.use(errorHandler);
  const guest = path => request(app).post(path).set("x-guest-token", customerA.guestToken).set("x-customer-id", customerA.customerId);
  return { app, ctx, attachments, messages, signed, uploads, removed, guest };
}
const image = () => sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).png().toBuffer();

test("chat uploads refuse unverified privacy for customers and admins without publishing files", async () => {
  const f = fixture("false"), png = await image();
  const customerResult = await f.guest("/api/chat/upload").attach("file", png, "photo.png");
  const adminResult = await request(f.app).post("/api/admin/chat/upload").attach("file", png, "photo.png");
  assert.equal(customerResult.status, 503);
  assert.equal(adminResult.status, 503);
  assert.equal(customerResult.body.error.code, "PRIVATE_MEDIA_UNVERIFIED");
  assert.equal(f.uploads.length, 0);
});

test("chat uploads register private server metadata and reject cross-customer attachments", async () => {
  const f = fixture(), png = await image();
  const uploaded = await f.guest("/api/chat/upload").attach("file", png, "photo.png");
  assert.equal(uploaded.status, 201);
  assert.equal(f.uploads[0].private, true);
  assert.equal(f.attachments.get(uploaded.body.data.fileId).owner, `guest:${customerA.customerId}`);
  const sent = await f.guest("/api/chat/messages").send({
    clientMessageId: "valid-image", attachment: { ...uploaded.body.data, filePath: "/somebody/private/secret.webp", url: "https://attacker.example.test/pixel", size: -10 },
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.data.message.attachment.filePath, uploaded.body.data.filePath);
  assert.equal(sent.body.data.message.attachment.size, uploaded.body.data.size);
  assert.ok(!f.signed.includes("/somebody/private/secret.webp"));
  f.attachments.set("other-file", { _id: "other-file", owner: `guest:${customerB.customerId}`, customerId: customerB.customerId, private: true, filePath: "/private/other.webp" });
  const blocked = await f.guest("/api/chat/messages").send({ clientMessageId: "stolen-image", attachment: { fileId: "other-file" } });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.error.code, "INVALID_CHAT_ATTACHMENT");
  assert.equal(f.messages.length, 1);
});

test("chat history never signs unregistered client paths or another conversation's attachments", async () => {
  const f = fixture();
  f.messages.push({ _id: "legacy", attachment: { fileId: "legacy", filePath: "/private/forged.webp", url: "https://attacker.example.test/" } });
  f.messages.push({ _id: "cross-customer", attachment: { fileId: "other-file" } });
  f.attachments.set("other-file", { _id: "other-file", customerId: customerB.customerId, private: true, filePath: "/private/other.webp" });
  for (const path of ["/api/chat/messages", `/api/admin/chat/conversations/${customerA.customerId}/messages`]) {
    const result = await request(f.app).get(path).set("x-guest-token", customerA.guestToken);
    assert.equal(result.status, 200);
    assert.ok(result.body.data.messages.every(message => message.attachment === null));
  }
  assert.deepEqual(f.signed, []);
});

test("admin attachments bind once to a conversation and cannot be reused in another customer's chat", async () => {
  const f = fixture();
  const uploaded = await request(f.app).post("/api/admin/chat/upload").attach("file", await image(), "photo.png");
  assert.equal(uploaded.status, 201);
  assert.equal(f.uploads[0].private, true);
  const sent = await request(f.app).post(`/api/admin/chat/conversations/${customerA.customerId}/messages`).send({ clientMessageId: "admin-first", attachment: uploaded.body.data });
  assert.equal(sent.status, 201);
  assert.ok(sent.body.data.message.attachment.url.includes("expires=300"));
  const blocked = await request(f.app).post(`/api/admin/chat/conversations/${customerB.customerId}/messages`).send({ clientMessageId: "admin-second", attachment: uploaded.body.data });
  assert.equal(blocked.status, 400);
  assert.equal(f.messages.length, 1);
});

test("chat upload removes provider file if metadata cannot be persisted", async () => {
  const f = fixture();
  f.ctx.models.ChatAttachment.create = async () => { throw new Error("DB failure"); };
  const result = await f.guest("/api/chat/upload").attach("file", await image(), "photo.png");
  assert.equal(result.status, 500);
  assert.deepEqual(f.removed, ["upload-1"]);
});

test("chat upload signer failures clean up provider files without creating stale registry records", async () => {
  const f = fixture();
  f.ctx.images.url = () => { throw new Error("Signing failure"); };
  const result = await f.guest("/api/chat/upload").attach("file", await image(), "photo.png");
  assert.equal(result.status, 500);
  assert.deepEqual(f.removed, ["upload-1"]);
  assert.equal(f.attachments.size, 0);
});

test("chat rejects malformed pagination and tolerates malformed unrelated cookies", async () => {
  const f = fixture();
  for (const queryString of ["limit=1.5", "limit=Infinity", "limit=-1", "before=invalid"]) {
    const result = await request(f.app).get(`/api/chat/messages?${queryString}`).set("x-guest-token", customerA.guestToken);
    assert.equal(result.status, 400);
  }
  const valid = await request(f.app).get("/api/chat/messages").set("Cookie", "unrelated=%E0%A4%A").set("x-guest-token", customerA.guestToken);
  assert.equal(valid.status, 200);
});

test("CORS preflight permits guest chat headers for configured frontend origins", async () => {
  const app = createApp({ models: {}, config: { NODE_ENV: "test", JWT_SECRET: randomBytes(64).toString("base64url"), origins: ["https://shop.example.test"] }, logger: quiet });
  const result = await request(app).options("/api/chat/messages").set("Origin", "https://shop.example.test").set("Access-Control-Request-Method", "POST").set("Access-Control-Request-Headers", "x-guest-token,x-customer-id,content-type");
  assert.equal(result.status, 204);
  assert.match(result.headers["access-control-allow-headers"], /X-Guest-Token/i);
  assert.match(result.headers["access-control-allow-headers"], /X-Customer-ID/i);
});

async function socketFixture(t, tokenOverride) {
  const config = { NODE_ENV: "test", JWT_SECRET: randomBytes(64).toString("base64url"), origins: [] };
  const user = { _id: "123456789012345678901234", role: "admin", authVersion: 0, disabled: false };
  const models = { User: { async findById() { return user; } }, ChatConversation: { async findOne() { throw new Error("Revoked socket must not reach mutations"); } } };
  const server = createServer();
  const io = initChatSocket(server, { config, models, logger: quiet });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const token = tokenOverride ? tokenOverride(config, user) : tokenService(config).issue(user).token;
  const socket = connectSocket(`http://127.0.0.1:${server.address().port}`, { transports: ["websocket"], auth: { token }, reconnection: false, forceNew: true });
  t.after(async () => { socket.disconnect(); await new Promise(resolve => io.close(resolve)); });
  return { socket, user, config, io };
}

test("socket handshakes reject JWTs revoked by logout or password reset", { timeout: 10000 }, async t => {
  const f = await socketFixture(t, (config, user) => { const token = tokenService(config).issue(user).token; user.authVersion++; return token; });
  const [error] = await once(f.socket, "connect_error");
  assert.equal(error.message, "UNAUTHORIZED");
});

test("revoked connected admins are disconnected before private chat broadcasts", { timeout: 10000 }, async t => {
  const f = await socketFixture(t);
  await once(f.socket, "connect");
  let received = 0;
  f.socket.on("new_message", () => received++);
  f.user.authVersion++;
  const disconnected = once(f.socket, "disconnect");
  await broadcastChatMessage({ customerId: customerA.customerId, content: "Private data" }, { customerId: customerA.customerId });
  await disconnected;
  assert.equal(received, 0);
});

test("disabled connected admins cannot use socket events", { timeout: 10000 }, async t => {
  const f = await socketFixture(t);
  await once(f.socket, "connect");
  f.user.disabled = true;
  const disconnected = once(f.socket, "disconnect");
  f.socket.emit("mark_read", { customerId: customerA.customerId });
  await disconnected;
  assert.equal(f.socket.connected, false);
});

test("admin sockets disconnect when their signed JWT expires", { timeout: 10000 }, async t => {
  const f = await socketFixture(t, (config, user) => jwt.sign({ version: user.authVersion }, Buffer.from(config.JWT_SECRET, "base64url"), { algorithm: "HS256", subject: user._id, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: 2 }));
  await once(f.socket, "connect");
  await once(f.socket, "disconnect");
  assert.equal(f.socket.connected, false);
});
