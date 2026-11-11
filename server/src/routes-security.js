import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { rateLimitFor } from "./rate-limits.js";
import {
  newPasswordInput,
  emailInput,
  loginInput,
  hashPassword,
  verifyPassword,
  passwordWorkGate,
} from "./credentials.js";
import { audit } from "./route-utils.js";
import { fail, requireFound } from "./errors.js";
import { googleAvailable } from "./routes-google.js";

export const actionHash = (token) =>
  createHash("sha256").update(token).digest("hex");
export const actionTokenInput = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export function mailAvailable(config) {
  return Boolean(
    config.RESEND_API_KEY && config.EMAIL_FROM && config.PUBLIC_WEB_URL,
  );
}
async function sendAction(ctx, email, token, kind) {
  const url = new URL("/password-help", ctx.config.PUBLIC_WEB_URL);
  // The secret is in the fragment: it is never sent in HTTP paths or Referer.
  url.hash = new URLSearchParams({ token, kind }).toString();
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: `Bearer ${ctx.config.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ctx.config.EMAIL_FROM,
      to: [email],
      subject:
        kind === "reset"
          ? "Reset your Khwab Stitch password"
          : "Verify your Khwab Stitch email",
      text: `Open this link to ${kind === "reset" ? "reset your password" : "verify your email"}: ${url.href}\nThis link expires in ${kind === "reset" ? "30 minutes" : "24 hours"}. If you did not request this, ignore it.`,
    }),
  });
  if (!result.ok) throw new Error("Email provider unavailable");
}
export function securityRoutes(app, ctx, auth) {
  const gate = passwordWorkGate(2),
    { models } = ctx;
  const limit = rateLimitFor(ctx, "account-security", {
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ctx.limitHandler,
  });
  app.get("/api/auth/capabilities", (_req, res) =>
    res.json({
      data: {
        emailPassword: true,
        google: googleAvailable(ctx.config),
        googleClientId: ctx.config.GOOGLE_CLIENT_ID || null,
        passwordRecovery: mailAvailable(ctx.config),
        emailVerification: mailAvailable(ctx.config),
      },
    }),
  );
  app.post("/api/auth/password", auth, limit, async (req, res) => {
    const body = z
      .object({
        currentPassword: loginInput.shape.password,
        password: newPasswordInput,
      })
      .strict()
      .parse(req.body);
    await gate(async () => {
      const user = requireFound(
        await models.User.findById(req.user._id).select("+passwordHash"),
      );
      if (
        !user.passwordHash ||
        !(await verifyPassword(body.currentPassword, user.passwordHash))
      )
        fail(401, "INVALID_CREDENTIALS", "Your current password is incorrect.");
      const passwordHash = await hashPassword(body.password);
      await ctx.transaction(async (session) => {
        const updated = await models.User.updateOne(
          {
            _id: user._id,
            passwordHash: user.passwordHash,
            authVersion: user.authVersion,
            disabled: false,
          },
          { $set: { passwordHash }, $inc: { authVersion: 1 } },
          { session },
        );
        if (updated.modifiedCount !== 1)
          fail(
            409,
            "SESSION_CHANGED",
            "Your account changed. Sign in again before changing your password.",
          );
        await models.PasswordAction.deleteMany(
          { owner: user._id, kind: "reset" },
          { session },
        );
        await audit(
          ctx,
          req,
          "account.password_changed",
          "user",
          user._id,
          session,
        );
      });
    });
    res
      .set("Cache-Control", "no-store")
      .json({ data: { changed: true, reauthenticationRequired: true } });
  });
  app.post("/api/auth/recovery", limit, async (req, res) => {
    const { email } = z.object({ email: emailInput }).strict().parse(req.body);
    // Always return the same body for eligible, absent, and disabled accounts.
    if (!mailAvailable(ctx.config))
      fail(
        503,
        "RECOVERY_UNAVAILABLE",
        "Email recovery is not configured. Contact the atelier for account assistance.",
      );
    const user = await models.User.findOne({
      email,
      disabled: false,
      passwordHash: { $type: "string" },
    });
    const token = randomBytes(32).toString("base64url");
    if (user) {
      const action = await models.PasswordAction.create({
        owner: user._id,
        kind: "reset",
        tokenHash: actionHash(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      try {
        if (ctx.sendAccountAction)
          await ctx.sendAccountAction(email, token, "reset");
        else await sendAction(ctx, email, token, "reset");
      } catch {
        await models.PasswordAction.deleteOne({ _id: action._id });
        req.log?.warn({ requestId: req.id }, "Account email delivery failed");
      }
    }
    res.set("Cache-Control", "no-store").json({
      data: {
        message:
          "If an eligible account exists, a password-reset link will be sent. Check your inbox or contact the atelier if it does not arrive.",
      },
    });
  });
  app.post("/api/auth/reset", limit, async (req, res) => {
    const body = z
      .object({ token: actionTokenInput, password: newPasswordInput })
      .strict()
      .parse(req.body);
    await gate(async () => {
      const passwordHash = await hashPassword(body.password);
      await ctx.transaction(async (session) => {
        const action = await models.PasswordAction.findOneAndUpdate(
          {
            tokenHash: actionHash(body.token),
            kind: "reset",
            usedAt: null,
            expiresAt: { $gt: new Date() },
          },
          { $set: { usedAt: new Date() } },
          { returnDocument: "after", session },
        );
        if (!action)
          fail(
            400,
            "ACTION_EXPIRED",
            "This link is invalid or expired. Request a new link.",
          );
        const updated = await models.User.updateOne(
          {
            _id: action.owner,
            disabled: false,
            passwordHash: { $type: "string" },
          },
          { $set: { passwordHash }, $inc: { authVersion: 1 } },
          { session },
        );
        if (!updated.modifiedCount)
          fail(
            400,
            "ACTION_EXPIRED",
            "This link is invalid or expired. Request a new link.",
          );
        await models.PasswordAction.deleteMany(
          { owner: action.owner, kind: "reset", _id: { $ne: action._id } },
          { session },
        );
        await audit(
          ctx,
          req,
          "account.password_reset",
          "user",
          action.owner,
          session,
        );
      });
    });
    res
      .set("Cache-Control", "no-store")
      .json({ data: { changed: true, reauthenticationRequired: true } });
  });
  app.get("/api/account/identity", auth, async (req, res) => {
    const record = await models.AccountIdentity.findOne({
      owner: req.user._id,
    }).lean();
    res.set("Cache-Control", "no-store").json({
      data: {
        emailVerified: Boolean(record?.emailVerifiedAt),
        emailVerifiedAt: record?.emailVerifiedAt || null,
        methods: [
          ...(typeof req.user.passwordHash === "string" ? ["password"] : []),
          ...((await models.AccountIdentity.exists({
            owner: req.user._id,
            googleSubject: { $type: "string" },
          }))
            ? ["google"]
            : []),
        ],
      },
    });
  });
  app.post("/api/auth/verification", auth, limit, async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    if (!mailAvailable(ctx.config))
      fail(
        503,
        "VERIFICATION_UNAVAILABLE",
        "Email verification is not configured.",
      );
    const token = randomBytes(32).toString("base64url"),
      action = await models.PasswordAction.create({
        owner: req.user._id,
        kind: "verify",
        tokenHash: actionHash(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    try {
      if (ctx.sendAccountAction)
        await ctx.sendAccountAction(req.user.email, token, "verify");
      else await sendAction(ctx, req.user.email, token, "verify");
    } catch {
      await models.PasswordAction.deleteOne({ _id: action._id });
      fail(
        503,
        "EMAIL_UNAVAILABLE",
        "The verification email could not be sent. Please try again later.",
      );
    }
    res.json({
      data: { message: "Verification email requested. Check your inbox." },
    });
  });
  app.post("/api/auth/verify", limit, async (req, res) => {
    const { token } = z
      .object({ token: actionTokenInput })
      .strict()
      .parse(req.body);
    await ctx.transaction(async (session) => {
      const action = await models.PasswordAction.findOneAndUpdate(
        {
          tokenHash: actionHash(token),
          kind: "verify",
          usedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { usedAt: new Date() } },
        { returnDocument: "after", session },
      );
      if (!action)
        fail(
          400,
          "ACTION_EXPIRED",
          "This link is invalid or expired. Request a new link.",
        );
      if (
        !(await models.User.exists({
          _id: action.owner,
          disabled: false,
        }).session(session))
      )
        fail(400, "ACTION_EXPIRED", "This link is invalid or expired.");
      await models.AccountIdentity.findOneAndUpdate(
        { owner: action.owner },
        { $set: { emailVerifiedAt: new Date() } },
        { session, upsert: true, returnDocument: "after" },
      );
      await audit(
        ctx,
        req,
        "account.email_verified",
        "user",
        action.owner,
        session,
      );
    });
    res.json({ data: { verified: true } });
  });
}
