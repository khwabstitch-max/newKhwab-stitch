import { z } from "zod";
import { validJwtSecret } from "./auth.js";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//),
  CORS_ORIGINS: z.string().min(1),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  JWT_SECRET: z
    .string()
    .refine(
      validJwtSecret,
      "Use canonical base64url encoding of at least 48 random bytes.",
    ),
  RESEND_API_KEY: z.string().default(""),
  GOOGLE_CLIENT_ID: z
    .union([
      z.literal(""),
      z.string().regex(/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/),
    ])
    .default(""),
  EMAIL_FROM: z.string().default(""),
  PUBLIC_WEB_URL: z.string().default(""),
  IMAGEKIT_PRIVATE_KEY: z.string().optional().default(""),
  IMAGEKIT_URL_ENDPOINT: z.string().optional().default(""),
  IMAGEKIT_PRIVATE_POLICY_VERIFIED: z.enum(["true", "false"]).default("false"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});
export class ConfigurationError extends Error {
  constructor(message, fields) { super(message);this.name="ConfigurationError";this.fields=fields; }
}
export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new ConfigurationError(
      "Invalid server configuration: " +
        result.error.issues.map((i) => i.path.join(".")).join(", "),
      [...new Set(result.error.issues.map(issue=>String(issue.path[0])))],
    );
  const c = result.data;
  if (
    [c.RESEND_API_KEY, c.EMAIL_FROM, c.PUBLIC_WEB_URL].some(Boolean) &&
    ![c.RESEND_API_KEY, c.EMAIL_FROM, c.PUBLIC_WEB_URL].every(Boolean)
  )
    throw new ConfigurationError(
      "Configure RESEND_API_KEY, EMAIL_FROM and PUBLIC_WEB_URL together.",
      ["RESEND_API_KEY","EMAIL_FROM","PUBLIC_WEB_URL"],
    );
  if (c.PUBLIC_WEB_URL) {
    const u = new URL(c.PUBLIC_WEB_URL);
    if (
      u.origin !== c.PUBLIC_WEB_URL ||
      !["https:", ...(c.NODE_ENV === "production" ? [] : ["http:"])].includes(
        u.protocol,
      )
    )
      throw new ConfigurationError(
        "PUBLIC_WEB_URL must be an exact trusted application origin.",
        ["PUBLIC_WEB_URL"],
      );
  }
  const origins = c.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !origins.length ||
    origins.some((s) => {
      try {
        const u = new URL(s);
        return (
          u.origin !== s ||
          !["http:", "https:"].includes(u.protocol) ||
          (c.NODE_ENV === "production" && u.protocol !== "https:")
        );
      } catch {
        return true;
      }
    })
  )
    throw new ConfigurationError("CORS_ORIGINS must be exact origins, HTTPS in production.",["CORS_ORIGINS"]);
  if (
    c.IMAGEKIT_URL_ENDPOINT &&
    !/^https:\/\/[^?#]+$/.test(c.IMAGEKIT_URL_ENDPOINT)
  )
    throw new ConfigurationError("Invalid IMAGEKIT_URL_ENDPOINT.",["IMAGEKIT_URL_ENDPOINT"]);
  return { ...c, origins };
}
