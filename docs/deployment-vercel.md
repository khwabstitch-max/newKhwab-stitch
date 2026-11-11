# GitHub → Vercel deployment

Current target: one Vercel project containing the existing Vite frontend and Express API. This supersedes Render as the requested target. `render.yaml` and the standalone entry remain compatibility material; they are not deleted. Nothing has been published or purchased. This review never read `.env` files or used configured customer/provider credentials.

## What is implemented

`vercel.json` selects root-level builds and `client/dist` output. `/api/**` and `/health/live|ready` route to `api/index.js` before SPA fallback. Existing static files are served before fallback, and missing assets receive404 rather than HTML. `api/index.js` exports `server/src/serverless.js`; it does not import the standalone `listen()` entry, start a daemon or load dotenv.

The loader shares one pending initialization/connection within each warm function instance, resets failed initialization for a later attempt, caps each Mongo pool at5, disables production autoIndex and checks required credential/extension/commerce/rate indexes. MongoDB holds account revocation, orders, drafts, messages, credits and shared rate buckets. Cold starts do not require a new session. Initialization failures return a generic no-store503 and a safe request ID; logs contain only safe event/name/ID fields.

Vercel supports Express/Node functions and documents Fluid compute. Function bodies are limited to4.5MB; this app prepares at most3 MiB image payloads before multipart upload, retaining the5 MiB source-file allowance and server-side decode/privacy checks. Runtime ImageKit, not function-local disk or Mongo image binaries, stores media. Read [official Express support](https://vercel.com/docs/frameworks/backend/express) and [function limits](https://vercel.com/docs/functions/limitations).

The function maximum is explicitly60 seconds, not a claimed platform maximum. Current Fluid documentation lists300 seconds by default and up to800 seconds generally on Pro/Enterprise, with longer beta options; these are platform limits, not performance targets. This request-oriented app requires no long-running daemon. Messaging uses visibility/offline-aware polling. Beta WebSocket support exists, but is not required or enabled here; see the [official WebSocket announcement](https://vercel.com/changelog/websocket-support-is-now-in-public-beta). Operator cleanup/backup jobs remain explicit tasks; do not rely on an in-process timer surviving function suspension.

## Exact project settings

The local repository is initialized on `main`; no commit, remote or push was created. Before the first push, review the source and example-file contents yourself (environment examples were deliberately not inspected), then use your own GitHub repository:

```powershell
git add .
git commit -m "Complete Khwab Stitch application and Vercel preparation"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

These are operator steps, not commands executed by this review. Real environment files, dependencies, private uploads, test runtime binaries and artifacts remain ignored. GitHub CI uses current Node24-based official actions, isolated checks and production dependency audits, with short-lived test reports; remote CI execution is still unverified.

| Setting | Value |
|---|---|
| Source | Owner's GitHub repository and reviewed branch; no remote URL is invented |
| Root Directory | Repository root (`.`); do **not** select only `client` or `server` |
| Framework Preset | Other (`framework:null` in config) |
| Install Command | `npm run setup` — installs both committed lockfiles with `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `client/dist` |
| Node.js runtime/build |24.x from root/server/client engines; current security patch |
| Function | `api/index.js`, Node runtime,60second configured duration |
| API URL | Same-origin `/api`; no second backend hostname is needed |
| Health | `/health/live`, `/health/ready` |
| Routing | API/health first, filesystem, missing-asset404, then SPA |

Use an appropriate commercial Vercel plan before taking business orders. Hobby is restricted to personal/non-commercial projects; it is not the commercial launch plan. Confirm Pro/Enterprise terms, account limits, region and spending controls with the owner; no plan was purchased. See [Hobby terms](https://vercel.com/docs/plans/hobby), [plans](https://vercel.com/docs/plans) and [current limits](https://vercel.com/docs/functions/limitations).

## Hosting environment variables — names and scope

Enter values privately in Vercel Project Settings → Environment Variables, separately for Preview and Production. Never put server secrets in `VITE_` variables or commit real environment files.

| Name | Scope/purpose |
|---|---|
| `NODE_ENV` | Server production runtime |
| `MONGODB_URI` | Backend-only explicit restricted database, TLS, replica-set transactions |
| `JWT_SECRET` | Backend-only independent canonical base64url secret with at least 48 random bytes; preserve across normal restarts |
| `CORS_ORIGINS` | Exact trusted HTTPS frontend origins; no wildcards, paths or trailing slash |
| `TRUST_PROXY_HOPS` | Backend proxy setting;1 for the documented single Vercel proxy, review additional proxies |
| `IMAGEKIT_PRIVATE_KEY` | Backend-only existing ImageKit key |
| `IMAGEKIT_URL_ENDPOINT` | Backend ImageKit HTTPS delivery endpoint |
| `IMAGEKIT_PRIVATE_POLICY_VERIFIED` | Keep `false` until actual unsigned-original/named-transform/access/expiry checks pass |
| `LOG_LEVEL` | Backend safe operational logging, normally `info` |
| `VITE_API_BASE_URL` | Public build-time `/api`; may be omitted because this is the default |
| `GOOGLE_CLIENT_ID` | Optional GIS audience; same local JWT/account system, not Firebase |
| `RESEND_API_KEY` | Optional backend email provider key |
| `EMAIL_FROM` | Configure with verified sending domain |
| `PUBLIC_WEB_URL` | Exact frontend HTTPS origin for email actions; configure all three email variables together |

No Firebase packages, credentials or authorized-domain setup are required. For optional Google, register exact production/staging origins in Google's console. For email, verify sender ownership and real inbox delivery. See [authentication](authentication.md).

For Preview, use a stable branch/custom preview alias and include that exact origin in Preview `CORS_ORIGINS`/email settings. A new generated deployment hostname is not automatically a trusted origin. Avoid broad `*.vercel.app` access. For production/custom domains, keep one canonical frontend URL and update origins and email settings consistently before rebuilding.

## Database and migration order

1. Create a restricted staging/production database and separate credentials. Review Atlas network access for Vercel egress. The actual account's network/tier is unverified because credentials were intentionally not accessed. Prefer reviewed stable egress/private networking where available; an all-address allowlist is not a permanent security strategy.
2. Back up and rehearse restore on a separate restricted database. Mongo metadata does not back up ImageKit bytes. Confirm the actual tier's retention/RPO/RTO and ImageKit export/recovery process.
3. From a trusted operator terminal with the intended environment, run `npm --prefix server run db:indexes`. It creates all additive schema indexes and preserves documents. New production startup deliberately fails closed when critical unique/TTL indexes are absent. Do not run development seed in production.
4. Register/verify control of the owner's account; run `npm --prefix server run admin:provision -- owner@example.com`. No default password/public promotion exists. Sign in again after role promotion.
5. Existing imported options/guides remain drafts. Review applicability, compatibility, real stitching prices/material wording and measurement accuracy before publication. No repair tool auto-publishes them. See [catalogue repair](catalogue-repair.md), [admin guide](admin-guide.md) and [visual import](visual-import.md).
6. Review optional free-length metadata/legacy-option migration plans and backups before explicit execution. New estimates already enforce zero sleeve-length charge; historical accepted quotes are not rewritten.
7. Keep commerce programmes disabled until owner-approved terms/rates, finance reconciliation and production smoke tests are complete. See [commerce](commerce.md). Fixture prices are not business prices.

## Verification after the first authorized deploy

Check API JSON health/404, direct nested SPA refresh, static assets, production origins and invalid-origin rejection. Run CustomerA/CustomerB/Admin ownership checks; signup/duplicate/wrong/correct login; refresh/reload; transient503 retry; logout revocation; real reset email→reset→single-use rejection→login. Record deployment/source IDs and safe request IDs without tokens or reset links.

Complete guest→customize→measurements→logistics→login→review→explicit submit; retry with the same key; reload order/history; admin quote→current acceptance→real progress. Repeat mixed references, master help, private-media owner/other-user/expiry policy, upload failure, replace/archive/reference protection, worker assignment/revocation, complaints/reviews and a disabled/enabled test commerce programme with reversible test credits. Redeploy/restart and confirm persistence.

Local tests do not prove Vercel's packaging, actual domains, payload handling, network access, cold-start performance or provider policy. Those remain staging smoke requirements. Use [capacity plan](capacity-plan.md), [operations](operations.md) and [production readiness](production-readiness.md) to record evidence before commercial launch.

## Rollback

Keep a compatible Git commit/deployment ID and protected database/media backup. Vercel source rollback does not undo orders, accepted quotes, ledger events, imports, index migration or provider deletions. Prefer additive changes; preserve owner IDs and accepted snapshots. Restore only after reconciling later writes and approved deletion records. Keep commerce disabled during an unresolved ledger incident; do not edit balances or delete ledger rows to “fix” history. No deployment, secret rotation or live migration is authorized by this document alone.
