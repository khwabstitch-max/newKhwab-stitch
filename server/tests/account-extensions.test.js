import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createModels, transaction } from "../src/models.js";
import { authentication, tokenService } from "../src/auth.js";
import { errorHandler } from "../src/errors.js";
import { accountRoutes } from "../src/routes-account.js";
import { supportRoutes } from "../src/routes-support.js";
import { workerRoutes } from "../src/routes-workers.js";
import { reviewRoutes } from "../src/routes-reviews.js";
import {
  serviceRoutes,
  assertOrderServiceEnabled,
} from "../src/routes-services.js";
import { proposalRoutes } from "../src/routes-proposals.js";
import { cleanupExtensionAccount } from "../src/extension-cleanup.js";

let repl,
  connection,
  models,
  app,
  context,
  alice,
  bob,
  admin,
  tokenA,
  tokenB,
  tokenAdmin;
const testDatabaseName = "khwab-extensions-" + randomUUID().replaceAll("-", "").slice(0, 20);
const auth = (method, path, token = tokenA) => {
  const agent = request(app);
  return agent[method](path).set("Authorization", "Bearer " + token);
};
const ticketBody = (overrides = {}) => ({
  clientId: randomUUID(),
  kind: "assistance",
  category: "measurement",
  subject: "Help with measurements",
  description: "Please explain how to measure the shoulder.",
  contextShared: false,
  context: { step: "measurements", garment: "kurti" },
  ...overrides,
});
const applicationBody = (overrides = {}) => ({
  clientId: randomUUID(),
  name: "Test applicant",
  phone: "9876543210",
  city: "Delhi",
  skills: ["stitching"],
  garments: ["kurti"],
  experience: "Five years",
  availability: "Weekdays",
  capacity: "Two garments",
  equipment: "Sewing machine",
  introduction: "This is an automated test application.",
  portfolioMediaIds: [],
  termsVersion: "application-consent-v1",
  ...overrides,
});
async function seedOrder(owner = alice._id, overrides = {}) {
  return models.Order.create({
    owner,
    orderNumber: "TEST-" + randomUUID(),
    idempotencyKey: randomUUID(),
    requestHash: "test",
    garment: "kurti",
    quantity: 1,
    measurements: { unit: "in", method: "body", values: { bust: 36 } },
    preferences: {},
    customer: { name: "Private customer", phone: "919876543210" },
    address: { line1: "Private address" },
    fabricAcknowledged: true,
    designSnapshot: {
      title: "Test design",
      code: "TEST",
      startingPricePaise: 90000,
    },
    ...overrides,
  });
}
before(
  async () => {
    if (process.env.NODE_ENV === "production")
      throw new Error("Refusing tests in production.");
    if (process.env.TEST_MONGODB_URI && process.env.ALLOW_EXTERNAL_TEST_DATABASE !== "true") throw Error("External tests require explicit disposable database authorization.");
    if (!process.env.TEST_MONGODB_URI) repl = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    connection = await mongoose
      .createConnection(process.env.TEST_MONGODB_URI || repl.getUri(), {
        dbName: testDatabaseName,
        autoIndex: true,
        bufferCommands: false,
      })
      .asPromise();
    models = createModels(connection);
    await Promise.all(Object.values(models).map((model) => model.init()));
    [alice, bob, admin] = await models.User.create([
      {
        email: "extension-a@example.test",
        name: "Test A",
        passwordHash: "test-fixture-not-a-login-hash",
      },
      {
        email: "extension-b@example.test",
        name: "Test B",
        passwordHash: "test-fixture-not-a-login-hash",
      },
      {
        email: "extension-admin@example.test",
        name: "Test admin",
        role: "admin",
        passwordHash: "test-fixture-not-a-login-hash",
      },
    ]);
    const config = { JWT_SECRET: randomBytes(64).toString("base64url") };
    const tokens = tokenService(config);
    [tokenA, tokenB, tokenAdmin] = [alice, bob, admin].map(
      (user) => tokens.issue(user).token,
    );
    context = {
      models,
      config,
      transaction: (work) => transaction(work, connection),
      images: {
        url: (path) => "https://private.example.test" + path + "?signed=test",
      },
      limitHandler: (_req, res) =>
        res.status(429).json({ error: { code: "RATE_LIMITED" } }),
    };
    app = express();
    app.use(express.json());
    const authenticate = authentication(context);
    accountRoutes(app, context, authenticate);
    supportRoutes(app, context, authenticate);
    workerRoutes(app, context, authenticate);
    reviewRoutes(app, context, authenticate);
    serviceRoutes(app, context, authenticate);
    proposalRoutes(app, context, authenticate);
    app.use(errorHandler);
  },
  { timeout: 120000 },
);
after(async () => {
  if (connection?.readyState === 1) {
    if (connection.name !== testDatabaseName || !/^khwab-extensions-[a-f0-9]{20}$/.test(connection.name)) throw new Error("Refusing cleanup outside the exact random extension test database.");
    await connection.dropDatabase();
  }
  await connection?.close();
  await repl?.stop();
});

test("application drafts accept incomplete fields, remain private, and require full validation before submission", async () => {
  const created = await auth("post", "/api/applications").send({
    clientId: randomUUID(),
    name: "",
    status: "draft",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, "draft");
  const id = created.body.data._id;
  assert.equal(
    (await auth("get", "/api/applications/" + id, tokenB)).status,
    404,
  );
  assert.equal(
    (
      await auth("patch", "/api/admin/applications/" + id, tokenAdmin).send({
        revision: 0,
        status: "approved",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await auth("patch", "/api/applications/" + id).send({
        revision: 0,
        status: "submitted",
        name: "",
      })
    ).status,
    400,
  );
  const { clientId: _key, ...complete } = applicationBody();
  void _key;
  const submitted = await auth("patch", "/api/applications/" + id).send({
    ...complete,
    revision: 0,
    status: "submitted",
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.data.status, "submitted");
  assert.equal(
    (
      await auth("patch", "/api/applications/" + id).send({
        ...complete,
        revision: 0,
        status: "submitted",
      })
    ).status,
    200,
  );
});
test("account preferences reject role escalation and preserve submitted order addresses", async () => {
  const order = await seedOrder();
  assert.equal(
    (
      await auth("patch", "/api/account/preferences").send({
        revision: 0,
        addresses: [],
        communications: { orderUpdates: true, marketing: false },
        role: "admin",
      })
    ).status,
    400,
  );
  const saved = await auth("patch", "/api/account/preferences").send({
    revision: 0,
    addresses: [
      {
        id: randomUUID(),
        label: "Home",
        line1: "New saved address",
        line2: "",
        city: "Delhi",
        state: "Delhi",
        pin: "110001",
      },
    ],
    communications: { orderUpdates: true, marketing: false },
  });
  assert.equal(saved.status, 200);
  assert.equal(
    (await models.Order.findById(order._id)).address.line1,
    "Private address",
  );
  assert.equal(
    (
      await auth("patch", "/api/account/preferences").send({
        revision: 0,
        addresses: [],
        communications: { orderUpdates: true, marketing: false },
      })
    ).status,
    409,
  );
});
test("saved measurement profiles are private, versioned and independent of order snapshots", async () => {
  const order = await seedOrder();
  const body = {
    name: "My kurti",
    garments: ["kurti"],
    unit: "in",
    method: "body",
    values: { bust: 36, sleeveLength: 18 },
    notes: "",
  };
  const created = await auth("post", "/api/measurements").send(body);
  assert.equal(created.status, 201);
  assert.equal(
    (await auth("get", "/api/measurements", tokenB)).body.data.length,
    0,
  );
  assert.equal(
    (
      await auth(
        "patch",
        "/api/measurements/" + created.body.data._id,
        tokenB,
      ).send({ ...body, revision: 0 })
    ).status,
    404,
  );
  assert.equal(
    (
      await auth("patch", "/api/measurements/" + created.body.data._id).send({
        ...body,
        values: { bust: 40 },
        revision: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (await models.Order.findById(order._id)).measurements.values.bust,
    36,
  );
});
test("ticket submission is idempotent, owner-scoped and gives an automated receipt only", async () => {
  const body = ticketBody();
  const created = await auth("post", "/api/support").send(body);
  assert.equal(created.status, 201);
  const ticket = created.body.data;
  assert.deepEqual(ticket.context, {});
  assert.equal(ticket.status, "open");
  assert.equal(ticket.firstHumanResponseAt, undefined);
  assert.equal(ticket.responseDueAt, null);
  assert.equal(
    (await auth("post", "/api/support").send(body)).body.data._id,
    ticket._id,
  );
  assert.equal(
    (
      await auth("post", "/api/support").send({
        ...body,
        description: "Different request with reused key",
      })
    ).status,
    409,
  );
  assert.equal(
    (await auth("get", "/api/support/" + ticket._id, tokenB)).status,
    404,
  );
});
test("messages check participants on each read and write and retries do not duplicate", async () => {
  const created = await auth("post", "/api/support").send(ticketBody());
  const conversationId = created.body.data.conversationId;
  const path = "/api/conversations/" + conversationId + "/messages";
  assert.equal((await auth("get", path, tokenB)).status, 404);
  assert.equal(
    (
      await auth("post", path, tokenB).send({
        clientId: randomUUID(),
        text: "Unauthorized",
      })
    ).status,
    404,
  );
  const body = {
    clientId: randomUUID(),
    text: "Please help with this measurement.",
  };
  const first = await auth("post", path).send(body);
  assert.equal(first.status, 201);
  assert.equal(
    (await auth("post", path).send(body)).body.data._id,
    first.body.data._id,
  );
  assert.equal(
    await models.Message.countDocuments({ conversation: conversationId }),
    1,
  );
  assert.equal(
    (await auth("post", path).send({ ...body, text: "Changed content" }))
      .status,
    409,
  );
});
test("human response timestamps and acknowledgement never automatically resolve a complaint", async () => {
  const created = await auth("post", "/api/support").send(
    ticketBody({ kind: "complaint" }),
  );
  const ticket = created.body.data;
  await auth(
    "post",
    "/api/conversations/" + ticket.conversationId + "/messages",
    tokenAdmin,
  ).send({
    clientId: randomUUID(),
    text: "We will review the confirmed details.",
  });
  let current = await models.SupportTicket.findById(ticket._id);
  assert.ok(current.firstHumanResponseAt);
  assert.equal(current.status, "open");
  assert.equal(
    (
      await auth(
        "patch",
        "/api/support/" + ticket._id + "/status",
        tokenAdmin,
      ).send({
        revision: 0,
        status: "acknowledged",
        note: "Received by a staff member",
      })
    ).status,
    200,
  );
  current = await models.SupportTicket.findById(ticket._id);
  assert.equal(current.status, "acknowledged");
});
test("private support attachments require an authorized participant", async () => {
  const media = await models.MediaAsset.create({
    owner: alice._id,
    fileId: randomUUID(),
    filePath: "/private/test.webp",
    private: true,
    purpose: "reference",
    mime: "image/webp",
    bytes: 10,
  });
  const created = await auth("post", "/api/support").send(
    ticketBody({ attachmentIds: [String(media._id)] }),
  );
  const path =
    "/api/conversations/" +
    created.body.data.conversationId +
    "/attachments/" +
    media._id;
  assert.equal((await auth("get", path)).status, 200);
  assert.equal((await auth("get", path, tokenB)).status, 404);
  assert.equal((await models.MediaAsset.findById(media._id)).references, 1);
});
test("applicants cannot approve themselves and approval retains the customer role", async () => {
  const created = await auth("post", "/api/applications").send(
    applicationBody(),
  );
  assert.equal(created.status, 201);
  const id = created.body.data._id;
  assert.equal(
    (
      await auth("patch", "/api/admin/applications/" + id).send({
        revision: 0,
        status: "approved",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await auth("patch", "/api/admin/applications/" + id, tokenAdmin).send({
        revision: 0,
        status: "approved",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await auth("patch", "/api/admin/applications/" + id, tokenAdmin).send({
        revision: 0,
        status: "under_review",
        internalNotes: "Internal assessment",
      })
    ).status,
    200,
  );
  assert.equal(
    (await auth("get", "/api/applications/" + id)).body.data.internalNotes,
    undefined,
  );
  assert.equal(
    (
      await auth("patch", "/api/admin/applications/" + id, tokenAdmin).send({
        revision: 1,
        status: "approved",
      })
    ).status,
    200,
  );
  assert.equal((await models.User.findById(alice._id)).role, "customer");
  const worker = await models.WorkerProfile.findOne({ owner: alice._id });
  assert.equal(worker.active, true);
  assert.equal(worker.assistancePermission, false);
});
test("workers see assigned requirements without customer addresses or business pricing", async () => {
  const order = await seedOrder(bob._id);
  const created = await auth("post", "/api/admin/assignments", tokenAdmin).send(
    {
      orderId: String(order._id),
      worker: String(alice._id),
      requirements: "Stitch according to the approved specification",
    },
  );
  assert.equal(created.status, 201);
  const job = created.body.data;
  const fetched = await auth("get", "/api/worker/jobs/" + job._id);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.order.address, undefined);
  assert.equal(fetched.body.data.order.customer, undefined);
  assert.equal(fetched.body.data.order.design.startingPricePaise, undefined);
  assert.equal(
    (await auth("get", "/api/worker/jobs/" + job._id, tokenB)).status,
    404,
  );
  const progress = await auth(
    "post",
    "/api/worker/jobs/" + job._id + "/progress",
  ).send({
    revision: 0,
    clientId: randomUUID(),
    stage: "stitching",
    note: "Prepared for admin review",
  });
  assert.equal(progress.status, 200);
  assert.equal(
    (await models.Order.findById(order._id)).status,
    "request_received",
  );
  const profile = await models.WorkerProfile.findOne({ owner: alice._id });
  await auth("patch", "/api/admin/workers/" + profile._id, tokenAdmin).send({
    revision: profile.revision,
    active: false,
    assistancePermission: false,
  });
  assert.equal((await auth("get", "/api/worker/jobs/" + job._id)).status, 404);
  assert.equal(
    (
      await auth(
        "get",
        "/api/conversations/" + job.conversationId + "/messages",
      )
    ).status,
    404,
  );
});
test("worker approval alone does not grant support access; explicit permission and assignment are both required", async () => {
  const ticket = (await auth("post", "/api/support", tokenB).send(ticketBody()))
    .body.data;
  const profile = await models.WorkerProfile.findOne({ owner: alice._id });
  await auth("patch", "/api/admin/workers/" + profile._id, tokenAdmin).send({
    revision: profile.revision,
    active: true,
    assistancePermission: false,
  });
  assert.equal((await auth("get", "/api/support/" + ticket._id)).status, 404);
  assert.equal(
    (
      await auth(
        "patch",
        "/api/admin/support/" + ticket._id + "/assignment",
        tokenAdmin,
      ).send({ revision: 0, assignedTo: String(alice._id) })
    ).status,
    404,
  );
  const current = await models.WorkerProfile.findById(profile._id);
  await auth("patch", "/api/admin/workers/" + profile._id, tokenAdmin).send({
    revision: current.revision,
    active: true,
    assistancePermission: true,
  });
  assert.equal((await auth("get", "/api/support/" + ticket._id)).status, 404);
  assert.equal(
    (
      await auth(
        "patch",
        "/api/admin/support/" + ticket._id + "/assignment",
        tokenAdmin,
      ).send({ revision: 0, assignedTo: String(alice._id) })
    ).status,
    200,
  );
  assert.equal((await auth("get", "/api/support/" + ticket._id)).status, 200);
  const permission = await models.WorkerProfile.findById(profile._id);
  await auth("patch", "/api/admin/workers/" + profile._id, tokenAdmin).send({
    revision: permission.revision,
    active: true,
    assistancePermission: false,
  });
  assert.equal(
    (
      await auth(
        "get",
        "/api/conversations/" + ticket.conversationId + "/messages",
      )
    ).status,
    404,
  );
});
test("reviews require completed ownership, consent and admin publication while preserving customer words", async () => {
  const active = await seedOrder();
  assert.equal(
    (
      await auth("post", "/api/account/reviews").send({
        orderId: String(active._id),
        rating: 4,
        text: "A useful customer review",
        consent: true,
      })
    ).status,
    404,
  );
  const complete = await seedOrder(alice._id, { status: "delivered" });
  assert.equal(
    (
      await auth("post", "/api/account/reviews", tokenB).send({
        orderId: String(complete._id),
        rating: 4,
        text: "Unrelated review",
        consent: true,
      })
    ).status,
    404,
  );
  const review = (
    await auth("post", "/api/account/reviews").send({
      orderId: String(complete._id),
      rating: 2,
      text: "Critical feedback must remain unchanged",
      consent: true,
    })
  ).body.data;
  assert.equal(
    (
      await auth("patch", "/api/admin/reviews/" + review._id).send({
        revision: 0,
        status: "published",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await auth("patch", "/api/admin/reviews/" + review._id, tokenAdmin).send({
        revision: 0,
        status: "published",
        text: "Changed text",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await auth("patch", "/api/admin/reviews/" + review._id, tokenAdmin).send({
        revision: 0,
        status: "published",
      })
    ).status,
    200,
  );
  const publicReviews = await request(app).get("/api/reviews");
  assert.equal(
    publicReviews.body.data[0].text,
    "Critical feedback must remain unchanged",
  );
  assert.equal(publicReviews.body.data[0].owner, undefined);
  assert.match(publicReviews.body.notice, /not the complete review history/);
  const second = await seedOrder(alice._id, { status: "delivered" });
  const noConsent = (
    await auth("post", "/api/account/reviews").send({
      orderId: String(second._id),
      rating: 5,
      text: "Private review for the business",
      consent: false,
    })
  ).body.data;
  assert.equal(
    (
      await auth(
        "patch",
        "/api/admin/reviews/" + noConsent._id,
        tokenAdmin,
      ).send({ revision: 0, status: "published" })
    ).status,
    409,
  );
});
test("assignment retries with the same key return the original job and reject changed payloads", async () => {
  const order = await seedOrder(bob._id);
  const key = randomUUID(),
    body = {
      orderId: String(order._id),
      worker: String(alice._id),
      requirements: "Use the confirmed design details",
    };
  const first = await auth("post", "/api/admin/assignments", tokenAdmin)
    .set("Idempotency-Key", key)
    .send(body);
  assert.equal(first.status, 201);
  const retry = await auth("post", "/api/admin/assignments", tokenAdmin)
    .set("Idempotency-Key", key)
    .send(body);
  assert.equal(retry.status, 200);
  assert.equal(first.body.data._id, retry.body.data._id);
  assert.equal(
    await models.WorkAssignment.countDocuments({ orderId: order._id }),
    1,
  );
  assert.equal(
    (
      await auth("post", "/api/admin/assignments", tokenAdmin)
        .set("Idempotency-Key", key)
        .send({ ...body, requirements: "Changed work" })
    ).status,
    409,
  );
  const workerView = await auth(
    "get",
    "/api/worker/jobs/" + first.body.data._id,
  );
  assert.equal(workerView.body.data.idempotencyKey, undefined);
  assert.equal(workerView.body.data.requestHash, undefined);
});
test("extension account deletion removes owned private records and unpins attachments", async () => {
  await context.transaction((session) =>
    cleanupExtensionAccount(context, alice, session),
  );
  for (const name of [
    "AccountPreferences",
    "MeasurementProfile",
    "SupportTicket",
    "WorkerApplication",
    "WorkerProfile",
    "Review",
    "Notification",
  ])
    assert.equal(await models[name].countDocuments({ owner: alice._id }), 0);
  assert.equal(
    await models.MediaAsset.countDocuments({
      owner: alice._id,
      references: { $gt: 0 },
    }),
    0,
  );
  assert.equal(
    await models.Conversation.countDocuments({ owner: alice._id }),
    0,
  );
});
test("future service templates stay unavailable until a tested adapter exists", async () => {
  const definition = {
    revision: 0,
    code: "embroidery",
    name: "Future embroidery",
    serviceType: "embroidery",
    active: false,
    audiences: ["unisex"],
    itemTypes: ["scarf"],
    componentKinds: ["placement"],
    measurementFields: [
      {
        key: "area",
        label: "Area",
        required: true,
        instructions: "Area to cover",
      },
    ],
    workflowStages: [{ key: "review", label: "Review" }],
    workerSkills: ["embroidery"],
    materials: "review",
    materialInstructions: "Discuss materials first",
  };
  assert.equal(
    (await auth("patch", "/api/admin/services/embroidery").send(definition))
      .status,
    403,
  );
  const saved = await auth(
    "patch",
    "/api/admin/services/embroidery",
    tokenAdmin,
  ).send(definition);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.active, false);
  assert.equal(
    (
      await auth("patch", "/api/admin/services/embroidery", tokenAdmin).send({
        ...definition,
        revision: 1,
        active: true,
      })
    ).status,
    400,
  );
  const publicList = await request(app).get("/api/services");
  assert.equal(publicList.status, 200);
  assert.ok(
    publicList.body.data.some((service) => service.code === "stitching"),
  );
  assert.equal(
    publicList.body.data.some((service) => service.code === "embroidery"),
    false,
  );
});
test("support alerts distinguish unanswered deadlines and never expose message bodies", async () => {
  await models.SupportTicket.create({
    owner: bob._id,
    clientId: randomUUID(),
    requestHash: "test",
    ticketNumber: "ALERT-" + randomUUID(),
    kind: "complaint",
    category: "other",
    subject: "Private complaint subject",
    description: "Private complaint text",
    status: "open",
    responseDueAt: new Date(Date.now() - 3600000),
  });
  const alerts = await auth("get", "/api/admin/support/alerts", tokenAdmin);
  assert.equal(alerts.status, 200);
  assert.ok(alerts.body.data.overdue >= 1);
  assert.equal(alerts.body.data.items[0].description, undefined);
  assert.equal(
    (await auth("get", "/api/admin/support/alerts", tokenB)).status,
    403,
  );
});
async function proposalFixture() {
  const [original, sleeve, neck] = await models.DesignOption.create([
    {
      name: "Original short sleeve",
      kind: "sleeve",
      garments: ["kurti"],
      active: true,
      priceMode: "included",
      measurementFields: ["sleeveLength"],
      sleeveStyle: "short",
    },
    {
      name: "Sleeveless",
      kind: "sleeve",
      garments: ["kurti"],
      active: true,
      priceMode: "additional",
      amountPaise: 10000,
      measurementFields: [],
      sleeveStyle: "sleeveless",
    },
    {
      name: "Scoop front",
      kind: "neck",
      garments: ["kurti"],
      active: true,
      priceMode: "additional",
      amountPaise: 5000,
      measurementFields: ["frontNeckDepth"],
    },
  ]);
  const design = await models.Design.create({
    code: "P-" + randomUUID().slice(0, 8),
    slug: "proposal-" + randomUUID().slice(0, 8),
    title: "Proposal test design",
    description: "A stitching reference for proposal tests.",
    garment: "kurti",
    startingPricePaise: 50000,
    status: "published",
    defaultComponents: { sleeve: original._id },
  });
  const draft = await models.Draft.create({
    owner: alice._id,
    clientId: randomUUID(),
    data: {
      garment: "kurti",
      quantity: 1,
      designId: String(design._id),
      configuration: {
        source: "catalogue",
        mode: "exact",
        changedParts: [],
        components: {},
        addonIds: [],
        notes: "",
      },
      logistics: {
        inbound: { method: "dropoff" },
        outbound: { method: "collect" },
      },
      measurements: {
        unit: "in",
        method: "body",
        values: {
          bust: 36,
          waist: 30,
          hip: 38,
          shoulder: 14,
          length: 40,
          sleeveLength: 18,
        },
        notes: "Private fit note",
      },
      address: { line1: "Private saved address" },
      referenceMediaIds: [],
    },
  });
  const ticket = (
    await auth("post", "/api/support").send(
      ticketBody({
        draftId: String(draft._id),
        contextShared: true,
        context: { step: "design", garment: "kurti" },
      }),
    )
  ).body.data;
  const body = {
    clientId: randomUUID(),
    revision: ticket.revision,
    draftRevision: draft.revision,
    summary: "Use sleeveless and a scoop front",
    pricingImpact:
      "Known customization charges increase; final quote still needs review.",
    measurementImpact:
      "Confirm front neck depth; sleeve length is no longer required.",
    changes: {
      sleeve: { source: "option", optionId: String(sleeve._id), notes: "" },
      neck: { source: "option", optionId: String(neck._id), notes: "" },
    },
  };
  return { draft, ticket, sleeve, neck, body };
}
test("tailor proposals expose only consented design context and do not silently modify drafts", async () => {
  const { draft, ticket, body } = await proposalFixture();
  const path = `/api/support/${ticket._id}/proposals`;
  const info = await auth("get", path, tokenAdmin);
  assert.equal(info.status, 200);
  assert.equal(info.body.context.draftRevision, 0);
  assert.equal(info.body.context.measurements, undefined);
  assert.equal(info.body.context.address, undefined);
  assert.equal(
    info.body.context.currentEstimate.components.sleeve.name,
    "Original short sleeve",
  );
  assert.equal((await auth("get", path, tokenB)).status, 404);
  assert.equal((await auth("post", path).send(body)).status, 403);
  const created = await auth("post", path, tokenAdmin).send(body);
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, "pending");
  assert.equal(
    (await models.Draft.findById(draft._id)).configuration,
    undefined,
  );
  assert.equal(
    (await models.Draft.findById(draft._id)).data.configuration.mode,
    "exact",
  );
  assert.equal(
    (await auth("post", path, tokenAdmin).send(body)).body.data._id,
    created.body.data._id,
  );
});
test("customer proposal acceptance changes only approved draft components and requires measurement reconfirmation", async () => {
  const { draft, ticket, body, sleeve, neck } = await proposalFixture();
  const path = `/api/support/${ticket._id}/proposals`;
  const proposal = (await auth("post", path, tokenAdmin).send(body)).body.data;
  const decision = `${path}/${proposal._id}/decision`,
    requestBody = { revision: 0, draftRevision: 0, decision: "accept" };
  const count = await models.Order.countDocuments();
  assert.equal(
    (await auth("post", decision, tokenAdmin).send(requestBody)).status,
    403,
  );
  const accepted = await auth("post", decision).send(requestBody);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.status, "accepted");
  const updated = await models.Draft.findById(draft._id);
  assert.equal(updated.revision, 1);
  assert.equal(updated.data.configuration.mode, "custom");
  assert.deepEqual(updated.data.configuration.changedParts, ["sleeve", "neck"]);
  assert.equal(
    updated.data.configuration.components.sleeve.optionId,
    String(sleeve._id),
  );
  assert.equal(
    updated.data.configuration.components.neck.optionId,
    String(neck._id),
  );
  assert.equal(updated.data.measurements.values.bust, 36);
  assert.equal(updated.data.measurements.values.sleeveLength, 18);
  assert.equal(updated.data.address.line1, "Private saved address");
  assert.deepEqual(updated.data.measurements.reconfirmFields, [
    "frontNeckDepth",
  ]);
  assert.equal(await models.Order.countDocuments(), count);
  assert.equal((await auth("post", decision).send(requestBody)).status, 200);
});
test("stale drafts and changed prices invalidate proposal acceptance without overwriting information", async () => {
  const stale = await proposalFixture();
  const proposal = (
    await auth(
      "post",
      `/api/support/${stale.ticket._id}/proposals`,
      tokenAdmin,
    ).send(stale.body)
  ).body.data;
  await models.Draft.updateOne(
    { _id: stale.draft._id },
    { $inc: { revision: 1 }, $set: { "data.notes": "New private draft note" } },
  );
  const decision = await auth(
    "post",
    `/api/support/${stale.ticket._id}/proposals/${proposal._id}/decision`,
  ).send({ revision: 0, draftRevision: 1, decision: "accept" });
  assert.equal(decision.status, 409);
  assert.equal(decision.body.error.code, "DRAFT_CHANGED");
  assert.equal(
    (await models.Draft.findById(stale.draft._id)).data.notes,
    "New private draft note",
  );
  const changed = await proposalFixture();
  const oldPrice = (
    await auth(
      "post",
      `/api/support/${changed.ticket._id}/proposals`,
      tokenAdmin,
    ).send(changed.body)
  ).body.data;
  await models.DesignOption.updateOne(
    { _id: changed.sleeve._id },
    { $inc: { revision: 1 }, $set: { amountPaise: 20000 } },
  );
  const priceDecision = await auth(
    "post",
    `/api/support/${changed.ticket._id}/proposals/${oldPrice._id}/decision`,
  ).send({ revision: 0, draftRevision: 0, decision: "accept" });
  assert.equal(priceDecision.status, 409);
  assert.equal(priceDecision.body.error.code, "PROPOSAL_PRICE_CHANGED");
  assert.equal((await models.Draft.findById(changed.draft._id)).revision, 0);
});
test("disabled configured services cannot be submitted through a trusted service check", async () => {
  await models.ServiceDefinition.create({
    code: "stitching",
    name: "Temporarily unavailable stitching",
    serviceType: "stitching",
    active: false,
    audiences: ["women"],
    itemTypes: ["kurti", "suit", "blouse"],
    materials: "customer",
  });
  await assert.rejects(
    () => assertOrderServiceEnabled(context, "kurti"),
    (error) => error.code === "SERVICE_UNAVAILABLE",
  );
  await assert.doesNotReject(() =>
    assertOrderServiceEnabled(context, "alteration"),
  );
});
