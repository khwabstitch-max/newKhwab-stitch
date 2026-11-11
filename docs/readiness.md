# Readiness - 2026-11-10

> **Historical document — superseded 2026-11-10.** Use [project status](project-status.md), [production readiness](production-readiness.md), the [current admin guide](admin-guide.md) and [customer workflow](customer-workflow.md) for the final implementation and evidence. **Every sleeve length adds zero:** earlier standalone length fees or combined per-length pricing instructions no longer apply. Submitted orders and accepted quotes remain preserved. Test counts, command results, provider limits and deployment/data statements below describe their dated runs, including earlier work on the same date; they are not current verification or launch approval.

Current enhancement results and launch gates are in [enhancement-test-report.md](enhancement-test-report.md) and [feature-status.md](feature-status.md). The existing application has been extended without deploying or migrating live data.

The current separate-customization extension has [its own verification report](separate-customization-test-report.md), including the unrun MongoDB integration suites and pending server formatting check. This supersedes earlier counts for the changed areas.

## Historical baseline - 2026-11-06

The former email/password JWT baseline had **133 passing automated tests**: 74 backend and 59 frontend, with no failures or skips reported. JavaScript lint/build checks and browser verification passed. This is verified local/development functionality, not a production availability or completed deployment claim.

The historical evidence below predates optional Google linking and email recovery. Current provider code is tested with fixtures; live Google/email configuration still needs verification.

## Exact verification evidence

| Check | Observed result | Boundary/limitation |
|---|---|---|
| Server format check, lint and build | Passed | JavaScript formatting/syntax; no TypeScript compilation claim |
| `npm --prefix server test` | 74/74 passed, 0 failed/skipped | 51 real temporary-Mongo HTTP/auth/index-migration/deletion/bilingual/board/import tests, 4 credential tests, 12 domain tests, 7 ImageKit adapter tests |
| Client lint and production build | Passed | Formatted source, Vite production bundle; no bundle warning reported |
| `npm --prefix client test` | 59/59 passed across 5 files | 15 auth lifecycle, 10 API-client, 11 critical component-flow, 16 language and 7 board/editor tests; component boundaries use appropriate mocks |
| Production dependency audits | Server 0; client 0 vulnerabilities | Observed npm audit --omit=dev results, not a promise of future vulnerability freedom |
| Full dependency audits | Client 0; server 4 moderate development-tooling advisories | Remaining server ESLint/minimatch maintenance issue; no reported high/critical or production-dependency finding |
| YAML/basic configuration check | Passed | Render and GitHub workflow parse; two services, health/SPA paths and JWT-only env fields checked. Not live Render schema/deployment acceptance |
| Documentation local links/table structure | Passed | Local documentation paths resolve and Markdown tables are consistent |

Backend integration uses a real disposable MongoDB 8.2.6 replica set. Authentication uses actual bcrypt/JWT code, not a mocked identity service. ImageKit operations are mocked in automated tests. No test inserts browser fixture accounts/orders into the configured Atlas development database.

## Browser evidence

Chrome checked the production frontend build with public/fixture catalogue routes, a design detail, not-found and unauthenticated gates. Layout and heading fit passed at 320, 390, 768 and 1024 pixels, with desktop coverage too. Keyboard/mobile navigation passed and no uncaught browser exception was reported. These are practical browser checks, not a completed screen-reader/accessibility audit.

The enhanced auth browser run mapped API requests to an **isolated temporary MongoDB-backed API** and exercised actual password/JWT authentication:

- Customer registration through the UI with real bcrypt/JWT issuance.
- Full page reload restoring the session through server profile verification.
- Customer admin-access denial.
- Logout clearing browser storage and making the previous JWT fail `/me` with 401.
- Wrong-password denial followed by successful correct-password login.
- Trusted test-fixture admin login and dashboard.

Only ImageKit is mocked for that run. The default browser command checks public/backend-unavailable behavior. Enhanced auth mode is optional:

```powershell
$env:KHWAB_BROWSER_AUTH = '1'
npm run browser:smoke
Remove-Item Env:KHWAB_BROWSER_AUTH
```

The production frontend build and an existing Chrome installation/CHROME_PATH are prerequisites. Screenshots are local ignored artifacts, not a deployed website. Auth browser verification does not claim a full live-image/real-order end-to-end deployment test.

## Development configuration actually verified

The local auth helper configured a private random base64url JWT secret and removed obsolete local provider assignments without printing secret values. Existing MongoDB/ImageKit assignments were preserved.

After explicit authorization and confirming the target is development, the configured Atlas database was reached and `db:indexes` completed successfully for all eight models. The obsolete firebaseUid_1 index alone was removed; account documents and MongoDB IDs were preserved. No customer account/order was created, edited or deleted by this development index operation. This establishes configured development connectivity and index migration, not production backup/restore or all-provider verification.

Windows native-Mongo testing initially encountered a missing Visual C++ runtime on the default process PATH. The successful runs used an already present compatible runtime through **that command process's PATH only**. No system/global PATH or installed runtime was modified. A new Windows environment needs the current compatible Microsoft Visual C++ x64 prerequisite described in README; a normal rerun without native prerequisites can still fail before tests start. No machine-specific path is embedded in source.

## What the tests establish

- Registration/password limits, bcrypt behavior, JWT signatures/claims/expiry, disabled accounts, logout/authVersion and current-role checks.
- Legacy email collision denial, explicit credential enrollment/index migration, preserved ownership and no implicit identity-account claiming.
- Strict validation/mass-assignment protection, public draft hiding, owner/admin denial, bounded pagination and safe dependency errors.
- Real-database concurrent duplicate submission, stale quotes, revision conflicts, state progression and immutable snapshots.
- Private-reference authorization, decoded-image checks, verified-provider metadata policy, failure compensation and referenced-asset constraints using mocked image boundaries.
- Requested deletion, active-order blocking, concurrent-write fences and retryable provider failures with local credential removal.
- Frontend session expiry/restoration/logout/error races; catalogue navigation; six-step assistance request and identical retry; current/stale quote decisions; admin design/quote/status input and image limits.

These are critical-path tests, not exhaustive load/security or every-device coverage.

## Readiness matrix

| Classification | Current state / remaining action |
|---|---|
| Implemented and tested | JavaScript React/Express application, email/password JWT sessions, ownership/admin rules, requests/quotes/state/concurrency, management UI, critical tests/build/browser checks |
| Implemented, awaiting live provider verification | Actual ImageKit upload/delete, private unsigned/named-transform denial, signed expiry/cache behavior, quotas/backup and provider-failure recovery |
| Local configuration available | JWT secret configured privately; development Atlas connectivity/index migration verified. Keep all values private and do not reuse the development secret in production |
| Configuration still required for production | Separate database/user/network allowlist and signing secret, exact production origins, production image settings/privacy gate, admin ownership verification and quotas |
| Deployment tasks remaining | GitHub repository/CI execution and Render Static Site/Web Service creation/deployment; production health/SPA/auth/ownership/image/rollback smoke evidence |
| Free-tier limitations | Sleeping compute and ephemeral local disk make the demo plan unsuitable for always-on order handling |
| Open maintenance | Server development-only moderate tooling advisories; review compatible updates without forced runtime downgrades |
| Production launch blockers | Always-on compute, verified image privacy, database/media backups and restore rehearsal, monitoring/incident owner, quota budgets, approved business/privacy/retention policies, real deployed smoke tests |

The email/password MVP deliberately has unverified emails and trusted-operator resets, with no self-service reset-email/verification service. Do not treat email strings as ownership proof, particularly for admin promotion or legacy enrollment. No paid plan or external deployment has been enabled. Performance/availability targets remain unmeasured.
## Branding update — 2026-11-06

The owner's supplied logo has been adapted into a transparent KS monogram, a circular standalone logo asset and a matching favicon. The website now uses its chocolate, cream, dusty-rose, copper and olive palette across public, customer and admin styling. See [branding.md](branding.md) for assets, palette and the exact built-in imagegen prompt.

For this visual-only change, client lint/build and all 36 frontend regression tests passed. Actual Chrome verification passed public routes, login gates, keyboard navigation and 320/390/768/1024px layouts; desktop/mobile plus about/footer screenshots were inspected and brand assets loaded. Backend code/data and authentication behavior were unchanged, so the previous backend evidence above was not rerun or reclassified as new integration verification.

## English/Hindi update — 2026-11-06

The top-bar language selector now covers public/customer/admin labels, measurement help, receipts, validation, status, dates and content editors. Preference persists without clearing forms. Optional validated Hindi content fields preserve existing records and use English fallback. New order snapshots preserve Hindi design/option labels, and account deletion scrubs both languages of quote/progress notes and preference snapshots. No live Atlas data was changed.

At the language-update checkpoint: **120 passing (68 backend + 52 frontend)**. Client/server lint and build pass. Actual Chrome verifies both languages, saved selection, form preservation, native Hindi validation, responsive public routes and the existing isolated real-JWT authentication flows. Hindi desktop/mobile screenshots were visually reviewed. See [languages.md](languages.md) for coverage and limits. Existing live-image/deployment launch blockers above remain.

## Supplied kurti board — 2026-11-06

The original local teal board is bundled as a known public application asset, with seven crop/full-board previews, zoom, bilingual structured details, four editable stitching rates and an explicit customer-fabric notice. Admin can use the template, edit content/prices/crops, preview both languages and save drafts/published entries. Other image uploads remain on ImageKit. Bundled assets cannot resolve arbitrary paths or private images. Media reference/owner checks and safe cleanup remain enforced.

`npm run check` passed: **133 tests (74 backend, 59 frontend)**, lint and builds. Actual Chrome verified the real asset, seven previews, modal open/Escape close, English/Hindi responsive layouts and real admin edit/save through the isolated API. Desktop/mobile screenshots were inspected under ignored `artifacts/teal-kurti-1440.png` and `artifacts/teal-kurti-390.png`.

In the configured development environment, ImageKit URL endpoint is not configured and there are zero active administrators. No registered owner email was supplied for promotion, so this task did not grant admin access or publish a record to that database. The image/template works without ImageKit once the owner provisions admin and saves it. The setup/publishing steps are in [design-board-upload.md](design-board-upload.md). No live ImageKit upload/delete or external deployment was performed.
