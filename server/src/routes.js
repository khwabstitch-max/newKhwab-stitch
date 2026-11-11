import { rateLimitFor } from "./rate-limits.js";
import { authentication, adminOnly } from "./auth.js";
import { publicRoutes } from "./routes-public.js";
import { orderRoutes } from "./routes-orders.js";
import { mediaRoutes } from "./routes-media.js";
import { adminRoutes } from "./routes-admin.js";
import { authRoutes } from "./routes-auth.js";
import { pricingRoutes } from "./pricing.js";
import { draftRoutes } from "./routes-drafts.js";
import { accountRoutes } from "./routes-account.js";
import { supportRoutes } from "./routes-support.js";
import { workerRoutes } from "./routes-workers.js";
import { reviewRoutes } from "./routes-reviews.js";
import { securityRoutes } from "./routes-security.js";
import { serviceRoutes } from "./routes-services.js";
import { googleRoutes } from "./routes-google.js";
import { proposalRoutes } from "./routes-proposals.js";
import { visualCatalogueRoutes } from "./visual-catalogue.js";
import { registerCommerceRoutes } from "./commerce-routes.js";
export function registerRoutes(app, ctx) {
  const auth = authentication(ctx);
  const orderLimit = rateLimitFor(ctx, "order", {
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ctx.limitHandler,
  });
  const uploadLimit = rateLimitFor(ctx, "upload", {
    windowMs: 60 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ctx.limitHandler,
  });
  authRoutes(app, ctx, auth);
  securityRoutes(app, ctx, auth);
  googleRoutes(app, ctx, auth);
  publicRoutes(app, ctx, auth);
  registerCommerceRoutes(app, ctx, auth);
  orderRoutes(app, ctx, auth, orderLimit);
  mediaRoutes(app, ctx, auth, uploadLimit);
  visualCatalogueRoutes(app, ctx, auth);
  adminRoutes(app, ctx, auth, adminOnly);
  pricingRoutes(app, ctx);
  draftRoutes(app, ctx, auth);
  accountRoutes(app, ctx, auth);
  supportRoutes(app, ctx, auth);
  workerRoutes(app, ctx, auth);
  reviewRoutes(app, ctx, auth);
  serviceRoutes(app, ctx, auth);
  proposalRoutes(app, ctx, auth);
}
