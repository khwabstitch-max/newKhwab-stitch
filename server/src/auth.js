import jwt from "jsonwebtoken";
import { fail } from "./errors.js";

export const JWT_ISSUER = "khwab-stitch-api";
export const JWT_AUDIENCE = "khwab-stitch-web";
export const TOKEN_LIFETIME_SECONDS = 30 * 60;

export function validJwtSecret(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length >= 48 && bytes.toString("base64url") === value;
}

export function tokenService(config) {
  if (!validJwtSecret(config.JWT_SECRET)) {
    throw new Error(
      "JWT_SECRET must encode at least 48 random bytes as canonical base64url.",
    );
  }
  const key = Buffer.from(config.JWT_SECRET, "base64url");
  return {
    issue(user) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        { version: user.authVersion ?? 0, iat: issuedAt },
        key,
        {
          algorithm: "HS256",
          subject: String(user._id),
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: TOKEN_LIFETIME_SECONDS,
        },
      );
      return {
        token,
        expiresAt: new Date(
          (issuedAt + TOKEN_LIFETIME_SECONDS) * 1000,
        ).toISOString(),
      };
    },
    verify(token) {
      const claims = jwt.verify(token, key, {
        algorithms: ["HS256"],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        maxAge: TOKEN_LIFETIME_SECONDS,
      });
      if (
        !claims ||
        typeof claims !== "object" ||
        !/^[a-f\d]{24}$/i.test(claims.sub || "") ||
        !Number.isSafeInteger(claims.version) ||
        claims.version < 0 ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) ||
        claims.exp <= claims.iat ||
        claims.iat > Math.floor(Date.now() / 1000) + 5 ||
        claims.exp - claims.iat > TOKEN_LIFETIME_SECONDS ||
        claims.iss !== JWT_ISSUER ||
        claims.aud !== JWT_AUDIENCE
      ) {
        throw new Error("Invalid JWT claims.");
      }
      return { sub: claims.sub, version: claims.version };
    },
  };
}

export function userProfile(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    deletionRequestedAt: user.deletionRequestedAt || null,
    emailVerified: false,
  };
}

export function authentication({ models, config }) {
  const tokens = tokenService(config);
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]{10,8192})$/.exec(
      req.get("authorization") || "",
    );
    if (!match) fail(401, "UNAUTHENTICATED", "Please sign in to continue.");
    let claims;
    try {
      claims = tokens.verify(match[1]);
    } catch {
      fail(
        401,
        "INVALID_TOKEN",
        "Your session is invalid or expired. Please sign in again.",
      );
    }
    // Authentication never creates accounts, and token role claims are ignored.
    const user = await models.User.findOne({
      _id: claims.sub,
    }).select("+passwordHash");
    if (!user)
      fail(
        401,
        "INVALID_TOKEN",
        "Your session is invalid or expired. Please sign in again.",
      );
    if (
      typeof user.passwordHash !== "string" &&
      !(await models.AccountIdentity.exists({
        owner: user._id,
        googleSubject: { $type: "string" },
      }))
    )
      fail(
        401,
        "INVALID_TOKEN",
        "Your session is invalid or expired. Please sign in again.",
      );
    if (user.disabled) {
      fail(
        403,
        "ACCOUNT_DISABLED",
        "This account is unavailable. Please contact the atelier.",
      );
    }
    if ((user.authVersion ?? 0) !== claims.version) {
      fail(
        401,
        "INVALID_TOKEN",
        "Your session has ended. Please sign in again.",
      );
    }
    req.user = user;
    res.set("Cache-Control", "private, no-store");
    next();
  };
}

export function adminOnly(req, _res, next) {
  if (req.user.role !== "admin")
    fail(403, "FORBIDDEN", "Administrator access is required.");
  next();
}

export const ownOrAdmin = (req, resource) =>
  req.user.role === "admin" || String(resource.owner) === String(req.user._id);
