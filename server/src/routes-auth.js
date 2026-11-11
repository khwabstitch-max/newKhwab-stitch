import { z } from "zod";
import { rateLimitFor } from "./rate-limits.js";
import { fail } from "./errors.js";
import { audit } from "./route-utils.js";
import { tokenService, userProfile } from "./auth.js";
import { normalizedEmailMatch } from "./account-security.js";
import {
  registerInput,
  loginInput,
  hashPassword,
  verifyPassword,
  passwordWorkGate,
} from "./credentials.js";

const accountUnavailable = () =>
  fail(
    409,
    "ACCOUNT_UNAVAILABLE",
    "This email is unavailable. Sign in or contact the atelier for account assistance.",
  );
const invalidCredentials = () =>
  fail(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

export function authRoutes(app, ctx, authenticate) {
  const { models } = ctx;
  const tokens = tokenService(ctx.config);
  const runPasswordWork = passwordWorkGate(2);
  const registrationLimit = rateLimitFor(ctx, "registration", {
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ctx.limitHandler,
  });
  const loginLimit = rateLimitFor(ctx, "login", {
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ctx.limitHandler,
  });

  app.post("/api/auth/register", registrationLimit, async (req, res) => {
    const input = registerInput.parse(req.body);
    const result = await runPasswordWork(async () => {
      // Legacy accounts can only be migrated by a trusted operator after ownership
      // verification. Registration must never take ownership by matching an email.
      const existing = await models.User.findOne(
        normalizedEmailMatch(input.email),
      );
      if (existing) accountUnavailable();
      const passwordHash = await hashPassword(input.password);
      let user;
      try {
        user = await ctx.transaction(async (session) => {
          const [created] = await models.User.create(
            [
              {
                name: input.name,
                email: input.email,
                emailReservation: input.email,
                passwordHash,
                authVersion: 0,
                role: "customer",
              },
            ],
            { session },
          );
          await audit(
            ctx,
            req,
            "account.registered",
            "user",
            created._id,
            session,
          );
          return created;
        });
      } catch (error) {
        if (error.code === 11000) accountUnavailable();
        throw error;
      }
      return { ...tokens.issue(user), user: userProfile(user) };
    });
    res.set("Cache-Control", "no-store").status(201).json({ data: result });
  });

  app.post("/api/auth/login", loginLimit, async (req, res) => {
    const input = loginInput.parse(req.body);
    const result = await runPasswordWork(async () => {
      const user = await models.User.findOne({
        email: input.email,
        passwordHash: { $type: "string" },
      })
        .select("+passwordHash")
        .collation({ locale: "en", strength: 2 });
      const matches = await verifyPassword(input.password, user?.passwordHash);
      if (!user || !matches || user.disabled) invalidCredentials();
      return { ...tokens.issue(user), user: userProfile(user) };
    });
    res.set("Cache-Control", "no-store").json({ data: result });
  });

  app.post("/api/auth/logout", authenticate, async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    await ctx.transaction(async (session) => {
      const updated = await models.User.updateOne(
        {
          _id: req.user._id,
          authVersion: req.user.authVersion ?? 0,
          disabled: false,
        },
        { $inc: { authVersion: 1 } },
        { session },
      );
      if (updated.modifiedCount !== 1) {
        fail(
          401,
          "INVALID_TOKEN",
          "Your session has ended. Please sign in again.",
        );
      }
      await audit(
        ctx,
        req,
        "account.logged_out",
        "user",
        req.user._id,
        session,
      );
    });
    res.json({ data: { loggedOut: true } });
  });
}
