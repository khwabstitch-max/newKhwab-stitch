# Deployed login failure — 11 November 2026

Site: `https://newkhwab-stitch.vercel.app`. The previous review verified isolated local API/browser behavior, not successful authentication on this deployment.

## Evidence and root cause

Read-only public checks found the homepage200, direct `/login`404, and `/health/live`, `/health/ready`, `/api/auth/capabilities`500 with Vercel's plain-text `FUNCTION_INVOCATION_FAILED`. No application request ID was present. No passwords, tokens, authenticated requests or environment files were used. The current observations are in ignored `artifacts/live-auth-probe.json`.

The owner provided the runtime error: `Invalid export found in module "/var/task/server/src/app.mjs"`. Vercel Express auto-detected `src/app.js`, but that module exported the injectable `createApp` factory rather than a default Express app. A `main` field in package.json alone did not prevent that detection. Separately, the current Services frontend did not define its SPA fallback, so direct login/navigation URLs404ed.

## Repair

- Keep named `createApp` for local development/tests and expose a real default Express gateway from the auto-detected module.
- Explicitly select the dedicated `src/vercel.js` API service entry instead of relying on detection. Configuration/database/SDK loading happens within the request error boundary, not before an app can export.
- Keep the owner's Services deployment and put filesystem/SPA fallback routes inside its frontend service. API routes remain on their original `/api/**` paths.
- Provide independent liveness and fail-closed readiness/authentication. Missing configuration, database connectivity or required indexes produce safe JSON503 with a precise error code and request ID; only approved configuration field names may appear in logs. Passwords, URIs, tokens, provider values and raw errors are never logged.
- Add regression tests importing the same `src/app.js` module Vercel selected. Earlier tests exercised only the app factory and therefore did not cover this failure.

Authentication/index requirements are not bypassed, and no startup migration or customer-data mutation was performed.

## Authorized deployment and second blocker

The owner authorized commit/push/redeployment. Commit `0f9d467` was pushed to GitHub `main`; GitHub's Vercel status reports successful deployment. The live probe at `2026-11-11T09:06:27.999Z` found `/` and `/login` HTML200 and `/health/live` JSON200. The invalid-export crash and SPA deep-link failure were therefore repaired on the actual deployment.

Readiness and auth capabilities then returned JSON503 `CONFIGURATION_INVALID`, with request ID `d4035de0-c339-4936-ad5a-ae8fdb694218`. The owner supplied the matching names-only log: `configurationFields:["IMAGEKIT_PRIVATE_POLICY_VERIFIED"]`. This validation failure happened before database connection or password verification; no conclusion about production MongoDB connectivity could be drawn.

The follow-up repair treats a malformed optional privacy flag as disabled, rather than preventing the whole authentication service from starting. Only the exact string `true` enables private uploads. Every other value resolves to `false`; malformed values produce a `private_media_disabled` warning containing only the field name. The existing adapter continues to reject private uploads with `PRIVATE_MEDIA_UNVERIFIED` before any ImageKit upload call. Required MongoDB/JWT/origin settings remain strict. The operator should set `IMAGEKIT_PRIVATE_POLICY_VERIFIED=false` until real provider privacy checks pass, then explicitly opt in; this review did not read or change its value.

Regression evidence: actual auth-capabilities routing with a malformed flag, private-upload rejection without an SDK call, exact opt-in behavior, and unchanged mandatory configuration validation. Full isolated server tests, lint and backend build passed. Production account login, actual ImageKit privacy, recovery email and live database/index readiness still require their own successful checks.

## Verified resolution

Commit `5eb0c0fd8a9e0332b11bd889054c8c10f8762f60` was pushed to `main` and Vercel successfully deployed it. The public probe at `2026-11-11T09:36:59.967Z` returned200 for `/`, `/login`, `/health/live`, `/health/ready` and `/api/auth/capabilities`. Readiness reported `ready`, confirming production database connection and required startup index assertions for that deployment. This does not verify every production transaction or external provider.

The owner then tested the existing account in the live browser and explicitly confirmed: **login and refresh both work**. No password, token, environment file or private account data was supplied to this review. Further live checks confirmed trusted-origin login preflight204, untrusted-origin403 `ORIGIN_FORBIDDEN`, and empty login payload400 `VALIDATION_ERROR` rather than a startup failure.

The [GitHub Actions run for this repair](https://github.com/khwabstitch-max/newKhwab-stitch/actions/runs/42996486297) also passed: server/client lint, server/client tests, both builds, source credential-pattern check and both production dependency audits. Local evidence was230server tests and189client tests. The prior failed run remains historical; its exact failed subcheck was unavailable anonymously. No check was bypassed to obtain the new passing run.

This login incident is resolved with deployed endpoint and owner-browser evidence. Actual ImageKit upload/privacy policy, email delivery/reset, deployed logout/revocation and the broader launch checklist remain separate checks. Malformed optional media verification remains disabled; do not set it to `true` before provider policy verification.

## CI follow-up: current-estimate submission

A subsequent docs-only rerun at `60626a4` exposed an intermittent client journey failure:188tests passed and the exact-copy retry test failed. The isolated report was retrieved using the existing repository credential transport without printing or persisting its credentials. It expected the uncertain-submission response but received `Review a current estimate before submitting.` The test clicked an enabled submit control before the initial150ms debounced estimate request completed.

The UI now associates each successful estimate with its exact pricing request. Authenticated first submission stays disabled until the matching response arrives, including immediately after quantity/logistics/customization edits and before the debounce timer starts. Stale prices are hidden and aborted/superseded responses cannot restore submission readiness. The submit handler retains the same guard. Guest login continuation and uncertain retries of an already frozen request remain supported.

The regression uses controlled response promises to cover initial loading, immediate quantity-change invalidation, a superseded response and the final matching price. The original exact-copy test waits for observable submission readiness. No sleep, timeout increase, blanket retry or security-check exemption was added. See the [workflow runs](https://github.com/khwabstitch-max/newKhwab-stitch/actions) for the final verification of this follow-up.

## Verify the replacement deployment

```powershell
node scripts/probe-live.mjs https://newkhwab-stitch.vercel.app
```

Expected: `/` and `/login` return HTML200; `/health/live` JSON200; `/health/ready` and `/api/auth/capabilities` JSON200 when hosting configuration/database/indexes are correct. This script uses only public GETs and never submits credentials.

If readiness returns503, inspect its error code and the matching safe `bootstrap_failed` log:

| Code | Operator action |
|---|---|
| `CONFIGURATION_INVALID` | Correct the named Vercel environment setting; never paste values into chat |
| `DATABASE_CONNECTION_FAILED` | Verify the intended MongoDB URI, database user and Vercel network access privately |
| `AUTH_INDEXES_REQUIRED` | Review backup/legacy migration, then run the explicit `db:indexes` tool against the intended database |
| `FEATURE_INDEXES_REQUIRED` / `DEPLOYMENT_INDEXES_REQUIRED` | Apply the reviewed additive index migration; no automatic deletion/migration endpoint exists |
| `GOOGLE_INDEXES_REQUIRED` | Review Google identity uniqueness before enabling optional Google auth |
| `RUNTIME_IMPORT_FAILED` | Inspect the deployment's dependency packaging; this occurs before app/database initialization |

After those checks pass, verify correct/wrong login, refresh, logout revocation and an existing customer's order visibility using an authorized test account. A local test pass is not proof that hosting secrets, indexes or a deployment are correct. The resolution evidence above covers public startup/readiness and the owner's successful login/refresh; the remaining smoke cases still require separate verification.

Sources: [Vercel Express exports](https://vercel.com/docs/frameworks/backend/express), [Services entry points/routing](https://vercel.com/kb/guide/vercel-services), [Vite SPA deep links](https://vercel.com/docs/frameworks/frontend/vite).
