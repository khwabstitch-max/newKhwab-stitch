# Current verification — 10 November 2026

This report supersedes earlier counts/deployment assumptions. Tests were run through `scripts/isolated.mjs`: no dotenv loading, configured provider/database values removed from child environments, Vite envDir disabled, temporary files/runtime artifacts kept inside this repository.

| Check | Result | Artifact / boundary |
|---|---|---|
| Initial client checkpoint |159/159 passed | `artifacts/vercel-client-baseline.txt` |
| Initial server pure checkpoint |96/96 passed | `artifacts/vercel-server-baseline.txt`; changes/tests were being introduced, not an invented pristine Git baseline |
| New auth regressions before fixes |5 reproduced failures | Agent focused run: credential401,503retry, stale profile, delayed logout, malformed profile |
| Final full server suite |221/221 passed | `artifacts/vercel-server-final.txt`; actual local disposable replica set and transactions |
| Final full client suite |189/189 passed,20 files | `artifacts/vercel-client-final.txt`; auth/catalogue/media/commerce/failure/language tests |
| Server/client lint | Passed | `artifacts/vercel-server-lint.txt`, `vercel-client-lint.txt` |
| Server syntax/frontend production build | Passed | `artifacts/vercel-server-build.txt`, `vercel-client-build.txt`; JavaScript, no TypeScript compiler claim |
| Chrome customization | Passed | `artifacts/vercel-browser-customization.txt`: pricing/replacement/compatibility/sleeveless restore/five edits/preserved fields |
| Chrome paging | Passed | `artifacts/vercel-browser-paging.txt`: bounded paging, selection retention, language/responsive behavior |
| Chrome real local-auth/order flow | Passed | `artifacts/vercel-browser-auth.txt`: register/reload/admin denial/logout, exact-copy login continuation, explicit receipt, support, admin quote/customer acceptance; customer benefits/admin commerce also checked at320/390/768/1440px |
| Local bounded load fixture |1000 requests,20 clients,0 errors | `artifacts/load-local.json`: p95=19.42 ms,1541.58 req/s; CPU/loopback fixture, not database/production capacity |
| Source-only credential-pattern check |216 source files,0findings at checkpoint | Excluded environment files, artifacts, dependencies and outside history; not an exhaustive secrets guarantee |
| Dependency audit | Client0; server4moderate dev findings | `artifacts/vercel-client-audit.json`, `vercel-server-audit.json`; production dependency findings0 |
| Actual Atlas/ImageKit/email/Google/Vercel | Not freshly verified | No environment-file/credential/provider access under this task's restriction |
| Production restart/restore/alerting | Unverified | Fresh app/connection test is not a deployed restart or a backup restore |

## What the server tests demonstrate

Registration/duplicate/wrong-password validation, password hashing/redaction, session expiry/revocation and ownership, one-use reset/verification logic with mocked delivery, draft/media revision/reference protection, authoritative integer pricing and free lengths, quote/status/idempotency concurrency, scoped worker/support/review access, guide matching/snapshots and administration are tested.

New commerce tests exercise current-quote selections, immutable accepted net/gross snapshots, concurrent spending from one wallet, a global offer-use limit across users, exact-once cancellation restoration, stale/disabled benefits clearing, referral/loyalty duplicate-event handling and private ledger projection. Shared production-limit buckets were tested across independent API instances against the same real MongoDB. Critical unique/TTL indexes are asserted.

A new continuity test issues a valid JWT, opens a fresh application/database connection with the same signing configuration, verifies identity, then revokes through durable authVersion and expects401. This establishes the design's process-independent state without claiming an actual Vercel rollout/restart.

## Initial failures and their resolution

- Local Mongo initially exited3221225781 because the Windows C++ runtime was unavailable. The verified official Microsoft package was extracted only into ignored workspace artifacts and supplied in child PATH. No OS install, external DLL copy, global PATH change or Ollama runtime was used. The same registration test then passed; the full Mongo suite passed. See [runtime provenance](local-test-runtime.md).
- Extended browser checks were corrected to follow the explicit Edit programme settings action and wait for the saved receipt content after navigation, rather than assuming a URL change meant the asynchronous receipt had rendered. These were test-journey timing/interaction corrections; no arbitrary application delay was added.
- The first browser customization check expected six SVG elements. Current valid options can show photos; it now checks six radio cards with loaded images or accessible illustrations, then exercises their selections/prices. The rerun passed.
- Isolated production build originally inherited NODE_ENV=test, inflating development bundles. The build child now explicitly uses production while still disabling environment files. Framework/icon splitting reduced the main chunk and the final production build passes without the earlier size warning.

## Evidence limits

Actual Sharp/image bytes and MongoDB transactions run locally; ImageKit/Google/email adapters use mocks where stated. No real inbox reset, external private-image policy, Atlas account networking, Vercel deployed packaging, deployed-origin/cold-start/load or restore drill was performed. All screenshots/reports reflect fixtures. No test-only prices/rewards were published. Historical47 public image uploads and34draft imports belong to the earlier configured review, not this one.

All generated reports, local test runtime binaries, test databases, browser profiles and potentially sensitive artifacts are ignored by Git/deploy source rules. Local links/documentation were checked; GitHub CI is prepared but was not executed remotely.
