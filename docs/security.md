# Security and reliability review

Updated 10 November 2026 for the Vercel review. This documents implemented controls and tested boundaries; it is not an independent security certification. Current outcomes and limitations belong in [review-verification.md](review-verification.md) and [production-readiness.md](production-readiness.md).

## Review boundary and evidence

No `.env` or `.env.*` file is accessed, and no local files outside this repository are read/copied. Checks use environment-isolated child processes, disposable local MongoDB and provider adapters. Real MongoDB Atlas/ImageKit/Google/Resend account configuration, network rules and private policy are not newly verified. Historical import/provider reports remain historical. Tests never authorize production publishing, purchases, stress tests or data migration.

The optional Microsoft prerequisite for local Windows MongoDB tests is an official checksum-pinned download extracted only into ignored artifacts; no system installation, global PATH change, outside runtime copy or Ollama command is involved. It is not a deployment asset. See [local-test-runtime.md](local-test-runtime.md).

## Trust boundaries

| Boundary | Threat | Implemented control |
|---|---|---|
| Browser to sign-in | Guessing/resource exhaustion | Strict inputs, generic bad-login response, dummy comparison, separate rate limits, bounded password work |
| Password to storage | Plaintext recovery/truncation | Salted bcrypt cost 12; minimum 12 Unicode code points and maximum 72 UTF-8 bytes; reject excess; hashes never returned/logged |
| JWT to protected API | Forged/expired/revoked identity | HS256 only, fixed issuer/audience, expiry, database subject/authVersion/current disabled state |
| Customer/worker to another account | IDOR or role escalation | Current database role, owner/assignment predicates, worker/application approval boundaries |
| Input to MongoDB | Injection/mass assignment | Strict schemas, allowlisted fields, bounded identifiers/queries, controlled update predicates |
| Retry/edit to orders or credits | Duplicate spending, stale decisions, lost updates | Scoped idempotency/hash, transactions, unique event indexes, expected revisions and current quote versions |
| Upload to provider | Malicious payload/private exposure | Auth before decode, actual PNG/JPEG/WebP validation, byte/pixel/count bounds, re-encode/EXIF strip, forced privacy and metadata check |
| Public response/log to privacy | Secret/address/token leakage | Safe projections, no private bodies/URLs/tokens in structured logs, private no-store links |
| Function to shared limits/state | Per-instance bypass/data loss | Durable MongoDB state/limit store, warm connection reuse only, no durable local upload/session storage |

## Authentication and session repair

The existing local password/JWT account system is retained; Firebase is not reinstalled. Registration cannot set role/hash/owner/verification. Duplicate credential ownership is protected by indexes and transactions. Existing account IDs and historical order ownership are preserved.

Tokens use issuer `khwab-stitch-api`, audience `khwab-stitch-web`, 30-minute expiry, MongoDB subject and auth version. The backend-only canonical base64url signing secret must contain at least 48 random bytes and be independent per environment. Role/identity from browser storage is never authoritative. Every private operation rechecks current account state/role. Logout, reset and privileged-access changes revoke earlier sessions through `authVersion`; secret rotation also invalidates sessions.

The frontend stores token/expiry in tab `sessionStorage` and reloads trusted profile data from `/me`. Sign-in now publishes the verified token without the synchronous store notification clearing its verified profile/loading state. Request generations prevent stale profile/login responses from replacing newer state; exact-token clearing cannot remove a replacement login. Temporary network failures/5xx responses preserve a valid token and expose a retry state. Incorrect credential rejection does not imply an existing bearer token is revoked. Invalid/revoked/expired sessions are handled separately; protected routes wait for initialization.

There is no refresh token or ambient authentication cookie. A valid unexpired token survives refresh and a supported server/function restart when the signing secret/account state persist. Browser/tab closure and expiry are documented limits, not promises of permanent sign-in. Failed logout clears this browser but cannot prove server-wide revocation; the UI explains uncertainty.

Same-origin JavaScript can read session storage. Safe rendering, dependency review and short lifetime remain important; storage is not a secure vault. Never store passwords, provider keys or signing secrets there. Bearer transport avoids ambient-cookie CSRF; introducing cookies later would require a reviewed HttpOnly/Secure/SameSite/path/expiry/CSRF design.

## Recovery and optional identity

Resend recovery/verification uses random hash-stored expiring one-use action tokens, generic request responses, rate limits and transactional consumption. Reset revokes old sessions and outstanding reset links. Provider delivery is not constant-time and is not proven by a mocked adapter test. Email secrets/action links must not be logged or copied into reports. Current configuration/live inbox/reset/login testing is pending operator verification.

Google credentials are accepted only by the dedicated exchange/link endpoints after signature/JWK, audience, issuer, expiry and subject checks. Normal API access still uses the app JWT. Same-email matches do not silently merge accounts or authorize account claiming; linking to a password account requires its authenticated current password. Unique subject/email-reservation indexes must exist before enabling. See [Google verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Private drafts, messages and worker access

Private measurements, addresses, notes and reference IDs deliberately stay in tab session storage for login continuation; ordinary allowlisted style choices may persist in local storage for 30 days. Explicit logout clears private tab drafts. Auth expiry does not pretend the same draft erasure occurred. Owner-scoped cloud drafts use revisions and media ownership/refcounts. Never put private values/tokens into return URLs; validate internal return routes. Authentication does not auto-submit.

Support context is shared only with consent. Message/attachment operations check current ownership/assignment. Worker approval is separate from customer/admin role; applicants cannot approve themselves and suspended/unassigned workers lose access. Reviews require an owned delivered order, one review per order and explicit moderation/publication consent. Historical PII erasure is an operator-controlled workflow, not an instant browser delete.

## Media and catalogue integrity

Backend ImageKit keys are never public variables. Customers cannot choose trusted provider IDs, owner/privacy or arbitrary attachment URLs. Bounded client compression improves Vercel payload compatibility, but the server remains authoritative and revalidates decoded data/purpose/privacy. No local uploads or MongoDB base64 blobs provide permanent image storage. Public catalogue assets and private references/measurement/support/application images remain distinct.

Private viewing rechecks ownership/admin/assignment and returns short-lived no-store signed links. Signed URLs are bearer capabilities during their lifetime. Keep `IMAGEKIT_PRIVATE_POLICY_VERIFIED` false until the actual account denies unsigned originals and unsafe named transformations, then verify owner/other-account access and expiry. A configured key/random filename is not access control. See [ImageKit security](https://imagekit.io/docs/media-delivery-basic-security).

Provider calls cannot join MongoDB transactions. Database pins/fences/audits protect attached images, and compensation/orphan cleanup is tracked separately. Referenced public assets cannot be erased through unused-asset cleanup. Orders preserve chosen public-image pins and immutable guide snapshots; account erasure releases exact pins while scrubbing private context. No production asset cleanup is executed by this review.

Published option queries now use a positive allowlist, including established active pre-status legacy records; unknown publication values fail closed. Live ImageKit/admin images take priority over static guide examples, and guide prices cannot turn pending work into an included/quoted option. Safe metadata repair never activates imports or invents applicability/compatibility. See [catalogue repair](catalogue-repair.md).

## Pricing, benefits and historical consent

The backend owns integer paise, charge scope/quantity and deterministic rounding. Sleeve-length fees remain zero despite old metadata/combined tables; standalone sleeve design charges remain separate. Included catalogue components are not charged again. Unpriced reference/custom work stays pending and every changed quote requires current-version acceptance. Generic manual quote rows are not a component taxonomy: operators must never add a length surcharge manually.

The opt-in commerce module defaults disabled. Owner-approved published terms and explicit limits/reward values are required before activation. Only itemized current final quotes can use offers/credits, restricted to eligible stitching rather than transport/fabric. Browser benefit selections reserve nothing or accept nothing. Acceptance transactionally revalidates eligibility, limits and balance, records a versioned benefit snapshot and debits a nonnegative wallet under unique order/version/event indexes.

Referral self-claims/late eligibility and duplicate benefits are guarded. Loyalty/referral rewards arise from qualifying genuinely delivered orders, not fabricated progress. Cancellation records a unique compensating credit event instead of rewriting ledger history. Admin adjustments require a stable retry ID and reason. Concurrency/idempotency tests and business policy approval are distinct gates; no actual programme is activated during this review.

## Vercel limits, proxy and operational controls

The Vercel entry exports Express without starting its long-lived listener. Warm app/connection initialization is cached per function instance, reset after initialization failure and uses a bounded MongoDB pool. Persistent sessions, wallet/order/draft state and production request limits remain in MongoDB. Every warm instance still owns a pool: increasing function concurrency multiplies connections and requires capacity monitoring. Temporary storage is not durable storage.

Production `rateLimitFor` uses MongoDB `RequestLimit` buckets, hashed namespaced identifiers and unique key/bucket indexes. Reset time is computed by fixed windows; TTL removes expired records eventually and is not the enforcement clock. Development can use process-local limits; those are not a global security guarantee. Password/image concurrency gates remain per process as additional resource protection. A failed durable limit operation must not silently grant unlimited requests.

Proxy configuration must match the actual Vercel/optional fallback topology. Do not trust arbitrary caller-provided forwarding headers or carry a Render proxy assumption without validation. Verify real source-IP behavior, edge/WAF settings and limits on the deployed domains; local mocks do not prove those deployment properties.

Production configuration comes from hosting environment variables; pure config import no longer reads dotenv. Explicit local-development loading remains an operator action and is never used by isolated checks. CORS permits exact origins, including only approved previews; bearer credentials are not cookie credentials. API/private responses must not share cache state across accounts. Health/readiness indicate process/database state, not complete provider/launch readiness.

## Deployment, secrets and recovery

Apply explicit credential, identity, shared-limit and commerce indexes after a verified backup; production auto-index creation is disabled. Preserve historical account IDs and existing unrelated indexes. Trusted first-admin/legacy enrollment requires independently verified ownership, not merely an email string. No public role-promotion endpoint/default password exists.

Ignore real environment files, private keys, dumps, private uploads and sensitive artifacts in Git. Ignore rules do not remove tracked secrets; inspect tracked metadata without printing secret values, rotate exposed credentials and obtain authorization before shared-history rewriting. No tracked-secret or provider-account verification is inferred from source review alone.

Verify real ImageKit privacy, inbox recovery, production domain/network/index setup, quota/alert owners, deployment restart and an encrypted backup/restore rehearsal before launch. Source rollback does not undo data writes/indexes/uploads or quote/ledger events; reconcile later writes and approved deletion records. Retention and external reporting remain business/operator policy. See [deployment](deployment-vercel.md), [operations](operations.md), [capacity plan](capacity-plan.md) and [authentication](authentication.md).
