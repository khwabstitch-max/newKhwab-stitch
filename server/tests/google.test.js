import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import {
  createGoogleVerifier,
  assertGoogleIndexes,
} from "../src/routes-google.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "fixture-google-key",
  alg: "RS256",
  use: "sig",
};
const clientId = "fixture-client.apps.googleusercontent.com";
const token = (claims = {}, options = {}) =>
  jwt.sign(
    {
      sub: "google-subject-123",
      email: "fixture@gmail.com",
      email_verified: true,
      ...claims,
    },
    privateKey,
    {
      algorithm: "RS256",
      keyid: jwk.kid,
      issuer: "https://accounts.google.com",
      audience: clientId,
      expiresIn: 3600,
      ...options,
    },
  );
test("Google JWT validation checks verified RSA signature and caches only configured Google keys", async () => {
  let reads = 0;
  const verify = createGoogleVerifier({
    config: { GOOGLE_CLIENT_ID: clientId },
    googleJwks: async () => {
      reads++;
      return { keys: [jwk], maxAgeSeconds: 3600 };
    },
  });
  assert.equal((await verify(token())).sub, "google-subject-123");
  await verify(token());
  assert.equal(reads, 1);
});
test("Google JWT validation rejects wrong issuer, audience, expiry, key and algorithm", async () => {
  const verify = createGoogleVerifier({
    config: { GOOGLE_CLIENT_ID: clientId },
    googleJwks: async () => ({ keys: [jwk], maxAgeSeconds: 3600 }),
  });
  for (const options of [
    { issuer: "https://attacker.example.test" },
    { audience: "other-client" },
    { expiresIn: -60 },
    { keyid: "unknown-key" },
  ])
    await assert.rejects(
      () => verify(token({}, options)),
      (error) => error.code === "INVALID_GOOGLE_TOKEN",
    );
  const forged = jwt.sign(
    { sub: "fake", email: "fixture@gmail.com", email_verified: true },
    "attacker-secret",
    { algorithm: "HS256", keyid: jwk.kid },
  );
  await assert.rejects(
    () => verify(forged),
    (error) => error.code === "INVALID_GOOGLE_TOKEN",
  );
});
test("Google third-party email remains unverified without Gmail or Workspace authority", async () => {
  const verify = createGoogleVerifier({
    config: { GOOGLE_CLIENT_ID: clientId },
    googleJwks: async () => ({ keys: [jwk] }),
  });
  assert.equal(
    (
      await verify(
        token({ email: "thirdparty@example.test", email_verified: true }),
      )
    ).authoritativeEmail,
    false,
  );
  assert.equal(
    (
      await verify(
        token({
          email: "worker@example.test",
          email_verified: true,
          hd: "example.test",
        }),
      )
    ).authoritativeEmail,
    true,
  );
  assert.equal(
    (await verify(token({ email_verified: false }))).authoritativeEmail,
    false,
  );
});
test("Google credentials fail closed without configuration or usable provider keys", async () => {
  await assert.rejects(
    () => createGoogleVerifier({ config: {} })(token()),
    (error) => error.code === "GOOGLE_UNAVAILABLE",
  );
  await assert.rejects(
    () =>
      createGoogleVerifier({
        config: { GOOGLE_CLIENT_ID: clientId },
        googleJwks: async () => {
          throw new Error("Fixture provider down");
        },
      })(token()),
    (error) => error.code === "GOOGLE_UNAVAILABLE",
  );
});

test("Google startup requires both reservation and provider-subject uniqueness indexes", async () => {
  const model = (field) => ({
    collection: {
      indexes: async () => [
        {
          key: { [field]: 1 },
          unique: true,
          partialFilterExpression: { [field]: { $type: "string" } },
        },
      ],
    },
  });
  await assertGoogleIndexes({
    User: model("emailReservation"),
    AccountIdentity: model("googleSubject"),
  });
  await assert.rejects(
    () =>
      assertGoogleIndexes({
        User: model("email"),
        AccountIdentity: model("googleSubject"),
      }),
    /uniqueness/,
  );
});
