# Production readiness — current Vercel target

A successful build is not a launch decision. Status terms are: **Verified**, **Implemented but unverified**, **Missing configuration**, **Production blocker**, **Optional improvement**.

| Check | Status | Evidence / next action |
|---|---|---|
| Frontend build/routing/source | Verified | Vite production build,189 client tests, responsive Chrome checks |
| Express/Vercel adapter and route precedence | Verified locally | Cached initializer/error recovery/route tests; actual Vercel packaging/domain remains unverified |
| Authentication/session persistence/revocation | Verified | Real local JWT/Mongo API+Chrome, network/error regressions, fresh app/DB-connection continuity test |
| Mongo transactions/indexes/ownership/credits | Verified locally |221 server tests including shared limiter and finance races; no production Atlas connection was attempted |
| Image processing/provider-adapter boundaries | Verified locally | Actual multipart/Sharp tests and provider mocks; cap/source/privacy/cleanup tests |
| Real ImageKit account upload/private delivery | Implemented but unverified | Operator must verify configured credentials, metadata, unsigned/named-transform denial and signed expiry; no environment files were inspected |
| Real recovery email and optional Google | Implemented but unverified | One-use/generic/rate-limited code tested; sender/inbox/origins need live verification |
| Required Vercel variables and canonical domains | Missing configuration | Add names/scopes from deployment runbook; no values are requested in chat |
| Vercel deployment/restart/cold starts/network | Implemented but unverified | Authorize/configure a staging deployment, then smoke actual API/SPA/upload/auth routes |
| Commercial hosting, backup/restore and alerts | Production blocker | Appropriate commercial plan, verified recovery policy/rehearsal, operational ownership and spend monitoring |
| Catalogue prices/compatibility/material wording/guides | Production blocker for unapproved content | Imported drafts remain drafts; approve accurate choices/body guidance or keep assistance-only/unavailable |
| Optional offers/referrals/credits | Verified locally; disabled by default | Owner terms/rates and deployed finance reconciliation required before enabling |
| Production dependency audit | Verified | No production findings; full server dev chain has4moderate advisories |
| Full dev audit/manual accessibility-language breadth | Optional improvement | Review supported ESLint/minimatch patch and wider screen-reader/copy/device coverage |

## Direct answers

1. **Can the frontend deploy?** A build artifact and root settings are prepared. Actual Vercel deployment is unverified.
2. **Can the backend run on Vercel?** It has a Node function adapter, durable state/limits, bounded pool and safe payload handling. No continuously listening daemon is required. Local tests pass; hosting/network/provider packaging must be staged.
3. **Are external services verified now?** Local MongoDB/real driver behavior is verified. Actual Atlas/ImageKit/email/Google accounts were not accessed this review. Earlier provider results are historical.
4. **Can a complete order flow work?** It passed in Chrome against a disposable local database, including guest/login continuation, explicit submission, admin quote and current acceptance.
5. **Is a real-customer launch appropriate now?** No. Commercial hosting, production configuration, private-media verification, approved catalogue/guides, recovery/operational coverage, backup restoration and deployed smoke remain required. Optional commerce must remain disabled until owner policy and live checks are complete.

Use [exact Vercel deployment steps](deployment-vercel.md), [current evidence](review-verification.md), [operations](operations.md) and [capacity assumptions](capacity-plan.md). No publish, paid purchase or live customer-data migration occurred.
