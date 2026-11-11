import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { fail } from "./errors.js";

export const BCRYPT_COST = 12;
export const emailInput = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
const boundedPassword = z
  .string()
  .min(1, "Enter your password.")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must be at most 72 UTF-8 bytes.",
  )
  .refine(
    (value) =>
      [...value].every(
        (character) =>
          character.codePointAt(0) >= 32 && character.codePointAt(0) !== 127,
      ),
    "Password cannot contain control characters.",
  );

export const newPasswordInput = boundedPassword.refine(
  (value) => [...value].length >= 12,
  "Use at least 12 characters for your password.",
);
export const registerInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: emailInput,
    password: newPasswordInput,
  })
  .strict();
export const loginInput = z
  .object({
    email: emailInput,
    password: boundedPassword,
  })
  .strict();

// A missing account still performs the same bcrypt cost as an existing account.
const dummyHash = bcrypt.hash(
  randomBytes(32).toString("base64url"),
  BCRYPT_COST,
);
export const hashPassword = (password) =>
  bcrypt.hash(newPasswordInput.parse(password), BCRYPT_COST);
export const verifyPassword = async (password, hash) =>
  bcrypt.compare(password, hash || (await dummyHash));

export function passwordWorkGate(maximum = 2) {
  let active = 0;
  return async (work) => {
    if (active >= maximum)
      fail(429, "AUTH_BUSY", "Sign-in is busy. Please try again shortly.");
    active++;
    try {
      return await work();
    } finally {
      active--;
    }
  };
}
