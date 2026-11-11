# Production readiness - current Vercel Services deployment

A successful build or deployment is not a launch decision. Status terms: **Verified**, **Implemented but unverified**, **Missing configuration**, **Production blocker**, **Optional improvement**. Local/provider-mock evidence is distinct from live account and provider checks.

## Deployment status on 11 November 2026

The owner pushed `main` at `0f9d467`; Vercel deployment succeeded. Public GETs verify `/login` HTML 200 and `/health/live` JSON 200. Readiness and auth capabilities return 503 `CONFIGURATION_INVALID`. The owner's safe runtime log names `IMAGEKIT_PRIVATE_POLICY_VERIFIED`. That configuration error occurs before production MongoDB connection or credential validation.

The local repair defaults malformed optional-policy values to disabled. Only exact `true` enables private uploads; otherwise customer reference/measurement uploads remain blocked before ImageKit upload. Names-only warnings identify malformed configuration without exposing its value. The repair passed 230 local server tests, server lint and source validation. Deployment of this latest repair and live authentication remain pending.

| Check | Status | Evidence and remaining action |
|---|---|---|
| Frontend build and local workflows | Verified locally | Historical 189 client tests, production build and three isolated Chrome journeys; not a live account test |
| GitHub source and Vercel deployment | Verified | Owner's `main` commit `0f9d467` deployed; current Services routing serves direct login and liveness |
| Backend entry and SPA routes | Verified | Explicit `server/src/vercel.js`, valid default Express export and frontend SPA fallback; public login/live 200 |
| Optional private-policy configuration repair | Implemented but unverified on deployment | 230 local server tests pass; only exact `true` enables private upload; deploy and recheck |
| Deployed readiness and account login | Production blocker | Current 503 configuration failure; after repair, verify readiness, valid/invalid credentials, refresh and logout |
| Authentication persistence and revocation | Verified locally | Disposable Mongo/JWT API and Chrome flows, transient-error regressions and fresh-connection continuity |
| Mongo transactions, indexes, ownership and credits | Verified locally | Local server suite; production Atlas was not reached by the configuration-failing startup |
| Production Atlas connectivity and required indexes | Implemented but unverified | Confirm intended database/network, reviewed migration and readiness; no production data changes performed |
| Image validation and provider adapter | Verified locally | Actual multipart/Sharp checks and mocked privacy/metadata/cleanup failures |
| Real ImageKit private delivery | Implemented but unverified | Verify uploads, durable metadata, unsigned/named-transform denial, owner isolation and signed expiry; keep private-policy gate disabled until verified |
| Real recovery email and optional Google | Implemented but unverified | Local one-use reset, generic responses and rate-limit tests; actual sender/inbox/origins need verification |
| Hosting environment settings | Missing configuration | Known malformed private-policy flag; other settings/provider correctness remain unverified; no values requested in chat |
| GitHub CI for `0f9d467` | Production blocker for verification sign-off | `check:isolated` failed; detailed log/artifact requires owner access; next workflow exposes individual checks |
| Hosting restart, cold start and full deployed flow | Implemented but unverified | Verify actual account/order/media persistence after replacement deployment |
| Commercial hosting, backup/restore and monitoring | Production blocker | Confirm appropriate plan, operational ownership, recovery rehearsal and spend/usage monitoring |
| Catalogue prices, compatibility and measurement guides | Production blocker for unapproved content | Imported drafts stay unpublished until accurate options/prices/material wording/guides are approved |
| Optional offers, referrals and credits | Verified locally; disabled by default | Owner policy, deployed concurrency/reconciliation and acceptance checks required before enabling |
| Dependency audits | Verified locally at earlier review | Earlier production audits had no findings; historical server dev chain had 4 moderate advisories; latest failed CI skipped audits |
| Wider device, accessibility and language coverage | Optional improvement | Broader manual checks beyond the documented local journeys remain useful |

## Exact deployment configuration

Use repository root `.` with the committed `services` block. Leave root install/build/output overrides unset. Frontend service `khwab-stitch-web`: root `client`, Vite, build `npm run build`, output `dist`. Backend service `khwab-stitch-api`: root `server`, Express, entry `src/vercel.js`, Node 24.x and framework-managed function output. API/health rewrites precede the frontend; the frontend service owns its filesystem and SPA routes.

Do not use obsolete root preset Other, root output `client/dist` or `api/index.js` function settings for this Services deployment. The older adapter remains in source for compatibility. See the [current deployment runbook](deployment-vercel.md).

## Evidence required before real orders

1. Deploy the reviewed policy repair or privately correct the named flag, then verify readiness/auth capabilities 200. Do not set the policy flag to `true` merely to clear startup.
2. Inspect the failed GitHub report and obtain a passing rerun. The current public API establishes only that `check:isolated` failed; its failing subcheck is unknown. See the [failed job](https://github.com/khwabstitch-max/newKhwab-stitch/actions/runs/42991978077/job/130426800687).
3. Verify authorized CustomerA/CustomerB/Admin signup/login, duplicate and wrong-password rejection, refresh, logout revocation, ownership boundaries and email reset with actual delivery.
4. Verify guest customization, measurements/logistics, login continuation, explicit submission, idempotent retry, admin quote/current acceptance and real tracking/history on the deployed site.
5. Verify ImageKit private/public behavior, upload failure, replacement/archive, historical references and unauthorized viewing before enabling customer private uploads.
6. Confirm commercial plan suitability, approved catalogue and guides, backup/restore, monitoring and incident ownership. Keep optional commerce disabled until owner policy and deployed reconciliation checks pass.

No live customer launch is verified yet. No environment files or provider secrets were accessed, and no paid purchase or live customer-data migration was performed in this review. See [operations](operations.md), [capacity assumptions](capacity-plan.md), [earlier local evidence](review-verification.md) and the [deployment incident](login-deployment-incident-2026-11-11.md).
