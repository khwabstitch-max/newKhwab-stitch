# Production readiness - current Vercel Services deployment

A successful build or deployment is not a launch decision. Status terms: **Verified**, **Implemented but unverified**, **Missing configuration**, **Production blocker**, **Optional improvement**. Local/provider-mock evidence is distinct from live account and provider checks.

## Deployment status on 11 November 2026

The collection-network follow-up adds explicit anonymous public-read recovery and a native MongoDB readiness probe. Its local suites passed 234 server and 219 client tests, plus lint/build checks. The earlier deployment/account evidence below remains historical; exact follow-up CI and browser fault-injection results are tracked in the [collection incident](collection-network-incident-2026-11-11.md) and per-commit Actions checks. The original signed-in browser's transport trigger is not established by anonymous browser tests.

Commit `5eb0c0f` is pushed to `main` and Vercel reports successful deployment. The public probe at `2026-11-11T09:36:59.967Z` returned 200 for `/`, `/login`, `/health/live`, `/health/ready` and `/api/auth/capabilities`. Liveness reports `alive`; readiness reports `ready`, verifying configured MongoDB connection and required startup indexes.

The deployed optional-policy repair defaults malformed values to disabled. Only exact `true` enables private uploads; disabled private uploads stop before ImageKit. The passing `5eb0c0f` CI baseline covered 230 server tests, 189 client tests, both linters/builds, source checks and production audits. The owner confirmed existing-account login and refresh work on this deployment; the agent did not receive or submit a password. Live logout/reset, transactions, ImageKit privacy and email remain unverified.

| Check | Status | Evidence and remaining action |
|---|---|---|
| Frontend build and local workflows | Verified locally | Estimate repair passed all190client tests with one worker plus lint/build; the earlier combined run exhausted local worker memory |
| GitHub source and Vercel deployment | Verified | `main` commit `5eb0c0f` deployed; public frontend/API health routes return 200 |
| Backend entry and SPA routes | Verified | Explicit `server/src/vercel.js`, valid default Express export and frontend SPA fallback; public login/live 200 |
| Optional private-policy configuration repair | Verified for startup; private-upload safety tested locally/CI | Deployed configuration no longer blocks startup; malformed flag never enables private upload |
| Deployed readiness | Verified | JSON 200 `ready` and auth capabilities 200 in latest public probe |
| Login API boundary | Verified | Trusted-origin preflight 204, untrusted-origin 403 and empty-login 400; no credentials submitted |
| Existing-account login and refresh | Verified by owner | Owner confirmed both on deployed `5eb0c0f`; agent did not submit credentials; logout/reset remain unverified live |
| Mongo transactions, ownership and credits | Verified locally/CI | 230 server tests pass; deployed transaction and ownership workflows remain unverified |
| Configured MongoDB connection and required indexes | Verified for deployed startup | Readiness 200 proves connection and required startup checks; database identity/network review, transactions and restore remain separate |
| Image validation and provider adapter | Verified locally | Actual multipart/Sharp checks and mocked privacy/metadata/cleanup failures |
| Real ImageKit private delivery | Implemented but unverified | Verify uploads, durable metadata, unsigned/named-transform denial, owner isolation and signed expiry; keep private-policy gate disabled until verified |
| Real recovery email and optional Google | Implemented but unverified | Local one-use reset, generic responses and rate-limit tests; actual sender/inbox/origins need verification |
| Hosting environment settings | Verified for startup; providers unverified | Readiness succeeds; provider capability, privacy and delivery still need actual checks; no secret values accessed |
| CI baseline for `5eb0c0f` | Verified historical baseline | Run 42996486297 passed both linters, 230 server/189 client tests, both builds, source checks and production audits |
| Estimate-readiness follow-up | Verified locally; per-commit CI gate | Current-price guard, immediate invalidation, stale-response rejection and uncertain retries covered; inspect linked Actions for the exact commit's result |
| Full deployed flow and restart persistence | Implemented but unverified | Verify actual account/order/media persistence across navigation, refresh and another deployment |
| Commercial hosting, backup/restore and monitoring | Production blocker | Confirm appropriate plan, operational ownership, recovery rehearsal and spend/usage monitoring |
| Catalogue prices, compatibility and measurement guides | Production blocker for unapproved content | Imported drafts stay unpublished until accurate options/prices/material wording/guides are approved |
| Optional offers, referrals and credits | Verified locally; disabled by default | Owner policy, deployed concurrency/reconciliation and acceptance checks required before enabling |
| Production dependency audits | Verified in `5eb0c0f` CI baseline | Both server/client production audits passed; dev-only advisories require separate maintenance review |
| Wider device, accessibility and language coverage | Optional improvement | Broader manual checks beyond the documented local journeys remain useful |

## Exact deployment configuration

Use repository root `.` with the committed `services` block. Leave root install/build/output overrides unset. Frontend service `khwab-stitch-web`: root `client`, Vite, build `npm run build`, output `dist`. Backend service `khwab-stitch-api`: root `server`, Express, entry `src/vercel.js`, Node 24.x and framework-managed function output. API/health rewrites precede the frontend; the frontend service owns its filesystem and SPA routes.

Do not use obsolete root preset Other, root output `client/dist` or `api/index.js` function settings for this Services deployment. The older adapter remains in source for compatibility. See the [current deployment runbook](deployment-vercel.md).

## Evidence required before real orders

1. Keep readiness/auth capabilities 200 checks in every deployment smoke test. Do not enable the private-policy flag until provider privacy is verified.
2. Require a passing [Actions result](https://github.com/khwabstitch-max/newKhwab-stitch/actions) for the exact deployed commit. The complete local190-client-test rerun passed with one worker after the initial parallel run exhausted local memory. The [green `5eb0c0f` baseline](https://github.com/khwabstitch-max/newKhwab-stitch/actions/runs/42996486297) predates the estimate-readiness repair. That repair binds prices to the current request, immediately invalidates review submission on price-affecting edits, hides stale prices and ignores stale responses, preserving guest login and uncertain retries.
3. Existing-account login and refresh are owner-confirmed. Complete authorized CustomerA/CustomerB/Admin signup/duplicate/wrong-password checks, logout revocation, ownership boundaries and email reset with actual delivery.
4. Verify guest customization, measurements/logistics, login continuation, explicit submission, idempotent retry, admin quote/current acceptance and real tracking/history on the deployed site.
5. Verify ImageKit private/public behavior, upload failure, replacement/archive, historical references and unauthorized viewing before enabling customer private uploads.
6. Confirm commercial plan suitability, approved catalogue and guides, backup/restore, monitoring and incident ownership. Keep optional commerce disabled until owner policy and deployed reconciliation checks pass.

No live customer launch is verified yet. No environment files or provider secrets were accessed, and no paid purchase or live customer-data migration was performed in this review. See [operations](operations.md), [capacity assumptions](capacity-plan.md), [earlier local evidence](review-verification.md) and the [deployment incident](login-deployment-incident-2026-11-11.md).
