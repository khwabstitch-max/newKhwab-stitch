> Superseded for the current target: the owner now requests GitHub + Vercel. Use [deployment-vercel.md](deployment-vercel.md). The retained Render runbook below is historical compatibility material.

# Render deployment runbook — 10 November 2026

The implemented topology is **Render Static Site + Render Node Web Service**, with MongoDB Atlas and ImageKit. Preserve this setup. This review did not publish anything, purchase plans, select a remote repository/branch or change production customer data. There is no `.git` checkout/remote in this workspace, so do not invent a repository URL or branch. Save a source snapshot, create/connect the owner's intended private repository and select an explicitly reviewed deployment branch before provisioning.

## Prerequisites and suitability

Use current supported Node 24.x security patches; `engines` and `NODE_VERSION` select24. Node 24 remains LTS per the [official release table](https://nodejs.org/en/about/previous-releases). Both lockfiles support `npm ci`. The app is JavaScript; server build checks syntax, not TypeScript types.

Render Static Sites support CDN hosting, custom domains, automatic HTTPS and SPA rewrite configuration; bandwidth/pipeline usage still applies. See [Static Sites](https://render.com/docs/static-sites). The checked-in blueprint selects a **Free API instance for preview**. Render explicitly says Free instances are unsuitable for production; idle web services sleep after 15 minutes and can take about a minute to wake. Paid service compute removes those Free limits; changing only a workspace plan does not. No plan was purchased. Confirm current account limits and choose always-on compute before real orders. See [official Free limits](https://render.com/docs/free).

Required accounts: source host/Render, transaction-capable Atlas deployment with separate stage/prod users and databases, and ImageKit. Google OAuth/GIS and Resend are optional additional accounts. No Firebase SDK or Firebase authorized-domain configuration is used by current auth.

## Environment settings

Set secrets privately in Render's service settings; never put them in source, a screenshot or a `VITE_` variable.

| Service / variable | Purpose |
|---|---|
| API `NODE_ENV=production` | Production validation/index behavior |
| API `NODE_VERSION=24` | Supported Node build/runtime family |
| API `PORT` | Use Render's provided port; app binds0.0.0.0 |
| API `MONGODB_URI` | Explicit restricted database, TLS, replica-set transactions |
| API `JWT_SECRET` | Independent canonical base64url secret containing at least48 random bytes |
| API `CORS_ORIGINS` | Comma-separated exact frontend HTTPS origins; no wildcard/path/trailing slash |
| API `TRUST_PROXY_HOPS=1` | Render proxy topology; review if another proxy is added |
| API `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT` | Backend-only provider key and HTTPS delivery endpoint |
| API `IMAGEKIT_PRIVATE_POLICY_VERIFIED=false` | Keep false until actual private-policy smoke passes |
| API `LOG_LEVEL=info` | Safe operational logs; no request bodies/passwords/URLs with private tokens |
| API optional `GOOGLE_CLIENT_ID` | Web GIS audience; configure exact frontend origins in Google console |
| API optional `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_WEB_URL` | Configure all three together; verified sending domain and exact frontend HTTPS origin |
| Web `NODE_VERSION=24` | Frontend build family |
| Web `SKIP_INSTALL_DEPS=true` | Build command owns exact installation |
| Web `VITE_API_BASE_URL=https://YOUR_API.onrender.com/api` | Public build-time API URL; rebuild after change |

Ordinary password login remains available when optional providers are absent. Google sign-in/recovery actions depend on capability flags. Email links use the configured frontend; provider-domain verification and real-inbox delivery must be tested. Register Google origins for both staging and production separately; there is no Firebase migration. See [Google token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) and [Resend send API](https://resend.com/docs/api-reference/emails/send-email).

## Create the two services

Use the intended repository and reviewed branch for both. `render.yaml` preserves these settings; review its demo plan and sync:false values before using a Blueprint. A Render configuration review is not deployment authorization.

| Setting | Web Static Site | API Web Service |
|---|---|---|
| Root directory | `client` | `server` |
| Build command | `npm ci && npm run build` | `npm ci && npm run build` |
| Publish directory | `dist` | Not applicable |
| Start command | Not applicable | `npm start` (`node src/index.js`) |
| Runtime | Static | Node |
| Health check | Static response | `/health/ready` |
| Region | CDN | Existing blueprint Singapore; confirm Atlas proximity |
| Route rewrite | `/*` to `/index.html`, rewrite200 | Keep API JSON404 |

Configure backend CORS with the final frontend origin and the frontend API URL with `/api`. Set exact custom-domain values before rebuilding. Check direct visits to `/request`, `/account`, `/worker`, `/admin/measurement-guides` and password-help/email-action routes. See [Render Express deployment](https://render.com/docs/deploy-node-express-app), [rewrites](https://render.com/docs/redirects-rewrites) and [Node version selection](https://render.com/docs/node-version).

## Database, storage and migration order

1. Take an encrypted backup; restore/rehearse on a restricted staging copy. Confirm the actual Atlas tier, storage/connection limits and backup policy. Current Atlas Free can enable daily snapshots retaining up to 4; that is not proof that this account enabled them or meets retention/RPO/RTO needs. See [Atlas Free limitations](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).
2. Restrict database users to the intended database/actions. Allow Render's documented outbound ranges and intended operator address, use TLS and exact DB names. Avoid a permanent all-address allowlist. See [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
3. Against the explicitly reviewed environment, run `npm --prefix server run db:indexes`. This additive script checks credential/identity conflicts and required indexes. Production autoIndex is disabled; do not rely on startup to migrate. Existing legacy credential enrollment requires separately verified ownership and exact IDs; see [legacy migration](deployment-render.md#existing-account-migration).
4. Register the intended owner, then run `npm --prefix server run admin:provision -- owner@example.com` from a trusted terminal. Verify ownership first. Sign in again because role changes revoke existing tokens. There is no default password/public promotion endpoint. Do not run development seed in production.
5. Prepare/import visual records using [visual import](visual-import.md). A local configured development import already exists; do not assume those records exist in a different production DB. Drafts must be reviewed, not auto-published. Do not copy private customer media into a public folder.
6. Preview `npm --prefix server run db:free-lengths`. Its default is a plan. Only after backup/environment review use `-- --execute` to normalize stored length metadata and invalidate editable draft caches. It does not rewrite accepted quotes/submitted orders. Runtime free-length enforcement already operates without this migration.
7. Confirm actual services, applicability/compatibility, standalone prices/material wording, policies, service areas, transport rates and support hours. Publish only accurate content/guides. A guide showing a garment is not an approved body guide.

ImageKit public upload/import and one representative public delivery were verified. Private uploads remain gated off. In staging verify unsigned original/named-transform denial, short-lived signed expiry, owner/admin access, unrelated-account denial, deletion/failure behavior and absence of private URLs in public responses. Set the private flag true only after recording those results. See [ImageKit security](https://imagekit.io/docs/media-delivery-basic-security). Keys alone do not prove privacy.

## Verification and rollback

After deployment, verify `/health/live`200 and `/health/ready`200; simulate DB unavailability in staging and expect503. Readiness currently checks DB connection, not every integration. Check actual request logs, error rates, uptime and quota alerts. Restart/redeploy the API and confirm the same saved order/draft/quote survives. Repeat guest→customize→login→review→submit once, reload receipt, second-account/admin denial, quote revision acceptance, manual logistics updates, support/worker/review permissions and public/private image checks. Capture deploy IDs/source snapshot, environment names, safe request IDs and outcomes.

Use [operations](operations.md) for restore/incident procedures. Rollback a compatible prior build in Render and restore a verified data/media backup only if needed after reconciling later writes/deletions. Source rollback does not reverse uploads, migrations, order submissions or accepted quote history. Do not restore earlier paid-length logic against the current requirement. A restore rehearsal and actual deployment smoke remain outstanding.
