import { mediaUrl } from "../src/media-storage.js";
import { readFileSync } from "node:fs";
import { importDesignBoard } from "../src/design-import.js";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID, randomBytes, generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { tokenService, JWT_ISSUER, JWT_AUDIENCE } from "../src/auth.js";
import { hashPassword } from "../src/credentials.js";
import { resetAccountPassword } from "../src/account-security.js";
import {
  ensureIndexes,
  assertCredentialIndexes,
} from "../src/index-migration.js";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import sharp from "sharp";
import pino from "pino";
import { createApp } from "../src/app.js";
import { createModels, transaction } from "../src/models.js";
import { AppError } from "../src/errors.js";
import { executeAccountDeletion } from "../src/account-deletion.js";
import express from "express";
import { rateLimitFor } from "../src/rate-limits.js";
import { assertDeploymentIndexes } from "../src/deployment-indexes.js";
let repl, connection, models, app, customer, other, mainOrder, png;
let providerFails = false;
let blockedUpload = null;
const testDatabaseName = "khwab-tests-" + randomUUID().replaceAll("-", "").slice(0, 20);
let tokenA, tokenB, tokenAdmin, disabledToken, fixtureHash, context;
const fixturePassword = "A secure fixture password 2026!";
const extraDatabases = [];
const images = {
  async upload(_buffer, options) {
    if (blockedUpload) await blockedUpload();
    if (providerFails)
      throw new AppError(503, "MEDIA_PROVIDER_FAILURE", "Provider unavailable");
    return {
      fileId: randomUUID(),
      filePath:
        "/khwab/" +
        (options.private ? "private" : "public") +
        "/" +
        randomUUID() +
        ".webp",
    };
  },
  async remove() {
    if (providerFails)
      throw new AppError(503, "MEDIA_PROVIDER_FAILURE", "Provider unavailable");
  },
  url(path, seconds) {
    return (
      "https://images.example.test" +
      path +
      "?expires=" +
      seconds +
      "&signature=test"
    );
  },
};
const config = {
  NODE_ENV: "test",
  JWT_SECRET: randomBytes(64).toString("base64url"),
  origins: ["http://localhost:5173"],
  TRUST_PROXY_HOPS: 0,
  LOG_LEVEL: "silent",
};
const body = () => ({
  garment: "kurti",
  quantity: 1,
  preferences: {
    neck: "Round",
    sleeve: "Full",
    back: "Simple",
    fit: "Comfort",
    length: "Knee",
    extraWork: "",
  },
  measurements: {
    unit: "in",
    method: "body",
    values: { bust: 36, waist: 30, hip: 38, shoulder: 14, length: 40 },
    notes: "",
  },
  referenceMediaIds: [],
  customer: { name: "Test Customer", phone: "9876543210" },
  address: {
    line1: "A test address",
    line2: "",
    city: "Delhi",
    state: "Delhi",
    pin: "110001",
  },
  notes: "Automated test fixture",
  fabricAcknowledged: true,
});
const auth = (method, path, token = tokenA) => {
  const agent = request(app);
  return agent[method](path).set("Authorization", "Bearer " + token);
};
const createOrder = (payload = body(), key = randomUUID(), token = tokenA) =>
  auth("post", "/api/orders", token).set("Idempotency-Key", key).send(payload);
const adminDesign = (changes = {}) => ({
  title: "Test design",
  code: "T-" + randomUUID().slice(0, 8),
  slug: "test-" + randomUUID().slice(0, 8),
  garment: "kurti",
  description: "A stitching design for automated testing only.",
  startingPricePaise: 65000,
  mediaIds: [],
  status: "draft",
  ...changes,
});
async function seededOrder(changes = {}) {
  return models.Order.create({
    ...body(),
    owner: customer._id,
    idempotencyKey: randomUUID(),
    requestHash: "fixture",
    orderNumber: "TEST-" + randomUUID(),
    timeline: [],
    ...changes,
  });
}
before(
  async () => {
    if (process.env.NODE_ENV === "production")
      throw new Error("Refusing integration tests in NODE_ENV=production.");
    if (
      process.env.TEST_MONGODB_URI &&
      process.env.ALLOW_EXTERNAL_TEST_DATABASE !== "true"
    )
      throw new Error(
        "TEST_MONGODB_URI must be disposable: set ALLOW_EXTERNAL_TEST_DATABASE=true explicitly.",
      );
    if (!process.env.TEST_MONGODB_URI)
      repl = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: "wiredTiger" },
      });
    connection = await mongoose
      .createConnection(process.env.TEST_MONGODB_URI || repl.getUri(), {
        dbName: testDatabaseName,
        autoIndex: true,
        bufferCommands: false,
        serverSelectionTimeoutMS: 3000,
      })
      .asPromise();
    models = createModels(connection);
    await Promise.all(Object.values(models).map((model) => model.init()));
    fixtureHash = await hashPassword(fixturePassword);
    const [adminUser, customerUser, otherUser, disabledUser] =
      await models.User.create([
        {
          email: "admin@example.test",
          name: "Test admin",
          role: "admin",
          passwordHash: fixtureHash,
        },
        { email: "a@example.test", name: "Test A", passwordHash: fixtureHash },
        { email: "b@example.test", name: "Test B", passwordHash: fixtureHash },
        {
          email: "disabled@example.test",
          name: "Disabled",
          disabled: true,
          passwordHash: fixtureHash,
        },
      ]);
    const tokens = tokenService(config);
    tokenA = tokens.issue(customerUser).token;
    tokenB = tokens.issue(otherUser).token;
    tokenAdmin = tokens.issue(adminUser).token;
    disabledToken = tokens.issue(disabledUser).token;
    context = {
      config,
      models,
      transaction: (work) => transaction(work, connection),
      images,
      logger: pino({ level: "silent" }),
      dbReady: () => connection.readyState === 1,
    };
    app = createApp(context);
    customer = (await auth("get", "/api/me")).body.data;
    other = (await auth("get", "/api/me", tokenB)).body.data;
    png = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#917b55" },
    })
      .png()
      .toBuffer();
  },
  { timeout: 180000 },
);
after(async () => {
  if (connection?.readyState === 1) {
    if (connection.name !== testDatabaseName || !/^khwab-tests-[a-f0-9]{20}$/.test(connection.name)) throw new Error("Refusing cleanup outside the exact random API test database.");
    await connection.dropDatabase();
  }
  for (const { db, expectedName } of extraDatabases) {
    try {
      if (db.name !== expectedName || !/^khwab-index-tests-[a-f0-9]{20}$/.test(db.name)) throw new Error("Refusing cleanup outside an exact random index-test database.");
      await db.dropDatabase();
    } finally {
      await db.close();
    }
  }
  await connection?.close();
  await repl?.stop();
});
test("cloud drafts preserve empty configuration and measurement objects through storage", async () => {
  const data = {
    configuration: {
      source: "catalogue",
      mode: "exact",
      components: {},
      changedParts: [],
      addonIds: [],
    },
    measurements: { unit: "in", method: "assistance", values: {}, notes: "" },
    customer: { name: "Test customer", phone: "9876543210" },
  };
  const response = await auth("post", "/api/drafts").send({
    clientId: randomUUID(),
    data,
  });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.data.data, data);
  const loaded = await auth("get", "/api/drafts/" + response.body.data._id);
  assert.deepEqual(loaded.body.data.data, data);
});

test("guide CRUD enforces admin, exact garment/method, shared media and persistence after reconnect", async () => {
  const [image] = await models.MediaAsset.create([{owner:customer._id,fileId:randomUUID(),filePath:"/khwab/public/guide.webp",private:false,purpose:"catalogue",mime:"image/webp",bytes:120,width:322,height:328,references:1}]);
  const payload={code:"GUIDE-"+randomUUID().slice(0,8).toUpperCase(),name:"Kurti garment guide",garment:"kurti",method:"garment",language:"und",instructions:"Measure a garment, not the body.",measurementFields:["bust"],imageMediaIds:[String(image._id)],status:"published",displayOrder:1};
  await auth("post","/api/admin/measurement-guides").send(payload).expect(403);
  const created=await auth("post","/api/admin/measurement-guides",tokenAdmin).send(payload).expect(201), guide=created.body.data;
  const matching=await request(app).get("/api/measurement-guides?garment=kurti&method=garment&language=hi").expect(200);
  assert.ok(matching.body.data.some(item=>item._id===guide._id));assert.ok(matching.body.data.every(item=>!item.sourceCrops));
  const wrong=await request(app).get("/api/measurement-guides?garment=blouse&method=body&language=en").expect(200);
  assert.equal(wrong.body.data.some(item=>item._id===guide._id),false);
  await auth("patch",`/api/admin/measurement-guides/${guide._id}`,tokenAdmin).send({...payload,instructions:"Updated garment-only instructions",revision:0}).expect(200);
  const fresh=await mongoose.createConnection(process.env.TEST_MONGODB_URI||repl.getUri(),{dbName:testDatabaseName,bufferCommands:false}).asPromise();
  try{assert.equal((await createModels(fresh).MeasurementGuide.findById(guide._id)).instructions,"Updated garment-only instructions");}finally{await fresh.close();}
  await auth("delete",`/api/admin/measurement-guides/${guide._id}`,tokenAdmin).send({revision:1}).expect(200);
  const archived=await request(app).get("/api/measurement-guides?garment=kurti&method=garment&language=en").expect(200);assert.equal(archived.body.data.some(item=>item._id===guide._id),false);
  await auth("delete",`/api/admin/measurement-guides/${guide._id}`,tokenAdmin).send({revision:2,permanent:true}).expect(200);
  assert.equal((await models.MediaAsset.findById(image._id)).references,1);
  assert.ok(await models.AuditEvent.exists({action:"guide.deleted",resourceId:guide._id}));
});

test("option imports are duplicate-safe, preserve images and cannot delete historical references", async () => {
  const image=await models.MediaAsset.create({owner:customer._id,fileId:randomUUID(),filePath:"/khwab/public/option.webp",private:false,purpose:"catalogue",mime:"image/webp",bytes:120,width:220,height:212,references:0});
  const option={code:"OPT-"+randomUUID().slice(0,8).toUpperCase(),name:"Imported round",kind:"neck",garments:[],status:"draft",active:false,priceMode:"pending",imageMediaId:String(image._id),imageMediaIds:[String(image._id)]};
  const payload={items:[{importKey:"test-import-"+randomUUID(),option}]};
  await auth("post","/api/admin/options/import").send(payload).expect(403);
  const first=await auth("post","/api/admin/options/import",tokenAdmin).send(payload).expect(201),id=first.body.data[0].id;
  const second=await auth("post","/api/admin/options/import",tokenAdmin).send(payload).expect(201);
  assert.equal(first.body.data[0].created,true);assert.equal(second.body.data[0].created,false);assert.equal((await models.MediaAsset.findById(image._id)).references,1);
  await auth("post","/api/admin/options/import",tokenAdmin).send({items:[{...payload.items[0],option:{...option,name:"Conflicting source"}}]}).expect(409);
  const order=await seededOrder({estimate:{components:{neck:{optionId:id,name:"Imported round"}}}});
  await auth("delete",`/api/admin/options/${id}/permanent`,tokenAdmin).send({revision:0}).expect(409);
  await models.Order.deleteOne({_id:order._id});
  await auth("delete",`/api/admin/options/${id}/permanent`,tokenAdmin).send({revision:0}).expect(200);
  assert.equal((await models.MediaAsset.findById(image._id)).references,0);
});
test("public design ID recovery preserves old request links and hides unpublished records", async () => {
  const published = await models.Design.create(
    adminDesign({ status: "published" }),
  );
  const hidden = await models.Design.create(adminDesign());
  const found = await request(app).get("/api/designs/id/" + published._id);
  assert.equal(found.status, 200);
  assert.equal(found.body.data._id, String(published._id));
  assert.equal(found.body.data.code, published.code);
  assert.equal(found.body.data.usedCount, undefined);
  assert.equal(
    (await request(app).get("/api/designs/id/" + hidden._id)).status,
    404,
  );
  assert.equal(
    (await request(app).get("/api/designs/id/not-an-id")).status,
    400,
  );
});
test("liveness/readiness return safe status without configuration", async () => {
  const live = await request(app).get("/health/live");
  assert.equal(live.status, 200);
  assert.deepEqual(live.body.data, { status: "alive" });
  assert.equal((await request(app).get("/health/ready")).status, 200);
});
test("missing invalid and expired authentication are rejected", async () => {
  assert.equal((await request(app).get("/api/me")).status, 401);
  assert.equal(
    (await auth("get", "/api/me", "invalid-session-token")).status,
    401,
  );
  assert.equal(
    (
      await auth(
        "get",
        "/api/me",
        jwt.sign({ version: 0 }, Buffer.from(config.JWT_SECRET, "base64url"), {
          algorithm: "HS256",
          subject: customer._id,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: -1,
        }),
      )
    ).status,
    401,
  );
});
test("JWT verification rejects the wrong algorithm issuer audience and missing expiry", async () => {
  const key = Buffer.from(config.JWT_SECRET, "base64url");
  for (const options of [
    {
      algorithm: "HS384",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: 1800,
    },
    {
      algorithm: "HS256",
      issuer: "another-service",
      audience: JWT_AUDIENCE,
      expiresIn: 1800,
    },
    {
      algorithm: "HS256",
      issuer: JWT_ISSUER,
      audience: "another-app",
      expiresIn: 1800,
    },
    { algorithm: "HS256", issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  ]) {
    const token = jwt.sign({ version: 0 }, key, {
      subject: customer._id,
      ...options,
    });
    assert.equal((await auth("get", "/api/me", token)).status, 401);
  }
});
test("database role overrides untrusted admin claims and disabled users are denied", async () => {
  assert.equal(customer.role, "customer");
  assert.equal((await auth("get", "/api/admin/dashboard")).status, 403);
  const forgedRole = jwt.sign(
    { version: 0, role: "admin" },
    Buffer.from(config.JWT_SECRET, "base64url"),
    {
      algorithm: "HS256",
      subject: customer._id,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: 1800,
    },
  );
  assert.equal(
    (await auth("get", "/api/admin/dashboard", forgedRole)).status,
    403,
  );
  assert.equal((await auth("get", "/api/me", disabledToken)).status, 403);
});
test("profile rejects role escalation and stores only allowed fields", async () => {
  assert.equal(
    (await auth("patch", "/api/me").send({ role: "admin" })).status,
    400,
  );
  const r = await auth("patch", "/api/me").send({ phone: "+91 98765 43210" });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.phone, "919876543210");
});
test("exact CORS allowlist blocks other origins and allows configured frontend", async () => {
  assert.equal(
    (
      await request(app)
        .get("/api/designs")
        .set("Origin", "https://evil.example.test")
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .get("/api/designs")
        .set("Origin", "http://localhost:5173")
    ).headers["access-control-allow-origin"],
    "http://localhost:5173",
  );
});
test("public pagination rejects excessive limits unknown fields and injection-like queries", async () => {
  for (const path of [
    "/api/designs?limit=500",
    "/api/designs?page=-1",
    "/api/designs?sort=__proto__",
    "/api/designs?role=admin",
    "/api/designs?garment[$ne]=kurti",
  ])
    assert.equal((await request(app).get(path)).status, 400, path);
});
test("admin CRUD validates design input and public API hides drafts", async () => {
  assert.equal(
    (
      await auth("post", "/api/admin/designs", tokenAdmin).send({
        ...adminDesign(),
        startingPricePaise: 1.5,
      })
    ).status,
    400,
  );
  const created = await auth("post", "/api/admin/designs", tokenAdmin).send(
    adminDesign(),
  );
  assert.equal(created.status, 201);
  const d = created.body.data;
  assert.equal((await request(app).get("/api/designs/" + d.slug)).status, 404);
  const publicList = await request(app).get("/api/designs");
  assert.ok(!publicList.body.data.some((x) => x._id === d._id));
  const update = await auth(
    "patch",
    "/api/admin/designs/" + d._id,
    tokenAdmin,
  ).send({
    ...adminDesign({ code: d.code, slug: d.slug, status: "published" }),
    revision: d.revision,
  });
  assert.equal(update.status, 200);
  const visible = await request(app).get("/api/designs/" + d.slug);
  assert.equal(visible.status, 200);
  assert.equal(visible.body.data.revision, undefined);
  assert.equal(visible.body.data.usedCount, undefined);
  const stale = await auth(
    "patch",
    "/api/admin/designs/" + d._id,
    tokenAdmin,
  ).send({ ...adminDesign({ code: d.code, slug: d.slug }), revision: 0 });
  assert.equal(stale.status, 409);
});
test("category references prevent deletion and draft deletion releases the reference", async () => {
  const cat = (
    await auth("post", "/api/admin/categories", tokenAdmin).send({
      name: "Test category",
      slug: "test-category",
      active: true,
    })
  ).body.data;
  const design = (
    await auth("post", "/api/admin/designs", tokenAdmin).send(
      adminDesign({ category: cat._id }),
    )
  ).body.data;
  assert.equal(
    (
      await auth("delete", "/api/admin/categories/" + cat._id, tokenAdmin).send(
        { revision: 0 },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await auth("delete", "/api/admin/designs/" + design._id, tokenAdmin).send(
        { revision: 0 },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await auth("delete", "/api/admin/categories/" + cat._id, tokenAdmin).send(
        { revision: 0 },
      )
    ).status,
    200,
  );
});
test("order request rejects invalid measurements and client-controlled owner/price/status", async () => {
  const missing = body();
  delete missing.measurements.values.bust;
  assert.equal((await createOrder(missing)).status, 400);
  for (const fields of [
    { owner: other._id },
    { status: "customer_accepted" },
    { amountPaise: 100 },
  ])
    assert.equal((await createOrder({ ...body(), ...fields })).status, 400);
  assert.equal((await auth("post", "/api/orders").send(body())).status, 400);
});
test("new request is received without confirmation and has a unique order number", async () => {
  const result = await createOrder();
  assert.equal(result.status, 201);
  mainOrder = result.body.data;
  assert.equal(mainOrder.status, "request_received");
  assert.match(mainOrder.orderNumber, /^KS-\d{4}-[A-F\d]{12}$/);
  assert.equal(mainOrder.requestHash, undefined);
  assert.equal(mainOrder.acceptedQuote, undefined);
});
test("owner checks hide another customer orders and mutations", async () => {
  assert.equal(
    (await auth("get", "/api/orders/" + mainOrder._id, tokenB)).status,
    404,
  );
  assert.equal(
    (
      await auth(
        "post",
        "/api/orders/" + mainOrder._id + "/cancel",
        tokenB,
      ).send({ revision: 0 })
    ).status,
    404,
  );
  const list = await auth("get", "/api/orders", tokenB);
  assert.equal(list.status, 200);
  assert.ok(!list.body.data.some((x) => x._id === mainOrder._id));
});
test("same idempotency key returns original receipt and changed payload conflicts", async () => {
  const key = randomUUID(),
    payload = body();
  const first = await createOrder(payload, key);
  assert.equal(first.status, 201);
  const replay = await createOrder(payload, key);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data._id, first.body.data._id);
  assert.equal(replay.headers["idempotency-replayed"], "true");
  assert.equal(
    (await createOrder({ ...payload, quantity: 2 }, key)).status,
    409,
  );
});
test("concurrent duplicate submissions create exactly one request", async () => {
  const key = randomUUID(),
    payload = body();
  const responses = await Promise.all([
    createOrder(payload, key),
    createOrder(payload, key),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  assert.equal(responses[0].body.data._id, responses[1].body.data._id);
  assert.equal(
    await models.Order.countDocuments({
      owner: customer._id,
      idempotencyKey: key,
    }),
    1,
  );
});
test("design snapshots survive later catalogue edits and used designs cannot be deleted", async () => {
  const d = await models.Design.create(adminDesign({ status: "published" }));
  const created = await createOrder({ ...body(), designId: String(d._id) });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.designSnapshot.title, d.title);
  await models.Design.updateOne(
    { _id: d._id },
    { $set: { title: "Edited later", status: "draft" } },
  );
  const historical = await auth("get", "/api/orders/" + created.body.data._id);
  assert.equal(historical.body.data.designSnapshot.title, d.title);
  assert.equal(
    (
      await auth("delete", "/api/admin/designs/" + d._id, tokenAdmin).send({
        revision: 0,
      })
    ).status,
    409,
  );
});
test("administrator cannot skip customer quote acceptance", async () => {
  assert.equal(
    (
      await auth(
        "patch",
        "/api/admin/orders/" + mainOrder._id + "/status",
        tokenAdmin,
      ).send({ revision: 0, status: "stitching", note: "" })
    ).status,
    409,
  );
  assert.equal(
    (
      await auth(
        "patch",
        "/api/admin/orders/" + mainOrder._id + "/status",
        tokenAdmin,
      ).send({ revision: 0, status: "customer_accepted", note: "" })
    ).status,
    409,
  );
});
test("quote versions and atomic revisions reject stale acceptance and concurrent writes", async () => {
  const order = await seededOrder({ status: "under_review" });
  const deliveryDate = new Date(Date.now() + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  const attempts = await Promise.all([
    auth("post", "/api/admin/orders/" + order._id + "/quotes", tokenAdmin).send(
      { revision: 0, amountPaise: 100000, deliveryDate, notes: "" },
    ),
    auth("post", "/api/admin/orders/" + order._id + "/quotes", tokenAdmin).send(
      { revision: 0, amountPaise: 120000, deliveryDate, notes: "" },
    ),
  ]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
  const quoted = attempts.find((r) => r.status === 200).body.data;
  assert.equal(quoted.quotes.length, 1);
  const revised = await auth(
    "post",
    "/api/admin/orders/" + order._id + "/quotes",
    tokenAdmin,
  ).send({
    revision: 1,
    amountPaise: 130000,
    deliveryDate,
    notes: "Updated scope",
  });
  assert.equal(revised.status, 200);
  assert.equal(revised.body.data.quotes[1].version, 2);
  assert.equal(
    (
      await auth("post", "/api/orders/" + order._id + "/quote-response").send({
        revision: 2,
        quoteVersion: 1,
        decision: "accept",
      })
    ).status,
    409,
  );
  const accepted = await auth(
    "post",
    "/api/orders/" + order._id + "/quote-response",
  ).send({ revision: 2, quoteVersion: 2, decision: "accept" });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.acceptedQuote.amountPaise, 130000);
  assert.equal(accepted.body.data.status, "customer_accepted");
  assert.equal(
    (
      await auth("post", "/api/orders/" + order._id + "/quote-response").send({
        revision: 2,
        quoteVersion: 2,
        decision: "accept",
      })
    ).status,
    409,
  );
});
test("concurrent status changes require one winning revision", async () => {
  const order = await seededOrder({ status: "request_received" });
  const attempts = await Promise.all([
    auth(
      "patch",
      "/api/admin/orders/" + order._id + "/status",
      tokenAdmin,
    ).send({ revision: 0, status: "under_review", note: "" }),
    auth(
      "patch",
      "/api/admin/orders/" + order._id + "/status",
      tokenAdmin,
    ).send({ revision: 0, status: "cancelled", note: "" }),
  ]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
});
test("full accepted order lifecycle preserves quote and timeline", async () => {
  const order = await seededOrder({
    status: "customer_accepted",
    acceptedQuote: { version: 1, amountPaise: 90000, currency: "INR" },
  });
  let revision = 0;
  for (const status of [
    "fabric_received",
    "stitching",
    "ready",
    "dispatched",
    "delivered",
  ]) {
    const result = await auth(
      "patch",
      "/api/admin/orders/" + order._id + "/status",
      tokenAdmin,
    ).send({ revision, status, note: "Test transition" });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.status, status);
    revision++;
  }
  const final = await models.Order.findById(order._id);
  assert.equal(final.timeline.length, 5);
  assert.equal(final.acceptedQuote.amountPaise, 90000);
});
test("quote rejection returns request to review and accepted orders require admin cancellation", async () => {
  const q = await seededOrder({
    status: "quote_sent",
    quotes: [{ version: 1, amountPaise: 100000, currency: "INR" }],
  });
  const response = await auth(
    "post",
    "/api/orders/" + q._id + "/quote-response",
  ).send({ revision: 0, quoteVersion: 1, decision: "reject" });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, "under_review");
  const accepted = await seededOrder({ status: "customer_accepted" });
  assert.equal(
    (
      await auth("post", "/api/orders/" + accepted._id + "/cancel").send({
        revision: 0,
      })
    ).status,
    409,
  );
});
test("unauthorized uploads fail before decoding and actual image data is required", async () => {
  assert.equal(
    (
      await request(app)
        .post("/api/media")
        .field("purpose", "reference")
        .attach("file", png, "x.png")
    ).status,
    401,
  );
  assert.equal(
    (
      await auth("post", "/api/media")
        .field("purpose", "catalogue")
        .attach("file", png, "x.png")
    ).status,
    403,
  );
  const invalid = await auth("post", "/api/media")
    .field("purpose", "reference")
    .attach("file", Buffer.from("<svg></svg>"), "fake.jpg");
  assert.equal(invalid.status, 400);
});
test("private image access enforces ownership and strips provider metadata", async () => {
  const result = await auth("post", "/api/media")
    .field("purpose", "reference")
    .attach("file", png, "reference.png");
  assert.equal(result.status, 201);
  const media = result.body.data;
  assert.equal(media.private, true);
  assert.equal(media.mime, "image/webp");
  assert.equal(media.filePath, undefined);
  assert.equal(media.fileId, undefined);
  assert.equal(
    (await auth("get", "/api/media/" + media._id + "/access", tokenB)).status,
    404,
  );
  const access = await auth("get", "/api/media/" + media._id + "/access");
  assert.equal(access.status, 200);
  assert.match(access.body.data.url, /signature=/);
  assert.match(access.headers["cache-control"], /no-store/);
  const order = await createOrder({
    ...body(),
    referenceMediaIds: [media._id],
  });
  assert.equal(order.status, 201);
  assert.equal(
    (await auth("delete", "/api/media/" + media._id).send({})).status,
    409,
  );
});
test("cross-customer references and public assets cannot be attached as private references", async () => {
  const privateAsset = await models.MediaAsset.create({
    owner: other._id,
    fileId: randomUUID(),
    filePath: "/private/test.webp",
    purpose: "reference",
    private: true,
    mime: "image/webp",
    bytes: 200,
  });
  assert.equal(
    (
      await createOrder({
        ...body(),
        referenceMediaIds: [String(privateAsset._id)],
      })
    ).status,
    400,
  );
});
test("provider failure returns503 without creating a media record", async () => {
  const count = await models.MediaAsset.countDocuments();
  providerFails = true;
  try {
    assert.equal(
      (
        await auth("post", "/api/media")
          .field("purpose", "reference")
          .attach("file", png, "test.png")
      ).status,
      503,
    );
  } finally {
    providerFails = false;
  }
  assert.equal(await models.MediaAsset.countDocuments(), count);
});
test("settings banner reference integrity prevents deletion until removed", async () => {
  const asset = (
    await auth("post", "/api/media", tokenAdmin)
      .field("purpose", "banner")
      .attach("file", png, "banner.png")
  ).body.data;
  const settings = (await auth("get", "/api/admin/settings", tokenAdmin)).body
    .data;
  const {
    _id: _id,
    key: _key,
    createdAt: _created,
    updatedAt: _updated,
    ...fields
  } = settings;
  const update = await auth("patch", "/api/admin/settings", tokenAdmin).send({
    ...fields,
    bannerMediaId: asset._id,
  });
  assert.equal(update.status, 200);
  assert.equal(
    (await auth("delete", "/api/media/" + asset._id, tokenAdmin).send({}))
      .status,
    409,
  );
  const {
    _id: _newId,
    key: _newKey,
    createdAt: _newCreated,
    updatedAt: _newUpdated,
    ...updated
  } = update.body.data;
  assert.equal(
    (
      await auth("patch", "/api/admin/settings", tokenAdmin).send({
        ...updated,
        bannerMediaId: null,
      })
    ).status,
    200,
  );
  assert.equal(
    (await auth("delete", "/api/media/" + asset._id, tokenAdmin).send({}))
      .status,
    200,
  );
});
test("deletion request is durable idempotent and audit excludes private data", async () => {
  const first = await auth("post", "/api/me/deletion-request").send({});
  assert.equal(first.status, 202);
  const next = await auth("post", "/api/me/deletion-request").send({});
  assert.equal(next.status, 202);
  assert.equal(first.body.data.requestedAt, next.body.data.requestedAt);
  assert.equal(
    await models.AuditEvent.countDocuments({
      action: "account.deletion_requested",
      actor: customer._id,
    }),
    1,
  );
  const audits = await auth("get", "/api/admin/audit?limit=50", tokenAdmin);
  assert.equal(audits.status, 200);
  assert.ok(!JSON.stringify(audits.body).includes("Test address"));
  assert.ok(!JSON.stringify(audits.body).includes("Test Customer"));
});
test("database failure uses safe503 error and includes a request ID", async () => {
  const broken = createApp({
    config,
    models: {
      Design: {
        find() {
          throw Object.assign(new Error("secret-db-password"), {
            name: "MongoNetworkError",
          });
        },
      },
    },
    transaction: async (fn) => fn(null),
    images,
    logger: pino({ level: "silent" }),
    dbReady: () => false,
  });
  const result = await request(broken).get("/api/designs");
  assert.equal(result.status, 503);
  assert.match(result.body.error.requestId, /^[a-f\d-]+$/);
  assert.ok(!JSON.stringify(result.body).includes("secret-db-password"));
  assert.equal((await request(broken).get("/health/ready")).status, 503);
});

test("registration normalizes email, creates only a customer, and returns a thirty-minute signed session without password fields", async () => {
  const testApp = createApp(context);
  const result = await request(testApp).post("/api/auth/register").send({
    name: "New customer",
    email: "  New.Customer@Example.Test ",
    password: fixturePassword,
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.data.user.email, "new.customer@example.test");
  assert.equal(result.body.data.user.role, "customer");
  assert.equal(result.body.data.user.emailVerified, false);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(result.headers["set-cookie"], undefined);
  assert.equal(result.body.data.user.passwordHash, undefined);
  assert.equal(result.body.data.user.authVersion, undefined);
  const claims = jwt.verify(
    result.body.data.token,
    Buffer.from(config.JWT_SECRET, "base64url"),
    { algorithms: ["HS256"], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  );
  assert.equal(claims.sub, result.body.data.user._id);
  assert.equal(claims.version, 0);
  assert.equal(claims.exp - claims.iat, 1800);
  assert.equal(
    new Date(result.body.data.expiresAt).getTime(),
    claims.exp * 1000,
  );
  assert.equal(claims.role, undefined);
  const normal = await models.User.findById(claims.sub).lean();
  assert.equal(normal.passwordHash, undefined);
  const stored = await models.User.findById(claims.sub).select("+passwordHash");
  assert.match(stored.passwordHash, /^\$2[aby]\$12\$/);
  assert.notEqual(stored.passwordHash, fixturePassword);
  assert.equal(
    (
      await request(testApp)
        .get("/api/me")
        .set("Authorization", "Bearer " + result.body.data.token)
    ).status,
    200,
  );
});

test("registration rejects role escalation, short and overlength Unicode passwords, and duplicate emails", async () => {
  const testApp = createApp(context);
  for (const input of [
    {
      name: "No role escalation",
      email: "escalation@example.test",
      password: fixturePassword,
      role: "admin",
    },
    { name: "Short password", email: "short@example.test", password: "short" },
    {
      name: "Long Unicode",
      email: "unicode@example.test",
      password: "🪡".repeat(19),
    },
    {
      name: "Too few codepoints",
      email: "codepoints@example.test",
      password: "🪡".repeat(6),
    },
  ])
    assert.equal(
      (await request(testApp).post("/api/auth/register").send(input)).status,
      400,
    );
  const duplicate = await request(testApp).post("/api/auth/register").send({
    name: "Another name",
    email: "A@EXAMPLE.TEST",
    password: fixturePassword,
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, "ACCOUNT_UNAVAILABLE");
  assert.equal(
    await models.User.countDocuments({ email: "a@example.test" }),
    1,
  );
});

test("login succeeds with normalized credentials and missing/wrong/disabled accounts receive the same safe error", async () => {
  const testApp = createApp(context);
  const loggedIn = await request(testApp)
    .post("/api/auth/login")
    .send({ email: " A@Example.Test ", password: fixturePassword });
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.body.data.user._id, customer._id);
  assert.equal(loggedIn.body.data.user.emailVerified, false);
  assert.equal(loggedIn.body.data.user.passwordHash, undefined);
  const failures = [];
  for (const input of [
    { email: "a@example.test", password: "An incorrect long password." },
    { email: "not-present@example.test", password: fixturePassword },
    { email: "disabled@example.test", password: fixturePassword },
  ]) {
    const result = await request(testApp).post("/api/auth/login").send(input);
    assert.equal(result.status, 401);
    failures.push({
      code: result.body.error.code,
      message: result.body.error.message,
    });
  }
  assert.deepEqual(failures[0], failures[1]);
  assert.deepEqual(failures[1], failures[2]);
});

test("simultaneous registration of one email cannot create duplicate credential accounts", async () => {
  const testApp = createApp(context);
  const input = {
    name: "Concurrent customer",
    email: "concurrent-auth@example.test",
    password: fixturePassword,
  };
  const responses = await Promise.all([
    request(testApp).post("/api/auth/register").send(input),
    request(testApp).post("/api/auth/register").send(input),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [201, 409],
  );
  assert.equal(await models.User.countDocuments({ email: input.email }), 1);
});

test("password work is bounded and authentication endpoints enforce IP limits before expensive work", async () => {
  const concurrentApp = createApp(context);
  const results = await Promise.all(
    [1, 2, 3].map((number) =>
      request(concurrentApp)
        .post("/api/auth/register")
        .send({
          name: "Limited customer",
          email: "limited-" + number + "@example.test",
          password: fixturePassword,
        }),
    ),
  );
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    [201, 201, 429],
  );
  assert.equal(
    results.find((result) => result.status === 429).body.error.code,
    "AUTH_BUSY",
  );
  const limitedApp = createApp(context);
  for (let index = 0; index < 10; index++)
    assert.equal(
      (await request(limitedApp).post("/api/auth/register").send({})).status,
      400,
    );
  assert.equal(
    (await request(limitedApp).post("/api/auth/register").send({})).status,
    429,
  );
  for (let index = 0; index < 30; index++)
    assert.equal(
      (await request(limitedApp).post("/api/auth/login").send({})).status,
      400,
    );
  assert.equal(
    (await request(limitedApp).post("/api/auth/login").send({})).status,
    429,
  );
});

test("logout revokes all existing tokens for the account without cookies or an authentication upsert", async () => {
  const user = await models.User.create({
    email: "logout@example.test",
    name: "Logout fixture",
    passwordHash: fixtureHash,
  });
  const tokens = tokenService(config);
  const first = tokens.issue(user).token,
    second = tokens.issue(user).token;
  assert.equal((await auth("get", "/api/me", first)).status, 200);
  const loggedOut = await auth("post", "/api/auth/logout", first).send({});
  assert.equal(loggedOut.status, 200);
  assert.equal(loggedOut.body.data.loggedOut, true);
  assert.equal((await auth("get", "/api/me", first)).status, 401);
  assert.equal((await auth("get", "/api/me", second)).status, 401);
  const current = await models.User.findById(user._id);
  assert.equal(current.authVersion, 1);
  assert.equal(
    (await auth("get", "/api/me", tokens.issue(current).token)).status,
    200,
  );
  const phantom = tokens.issue({
    _id: new mongoose.Types.ObjectId(),
    authVersion: 0,
  }).token;
  const beforeCount = await models.User.countDocuments();
  assert.equal((await auth("get", "/api/me", phantom)).status, 401);
  assert.equal(await models.User.countDocuments(), beforeCount);
});

test("public registration cannot claim a legacy account and trusted migration preserves its order ownership", async () => {
  const legacyId = new mongoose.Types.ObjectId();
  await models.User.collection.insertOne({
    _id: legacyId,
    firebaseUid: "legacy-identity-fixture",
    email: " Legacy.Customer@Example.Test ",
    name: "Legacy customer",
    role: "customer",
    disabled: false,
  });
  const oldOrder = await seededOrder({ owner: legacyId, status: "delivered" });
  const testApp = createApp(context);
  const blocked = await request(testApp).post("/api/auth/register").send({
    name: "Would-be claimant",
    email: "legacy.customer@example.test",
    password: fixturePassword,
  });
  assert.equal(blocked.status, 409);
  await assert.rejects(
    resetAccountPassword(context, {
      email: "legacy.customer@example.test",
      password: fixturePassword,
    }),
    { code: "LEGACY_MIGRATION_REQUIRED" },
  );
  const migrated = await resetAccountPassword(context, {
    email: "legacy.customer@example.test",
    password: fixturePassword,
    migrateLegacy: true,
    userId: String(legacyId),
  });
  assert.equal(migrated.userId, String(legacyId));
  assert.equal(migrated.legacyMigration, true);
  assert.equal(
    String((await models.Order.findById(oldOrder._id)).owner),
    String(legacyId),
  );
  const login = await request(testApp)
    .post("/api/auth/login")
    .send({ email: "legacy.customer@example.test", password: fixturePassword });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user._id, String(legacyId));
  assert.equal((await models.User.findById(legacyId)).authVersion, 1);
});

test("trusted password reset revokes old tokens and preserves the account ID", async () => {
  const user = await models.User.create({
    email: "reset@example.test",
    name: "Reset fixture",
    passwordHash: fixtureHash,
  });
  const oldToken = tokenService(config).issue(user).token;
  const newPassword = "A different secure password 2026!";
  const reset = await resetAccountPassword(context, {
    email: "RESET@example.test",
    password: newPassword,
  });
  assert.equal(reset.userId, String(user._id));
  assert.equal(reset.legacyMigration, false);
  assert.equal((await auth("get", "/api/me", oldToken)).status, 401);
  const testApp = createApp(context);
  assert.equal(
    (
      await request(testApp)
        .post("/api/auth/login")
        .send({ email: "reset@example.test", password: fixturePassword })
    ).status,
    401,
  );
  const login = await request(testApp)
    .post("/api/auth/login")
    .send({ email: "reset@example.test", password: newPassword });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user._id, String(user._id));
  const events = await models.AuditEvent.find({
    resourceId: String(user._id),
  }).lean();
  assert.ok(!JSON.stringify(events).includes(newPassword));
  assert.ok(!JSON.stringify(events).includes("passwordHash"));
});

async function isolatedIndexModels() {
  const databaseName = "khwab-index-tests-" + randomUUID().replaceAll("-", "").slice(0, 20);
  const db = await mongoose
    .createConnection(process.env.TEST_MONGODB_URI || repl.getUri(), {
      dbName: databaseName,
      autoIndex: false,
      bufferCommands: false,
    })
    .asPromise();
  extraDatabases.push({ db, expectedName: databaseName });
  const testModels = createModels(db);
  await testModels.User.createCollection();
  return testModels;
}

test("explicit index migration removes only the obsolete UID unique index and preserves legacy users and unrelated indexes", async () => {
  const legacy = await isolatedIndexModels();
  await legacy.User.collection.createIndex(
    { firebaseUid: 1 },
    { name: "firebaseUid_1", unique: true },
  );
  await legacy.User.collection.createIndex(
    { role: 1 },
    { name: "keep_role_index" },
  );
  const records = [
    {
      _id: new mongoose.Types.ObjectId(),
      firebaseUid: "old-a",
      email: "old-a@example.test",
      role: "customer",
    },
    {
      _id: new mongoose.Types.ObjectId(),
      firebaseUid: "old-b",
      email: "old-b@example.test",
      role: "customer",
    },
  ];
  await legacy.User.collection.insertMany(records);
  const beforeRecords = await legacy.User.collection
    .find()
    .sort({ _id: 1 })
    .toArray();
  await assert.rejects(
    assertCredentialIndexes(legacy),
    /Legacy authentication index migration/,
  );
  await ensureIndexes(legacy);
  await assertCredentialIndexes(legacy);
  assert.deepEqual(
    await legacy.User.collection.find().sort({ _id: 1 }).toArray(),
    beforeRecords,
  );
  const indexes = await legacy.User.collection.indexes();
  assert.ok(!indexes.some((index) => index.name === "firebaseUid_1"));
  assert.ok(indexes.some((index) => index.name === "keep_role_index"));
  assert.ok(
    indexes.some(
      (index) =>
        index.name === "email_credential_unique" && index.unique === true,
    ),
  );
  await legacy.User.create([
    { email: "new-a@example.test", passwordHash: fixtureHash },
    { email: "new-b@example.test", passwordHash: fixtureHash },
  ]);
  await assert.rejects(
    legacy.User.create({
      email: "new-a@example.test",
      passwordHash: fixtureHash,
    }),
    { code: 11000 },
  );
});

test("index migration refuses credential email conflicts before dropping the legacy protection", async () => {
  const legacy = await isolatedIndexModels();
  await legacy.User.collection.createIndex(
    { firebaseUid: 1 },
    { name: "firebaseUid_1", unique: true },
  );
  await legacy.User.collection.insertMany([
    {
      firebaseUid: "duplicate-a",
      email: "Duplicate@Example.Test",
      passwordHash: fixtureHash,
    },
    {
      firebaseUid: "duplicate-b",
      email: " duplicate@example.test ",
      passwordHash: fixtureHash,
    },
  ]);
  await assert.rejects(
    ensureIndexes(legacy),
    /Credential email duplicates or normalization/,
  );
  assert.ok(
    (await legacy.User.collection.indexes()).some(
      (index) => index.name === "firebaseUid_1",
    ),
  );
});

test("index migration refuses an unexpected index definition instead of dropping it by name", async () => {
  const legacy = await isolatedIndexModels();
  await legacy.User.collection.createIndex(
    { role: 1 },
    { name: "firebaseUid_1" },
  );
  await assert.rejects(ensureIndexes(legacy), /Unexpected firebaseUid_1/);
  assert.ok(
    (await legacy.User.collection.indexes()).some(
      (index) => index.name === "firebaseUid_1",
    ),
  );
});

test("account deletion scrubs terminal records and removes credentials without allowing JWT-based profile recreation", async () => {
  const user = await models.User.create({
    email: "erase-me@example.test",
    name: "Erase Me",
    phone: "919876543210",
    passwordHash: fixtureHash,
    deletionRequestedAt: new Date(),
  });
  const token = tokenService(config).issue(user).token;
  const asset = await models.MediaAsset.create({
    owner: user._id,
    fileId: randomUUID(),
    filePath: "/private/delete.webp",
    purpose: "reference",
    private: true,
    mime: "image/webp",
    bytes: 200,
    references: 1,
  });
  const terminal = await seededOrder({
    owner: user._id,
    status: "delivered",
    preferenceLabelsHi: { neck: "खास गला" },
    timeline: [
      { status: "delivered", note: "Private update", noteHi: "निजी अपडेट" },
    ],
    referenceMediaIds: [asset._id],
    quotes: [
      {
        version: 1,
        notes: "private customer details",
        notesHi: "ग्राहक की निजी जानकारी",
        amountPaise: 100000,
        currency: "INR",
      },
    ],
    acceptedQuote: {
      version: 1,
      notes: "private customer details",
      notesHi: "ग्राहक की निजी जानकारी",
      amountPaise: 100000,
      currency: "INR",
    },
  });
  const result = await executeAccountDeletion(context, user);
  assert.equal(result.alreadyComplete, false);
  assert.equal(await models.User.findById(user._id), null);
  assert.equal(await models.MediaAsset.countDocuments({ owner: user._id }), 0);
  const history = await models.Order.findById(terminal._id);
  assert.notEqual(String(history.owner), String(user._id));
  assert.deepEqual(history.address, {});
  assert.equal(history.referenceMediaIds.length, 0);
  assert.equal(history.notes, "");
  assert.equal(history.quotes[0].notes, "");
  assert.equal(history.acceptedQuote.notes, "");
  assert.equal(history.quotes[0].notesHi, "");
  assert.equal(history.acceptedQuote.notesHi, "");
  assert.equal(history.timeline[0].noteHi, "");
  assert.deepEqual(history.preferenceLabelsHi, {});
  assert.equal(history.requestHash, "deleted");
  assert.equal((await auth("get", "/api/me", token)).status, 401);
  assert.equal(
    await models.User.countDocuments({ email: "erase-me@example.test" }),
    0,
  );
  assert.equal(
    (await executeAccountDeletion(context, user)).alreadyComplete,
    true,
  );
});

test("account deletion media failure leaves a disabled retryable account", async () => {
  const user = await models.User.create({
    email: "deletion-retry@example.test",
    passwordHash: fixtureHash,
    deletionRequestedAt: new Date(),
  });
  const asset = await models.MediaAsset.create({
    owner: user._id,
    fileId: randomUUID(),
    filePath: "/private/retry.webp",
    purpose: "reference",
    private: true,
    mime: "image/webp",
    bytes: 200,
  });
  let attempts = 0;
  const ctx = {
    ...context,
    images: {
      async remove() {
        attempts++;
        if (attempts === 1)
          throw new AppError(503, "MEDIA_PROVIDER_FAILURE", "Temporary outage");
      },
    },
  };
  await assert.rejects(executeAccountDeletion(ctx, user), {
    code: "MEDIA_PROVIDER_FAILURE",
  });
  const pending = await models.User.findById(user._id);
  assert.equal(pending.disabled, true);
  assert.ok(await models.MediaAsset.findById(asset._id));
  assert.equal(
    (await executeAccountDeletion(ctx, pending)).alreadyComplete,
    false,
  );
  assert.equal(await models.User.findById(user._id), null);
  assert.equal(await models.MediaAsset.findById(asset._id), null);
});

test("account deletion refuses active stitching requests before disabling the customer", async () => {
  const user = await models.User.create({
    email: "deletion-active@example.test",
    deletionRequestedAt: new Date(),
  });
  await seededOrder({ owner: user._id, status: "stitching" });
  await assert.rejects(executeAccountDeletion(context, user), {
    code: "ACTIVE_ORDERS",
  });
  assert.equal((await models.User.findById(user._id)).disabled, false);
});

test("an upload already in flight cannot attach private media after credential-account deletion", async () => {
  const user = await models.User.create({
    email: "deletion-upload@example.test",
    passwordHash: fixtureHash,
    deletionRequestedAt: new Date(),
  });
  const token = tokenService(config).issue(user).token;
  let signalStarted, finishUpload;
  const started = new Promise((resolve) => {
    signalStarted = resolve;
  });
  const release = new Promise((resolve) => {
    finishUpload = resolve;
  });
  blockedUpload = () => {
    signalStarted();
    return release;
  };
  const pending = auth("post", "/api/media", token)
    .field("purpose", "reference")
    .attach("file", png, "pending.png")
    .then((result) => result);
  await started;
  blockedUpload = null;
  try {
    await executeAccountDeletion(context, await models.User.findById(user._id));
  } finally {
    finishUpload();
  }
  assert.equal((await pending).status, 403);
  assert.equal(await models.MediaAsset.countDocuments({ owner: user._id }), 0);
  assert.equal(await models.User.findById(user._id), null);
});

test("Hindi catalogue fields are validated, publicly readable, searchable and preserved in request snapshots", async () => {
  const category = await auth("post", "/api/admin/categories", tokenAdmin)
    .send({
      name: "Bilingual category",
      nameHi: "खास श्रेणी",
      slug: "bilingual-category",
    })
    .expect(201);
  const option = await auth("post", "/api/admin/options", tokenAdmin)
    .send({
      name: "Bilingual neck",
      nameHi: "खास गला",
      kind: "neck",
      garments: ["kurti"],
    })
    .expect(201);
  const payload = adminDesign({
    title: "Bilingual embroidery",
    titleHi: "हिंदी खास कढ़ाई",
    descriptionHi: "आपकी पसंद से तैयार की जाने वाली सिलाई।",
    category: category.body.data._id,
    status: "published",
  });
  const created = await auth("post", "/api/admin/designs", tokenAdmin)
    .send(payload)
    .expect(201);
  const design = created.body.data;
  const detail = await request(app)
    .get("/api/designs/" + payload.slug)
    .expect(200);
  assert.equal(detail.body.data.titleHi, payload.titleHi);
  assert.equal(detail.body.data.descriptionHi, payload.descriptionHi);
  assert.equal(detail.body.data.title, payload.title);
  const search = await request(app)
    .get("/api/designs")
    .query({ search: "खास कढ़ाई" })
    .expect(200);
  assert.ok(search.body.data.some((item) => item._id === design._id));
  const categories = await request(app)
    .get("/api/categories?limit=50")
    .expect(200);
  assert.equal(
    categories.body.data.find((item) => item._id === category.body.data._id)
      .nameHi,
    "खास श्रेणी",
  );
  const options = await request(app).get("/api/options?limit=50").expect(200);
  assert.equal(
    options.body.data.find((item) => item._id === option.body.data._id).nameHi,
    "खास गला",
  );
  const payloadOrder = body();
  payloadOrder.designId = design._id;
  payloadOrder.preferences.neck = "Bilingual neck";
  const key = randomUUID();
  const receipt = await createOrder(payloadOrder, key).expect(201);
  assert.equal(receipt.body.data.designSnapshot.titleHi, payload.titleHi);
  assert.equal(receipt.body.data.preferenceLabelsHi.neck, "खास गला");
  assert.equal(receipt.body.data.preferences.neck, "Bilingual neck");
  await auth("patch", "/api/admin/designs/" + design._id, tokenAdmin)
    .send({
      ...payload,
      titleHi: "नई हिंदी जानकारी",
      revision: design.revision,
    })
    .expect(200);
  const replay = await createOrder(payloadOrder, key).expect(200);
  assert.equal(replay.body.data._id, receipt.body.data._id);
  assert.equal(replay.body.data.designSnapshot.titleHi, payload.titleHi);
  await auth("post", "/api/admin/designs", tokenAdmin)
    .send(adminDesign({ titleHi: "क".repeat(121) }))
    .expect(400);
});

test("Hindi website content and FAQ fields round trip without exposing admin-only settings", async () => {
  const current = await auth("get", "/api/admin/settings", tokenAdmin).expect(
    200,
  );
  const input = Object.fromEntries(
    [
      "businessName",
      "tagline",
      "whatsapp",
      "instagram",
      "contactEmail",
      "announcement",
      "about",
      "faqs",
      "bannerMediaId",
      "revision",
    ].map((key) => [key, current.body.data[key]]),
  );
  Object.assign(input, {
    taglineHi: "जहाँ कपड़ा बने कला।",
    announcementHi: "खास सिलाई, आपके लिए।",
    aboutHi: "आपकी पसंद के अनुसार सिलाई।",
    faqs: [
      {
        question: "Do you provide fabric?",
        answer: "Please bring your own fabric.",
        questionHi: "कपड़ा कौन देगा?",
        answerHi: "कृपया अपना कपड़ा साथ लाएँ।",
      },
    ],
  });
  await auth("patch", "/api/admin/settings", tokenAdmin)
    .send(input)
    .expect(200);
  const publicSettings = await request(app).get("/api/settings").expect(200);
  assert.equal(publicSettings.body.data.taglineHi, input.taglineHi);
  assert.equal(publicSettings.body.data.aboutHi, input.aboutHi);
  assert.equal(
    publicSettings.body.data.faqs[0].answerHi,
    input.faqs[0].answerHi,
  );
  assert.equal(publicSettings.body.data.revision, undefined);
  assert.equal(publicSettings.body.data.key, undefined);
});

test("Hindi quote and progress notes retain canonical workflow and integer prices", async () => {
  const created = await createOrder().expect(201);
  let order = created.body.data;
  let response = await auth(
    "patch",
    "/api/admin/orders/" + order._id + "/status",
    tokenAdmin,
  )
    .send({
      revision: order.revision,
      status: "under_review",
      note: "Review started.",
      noteHi: "अनुरोध की समीक्षा शुरू हुई।",
    })
    .expect(200);
  order = response.body.data;
  assert.equal(order.status, "under_review");
  assert.equal(order.timeline.at(-1).noteHi, "अनुरोध की समीक्षा शुरू हुई।");
  response = await auth(
    "post",
    "/api/admin/orders/" + order._id + "/quotes",
    tokenAdmin,
  )
    .send({
      revision: order.revision,
      amountPaise: 65025,
      deliveryDate: "2099-12-10",
      notes: "Embroidery included.",
      notesHi: "कढ़ाई की कीमत शामिल है।",
    })
    .expect(200);
  const quote = response.body.data.quotes.at(-1);
  assert.equal(quote.amountPaise, 65025);
  assert.equal(quote.notesHi, "कढ़ाई की कीमत शामिल है।");
  assert.equal(response.body.data.status, "quote_sent");
});

test("design boards expose labelled cropped previews, bilingual specifications and stitching price options", async () => {
  const media = await auth("post", "/api/media", tokenAdmin)
    .field("purpose", "catalogue")
    .attach("file", png, "design-board.png")
    .expect(201);
  const source = JSON.parse(
    readFileSync(
      new URL("../../client/src/data/teal-kurti.json", import.meta.url),
      "utf8",
    ),
  ).design;
  const id = media.body.data._id;
  const payload = {
    ...source,
    code: "BOARD-" + randomUUID().slice(0, 6),
    slug: "board-" + randomUUID().slice(0, 8),
    mediaIds: [id],
    coverMediaId: id,
    imageViews: source.imageViews.map((view) => ({ ...view, mediaId: id })),
    status: "published",
  };
  const created = await auth("post", "/api/admin/designs", tokenAdmin)
    .send(payload)
    .expect(201);
  const response = await request(app)
    .get("/api/designs/" + payload.slug)
    .expect(200);
  assert.equal(response.body.data.views.length, 7);
  assert.equal(response.body.data.views[0].label, "Front view");
  assert.equal(response.body.data.views[0].labelHi, "सामने से");
  assert.equal(response.body.data.coverView.label, "Front view");
  assert.equal(
    response.body.data.designDetails.back,
    "Keyhole with tie & tassel",
  );
  assert.deepEqual(
    response.body.data.priceOptions.map((row) => row.amountPaise),
    [30000, 40000, 45000, 55000],
  );
  assert.equal(response.body.data.priceOptions[3].isStartingPrice, true);
  assert.equal((await models.MediaAsset.findById(id)).references, 1);
  assert.ok(
    response.body.data.views.every((view) =>
      view.url.startsWith("https://images.example.test"),
    ),
  );
  const edited = await auth(
    "patch",
    "/api/admin/designs/" + created.body.data._id,
    tokenAdmin,
  )
    .send({
      ...payload,
      designDetails: { ...payload.designDetails, neck: "Custom neckline" },
      imageViews: payload.imageViews.slice().reverse(),
      revision: created.body.data.revision,
    })
    .expect(200);
  assert.equal(edited.body.data.designDetails.neck, "Custom neckline");
  const again = await request(app)
    .get("/api/designs/" + payload.slug)
    .expect(200);
  assert.equal(again.body.data.views[0].label, "Full design board");
});

test("design preview metadata rejects external sources, foreign media, invalid crops and misleading starting prices", async () => {
  const id = new mongoose.Types.ObjectId().toString();
  const view = {
    mediaId: id,
    label: "Front view",
    crop: { x: 0, y: 0, width: 25, height: 100 },
  };
  for (const change of [
    {
      mediaIds: [id],
      imageViews: [{ ...view, url: "https://untrusted.example/image.png" }],
    },
    { mediaIds: [], imageViews: [view] },
    {
      mediaIds: [id],
      imageViews: [{ ...view, crop: { x: 90, y: 0, width: 25, height: 100 } }],
    },
    {
      mediaIds: [id],
      imageViews: [{ ...view, crop: { x: 0, y: 0, width: 0, height: 100 } }],
    },
    {
      priceOptions: [{ label: "Basic", amountPaise: 30000 }],
      startingPricePaise: 20000,
    },
    { designDetails: { fabric: "x".repeat(301) } },
    {
      priceOptions: Array.from({ length: 7 }, () => ({
        label: "Basic",
        amountPaise: 65000,
      })),
    },
  ])
    await auth("post", "/api/admin/designs", tokenAdmin)
      .send(adminDesign(change))
      .expect(400);
  await auth("post", "/api/admin/designs", tokenA)
    .send(adminDesign({ imageViews: [] }))
    .expect(403);
});

test("operator board import creates one public catalogue asset and never overwrites an existing code", async () => {
  const template = JSON.parse(
    readFileSync(
      new URL("../../client/src/data/teal-kurti.json", import.meta.url),
      "utf8",
    ),
  );
  template.design.code = "IMP-" + randomUUID().slice(0, 8);
  template.design.slug = "import-" + randomUUID().slice(0, 8);
  const owner = await models.User.create({
    email: "board-import-" + randomUUID() + "@example.test",
    name: "Import operator",
    role: "admin",
    passwordHash: fixtureHash,
  });
  const result = await importDesignBoard(context, {
    template,
    buffer: png,
    ownerEmail: owner.email,
    publish: true,
  });
  assert.equal(result.created, true);
  assert.equal(result.design.status, "published");
  const asset = await models.MediaAsset.findById(result.design.coverMediaId);
  assert.equal(asset.private, false);
  assert.equal(asset.references, 1);
  assert.equal(asset.purpose, "catalogue");
  assert.equal(result.design.imageViews.length, 7);
  const again = await importDesignBoard(
    {
      ...context,
      images: {
        upload() {
          throw Error("Must not upload twice");
        },
      },
    },
    { template, buffer: png, ownerEmail: owner.email, publish: false },
  );
  assert.equal(again.created, false);
  assert.equal(String(again.design._id), String(result.design._id));
  assert.equal(again.design.status, "published");
});

test("operator board import compensates uploaded media if its database transaction fails", async () => {
  const template = JSON.parse(
    readFileSync(
      new URL("../../client/src/data/teal-kurti.json", import.meta.url),
      "utf8",
    ),
  );
  template.design.code = "FAIL-" + randomUUID().slice(0, 8);
  template.design.slug = "failed-import-" + randomUUID().slice(0, 8);
  const owner = await models.User.create({
    email: "failed-import-" + randomUUID() + "@example.test",
    role: "admin",
    passwordHash: fixtureHash,
  });
  let removed;
  const ctx = {
    ...context,
    images: {
      upload: async () => ({
        fileId: "compensate-board",
        filePath: "/public/board.webp",
      }),
      remove: async (id) => {
        removed = id;
      },
    },
    transaction: async () => {
      throw Error("Database unavailable");
    },
  };
  await assert.rejects(
    importDesignBoard(ctx, { template, buffer: png, ownerEmail: owner.email }),
    /Database unavailable/,
  );
  assert.equal(removed, "compensate-board");
  assert.equal(
    await models.Design.countDocuments({ code: template.design.code }),
    0,
  );
});

test("only administrators can attach the exact included board without ImageKit and unused references can be removed", async () => {
  await auth("post", "/api/media/presets/teal-kurti", tokenA)
    .send({})
    .expect(403);
  await auth("post", "/api/media/presets/teal-kurti", tokenAdmin)
    .send({ filePath: "/private/file.png" })
    .expect(400);
  const first = await auth("post", "/api/media/presets/teal-kurti", tokenAdmin)
    .send({})
    .expect(200);
  const again = await auth("post", "/api/media/presets/teal-kurti", tokenAdmin)
    .send({})
    .expect(200);
  assert.equal(first.body.data.storage, "bundled");
  assert.equal(first.body.data._id, again.body.data._id);
  const access = await auth(
    "get",
    "/api/media/" + first.body.data._id + "/access",
    tokenAdmin,
  ).expect(200);
  assert.equal(access.body.data.url, "/design-library/teal-kurti-board.png");
  assert.equal(access.body.data.width, 1536);
  providerFails = true;
  try {
    await auth("delete", "/api/media/" + first.body.data._id, tokenAdmin)
      .send({})
      .expect(200);
  } finally {
    providerFails = false;
  }
  assert.equal(await models.MediaAsset.findById(first.body.data._id), null);
});

test("the included board import verifies exact source bytes and works with no image provider", async () => {
  const template = JSON.parse(
    readFileSync(
      new URL("../../client/src/data/teal-kurti.json", import.meta.url),
      "utf8",
    ),
  );
  template.design.code = "BUNDLE-" + randomUUID().slice(0, 7);
  template.design.slug = "bundle-" + randomUUID().slice(0, 8);
  const buffer = readFileSync(
    new URL(
      "../../client/public/design-library/teal-kurti-board.png",
      import.meta.url,
    ),
  );
  const owner = await models.User.create({
    email: "bundled-" + randomUUID() + "@example.test",
    role: "admin",
    passwordHash: fixtureHash,
  });
  const ctx = {
    ...context,
    images: {
      upload() {
        throw Error("No cloud upload expected");
      },
      remove() {
        throw Error("No cloud deletion expected");
      },
      url() {
        throw Error("No cloud URL expected");
      },
    },
  };
  await assert.rejects(
    importDesignBoard(ctx, {
      template,
      buffer: png,
      ownerEmail: owner.email,
      bundled: true,
    }),
    (error) => error.code === "INVALID_BUNDLED_MEDIA",
  );
  const result = await importDesignBoard(ctx, {
    template,
    buffer,
    ownerEmail: owner.email,
    bundled: true,
    publish: true,
  });
  assert.equal(result.created, true);
  const asset = await models.MediaAsset.findById(result.design.coverMediaId);
  assert.equal(asset.storage, "bundled");
  assert.throws(
    () => mediaUrl({}, { ...asset.toObject(), private: true }),
    (error) => error.code === "INVALID_BUNDLED_MEDIA",
  );
  assert.throws(
    () => mediaUrl({}, { ...asset.toObject(), filePath: "/other-image.png" }),
    (error) => error.code === "INVALID_BUNDLED_MEDIA",
  );
  assert.equal(asset.mime, "image/png");
  assert.equal(asset.bytes, buffer.length);
  const response = await request(app)
    .get("/api/designs/" + template.design.slug)
    .expect(200);
  assert.equal(response.body.data.views.length, 7);
  assert.ok(
    response.body.data.views.every(
      (view) => view.url === "/design-library/teal-kurti-board.png",
    ),
  );
});

test("owned drafts are idempotent, preserve full data, and reject stale tabs and cross-customer access", async () => {
  const testApp = createApp(context);
  const api = (method, path, token = tokenA) => {
    const agent = request(testApp);
    return agent[method](path).set("Authorization", "Bearer " + token);
  };
  const clientId = randomUUID(),
    data = {
      garment: "kurti",
      notes: "Keep my choices",
      measurements: { unit: "in", values: { bust: 36 } },
      logistics: { outbound: { method: "collect" } },
    };
  const created = await api("post", "/api/drafts")
    .send({ clientId, data })
    .expect(201);
  const id = created.body.data._id;
  const replay = await api("post", "/api/drafts")
    .send({ clientId, data: { notes: "A retry must not overwrite" } })
    .expect(200);
  assert.equal(replay.body.data._id, id);
  assert.equal(replay.body.data.data.notes, "Keep my choices");
  await api("get", "/api/drafts/" + id, tokenB).expect(404);
  const updated = await api("patch", "/api/drafts/" + id)
    .send({ revision: 0, data: { ...data, notes: "Updated" } })
    .expect(200);
  assert.equal(updated.body.data.revision, 1);
  assert.equal(updated.body.data.data.measurements.values.bust, 36);
  await api("patch", "/api/drafts/" + id)
    .send({ revision: 0, data })
    .expect(409);
  await api("delete", "/api/drafts/" + id)
    .send({ revision: 1 })
    .expect(200);
  await api("get", "/api/drafts/" + id).expect(404);
});

test("cloud draft references enforce private ownership and retain media until the draft is deleted", async () => {
  const testApp = createApp(context),
    makeAsset = (owner) =>
      models.MediaAsset.create({
        owner,
        fileId: randomUUID(),
        filePath: "/khwab/private/test.webp",
        purpose: "reference",
        private: true,
        mime: "image/webp",
        bytes: 100,
        references: 0,
      });
  const own = await makeAsset(customer._id),
    foreign = await makeAsset(other._id);
  const post = (data) =>
    request(testApp)
      .post("/api/drafts")
      .set("Authorization", "Bearer " + tokenA)
      .send({ clientId: randomUUID(), data });
  await post({ referenceMediaIds: [String(foreign._id)] }).expect(400);
  const created = await post({ referenceMediaIds: [String(own._id)] }).expect(
    201,
  );
  assert.equal((await models.MediaAsset.findById(own._id)).references, 1);
  await request(testApp)
    .delete("/api/drafts/" + created.body.data._id)
    .set("Authorization", "Bearer " + tokenA)
    .send({ revision: 0 })
    .expect(200);
  assert.equal((await models.MediaAsset.findById(own._id)).references, 0);
});

test("successful submission finalizes only its owned draft and retries return the original trusted estimate", async () => {
  const testApp = createApp(context),
    token = "Bearer " + tokenA;
  const draft = await request(testApp)
    .post("/api/drafts")
    .set("Authorization", token)
    .send({ clientId: randomUUID(), data: body() })
    .expect(201);
  const payload = { ...body(), draftId: draft.body.data._id },
    key = randomUUID();
  const send = () =>
    request(testApp)
      .post("/api/orders")
      .set("Authorization", token)
      .set("Idempotency-Key", key)
      .send(payload);
  const created = await send().expect(201),
    replay = await send().expect(200);
  assert.equal(replay.body.data._id, created.body.data._id);
  assert.equal(created.body.data.estimate.estimatedTotalPaise, null);
  assert.equal(created.body.data.estimate.hasPending, true);
  const saved = await models.Draft.findById(payload.draftId);
  assert.equal(saved.status, "submitted");
  assert.equal(String(saved.orderId), created.body.data._id);
  await request(testApp)
    .patch("/api/drafts/" + payload.draftId)
    .set("Authorization", token)
    .send({ revision: saved.revision, data: body() })
    .expect(409);
});

test("visual option configuration exposes only public images, prices trusted records, and archives instead of deleting", async () => {
  const testApp = createApp(context),
    admin = (path) =>
      request(testApp)
        .post(path)
        .set("Authorization", "Bearer " + tokenAdmin);
  const ids = {};
  for (const kind of ["sleeve", "neck", "back"]) {
    const option = await admin("/api/admin/options")
      .send({
        name: "Verified " + kind,
        kind,
        garments: ["kurti"],
        active: true,
        description: "Configured design component",
        priceMode: "additional",
        amountPaise: 20000,
      })
      .expect(201);
    ids[kind] = option.body.data._id;
  }
  const designResult = await admin("/api/admin/designs")
    .send(adminDesign({ status: "published", defaultComponents: ids }))
    .expect(201);
  const payload = {
    garment: "kurti",
    quantity: 2,
    designId: designResult.body.data._id,
    configuration: {
      source: "catalogue",
      mode: "exact",
      components: {},
      addonIds: [],
    },
    logistics: {
      inbound: { method: "dropoff" },
      outbound: { method: "collect" },
    },
  };
  const estimate = await request(testApp)
    .post("/api/pricing/estimate")
    .send(payload)
    .expect(200);
  assert.equal(estimate.body.data.knownSubtotalPaise, 130000);
  assert.equal(estimate.body.data.estimatedTotalPaise, 130000);
  await request(testApp)
    .post("/api/pricing/estimate")
    .send({ ...payload, amountPaise: 1 })
    .expect(400);
  await request(testApp)
    .delete("/api/admin/options/" + ids.sleeve)
    .set("Authorization", "Bearer " + tokenAdmin)
    .send({ revision: 0 })
    .expect(200);
  const archived = await models.DesignOption.findById(ids.sleeve);
  assert.ok(archived);
  assert.equal(archived.active, false);
  const retained = await request(testApp)
    .post("/api/pricing/estimate")
    .send(payload)
    .expect(200);
  assert.equal(retained.body.data.knownSubtotalPaise, 130000);
});

async function securityFixture({ mail = true, deliveryFails = false } = {}) {
  const user = await models.User.create({
    email: "security-" + randomUUID() + "@example.test",
    name: "Security fixture",
    passwordHash: fixtureHash,
    role: "customer",
  });
  const sent = [];
  const testApp = createApp({
    ...context,
    config: {
      ...config,
      ...(mail
        ? {
            RESEND_API_KEY: "test-key-never-sent",
            EMAIL_FROM: "atelier@example.test",
            PUBLIC_WEB_URL: "http://localhost:5173",
          }
        : {}),
    },
    sendAccountAction: async (email, token, kind) => {
      if (deliveryFails) throw new Error("Fixture mail delivery failure");
      sent.push({ email, token, kind });
    },
  });
  const bearer = "Bearer " + tokenService(config).issue(user).token;
  return { user, sent, testApp, bearer };
}

test("authentication capabilities hide unsupported Google and recovery methods without configured mail", async () => {
  const { testApp } = await securityFixture({ mail: false });
  const capability = await request(testApp)
    .get("/api/auth/capabilities")
    .expect(200);
  assert.deepEqual(capability.body.data, {
    emailPassword: true,
    google: false,
    googleClientId: null,
    passwordRecovery: false,
    emailVerification: false,
  });
  await request(testApp)
    .post("/api/auth/recovery")
    .send({ email: "unknown@example.test" })
    .expect(503);
});

test("recovery responses do not disclose account existence and tokens are hashed, expire, and are single-use", async () => {
  const { testApp, user, sent, bearer } = await securityFixture();
  const recover = (email) =>
    request(testApp).post("/api/auth/recovery").send({ email });
  const eligible = await recover(user.email).expect(200),
    absent = await recover("absent-" + randomUUID() + "@example.test").expect(
      200,
    );
  assert.deepEqual(eligible.body, absent.body);
  assert.equal(sent.length, 1);
  assert.equal(eligible.body.token, undefined);
  const action = await models.PasswordAction.findOne({
    owner: user._id,
    kind: "reset",
  });
  assert.notEqual(action.tokenHash, sent[0].token);
  assert.match(action.tokenHash, /^[a-f\d]{64}$/);
  await models.PasswordAction.updateOne(
    { _id: action._id },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  await request(testApp)
    .post("/api/auth/reset")
    .send({ token: sent[0].token, password: "A new secure password 2026!" })
    .expect(400);
  await recover(user.email).expect(200);
  const token = sent.at(-1).token;
  await request(testApp)
    .post("/api/auth/reset")
    .send({ token, password: "A new secure password 2026!", role: "admin" })
    .expect(400);
  const reset = await request(testApp)
    .post("/api/auth/reset")
    .send({ token, password: "A new secure password 2026!" })
    .expect(200);
  assert.equal(reset.body.data.reauthenticationRequired, true);
  await request(testApp)
    .post("/api/auth/reset")
    .send({ token, password: "Another secure password 2026!" })
    .expect(400);
  await request(testApp)
    .get("/api/me")
    .set("Authorization", bearer)
    .expect(401);
  await request(testApp)
    .post("/api/auth/login")
    .send({ email: user.email, password: fixturePassword })
    .expect(401);
  await request(testApp)
    .post("/api/auth/login")
    .send({ email: user.email, password: "A new secure password 2026!" })
    .expect(200);
  assert.equal((await models.User.findById(user._id)).role, "customer");
});

test("password change requires current control and revokes the previous session and reset links", async () => {
  const { testApp, user, bearer, sent } = await securityFixture();
  await request(testApp)
    .post("/api/auth/recovery")
    .send({ email: user.email })
    .expect(200);
  const change = (payload) =>
    request(testApp)
      .post("/api/auth/password")
      .set("Authorization", bearer)
      .send(payload);
  await change({
    currentPassword: "Incorrect existing password",
    password: "A changed password 2026!",
  }).expect(401);
  await request(testApp)
    .get("/api/me")
    .set("Authorization", bearer)
    .expect(200);
  await change({
    currentPassword: fixturePassword,
    password: "A changed password 2026!",
    role: "admin",
  }).expect(400);
  await change({
    currentPassword: fixturePassword,
    password: "A changed password 2026!",
  }).expect(200);
  await request(testApp)
    .get("/api/me")
    .set("Authorization", bearer)
    .expect(401);
  await request(testApp)
    .post("/api/auth/reset")
    .send({ token: sent[0].token, password: "A second changed password 2026!" })
    .expect(400);
  await request(testApp)
    .post("/api/auth/login")
    .send({ email: user.email, password: "A changed password 2026!" })
    .expect(200);
});

test("email verification proves the current account email and profile updates preserve verified status", async () => {
  const { testApp, user, bearer, sent } = await securityFixture();
  await request(testApp)
    .post("/api/auth/verification")
    .set("Authorization", bearer)
    .send({ owner: other._id })
    .expect(400);
  await request(testApp)
    .post("/api/auth/verification")
    .set("Authorization", bearer)
    .send({})
    .expect(200);
  assert.equal(sent[0].email, user.email);
  assert.equal(sent[0].kind, "verify");
  await request(testApp)
    .post("/api/auth/reset")
    .send({ token: sent[0].token, password: "A reset using wrong action!" })
    .expect(400);
  await request(testApp)
    .post("/api/auth/verify")
    .send({ token: sent[0].token })
    .expect(200);
  await request(testApp)
    .post("/api/auth/verify")
    .send({ token: sent[0].token })
    .expect(400);
  const profile = await request(testApp)
    .get("/api/me")
    .set("Authorization", bearer)
    .expect(200);
  assert.equal(profile.body.data.emailVerified, true);
  const updated = await request(testApp)
    .patch("/api/me")
    .set("Authorization", bearer)
    .send({ name: "Verified customer" })
    .expect(200);
  assert.equal(updated.body.data.emailVerified, true);
  const identity = await request(testApp)
    .get("/api/account/identity")
    .set("Authorization", bearer)
    .expect(200);
  assert.deepEqual(identity.body.data.methods, ["password"]);
});

test("failed email delivery leaves no usable action and recovery retains its generic response", async () => {
  const { testApp, user, bearer } = await securityFixture({
    deliveryFails: true,
  });
  await request(testApp)
    .post("/api/auth/recovery")
    .send({ email: user.email })
    .expect(200);
  assert.equal(
    await models.PasswordAction.countDocuments({ owner: user._id }),
    0,
  );
  await request(testApp)
    .post("/api/auth/verification")
    .set("Authorization", bearer)
    .send({})
    .expect(503);
  assert.equal(
    await models.PasswordAction.countDocuments({ owner: user._id }),
    0,
  );
});

test("concurrent password-reset consumption has exactly one winner", async () => {
  const { testApp, user, sent } = await securityFixture();
  await request(testApp)
    .post("/api/auth/recovery")
    .send({ email: user.email })
    .expect(200);
  const reset = () =>
    request(testApp).post("/api/auth/reset").send({
      token: sent[0].token,
      password: "A concurrent reset password 2026!",
    });
  const results = await Promise.all([reset(), reset()]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
  assert.equal((await models.User.findById(user._id)).authVersion, 1);
});

test("structured final quote line totals and per-garment quantities are validated and snapshotted", async () => {
  const testApp = createApp(context),
    order = await seededOrder({ status: "under_review", quantity: 2 });
  const send = (payload) =>
    request(testApp)
      .post("/api/admin/orders/" + order._id + "/quotes")
      .set("Authorization", "Bearer " + tokenAdmin)
      .send(payload);
  const quote = {
    revision: 0,
    amountPaise: 150000,
    deliveryDate: "2099-12-01",
    notes: "Confirmed work",
    lineItems: [
      {
        label: "Stitching for two garments",
        amountPaise: 130000,
        scope: "garment",
        quantity: 2,
      },
      {
        label: "Inbound fabric transport",
        amountPaise: 20000,
        scope: "shipment",
        quantity: 1,
      },
    ],
  };
  await send({ ...quote, amountPaise: 140000 }).expect(400);
  await send({
    ...quote,
    lineItems: [{ ...quote.lineItems[0], quantity: 1 }, quote.lineItems[1]],
  }).expect(400);
  const saved = await send(quote).expect(200);
  assert.deepEqual(saved.body.data.quotes.at(-1).lineItems, quote.lineItems);
  const accepted = await request(testApp)
    .post("/api/orders/" + order._id + "/quote-response")
    .set("Authorization", "Bearer " + tokenA)
    .send({
      revision: saved.body.data.revision,
      quoteVersion: 1,
      decision: "accept",
    })
    .expect(200);
  assert.deepEqual(accepted.body.data.acceptedQuote.lineItems, quote.lineItems);
  await send({ ...quote, revision: accepted.body.data.revision }).expect(409);
});

test("admin fulfilment records genuine separate transport details without advancing stitching or changing accepted pricing", async () => {
  const testApp = createApp(context),
    acceptedQuote = { version: 1, amountPaise: 65000, currency: "INR" },
    order = await seededOrder({ status: "customer_accepted", acceptedQuote });
  const path = "/api/admin/orders/" + order._id + "/fulfilment",
    payload = {
      revision: 0,
      inboundStatus: "confirmed",
      outboundStatus: "awaiting_confirmation",
      trackingUrl: "https://courier.example.test/track/ABC",
      estimatedCompletionDate: "2099-12-01",
      delayNote: "Fabric inspection is scheduled",
      alterationMargin: {
        confirmed: true,
        description: "Available margin confirmed after inspecting this garment",
        exceptions: "Delicate fabric limits the margin",
      },
      outboundReconfirmedAt: null,
    };
  await request(testApp)
    .patch(path)
    .set("Authorization", "Bearer " + tokenA)
    .send(payload)
    .expect(403);
  await request(testApp)
    .patch(path)
    .set("Authorization", "Bearer " + tokenAdmin)
    .send({ ...payload, amountPaise: 1 })
    .expect(400);
  const result = await request(testApp)
    .patch(path)
    .set("Authorization", "Bearer " + tokenAdmin)
    .send(payload)
    .expect(200);
  assert.equal(result.body.data.status, "customer_accepted");
  assert.deepEqual(result.body.data.acceptedQuote, acceptedQuote);
  assert.equal(result.body.data.fulfilment.history.length, 1);
  await request(testApp)
    .patch(path)
    .set("Authorization", "Bearer " + tokenAdmin)
    .send(payload)
    .expect(409);
  const cleared = await request(testApp)
    .patch(path)
    .set("Authorization", "Bearer " + tokenAdmin)
    .send({ revision: 1, trackingUrl: "", estimatedCompletionDate: "" })
    .expect(200);
  assert.equal(cleared.body.data.fulfilment.estimatedCompletionDate, null);
});

function googleFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    }),
    clientId = "fixture-client.apps.googleusercontent.com",
    kid = "fixture-google-key";
  const testApp = createApp({
    ...context,
    config: { ...config, GOOGLE_CLIENT_ID: clientId },
    googleJwks: async () => ({
      keys: [
        {
          ...publicKey.export({ format: "jwk" }),
          kid,
          alg: "RS256",
          use: "sig",
        },
      ],
      maxAgeSeconds: 3600,
    }),
  });
  const sign = (email, sub = randomUUID()) =>
    jwt.sign(
      {
        sub,
        email,
        email_verified: true,
        name: "Google fixture",
        role: "admin",
      },
      privateKey,
      {
        algorithm: "RS256",
        keyid: kid,
        audience: clientId,
        issuer: "https://accounts.google.com",
        expiresIn: 3600,
      },
    );
  return { testApp, sign };
}
test("Google creates and reuses one customer identity with the same local sessions and provider-only password guidance", async () => {
  const { testApp, sign } = googleFixture(),
    email = "google-" + randomUUID() + "@gmail.com",
    credential = sign(email),
    login = () =>
      request(testApp).post("/api/auth/google").send({ credential });
  const result = await login().expect(200),
    replay = await login().expect(200),
    user = result.body.data.user;
  assert.equal(user._id, replay.body.data.user._id);
  assert.equal(user.role, "customer");
  assert.equal(user.emailVerified, true);
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.emailReservation, undefined);
  const bearer = "Bearer " + result.body.data.token;
  await request(testApp)
    .get("/api/me")
    .set("Authorization", bearer)
    .expect(200);
  const identity = await request(testApp)
    .get("/api/account/identity")
    .set("Authorization", bearer)
    .expect(200);
  assert.deepEqual(identity.body.data.methods, ["google"]);
  await request(testApp)
    .post("/api/auth/password")
    .set("Authorization", bearer)
    .send({
      currentPassword: fixturePassword,
      password: "A new provider-only password!",
    })
    .expect(401);
  await request(testApp)
    .get("/api/admin/dashboard")
    .set("Authorization", bearer)
    .expect(403);
});
test("Google email collision never claims an existing account; linking requires its current password", async () => {
  const { testApp, sign } = googleFixture(),
    user = await models.User.create({
      name: "Existing local",
      email: "link-" + randomUUID() + "@gmail.com",
      passwordHash: fixtureHash,
      role: "customer",
    }),
    credential = sign(user.email),
    bearer = "Bearer " + tokenService(config).issue(user).token;
  await request(testApp)
    .post("/api/auth/google")
    .send({ credential })
    .expect(409);
  const link = (payload) =>
    request(testApp)
      .post("/api/auth/google/link")
      .set("Authorization", bearer)
      .send(payload);
  await link({ credential, currentPassword: "Wrong existing password" }).expect(
    401,
  );
  await link({
    credential: sign("someone-else@gmail.com"),
    currentPassword: fixturePassword,
  }).expect(409);
  await link({ credential, currentPassword: fixturePassword }).expect(200);
  const signin = await request(testApp)
    .post("/api/auth/google")
    .send({ credential })
    .expect(200);
  assert.equal(signin.body.data.user._id, String(user._id));
  const identity = await request(testApp)
    .get("/api/account/identity")
    .set("Authorization", bearer)
    .expect(200);
  assert.deepEqual(identity.body.data.methods, ["password", "google"]);
  assert.equal(await models.User.countDocuments({ email: user.email }), 1);
});
test("concurrent Google and local registration reserve one email without creating duplicate owners", async () => {
  const { testApp, sign } = googleFixture(),
    email = "race-google-" + randomUUID() + "@gmail.com";
  const results = await Promise.all([
    request(testApp)
      .post("/api/auth/google")
      .send({ credential: sign(email) }),
    request(testApp)
      .post("/api/auth/register")
      .send({ email, name: "Concurrent local", password: fixturePassword }),
  ]);
  assert.equal(
    results.filter((result) => result.status >= 200 && result.status < 300)
      .length,
    1,
  );
  assert.ok(results.some((result) => result.status === 409));
  assert.equal(await models.User.countDocuments({ email }), 1);
});

test("draft reference writes fence new options and guides while retaining unchanged stale choices", async () => {
  const testApp = createApp(context), bearer = "Bearer " + tokenA;
  const option = await models.DesignOption.create({ name: "Referenced sleeve", kind: "sleeve", garments: ["kurti"], active: true });
  const guide = await models.MeasurementGuide.create({ code: "DRAFT-GUIDE-" + randomUUID().slice(0,8).toUpperCase(), name: "Saved guide", garment: "kurti", method: "body", language: "en", status: "draft" });
  const data = { configuration: { components: { sleeve: { source: "option", optionId: String(option._id) } } }, measurements: { guideIds: [String(guide._id)] } };
  const created = await request(testApp).post("/api/drafts").set("Authorization", bearer).send({ clientId: randomUUID(), data }).expect(201);
  assert.equal((await models.DesignOption.findById(option._id)).referenceFence, 1);
  assert.equal((await models.MeasurementGuide.findById(guide._id)).referenceFence, 1);
  await request(testApp).post("/api/drafts").set("Authorization", bearer).send({ clientId: randomUUID(), data: { configuration: { addonIds: ["f".repeat(24)] } } }).expect(409);
  const stale = await models.Draft.create({ owner: customer._id, clientId: randomUUID(), data: { configuration: { addonIds: ["e".repeat(24)] } } });
  await request(testApp).patch("/api/drafts/" + stale._id).set("Authorization", bearer).send({ revision: 0, data: { ...stale.data, notes: "Keep my recoverable choices" } }).expect(200);
  await request(testApp).delete("/api/admin/measurement-guides/" + guide._id).set("Authorization", "Bearer " + tokenAdmin).send({ revision: 0, permanent: true }).expect(409);
  assert.ok(created.body.data._id);
});

test("permanent deletion retries its stale snapshot when a concurrent draft adds an option reference", async () => {
  const testApp = createApp(context), option = await models.DesignOption.create({ name: "Concurrent reference", kind: "neck", garments: ["kurti"], active: true });
  const originalDelete = models.DesignOption.deleteOne;
  let releaseDelete, reachedDelete, intercepted = false;
  const barrier = new Promise(resolve => { releaseDelete = resolve; }), reached = new Promise(resolve => { reachedDelete = resolve; });
  models.DesignOption.deleteOne = async function (filter, ...args) {
    if (String(filter._id) === String(option._id) && !intercepted) { intercepted = true; reachedDelete(); await barrier; }
    return originalDelete.call(this, filter, ...args);
  };
  try {
    const deleting = request(testApp).delete("/api/admin/options/" + option._id + "/permanent").set("Authorization", "Bearer " + tokenAdmin).send({ revision: 0 }).then(response => response);
    await reached;
    const saved = await request(testApp).post("/api/drafts").set("Authorization", "Bearer " + tokenA).send({ clientId: randomUUID(), data: { configuration: { components: { neck: { source: "option", optionId: String(option._id) } } } } });
    releaseDelete();
    assert.equal(saved.status, 201); assert.equal((await deleting).status, 409);
    assert.ok(await models.DesignOption.findById(option._id));
  } finally { releaseDelete(); models.DesignOption.deleteOne = originalDelete; }
});

test("submitted guide snapshots and their original public images survive guide replacement", async () => {
  const testApp = createApp(context);
  const images = await models.MediaAsset.create([1, 2].map(index => ({ owner: customer._id, fileId: randomUUID(), filePath: "/khwab/public/snapshot-guide-" + index + ".webp", purpose: "catalogue", private: false, mime: "image/webp", bytes: 100, width: 300, height: 400, references: 0 })));
  const payload = { code: "SNAP-GUIDE-" + randomUUID().slice(0, 8).toUpperCase(), name: "Body guide", garment: "kurti", method: "body", language: "en", instructions: "Original body instructions", measurementFields: ["bust"], imageMediaIds: [String(images[0]._id)], status: "published", displayOrder: 1 };
  const guide = await request(testApp).post("/api/admin/measurement-guides").set("Authorization", "Bearer " + tokenAdmin).send(payload).expect(201);
  const input = body(); input.measurements.guideIds = [guide.body.data._id];
  const order = await request(testApp).post("/api/orders").set("Authorization", "Bearer " + tokenA).set("Idempotency-Key", randomUUID()).send(input).expect(201);
  assert.equal(order.body.data.publicMediaPins, undefined);
  await request(testApp).patch("/api/admin/measurement-guides/" + guide.body.data._id).set("Authorization", "Bearer " + tokenAdmin).send({ ...payload, revision: 0, instructions: "Updated instructions", imageMediaIds: [String(images[1]._id)] }).expect(200);
  const snapshot = (await models.Order.findById(order.body.data._id)).guideSnapshots[0];
  assert.equal(snapshot.instructions, "Original body instructions"); assert.deepEqual(snapshot.imageMediaIds, [String(images[0]._id)]);
  assert.equal((await models.MediaAsset.findById(images[0]._id)).references, 1);
});

test("account erasure releases separate public option and guide pins exactly once and removes private snapshot context", async () => {
  const user = await models.User.create({ name: "Snapshot erasure", email: "snapshot-delete-" + randomUUID() + "@example.test", passwordHash: fixtureHash, role: "customer", deletionRequestedAt: new Date() });
  const image = await models.MediaAsset.create({ owner: other._id, fileId: randomUUID(), filePath: "/khwab/public/shared-snapshot.webp", purpose: "catalogue", private: false, mime: "image/webp", bytes: 100, references: 3 });
  const order = await models.Order.create({ ...body(), owner: user._id, orderNumber: "DELETE-" + randomUUID(), idempotencyKey: randomUUID(), requestHash: "fixture", status: "delivered", estimate: { components: { neck: { imageMediaIds: [String(image._id)] } }, addons: [] }, guideSnapshots: [{ imageMediaIds: [String(image._id)], instructions: "Original instructions" }], publicMediaPins: { optionImages: [String(image._id)], guideImages: [String(image._id)] }, designSnapshot: { code: "HISTORICAL", components: { sleeve: { source: "reference", notes: "Private customer note", referenceMediaId: "a".repeat(24) } } } });
  await executeAccountDeletion(context, user);
  const erased = await models.Order.findById(order._id);
  assert.equal((await models.MediaAsset.findById(image._id)).references, 1);
  assert.equal(erased.guideSnapshots, undefined); assert.equal(erased.publicMediaPins, undefined);
  assert.deepEqual(erased.designSnapshot.components, {});
  assert.equal((await executeAccountDeletion(context, user)).alreadyComplete, true);
  assert.equal((await models.MediaAsset.findById(image._id)).references, 1);
});


test("production rate limits share persisted buckets across API instances and critical indexes exist", async()=>{
  await assertDeploymentIndexes(models);
  const make=()=>{const app=express();app.set("trust proxy",false);app.get("/limited",rateLimitFor({...context,config:{...config,NODE_ENV:"production"}},"cross-instance-test",{windowMs:60000,limit:3,standardHeaders:"draft-8",legacyHeaders:false}),(req,res)=>res.json({ok:true}));return app;};
  const first=make(), second=make();
  const responses=await Promise.all([request(first).get("/limited"),request(second).get("/limited"),request(first).get("/limited"),request(second).get("/limited")]);
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,200,200,429]);
  assert.equal((await request(make()).get("/limited")).status,429);
  const stored=await models.RequestLimit.find({}).lean();
  assert.ok(stored.length>0);assert.ok(stored.every(record=>/^[a-f0-9]{64}$/.test(record.key)));
});


test("a valid session survives a fresh application and database connection with the same signing configuration", async()=>{
  const user=await models.User.create({email:"restart-"+randomUUID()+"@example.test",name:"Restart fixture",passwordHash:fixtureHash});
  const token=tokenService(config).issue(user).token;
  assert.equal((await auth("get","/api/me",token)).status,200);
  const fresh=await mongoose.createConnection(process.env.TEST_MONGODB_URI||repl.getUri(),{dbName:testDatabaseName,autoIndex:false,bufferCommands:false}).asPromise();
  try {
    const nextModels=createModels(fresh);
    const nextApp=createApp({...context,models:nextModels,dbReady:()=>fresh.readyState===1});
    const response=await request(nextApp).get("/api/me").set("Authorization","Bearer "+token);
    assert.equal(response.status,200);assert.equal(response.body.data._id,String(user._id));assert.equal(response.body.data.passwordHash,undefined);
    await nextModels.User.updateOne({_id:user._id},{$inc:{authVersion:1}});
    assert.equal((await request(nextApp).get("/api/me").set("Authorization","Bearer "+token)).status,401);
  } finally { await fresh.close(); }
});
