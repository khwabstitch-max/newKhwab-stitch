# Production readiness - current Vercel Services deployment

A successful build or deployment is not a launch decision. Status terms: **Verified**, **Implemented but unverified**, **Missing configuration**, **Production blocker**, **Optional improvement**. Local/provider-mock evidence is distinct from live account and provider checks.

## Deployment status on 11 November 2026

Commit `5eb0c0f` is pushed to `main` and Vercel reports successful deployment. The public probe at `2026-11-11T09:36:59.967Z` returned 200 for `/`, `/login`, `/health/live`, `/health/ready` and `/api/auth/capabilities`. Liveness reports `alive`; readiness reports `ready`, verifying configured MongoDB connection and required startup indexes.

The deployed optional-policy repair defaults malformed values to disabled. Only exact `true` enables private uploads; disabled private uploads stop before ImageKit. Current CI passed 230 server tests, 189 client tests, both linters/builds, source checks and production dependency audits. The owner confirmed existing-account login and refresh work on this deployment; the agent did not receive or submit a password. Live logout/reset, transactions, ImageKit privacy and email remain unverified.

| Check | Status | Evidence and remaining action |
|---|---|---|
| Frontend build and local workflows | Verified locally and in CI | Current 189 client tests and build pass; three earlier isolated Chrome journeys are local evidence |
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
| Current GitHub CI for `5eb0c0f` | Verified | Run 42996486297 passed both linters, 230 server/189 client tests, both builds, source checks and production audits |
| Full deployed flow and restart persistence | Implemented but unverified | Verify actual account/order/media persistence across navigation, refresh and another deployment |
| Commercial hosting, backup/restore and monitoring | Production blocker | Confirm appropriate plan, operational ownership, recovery rehearsal and spend/usage monitoring |
| Catalogue prices, compatibility and measurement guides | Production blocker for unapproved content | Imported drafts stay unpublished until accurate options/prices/material wording/guides are approved |
| Optional offers, referrals and credits | Verified locally; disabled by default | Owner policy, deployed concurrency/reconciliation and acceptance checks required before enabling |
| Production dependency audits | Verified in current CI | Both server/client production audits passed; dev-only advisories require separate maintenance review |
| Wider device, accessibility and language coverage | Optional improvement | Broader manual checks beyond the documented local journeys remain useful |

## Exact deployment configuration

Use repository root `.` with the committed `services` block. Leave root install/build/output overrides unset. Frontend service `khwab-stitch-web`: root `client`, Vite, build `npm run build`, output `dist`. Backend service `khwab-stitch-api`: root `server`, Express, entry `src/vercel.js`, Node 24.x and framework-managed function output. API/health rewrites precede the frontend; the frontend service owns its filesystem and SPA routes.

Do not use obsolete root preset Other, root output `client/dist` or `api/index.js` function settings for this Services deployment. The older adapter remains in source for compatibility. See the [current deployment runbook](deployment-vercel.md).

## Evidence required before real orders

1. Keep readiness/auth capabilities 200 checks in every deployment smoke test. Do not enable the private-policy flag until provider privacy is verified.
2. Preserve the passing [current CI result](https://github.com/khwabstitch-max/newKhwab-stitch/actions/runs/42996486297). The earlier `0f9d467` failure's exact subcheck remains unknown, but it is no longer the current verification blocker.
3. Existing-account login and refresh are owner-confirmed. Complete authorized CustomerA/CustomerB/Admin signup/duplicate/wrong-password checks, logout revocation, ownership boundaries and email reset with actual delivery.
4. Verify guest customization, measurements/logistics, login continuation, explicit submission, idempotent retry, admin quote/current acceptance and real tracking/history on the deployed site.
5. Verify ImageKit private/public behavior, upload failure, replacement/archive, historical references and unauthorized viewing before enabling customer private uploads.
6. Confirm commercial plan suitability, approved catalogue and guides, backup/restore, monitoring and incident ownership. Keep optional commerce disabled until owner policy and deployed reconciliation checks pass.

No live customer launch is verified yet. No environment files or provider secrets were accessed, and no paid purchase or live customer-data migration was performed in this review. See [operations](operations.md), [capacity assumptions](capacity-plan.md), [earlier local evidence](review-verification.md) and the [deployment incident](login-deployment-incident-2026-11-11.md).
