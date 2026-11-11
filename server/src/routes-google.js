import { createPublicKey } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { rateLimitFor } from "./rate-limits.js";
import { tokenService, userProfile } from "./auth.js";
import { normalizedEmailMatch } from "./account-security.js";
import {
  emailInput,
  loginInput,
  passwordWorkGate,
  verifyPassword,
} from "./credentials.js";
import { audit } from "./route-utils.js";
import { fail, requireFound } from "./errors.js";

export const googleAvailable = (config) => Boolean(config.GOOGLE_CLIENT_ID);
export async function assertGoogleIndexes(models) {
  for (const [Model, field] of [
    [models.User, "emailReservation"],
    [models.AccountIdentity, "googleSubject"],
  ]) {
    let indexes;
    try {
      indexes = await Model.collection.indexes();
    } catch {
      throw new Error(
        "Google identity indexes are missing. Run npm run db:indexes before enabling GOOGLE_CLIENT_ID.",
      );
    }
    if (
      !indexes.some(
        (index) =>
          index.unique &&
          Object.keys(index.key).length === 1 &&
          index.key[field] === 1 &&
          index.partialFilterExpression?.[field]?.$type === "string",
      )
    )
      throw new Error(
        "Google identity uniqueness is not configured. Run npm run db:indexes before enabling GOOGLE_CLIENT_ID.",
      );
  }
}
const credentialInput = z.string().min(100).max(12000);
const invalid = () =>
  fail(
    401,
    "INVALID_GOOGLE_TOKEN",
    "Google sign-in could not be verified. Please try again.",
  );
const linkRequired = () =>
  fail(
    409,
    "ACCOUNT_LINK_REQUIRED",
    "Sign in to your existing account, then link Google from Account and security using your current password.",
  );
export function createGoogleVerifier(ctx) {
  let cached = null,
    expires = 0,
    lastRefresh = 0,
    inflight = null;
  const refresh = async () => {
    if (inflight) return inflight;
    inflight = (async () => {
      let result;
      try {
        if (ctx.googleJwks) result = await ctx.googleJwks();
        else {
          const response = await fetch(
            "https://www.googleapis.com/oauth2/v3/certs",
            { signal: AbortSignal.timeout(8000) },
          );
          if (!response.ok) throw new Error("Google keys unavailable");
          const body = await response.text();
          if (body.length > 100000)
            throw new Error("Google key response too large");
          result = {
            ...JSON.parse(body),
            maxAgeSeconds: Number(
              /max-age=(\d+)/.exec(
                response.headers.get("cache-control") || "",
              )?.[1] || 300,
            ),
          };
        }
        if (
          !Array.isArray(result.keys) ||
          !result.keys.length ||
          result.keys.length > 20
        )
          throw new Error("Invalid Google keys");
        const keys = new Map();
        for (const key of result.keys)
          if (
            key.kty === "RSA" &&
            typeof key.kid === "string" &&
            (!key.use || key.use === "sig") &&
            (!key.alg || key.alg === "RS256")
          )
            keys.set(key.kid, createPublicKey({ key, format: "jwk" }));
        if (!keys.size) throw new Error("No usable Google keys");
        cached = keys;
        lastRefresh = Date.now();
        expires =
          lastRefresh +
          Math.max(60, Math.min(Number(result.maxAgeSeconds) || 300, 86400)) *
            1000;
      } catch {
        fail(
          503,
          "GOOGLE_UNAVAILABLE",
          "Google sign-in is temporarily unavailable. Please retry or use your existing sign-in method.",
        );
      }
    })();
    try {
      await inflight;
    } finally {
      inflight = null;
    }
  };
  return async (credential) => {
    if (!googleAvailable(ctx.config))
      fail(503, "GOOGLE_UNAVAILABLE", "Google sign-in is not configured.");
    const decoded = jwt.decode(credential, { complete: true });
    if (
      !decoded ||
      decoded.header.alg !== "RS256" ||
      typeof decoded.header.kid !== "string" ||
      decoded.header.kid.length > 200
    )
      invalid();
    if (!cached || Date.now() >= expires) await refresh();
    if (!cached.has(decoded.header.kid) && Date.now() - lastRefresh > 60000)
      await refresh();
    const key = cached.get(decoded.header.kid);
    if (!key) invalid();
    let payload;
    try {
      payload = jwt.verify(credential, key, {
        algorithms: ["RS256"],
        audience: ctx.config.GOOGLE_CLIENT_ID,
        issuer: ["accounts.google.com", "https://accounts.google.com"],
        clockTolerance: 30,
        maxAge: "1h",
      });
    } catch {
      invalid();
    }
    const valid = z
      .object({
        sub: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
        email: emailInput,
        email_verified: z.boolean(),
        iat: z.number().int(),
        exp: z.number().int(),
        name: z.string().max(500).optional(),
        hd: z.string().max(250).optional(),
      })
      .passthrough()
      .safeParse(payload);
    if (
      !valid.success ||
      valid.data.iat > Math.floor(Date.now() / 1000) + 30 ||
      valid.data.exp <= valid.data.iat
    )
      invalid();
    const data = valid.data;
    return {
      ...data,
      authoritativeEmail:
        data.email_verified &&
        (data.email.endsWith("@gmail.com") || Boolean(data.hd)),
    };
  };
}
export function googleRoutes(app, ctx, auth) {
  const { models } = ctx,
    verify = createGoogleVerifier(ctx),
    tokens = tokenService(ctx.config),
    gate = passwordWorkGate(2);
  const limit = rateLimitFor(ctx, "google-auth", {
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ctx.limitHandler,
  });
  const issue = async (user, res) => {
    if (user.disabled)
      fail(
        403,
        "ACCOUNT_DISABLED",
        "This account is unavailable. Please contact the atelier.",
      );
    const identity = await models.AccountIdentity.findOne({
      owner: user._id,
    }).lean();
    res.set("Cache-Control", "no-store").json({
      data: {
        ...tokens.issue(user),
        user: {
          ...userProfile(user),
          emailVerified: Boolean(identity?.emailVerifiedAt),
        },
      },
    });
  };
  app.post("/api/auth/google", limit, async (req, res) => {
    const { credential } = z
        .object({ credential: credentialInput })
        .strict()
        .parse(req.body),
      google = await verify(credential);
    let identity = await models.AccountIdentity.findOne({
      googleSubject: google.sub,
    });
    if (identity)
      return issue(
        requireFound(
          await models.User.findById(identity.owner),
          "This account is unavailable.",
        ),
        res,
      );
    if (await models.User.exists(normalizedEmailMatch(google.email)))
      linkRequired();
    let user;
    try {
      user = await ctx.transaction(async (session) => {
        if (
          await models.User.exists(normalizedEmailMatch(google.email)).session(
            session,
          )
        )
          linkRequired();
        const [created] = await models.User.create(
          [
            {
              email: google.email,
              emailReservation: google.email,
              name: google.name?.trim().slice(0, 100) || "Customer",
              role: "customer",
              authVersion: 0,
            },
          ],
          { session },
        );
        await models.AccountIdentity.create(
          [
            {
              owner: created._id,
              googleSubject: google.sub,
              googleEmail: google.email,
              googleEmailVerified: google.email_verified,
              ...(google.authoritativeEmail
                ? { emailVerifiedAt: new Date() }
                : {}),
            },
          ],
          { session },
        );
        await audit(
          ctx,
          req,
          "account.google_registered",
          "user",
          created._id,
          session,
        );
        return created;
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      identity = await models.AccountIdentity.findOne({
        googleSubject: google.sub,
      });
      if (!identity) linkRequired();
      user = requireFound(
        await models.User.findById(identity.owner),
        "This account is unavailable.",
      );
    }
    return issue(user, res);
  });
  app.post("/api/auth/google/link", auth, limit, async (req, res) => {
    const body = z
      .object({
        credential: credentialInput,
        currentPassword: loginInput.shape.password,
      })
      .strict()
      .parse(req.body);
    await gate(async () => {
      const google = await verify(body.credential),
        user = requireFound(
          await models.User.findById(req.user._id).select("+passwordHash"),
        );
      if (
        !user.passwordHash ||
        !(await verifyPassword(body.currentPassword, user.passwordHash))
      )
        fail(401, "INVALID_CREDENTIALS", "Your current password is incorrect.");
      if (google.email !== user.email)
        fail(
          409,
          "GOOGLE_EMAIL_MISMATCH",
          "Use the Google account with the same email address as this account.",
        );
      try {
        await ctx.transaction(async (session) => {
          const fresh = await models.User.updateOne(
            {
              _id: user._id,
              passwordHash: user.passwordHash,
              authVersion: user.authVersion,
              disabled: false,
            },
            { $inc: { mutationFence: 1 } },
            { session },
          );
          if (!fresh.modifiedCount)
            fail(
              409,
              "SESSION_CHANGED",
              "Your account changed. Sign in again before linking Google.",
            );
          const current = await models.AccountIdentity.findOne({
            owner: user._id,
          })
            .select("+googleSubject")
            .session(session);
          if (current?.googleSubject && current.googleSubject !== google.sub)
            fail(
              409,
              "GOOGLE_ALREADY_LINKED",
              "Another Google identity is already linked to this account.",
            );
          const other = await models.AccountIdentity.findOne({
            googleSubject: google.sub,
            owner: { $ne: user._id },
          }).session(session);
          if (other)
            fail(
              409,
              "GOOGLE_ALREADY_LINKED",
              "This Google identity is already linked to an account.",
            );
          await models.AccountIdentity.findOneAndUpdate(
            { owner: user._id },
            {
              $set: {
                googleSubject: google.sub,
                googleEmail: google.email,
                googleEmailVerified: google.email_verified,
                ...(google.authoritativeEmail
                  ? { emailVerifiedAt: new Date() }
                  : {}),
              },
            },
            { upsert: true, returnDocument: "after", session },
          );
          await audit(
            ctx,
            req,
            "account.google_linked",
            "user",
            user._id,
            session,
          );
        });
      } catch (error) {
        if (error.code === 11000)
          fail(
            409,
            "GOOGLE_ALREADY_LINKED",
            "This Google identity is already linked to an account.",
          );
        throw error;
      }
    });
    res.set("Cache-Control", "no-store").json({ data: { linked: true } });
  });
}
