import express from "express";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import cors from "cors";
import { rateLimitFor } from "./rate-limits.js";
import pino from "pino";
import { errorHandler, AppError } from "./errors.js";
import { registerRoutes } from "./routes.js";
export function createApp(context) {
  const app = express();
  const log =
    context.logger || pino({ level: context.config.LOG_LEVEL || "info" });
  app.disable("x-powered-by");
  app.set("trust proxy", context.config.TRUST_PROXY_HOPS || 0);
  app.use((req, res, next) => {
    req.id = randomUUID();
    req.log = log;
    res.set("X-Request-ID", req.id);
    const started = Date.now();
    // Paths, bodies, headers and provider URLs are deliberately excluded.
    res.on("finish", () =>
      log.info(
        {
          requestId: req.id,
          method: req.method,
          status: res.statusCode,
          durationMs: Date.now() - started,
        },
        "HTTP request",
      ),
    );
    next();
  });
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(
    cors({
      origin(origin, cb) {
        cb(
          origin && !context.config.origins.includes(origin)
            ? new AppError(
                403,
                "ORIGIN_FORBIDDEN",
                "This website origin is not allowed.",
              )
            : null,
          true,
        );
      },
      credentials: false,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
    }),
  );
  const limitHandler = (_req, res, _next, options) =>
    res.status(options.statusCode).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
        requestId: _req.id,
      },
    });
  app.use(
    "/api",
    rateLimitFor(context, "global", {
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: limitHandler,
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.get("/health/live", (_req, res) =>
    res.json({ data: { status: "alive" } }),
  );
  app.get("/health/ready", (_req, res) =>
    res
      .status(context.dbReady() ? 200 : 503)
      .json({ data: { status: context.dbReady() ? "ready" : "unavailable" } }),
  );
  registerRoutes(app, { ...context, limitHandler });
  app.use((_req, _res, next) =>
    next(new AppError(404, "NOT_FOUND", "This API endpoint does not exist.")),
  );
  app.use(errorHandler);
  return app;
}
