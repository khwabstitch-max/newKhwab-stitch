# Current project status — 10 November 2026

The latest owner request targets GitHub and Vercel, preserves the existing JavaScript/local-JWT/MongoDB/ImageKit project and forbids environment-file/outside-workspace access. Earlier Render/provider reports are historical. This review used no configured customer database or provider credentials in its tests.

## Verified changes

- Reproduced and fixed valid-session credential401 logout, transient verification retry redirect, stale profile overwrite, delayed local logout and malformed profile acceptance. Protected routes wait for verification; transient failures preserve the token and open form state.
- Fixed static guide images/prices overriding live admin catalogue data, unknown publication statuses leaking into selectors/pricing, reference gallery fetch/branching, inaccurate three-quarter illustration matching, and mixed loading/error/empty states. Added explicit refetch. No hardcoded business option was inserted.
- Sleeve length remains free, included components are not charged twice, and the requested test-only ₹300 + ₹50 + ₹0 + ₹30 + ₹20 subtotal is ₹400. Legacy option repair defaults to an offline plan and never auto-publishes imported drafts.
- Added Vercel Node entry, cached warm initialization/pool 5, safe bootstrap diagnostics, required production index checks, API/health/static/SPA precedence and Mongo-backed shared production rate limits.
- Centralized six image upload handlers. Source limit: 5 MiB/24 MP; prepared multipart file cap: 3 MiB for Vercel. Server-side authorization/real decode/privacy/compensation remain mandatory.
- Implemented optional offers, loyalty, referrals and stitching credits: private balances/history, admin settings/offers/adjustments, itemized-final-quote selection and atomic acceptance, concurrent-spend protection, exact-once cancellation restoration and delivered-order rewards. Programmes are disabled by default; no business rates were enabled.
- Preserved logo, supplied photos, ivory/teal/champagne/charcoal tokens, Hindi/English mechanisms and reduced-motion/touch/focus behavior. Split framework/icon bundles for caching and a smaller main production chunk.

## Verification

Current full run: **221 server tests and189 client tests passed**, including disposable local MongoDB transaction/ownership/concurrency tests. Chrome customization, pagination and real local-JWT/customer/admin order-and-quote journeys passed. Linters/builds passed. Source-only credential-pattern check reported no findings while intentionally excluding all environment files. See [verification](review-verification.md) for exact commands/artifacts, initial failures and limits.

Local load fixture:1000 requests,20 concurrent clients,0 errors; about 1542 requests/s and19.42ms p95 on loopback. This does not measure production/database/provider capacity. See [capacity plan](capacity-plan.md).

## Safe cleanup

Removed wrong static-price fallback and repeated multipart upload plumbing, replaced unsafe negative publication filtering, moved implicit dotenv loading out of core configuration, and separated standalone/serverless entry points. Historical metadata/schema compatibility, requested features, source assets, migrations and accepted quotes were retained. No unused dependency was deleted without proof and no blind forced dependency downgrade was adopted.

The earlier server-format sweep was not retried after its rejection. Formatting is separate from verified lint/build correctness. Four moderate development-tooling advisories remain along ESLint/minimatch; production dependency audits are clean. Treat the supported upstream/tooling patch as an optional improvement, not a false claim of a clean full dev audit.

## External checks and blockers

| Area | Status | Remaining action |
|---|---|---|
| Local auth, drafts, pricing, orders, ownership, commerce | Verified | Repeat deployed staging smoke and operational policies |
| Live production Atlas connectivity/limits | Implemented but unverified | Operator supplies/verifies hosting configuration and production network/indexes |
| Live ImageKit upload/delivery/private access policy | Implemented but unverified | Verify actual originals/transforms/owner/other-user/expiry; historical47asset import is not a fresh test |
| Actual reset email/inbox/Google origins | Implemented but unverified | Operator checks optional configuration and performs live smoke; no secret was inspected |
| Required Vercel variables/domain/commercial plan | Missing configuration | Enter settings in the owner-controlled project; existing local values are uninspected |
| Deployed route/package/restart/privacy/backup/restore/alerts | Production blocker | Authorized staging deployment, recorded smoke/restore rehearsal and monitoring ownership |
| Imported draft applicability/prices/compatibility and body guides | Production blocker | Owner approval/correct guidance before enabling those customer choices |
| Commercial benefits terms/accounting/production reconciliation | Production blocker for enabling benefits | Keep disabled until owner rules and live smoke are approved |
| Full screen-reader/language copy audit and dev advisory patch | Optional improvement | Complete wider device/content review and supported tooling update |

GitHub source preparation is complete; no remote push/publish is implied. The frontend/backend are prepared for a Vercel preview. A real-customer launch still requires the external/operational gates above. See [deployment](deployment-vercel.md), [readiness](production-readiness.md), [matrix](requirement-matrix.md), [plan](production-plan.md) and [commerce](commerce.md).

## Historical evidence

The earlier supplied-image import created31 options and3garment guides as drafts using47 public assets, with repeat0uploads and unchanged62 source files. This was a previous configured-environment run. It was not repeated against the original external source folder or live providers under the present access restrictions. Original source files, existing accounts/orders and accepted quote history were not migrated by this review.
