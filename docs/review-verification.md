# Verification - 25 November 2026

Local source hardening is verified. Live customer launch remains pending the operator checks below. The review preserved the existing React/Vite and Express/Mongoose architecture and did not read or modify .end or .env files, change live data, or publish a deployment.

| Check | Result | Evidence |
|---|---|---|
| Full backend suite | 405/405 passed | artifacts/verify-server-test.txt; disposable local MongoDB replica sets, actual transactions, provider mocks where noted |
| Full frontend suite | 376/376 passed across 39 files | artifacts/verify-client-test.txt |
| Final chat-focused frontend checks | 18/18 passed | artifacts/chat-focused-tests.txt |
| Backend chat/security checks | 24/24 passed | artifacts/chat-security-review.txt; real HTTP/socket boundaries with mocked database/provider records |
| Both linters | Passed | artifacts/verify-server-lint.txt and artifacts/verify-client-lint.txt |
| Backend source build and frontend production build | Passed | artifacts/verify-server-build.txt and artifacts/verify-client-build.txt |
| Headless Chrome authentication/order journey | 13 checks passed | artifacts/review-browser-auth.txt; actual local JWT/MongoDB, mocked providers |
| Current production dependency audits | Zero known vulnerabilities in both projects | npm --prefix server audit --omit=dev --json and npm --prefix client audit --omit=dev --json; lockfiles unchanged |

The frontend build retains an advisory for the approximately 780 kB main JavaScript chunk. It is a performance follow-up, not a failed build or proof of acceptable real-device loading time.

## Changed behavior

- Chat uploads require verified private storage. Server-owned, conversation-bound attachment metadata prevents forged paths, cross-customer attachment reuse, and signing of untrusted legacy objects. Upload/signing/persistence failure cleanup is covered.
- Admin sockets check current role, disabled state, authVersion and JWT expiry. Revoked sessions are disconnected before new private content/status broadcasts, and duplicate room delivery is removed.
- Frontend chat ignores stale customer/conversation responses, clears history on identity changes, supports REST delivery when sockets are unavailable, acknowledges displayed messages, and renews private photos including older history/lightbox images with throttled recovery. Routine polling keeps valid photo URLs stable for 240 seconds; focus and explicit image-error recovery can renew them immediately. Transcript export uses the current session token.
- Startup checks every model's unique/TTL invariants and rejects missing or weakened indexes. Operator scripts share application DNS retries. Startup does not mutate live indexes.
- Missing real public asset paths return 404. Unit-only selection excludes all MongoDB integration fixtures. Source scanning explicitly skips .end as well as .env files.
- The failing banner regression now submits only editable website fields, matching the actual admin form; strict rejection of unrelated chat settings remains tested.
- Chrome fixtures now follow current design summaries, automatic catalogue codes, assistance controls and enabled quote acceptance. No assertion timeouts or mutation retries were added to hide failures. The journey verifies accepted version 1, amount 140000 paise, customer_accepted status, and persistence after refresh.

## Launch requirements

1. Review and revoke any historical public ImageKit chat objects. Hiding legacy attachments does not invalidate previously distributed URLs. Verify private originals, transformations, expiry and ownership before enabling private uploads.
2. Back up the intended database, review required indexes and run the existing explicit db:indexes operation if needed before rollout. New readiness checks can reveal incomplete prior migrations/restores.
3. Deploy the reviewed source with a passing CI run and complete real-domain account, order, quote and restart smoke tests. Actual ImageKit, email, Google and courier behavior was not freshly verified.
4. Verify encrypted backup/restore and monitoring/alert delivery, approve catalogue/pricing and retention rules, and keep optional commerce disabled until its production checks pass.

The current Vercel entry uses REST rather than the standalone Socket.IO listener. Polling supplies message delivery; typing/presence still require a connected socket. Native multi-instance socket fanout and a deployed concurrency/capacity assessment remain separate work. See [operations](operations.md), [security](security.md) and [production readiness](production-readiness.md).

---

## Historical verification - 10 November 2026

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
