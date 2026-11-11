import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { mediaRoutes } from "../src/routes-media.js";
import { errorHandler } from "../src/errors.js";

const owner = "a".repeat(24);
function fixture({ serverless = true, role = "customer", databaseFails = false, authenticated = true } = {}) {
  const calls = { uploads: [], removed: [], assets: [] };
  const ctx = {
    config: { SERVERLESS: serverless },
    models: {
      User: { updateOne: async () => ({ modifiedCount: 1 }) },
      MediaAsset: { create: async ([asset]) => { if (databaseFails) throw Error("Database fixture failure"); calls.assets.push(asset); return [{ ...asset, _id: "b".repeat(24), references: 0 }]; } },
      AuditEvent: { create: async () => [] },
    },
    transaction: async work => work(null),
    images: { upload: async (bytes, options) => { calls.uploads.push({ bytes, options }); return { fileId: "fixture-file", filePath: "/fixture.webp" }; }, remove: async id => calls.removed.push(id) },
  };
  const app = express();
  app.use((req, _res, next) => { req.log = { error() {} }; req.id = "media-fixture"; next(); });
  const auth = (req, res, next) => { if (!authenticated) return res.status(401).json({ error: { code: "UNAUTHENTICATED" } }); req.user = { _id: owner, role }; next(); };
  mediaRoutes(app, ctx, auth, (_req, _res, next) => next());
  app.use(errorHandler);
  return { app, calls };
}

test("serverless multipart cap rejects unprepared3MiB+ files before provider work", async () => {
  const { app, calls } = fixture();
  const response = await request(app).post("/api/media").field("purpose", "reference").attach("file", Buffer.alloc(3 * 1024 * 1024 + 1), { filename: "large.jpg", contentType: "image/jpeg" });
  assert.equal(response.status, 413); assert.equal(response.body.error.code, "IMAGE_PAYLOAD_TOO_LARGE");
  assert.equal(calls.uploads.length, 0);
});

test("standalone upload limit remains5MiB while actual decoding rejects a MIME-spoofed image", async () => {
  const { app, calls } = fixture({ serverless: false });
  const response = await request(app).post("/api/media").field("purpose", "reference").attach("file", Buffer.alloc(3 * 1024 * 1024 + 1), { filename: "large.png", contentType: "image/png" });
  assert.equal(response.status, 400); assert.equal(response.body.error.code, "INVALID_IMAGE");
  assert.equal(calls.uploads.length, 0);
});

test("standalone uploads still reject files above the original5MiB cap", async () => {
  const { app, calls } = fixture({ serverless: false });
  const response = await request(app).post("/api/media").field("purpose", "reference").attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), { filename: "too-large.jpg", contentType: "image/jpeg" });
  assert.equal(response.status, 413); assert.equal(response.body.error.code, "INVALID_UPLOAD");
  assert.equal(calls.uploads.length, 0);
});

test("small actual image bytes are decoded and private owner/purpose are forced server-side", async () => {
  const { app, calls } = fixture();
  const png = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#abcdef" } }).png().toBuffer();
  const response = await request(app).post("/api/media").field("purpose", "reference").attach("file", png, { filename: "misleading.bin", contentType: "application/octet-stream" });
  assert.equal(response.status, 201);
  assert.deepEqual(calls.uploads[0].options, { private: true, purpose: "reference", owner });
  assert.equal((await sharp(calls.uploads[0].bytes).metadata()).format, "webp");
  assert.equal(calls.assets[0].mime, "image/webp"); assert.equal(calls.assets[0].private, true);
});

test("private media upload remains authenticated and public uploads remain admin-only", async () => {
  const denied = fixture({ authenticated: false });
  assert.equal((await request(denied.app).post("/api/media").field("purpose", "reference").attach("file", Buffer.from("fake"), "x.jpg")).status, 401);
  const customer = fixture();
  assert.equal((await request(customer.app).post("/api/media").field("purpose", "catalogue").attach("file", Buffer.from("fake"), "x.jpg")).status, 403);
  assert.equal(denied.calls.uploads.length + customer.calls.uploads.length, 0);
});

test("failed media persistence removes provider file rather than leaving a successful attachment", async () => {
  const { app, calls } = fixture({ databaseFails: true });
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const response = await request(app).post("/api/media").field("purpose", "reference").attach("file", png, "real.png");
  assert.equal(response.status, 500); assert.deepEqual(calls.removed, ["fixture-file"]);
  assert.equal(calls.assets.length, 0);
});
