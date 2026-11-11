import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  registerInput,
  newPasswordInput,
  hashPassword,
  verifyPassword,
} from "../src/credentials.js";
import { tokenService, validJwtSecret } from "../src/auth.js";

test("password validation counts Unicode codepoints and prevents bcrypt UTF-8 truncation", () => {
  assert.equal(newPasswordInput.safeParse("short").success, false);
  assert.equal(newPasswordInput.safeParse("🪡".repeat(6)).success, false);
  assert.equal(newPasswordInput.safeParse("🪡".repeat(12)).success, true);
  assert.equal(newPasswordInput.safeParse("🪡".repeat(19)).success, false);
  assert.equal(newPasswordInput.safeParse("x".repeat(72)).success, true);
  assert.equal(newPasswordInput.safeParse("x".repeat(73)).success, false);
  assert.equal(
    newPasswordInput.safeParse("twelve characters\n").success,
    false,
  );
});

test("registration identity and password validation reject mass assignment", () => {
  const input = {
    name: "Customer",
    email: " EMAIL@EXAMPLE.TEST ",
    password: "Twelve secure characters!",
  };
  assert.equal(registerInput.parse(input).email, "email@example.test");
  assert.equal(
    registerInput.safeParse({ ...input, role: "admin" }).success,
    false,
  );
  assert.equal(
    registerInput.safeParse({ ...input, authVersion: 100 }).success,
    false,
  );
  assert.equal(
    registerInput.safeParse({ ...input, passwordHash: "attacker" }).success,
    false,
  );
});

test("bcrypt uses independent salts and verifies the original password", async () => {
  const password = "A secure password for testing!";
  const [first, second] = await Promise.all([
    hashPassword(password),
    hashPassword(password),
  ]);
  assert.match(first, /^\$2[aby]\$12\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("An incorrect password.", first), false);
  assert.equal(await verifyPassword(password, null), false);
});

test("JWT secrets require canonical base64url and at least48 decoded bytes", () => {
  assert.equal(validJwtSecret("replace-with-a-secret"), false);
  assert.equal(validJwtSecret(randomBytes(47).toString("base64url")), false);
  assert.equal(validJwtSecret(randomBytes(48).toString("base64url")), true);
  assert.equal(
    validJwtSecret(randomBytes(64).toString("base64url") + "="),
    false,
  );
  assert.throws(() => tokenService({ JWT_SECRET: "weak" }), /JWT_SECRET/);
});
