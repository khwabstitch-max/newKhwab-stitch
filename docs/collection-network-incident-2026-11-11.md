# Collection request failures - 11 November 2026

## Evidence

The owner reported the home collection disappearing in a normal browser window while signed in, with `Cannot reach the atelier. Check your connection and try again.Try again`. This message is produced when the browser fetch fails without an HTTP response. HTTP service errors and client timeouts use different messages. The original user's browser/network failure has not been inspected directly.

Fresh unauthenticated Chrome checks loaded three real published design cards at1366px and390px, without alerts. The first designs request took about11.3seconds and the following request about0.95seconds. The browser used the correct same-origin `/api` endpoint. Public designs/settings/reviews returned200. These observations do not prove that latency caused the owner's network failure.

A controlled browser-only failure then reset exactly the first `/api/designs` request. The deployed baseline displayed the owner's exact message and zero cards even though subsequent normal requests succeeded. The mobile reload displayed three cards. This reproduces the application's handling of a transient transport failure; it does not identify the original ISP, device, extension or server transport trigger. The ignored baseline report is `artifacts/live-browser-transient-before.json`.

## Repair boundaries

The home collection, site settings and public reviews explicitly use anonymous public reads. Those requests do not depend on the signed-in session token. An eligible read may make one additional attempt after a fetch network failure or a502/503/504 response, within the original overall timeout. Permanent failures remain visible. Authentication, private resources, mutations, cancelled requests, offline requests and client/permission/rate-limit failures retain their existing semantics. A failed public resource can recover after an observed offline-to-online transition without a polling loop.

Retry controls use `type="button"`, preventing an error retry from also submitting an enclosing form. Catalogue contents continue to come from the API; recovery does not insert options or store catalogue snapshots in browser storage.

Separately, the old readiness check used Mongoose's connection-state getter. Its stale-heartbeat heuristic can report disconnected after a serverless suspension even when the existing native client still serves queries. Readiness now awaits one bounded native MongoDB ping and returns uncached200/503. This diagnostic repair does not establish the cause of a browser fetch rejection or open additional connection pools.

## Reproduce and verify

```powershell
node scripts/probe-live.mjs https://newkhwab-stitch.vercel.app
node scripts/probe-live-browser.mjs
node scripts/probe-live-browser.mjs --transient-collection
```

The browser probe uses a fresh repository-local profile, desktop/mobile viewports and public GETs. The optional fault resets one request inside that browser; it does not alter the service or a customer account. Reports omit cookies, authorization headers, request bodies and signed image URLs. The expected repaired behavior is three current API-provided cards, or a legitimate API empty state, after the one injected failure, with no collection error left visible. Persistent connectivity failure is still an error.

## Verification evidence

Local verification passed 234 server tests and 219 client tests. The full client run used one worker to stay within the previously measured local memory limit. Focused recovery/authentication tests, both linters and both builds passed. Client tests cover recovery, two-attempt maximum, shared deadline, cancellation/offline handling, private/mutation/permission exclusions, session independence, real reconnect and retry-button form semantics. Server tests cover the native readiness probe and asynchronous no-store HTTP contract.

The full reports are in ignored `artifacts/collection-client-full.txt`, `artifacts/collection-server-full.txt` and `artifacts/collection-client-build.txt`; focused reports are `artifacts/public-read-focused.txt` and the database-health reports. The exact committed version's hosted checks are published in [GitHub Actions](https://github.com/khwabstitch-max/newKhwab-stitch/actions). Replacement live probe results are written to `artifacts/live-auth-probe.json`, `artifacts/live-browser-probe.json` and `artifacts/live-browser-transient-probe.json`. Compare the transient result with the preserved `artifacts/live-browser-transient-before.json` rather than treating an ordinary successful request as recovery evidence.

## Deployed result

Commit `5852a34b228f0eec08c43d56e185e65518871110` was pushed to `main` and Vercel reported successful deployment. [Its GitHub Actions run](https://github.com/khwabstitch-max/newKhwab-stitch/actions/runs/43066383146) passed. The replacement public probes returned200 for homepage, login, liveness, native-ping readiness and authentication capabilities.

Both ordinary desktop/mobile Chrome checks displayed three published cards without alerts. With the first collection request deliberately reset, the desktop browser made the bounded recovery request, received200 and displayed three cards without the old error; mobile also passed. The repaired transient probe exited0, whereas the preserved baseline exited1 with the exact reported message and zero cards. No server fault or customer-data mutation was injected.

The owner then confirmed that the collection loads in the original normal signed-in window after hard refresh. This closes the application recovery incident with controlled-failure and original-browser confirmation. The original transport interruption's external trigger was not captured; a persistent outage still produces an error rather than fake catalogue data. No environment files, account password or private customer data were accessed.
