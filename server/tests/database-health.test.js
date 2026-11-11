import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { databaseReady } from "../src/database-health.js";
import { createApp } from "../src/app.js";

const application = (dbReady) => createApp({
  config: {
    NODE_ENV: "test",
    JWT_SECRET: Buffer.alloc(48, 7).toString("base64url"),
    origins: [],
    LOG_LEVEL: "silent",
  },
  models: {},
  images: {},
  logger: { info() {}, warn() {}, error() {} },
  dbReady,
});

test("readiness pings the existing native connection despite stale Mongoose heartbeat state", async () => {
  let calls = 0;
  const connection = {
    readyState: 0,
    db: {
      async command(command, options) {
        calls++;
        assert.deepEqual(command, { ping: 1 });
        assert.deepEqual(options, { timeoutMS: 2000 });
        return { ok: 1 };
      },
    },
  };
  assert.equal(await databaseReady(connection), true);
  assert.equal(calls, 1);
});

test("missing database, unsuccessful ping and native-driver failures return only unavailable", async () => {
  assert.equal(await databaseReady(undefined), false);
  assert.equal(await databaseReady({}), false);
  assert.equal(await databaseReady({ db: { async command() { return { ok: 0 }; } } }), false);
  assert.equal(await databaseReady({ db: { async command() { throw Error("private-provider-message"); } } }), false);
});

test("the readiness route waits for its probe once and sends uncached success", async () => {
  let finishProbe, probeStarted, calls = 0;
  const started = new Promise(resolve => { probeStarted = resolve; });
  const app = application(() => {
    calls++;
    probeStarted();
    return new Promise(resolve => { finishProbe = resolve; });
  });
  let completed = false;
  const pending = request(app).get("/health/ready").then(response => {
    completed = true;
    return response;
  });
  await started;
  assert.equal(completed, false);
  finishProbe(true);
  const response = await pending;
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.body, { data: { status: "ready" } });
});

test("readiness handles asynchronous failure and synchronous adapters without leaking errors", async () => {
  for (const [probe, expected] of [
    [() => true, 200],
    [() => false, 503],
    [async () => false, 503],
    [async () => { throw Error("private-provider-message"); }, 503],
  ]) {
    const response = await request(application(probe)).get("/health/ready");
    assert.equal(response.status, expected);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.body.data.status, expected === 200 ? "ready" : "unavailable");
    assert.ok(!JSON.stringify(response.body).includes("private-provider-message"));
  }
});
