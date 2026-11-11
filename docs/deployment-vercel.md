# GitHub and Vercel deployment

## Current deployment and incident status

Commit `5eb0c0fd8a9e0332b11bd889054c8c10f8762f60` is pushed to `main` and Vercel reports successful deployment. At `2026-11-11T09:36:59.967Z`, public GETs of `https://newkhwab-stitch.vercel.app` returned 200 for `/`, `/login`, `/health/live`, `/health/ready` and `/api/auth/capabilities`. Liveness reports `alive`; readiness reports `ready`, verifying configuration, the configured MongoDB connection and required startup indexes.

The deployed repair prevents a missing or malformed optional `IMAGEKIT_PRIVATE_POLICY_VERIFIED` flag from blocking authentication startup. Only the exact string `true` enables new private uploads. Malformed values disable them and produce a names-only warning. The owner confirmed successful existing-account login and page refresh on this deployment. This is owner verification, not an agent password test. Live logout/reset, database transactions, ImageKit delivery privacy and email remain unverified. See the [incident record](login-deployment-incident-2026-11-11.md).

Earlier failures included an invalid Express export, missing SPA fallback and strict rejection of the optional policy flag. Those startup/routing failures no longer reproduce in the latest public probe. Additional API checks verified trusted-origin login preflight 204, untrusted-origin 403 `ORIGIN_FORBIDDEN` and empty login 400 `VALIDATION_ERROR`; none submitted credentials. Complete business/provider workflows remain separate checks.

## Exact current settings

Use one Vercel project with the Services configuration committed in `vercel.json`. Keep the project root at the repository root. Do not select only `client` or `server`.

| Project setting | Current value |
|---|---|
| Git branch | `main` |
| Root Directory | Repository root (`.`) |
| Framework | Services; use the committed `services` configuration |
| Root Install / Build overrides | Unset; each service owns its dependencies and build |
| Root Output Directory override | Unset; do not set `client/dist` at project level |
| Node.js version | 24.x, matching repository package engines |
| Public API base | Same-origin `/api`; no separate backend hostname |

| Service setting | Frontend | Backend |
|---|---|---|
| Service name | `khwab-stitch-web` | `khwab-stitch-api` |
| Root | `client` | `server` |
| Framework | Vite | Express |
| Build | `npm run build` | Express framework default; `npm run build` validates server source locally |
| Output | `dist` | Framework-managed Node function; no static output directory |
| Entrypoint | Vite default | `src/vercel.js` |
| Dependencies | Service package and committed lockfile | Service package and committed lockfile |

The root `npm run setup` and `npm run build` scripts remain local/CI workspace commands. Do not copy the earlier single-project build/output overrides into Services. The preserved `api/index.js` adapter is not the current deployed service entry. `server/src/index.js` remains the standalone local entry.

Top-level rewrites route `/api/**` and `/health/**` to the backend before the frontend catch-all. The frontend service serves existing files, returns404 for missing known assets, then sends application paths to `/index.html`. Services preserve the original request path, so Express routes remain mounted at `/api/**`.

Read the current official [Services guide](https://vercel.com/kb/guide/vercel-services), [Express support](https://vercel.com/docs/frameworks/backend/express) and [Vite deployment guidance](https://vercel.com/docs/frameworks/frontend/vite). Older documentation examples using `experimentalServices` describe a previous configuration; do not replace the working `services` block with them.

## Runtime behavior and hosting limits

The dedicated Express entry exports an application before loading configuration, MongoDB or provider integrations. `src/app.js` also exposes that gateway as its default export to remain valid if framework detection selects the previously failing path. Liveness does not depend on database startup; readiness and business APIs retain required configuration/index checks.

A warm function instance shares one pending initialization and MongoDB connection; a failed initialization is cleared for a later retry. The Mongo pool is capped at 5 connections per instance, production auto-indexing is disabled, and durable sessions, orders, drafts, messages, credits and rate buckets remain in MongoDB. Initialization errors return a no-store JSON 503 with a safe code and request ID. Operational logs contain approved field names and stage codes, not secret values or raw provider errors.

ImageKit provides durable media storage; function-local files are not permanent storage. The app prepares uploads within its 3 MiB serverless image budget because Vercel documents a 4.5 MB function request/response limit. Verify the current plan and runtime limits before rollout; no custom function-duration setting is present in the current Services configuration. Messaging uses request-based polling and does not depend on a continuously running WebSocket server. Run migrations, backup and cleanup as explicit operator tasks rather than assuming an in-process timer will survive function suspension. See [function limits](https://vercel.com/docs/functions/limitations).

Business use requires an appropriate commercial plan. Vercel Hobby is for personal, non-commercial use; confirm current plan terms, limits, region and spending controls privately before taking orders. No plan was purchased. See [Hobby terms](https://vercel.com/docs/plans/hobby) and [plans](https://vercel.com/docs/plans).

## Hosting environment variables

Set variables privately in this Vercel project's Environment Variables settings, with Production selected for the production deployment and separate Preview settings where needed. Project variables are available during builds and function execution. Changes apply only to a new deployment: save, then redeploy. Do not export/download secret values into reports or put server secrets in `VITE_` variables. See [Vercel environment management](https://vercel.com/docs/environment-variables/managing-environment-variables).

| Name | Scope and requirement |
|---|---|
| `NODE_ENV` | Backend production runtime |
| `MONGODB_URI` | Required backend-only intended database connection; restricted database user and transaction-capable replica set |
| `JWT_SECRET` | Required backend-only canonical base64url encoding of at least 48 random bytes; preserve across normal redeploys |
| `CORS_ORIGINS` | Required exact trusted HTTPS origins; no wildcard, path or trailing slash |
| `TRUST_PROXY_HOPS` | Backend proxy setting; review the actual hosting proxy chain |
| `IMAGEKIT_PRIVATE_KEY` | Backend-only existing ImageKit key |
| `IMAGEKIT_URL_ENDPOINT` | Backend ImageKit HTTPS delivery endpoint |
| `IMAGEKIT_PRIVATE_POLICY_VERIFIED` | Only exact `true` enables new private uploads; use `false` until live privacy checks pass |
| `LOG_LEVEL` | Backend operational log level, normally `info` |
| `VITE_API_BASE_URL` | Public frontend build-time API base; omit to use `/api`, or set `/api` |
| `GOOGLE_CLIENT_ID` | Optional backend GIS audience for the same account system |
| `RESEND_API_KEY` | Optional backend email provider key; configure with both email variables below |
| `EMAIL_FROM` | Optional verified sender, required when email is enabled |
| `PUBLIC_WEB_URL` | Optional exact frontend HTTPS origin for email actions; configure with both email variables above |

The email trio must be complete or entirely absent. Optional Google and ImageKit settings do not prove their providers have been verified. Firebase remains removed.

The policy flag is an operator gate, not a privacy test result. While disabled, customer reference/measurement uploads return `PRIVATE_MEDIA_UNVERIFIED` without uploading bytes to ImageKit. Do not enable it merely to clear an error. Verify unsigned originals and unsafe named transformations are denied, authorized/unauthorized viewing works, and signed links expire before enabling it. Existing media ownership and authorized signed viewing remain enforced.

Preview URLs need exact trusted origins. Prefer a stable preview alias rather than allowing every `*.vercel.app` host. Production/custom-domain changes require coordinated origins and email settings followed by a redeploy.

## Database and migration order

1. Current readiness verifies connection to the configured MongoDB database and required startup indexes. Independently confirm database identity, restricted user, network policy and transaction behavior before launch. Review stable egress or private networking where available; do not treat an unrestricted network allowlist as a permanent security strategy.
2. Back up and rehearse restoration to a separate restricted database. Mongo metadata does not back up ImageKit image bytes. Confirm actual retention, recovery targets and media recovery procedures.
3. From a trusted operator terminal with the intended environment, run `npm --prefix server run db:indexes`. Review backups and legacy credential constraints first. The tool creates required indexes; startup deliberately fails closed if critical indexes are absent. Do not seed production.
4. Register and independently verify the owner's account, then run `npm --prefix server run admin:provision -- owner@example.com`. Sign in again after promotion. There is no default admin/password or public promotion endpoint.
5. Review imported design/guide drafts, garment applicability, compatibility, real prices and material wording before publication. See [catalogue repair](catalogue-repair.md), [admin guide](admin-guide.md) and [visual import](visual-import.md).
6. Review optional legacy-option migration plans separately. Sleeve length is free in new estimates; do not rewrite historical accepted prices.
7. Keep commerce programmes disabled until owner-approved terms and deployed finance reconciliation checks pass. Fixture prices are not business prices.

## Current verification and deployment smoke checks

The [passing CI baseline for `5eb0c0f`](https://github.com/khwabstitch-max/newKhwab-stitch/actions/runs/42996486297) passed both linters, 230 server tests, 189 client tests, both builds, source checks and both production dependency audits for `5eb0c0f`. Tests use disposable MongoDB and provider mocks. Three earlier isolated Chrome journeys are separate local evidence. Public readiness now verifies the deployed MongoDB connection/index startup, not full transaction or provider behavior.

The earlier `0f9d467` run failed `check:isolated`; its precise failing subcheck was not available anonymously. That historical failure is separate from the later identified client-test race. Individual CI steps now expose which check fails.

The docs-only `60626a4` CI rerun passed server/client lint, 230 server tests and both builds, but client tests passed 188/189: the exact-copy test clicked submit before the 150 ms estimate debounce completed. A controlled-promise regression confirmed the race. The repair records the pricing request key, invalidates review submission immediately on quantity/logistics/configuration changes, hides stale prices and ignores old responses. It preserves guest login continuation and retries of an uncertain submitted snapshot. All190client tests passed locally with `node scripts/isolated.mjs client-test --maxWorkers=1 --report artifacts/current-estimate-client-serial.txt`; client lint/build and source checks passed. The first combined local run exhausted worker memory. The bounded rerun changed concurrency only, not assertions/timeouts/retries. Check [Actions](https://github.com/khwabstitch-max/newKhwab-stitch/actions) for the exact deployed commit's CI result rather than inferring it from the earlier baseline.

After each replacement deployment, repeat:

```powershell
node scripts/probe-live.mjs https://newkhwab-stitch.vercel.app
```

This makes public GET requests only. Expect homepage/login HTML 200, liveness JSON 200, and readiness/auth capabilities JSON 200 when remaining configuration, database connectivity and indexes are correct. A request ID identifies the matching safe runtime log. Correct only the named setting or diagnosed stage; do not weaken authentication or index requirements.

Existing-account login and refresh are owner-confirmed. Use authorized isolated accounts to complete signup/duplicate/wrong-password, temporary-failure, logout-revocation, real recovery-email and single-use reset checks. Verify guest customization through explicit submission, current quote acceptance, history/tracking, admin CRUD, private uploads/owner isolation, replacement/archive protection, worker access and support flows. Confirm persistence after another deployment. Public health success alone does not verify these workflows.

Record actual results and request IDs without credentials, signed image URLs or reset links. Live customer launch remains blocked until deployed authentication, provider privacy/recovery, approved business content and operational recovery checks pass.

## Rollback

Keep a compatible source commit/deployment ID and protected database/media backups. Vercel rollback does not undo orders, quotes, ledger events, migrations or media changes. Prefer additive changes; preserve account ownership and historical snapshots. Restore only after reconciling later writes and approved deletion records. Keep commerce disabled during ledger incidents. No live migration, media deletion or paid change is authorized by this runbook alone.
