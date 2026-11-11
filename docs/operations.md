# Operations and recovery

Updated 2026-11-10 for GitHub + Vercel, current local JWT accounts, shared request limits, media adaptation and optional commerce. Previous Render rollout instructions are superseded; standalone startup/shutdown remains a compatibility path. Assign business/admin and technical incident owners. Availability/latency/recovery targets remain assumptions until measured. Use [Vercel deployment](deployment-vercel.md), [capacity](capacity-plan.md), [verification](review-verification.md), [project status](project-status.md) and [readiness](production-readiness.md). Prior Atlas/ImageKit imports/connections are historical records, not fresh checks. No environment files or external providers were inspected during this work.

## Routine operation

Alert on readiness/5xx failures, unusual login/403 rates, password-hash saturation, upload/privacy failures and provider quotas. Review unanswered requests/quotes, cleanup/orphan incidents and deletion requests. Logs/tickets use safe request/resource IDs, never passwords, JWTs or private customer bodies. No alert service or automatic WhatsApp sender is connected by this repository.

Vercel may run several warm/cold Node instances. Each caches one pending app/connection initialization with a pool bounded to five connections, not a global five-connection guarantee. Production rate counters are MongoDB RequestLimit buckets shared across instances; required unique/TTL indexes are checked before serving the app. A store failure fails closed rather than silently falling back to process memory. Hash/image concurrency gates remain per-instance CPU protection and upload daily quotas remain durable account data. Monitor function invocations/duration/errors, outbound traffic, MongoDB total connections/storage/latency, rate-bucket growth and ImageKit usage. Set account-level budgets/alerts and rehearse scale/timeout behavior before increasing traffic. Protect provider accounts with strong authentication/MFA.

Bootstrap failures return generic 503 with a request ID and safe structured `bootstrap_failed` diagnostics containing an allowlisted error name, never URI/configuration/error-message contents. Correlate request IDs with Vercel logs and inspect approved deployment variables/index state privately. Health readiness checks database access, not Google/email/private-image policy or business readiness. Verify recovery after cold-start dependency failure and a new deployment; do not depend on function memory or shutdown hooks for business persistence.

For an already initialized app, `/health/ready` now awaits one ping on the existing native MongoDB connection with driver `timeoutMS:2000`. It returns 200/`ready` or 503/`unavailable`, always with `Cache-Control:no-store`; absent database or rejected/failed ping exposes no raw provider error. `/health/live` remains independent of database access. A suspended serverless instance can retain an old Mongoose heartbeat timestamp and report disconnected while native queries work, so do not infer an outage from that getter alone. This readiness correction introduces no application-managed reconnect/new pool or mutation replay. Correlate actual browser request failures, response status and safe request IDs separately: it does not establish the cause of the customer's home-page `NETWORK_ERROR`.

## Passwords, sessions and admin access

The app issues 30-minute JWTs without refresh tokens. Successful remote logout, password change/reset and admin-role changes invalidate old tokens through database authVersion. Local logout is immediate; remote revocation uses the captured old token and a slow completion cannot delete a newer account/draft. A failed remote logout does not prove server-wide revocation. Credential-check401 differs from JWT rejection, and network/5xx profile verification remains recoverable without wiping a verified form. See [authentication](authentication.md). JWT-secret rotation invalidates tokens. Store independent secrets only in hosting backend settings, stage rotations/redeploy, then verify login/logout/ownership before retiring old configuration. Compromise requires immediate revocation/rotation and incident handling.

Trusted operator commands:

- `npm --prefix server run admin:provision -- owner@example.com` promotes the intended existing local account; `--revoke` removes admin. Verify ownership/control first, not just the email string. The trusted password-reset tool can secure an account before promotion. Sign in again after changes.
- `npm --prefix server run password:reset -- customer@example.com` uses hidden password input and revokes previous sessions. Never put a password in command arguments, history, logs or shared seed data.
- Legacy enrollment additionally needs `--migrate-legacy --user-id EXISTING_MONGO_ID` after independent ownership verification. Follow deployment-render.md rather than guessing a historical account.

Email remains unverified until a valid configured verification action completes; an email string is not ownership proof. Optional Resend verification/reset needs RESEND_API_KEY, EMAIL_FROM and PUBLIC_WEB_URL together, a verified sender and real inbox checks. When unavailable, use an approved out-of-band ownership process before operator reset/enrollment. Google-only passwords remain with Google. Optional Google exchange/linking requires GOOGLE_CLIENT_ID, registered actual frontend origins and subject/index checks; same-email password accounts must prove their current password before linking. There is no public promotion API or shared admin password.

## Database backups and restore

Verify the actual Atlas tier, enabled backup settings, retention and restore capability. Current [Atlas Free documentation](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) supports optional daily backups retaining up to four snapshots; Free does not mean backups are impossible. This review has not verified that backup is enabled for the configured cluster or completed a restore. Provider retention is not the application's proposed retention policy or proof of point-in-time recovery. Supplement it with separately protected encrypted operator backups as needed. Proposed policy pending owner approval: daily encrypted backups retained 30 days and monthly restore drills. Keep backup credentials outside Git and command history.

Restore into a separate restricted database first. Pause/isolate writes and record the incident window/source backup. Verify user IDs/hashes/roles/authVersion, order ownership/idempotency, accepted quote and guide snapshots, public media pins, catalogue/settings, commerce balances/ledger/reservations/reward events and required unique/TTL indexes. Use disposable staging identities for access checks. Reconcile later writes, benefits reversals and image gaps before approved cutover. Reapply the deletion register so erased data does not silently return. An untested backup is not verified recovery. Expired request-limit buckets are disposable operational counters; they are not a reason to delete financial/business ledgers.

## Media backup, cleanup and compensation

MongoDB metadata does not back up image bytes. Confirm ImageKit export/version/backup capabilities and retain private access policy when backing up/restoring. Verify restored provider paths/IDs map to application metadata. Never mirror private references into a public folder.

Reconcile provider-created/database-unrecorded images after partial uploads and failed compensation. Use restricted safe provider IDs/timestamp windows, not signed URLs. `npm --prefix server run media:cleanup` is a dry run for unreferenced assets older than seven days. Review the environment/candidate count, then use `-- --execute` only after operator approval. Referenced assets stay protected. Stale deletion reservations become retryable after 60 seconds; provider/database failures require tracked recovery rather than a false success.

All browser uploads use the authenticated proxy. Supported source images are limited to5 MiB / 24 MP and prepared within3 MiB for the Vercel payload budget; standalone input retains5 MiB. Preparation never changes original files and releases browser resources. Backend actual-byte decoding, role/purpose/owner enforcement, private-policy gate and provider metadata checks remain authoritative. Do not replace that boundary with a generic reusable browser-upload signature. Browser codec tests are mocked; real-device quality and live provider privacy remain separate checks. See [ImageKit/media](imagekit.md).

## Account deletion and retention

The customer endpoint records a request, not instant erasure. Verify the requester and resolve active stitching obligations first. Preview with `npm --prefix server run account:delete -- customer@example.com`. Execution adds `--execute` and requires a recorded request, no active orders and revoked admin access where applicable.

The service disables the account and fences concurrent order/upload/profile writes. Positive stitching-credit balance blocks erasure until settled through the audited programme process. It scrubs eligible terminal-order private fields, releases exact option/guide public-media pins, randomizes historical owner links and resets retry/hash fields; removes unreferenced private provider assets; then removes local credentials/identity mapping. Deleting a linked local identity does not delete the person's Google account. Provider failures retain disabled account/media metadata for tracked retry. Check caches/backups and justified business-ledger/audit retention; source rollback is not an erasure strategy.

Proposed policy, pending owner/legal review: unreferenced-upload cleanup eligibility is seven days with operator scheduling; review completed-order private references within 90 days; retain minimal justified order/audit evidence for an approved period. These are proposals, not an automatically running legal-retention system. Backups expire by policy; record approved deletions for restore reconciliation.

## Incident response and rollback

1. Record request IDs, impact, time window and responsible owner. Pause affected mutations/uploads if integrity/privacy is uncertain.
2. Disable affected accounts, revoke sessions/admin access, rotate exposed JWT/database/image secrets and preserve safe evidence.
3. Assess affected customers/orders/images and follow approved reporting obligations.
4. Recover compatible source and verified database/media backups. Reconcile partial provider calls and uncertain requests using idempotency.
5. Re-run login/logout/ownership/quote/image-privacy/health checks before approved resumption.
6. Document cause, resolution and follow-up without exposing customer data or secrets.

Git SHAs and Vercel deploy IDs identify source versions. Roll back to a compatible reviewed deployment; source rollback does not undo database writes/indexes, benefits settlement, accepted quotes, identity changes or deleted images. Preserve all ledger events/snapshots and reconcile later writes before any data restore. Disable affected optional programmes through reviewed settings rather than deleting balances/history. Do not restore earlier auth, paid-length or non-ledger code against newer records without compatibility review.

Install lockfiles, review changelogs/advisories, run current lint/tests/build/browser checks and repeat affected live-provider smoke tests on upgrades. Keep Node 24 security patches current. Separate runtime and development-tooling advisories in the current [production-readiness report](production-readiness.md).

## Drafts, visual imports and business queues

Ordinary guest design choices have 30-day local-browser retention. Private draft measurements/addresses/notes/reference IDs remain in tab session storage and explicit logout clears them; they are not persistent local-storage data. Ending the browser session can lose them. Cloud drafts remain owned MongoDB records without an unattended TTL that could strand media references. Saving a draft is separate from explicit consent to share support context with staff.

Review failed draft saves, unanswered support/messages, configured first-response targets, pending quotes and worker progress proposals. No connected notification sender/background queue guarantees callbacks. Reconcile uncertain writes using saved records and stable retry IDs rather than inventing success.

Preserve the visual inventory, unchanged originals and contact sheets. Imported public catalogue bytes are separate from private customer uploads. Imported option/guide drafts need confirmed garment applicability, pricing, compatibility and guide conventions before publication. The clipped ruffle-front item remains quarantined and body guides remain missing. Repeated stable-key imports reuse assets/records or report a conflict, never overwrite unrelated edits. See [admin guide](admin-guide.md).

All sleeve-length adjustments remain zero for new calculations. The controlled free-length migration preserves submitted orders/accepted quotes. Review compatibility before restoring legacy pricing code. Commerce is implemented but disabled by default; enable only approved business terms, limits and actual reward amounts.

## Offer, credit and reward reconciliation

Use [commerce](commerce.md) as the rule source. Pending quote selections do not debit/hold balance; current itemized-quote acceptance validates eligibility, commits ledger/offer use and snapshots gross/discount/credits/net. Transport never consumes stitching benefits. Cancellation/rejection restores committed credits/capacity once. Delivery rewards require a real qualifying delivered transition and unique completion/referral/milestone events.

Reconcile wallet balances against signed ledger deltas/resulting balances, committed versus released reservations, active offer uses/counters, accepted quote snapshots and unique reward events. Investigate a discrepancy using safe order/event IDs and transaction evidence. Never repair it by editing Mongo balances, deleting a ledger event, inventing delivery, or repeatedly issuing a new admin client ID. Audited admin adjustments need a reason and a stable retry ID; conflicting details require review. Cash refunds/payroll are outside this programme.

The current target is a commercially permitted Vercel deployment backed by durable MongoDB/ImageKit, not the retained Render preview blueprint. No hosting purchase, production deployment, actual backup/alert setup or live provider check is claimed. Complete [Vercel deployment](deployment-vercel.md), [capacity planning](capacity-plan.md), privacy/auth/mail checks and a deployed restart/restore rehearsal before real-order operation. Historical Render plan notes remain background only.
