# Separate customization verification — 2026-11-10

> **Historical document — superseded 2026-11-10.** Use [project status](project-status.md), [production readiness](production-readiness.md), the [current admin guide](admin-guide.md) and [customer workflow](customer-workflow.md) for the final implementation and evidence. **Every sleeve length adds zero:** earlier standalone length fees or combined per-length pricing instructions no longer apply. Submitted orders and accepted quotes remain preserved. Test counts, command results, provider limits and deployment/data statements below describe their dated runs, including earlier work on the same date; they are not current verification or launch approval.

Implementation and boundaries are recorded in [the plan](separate-customization-plan.md), [API contracts](enhancement-api.md), [admin guide](enhancement-admin-guide.md), [customer guide](enhancement-customer-guide.md) and [migration notes](enhancement-migration.md).

## Automated checks

- `npm --prefix client run test -- --maxWorkers=2`: **150 tests passed across 17 files**. This includes existing language, design-board, critical-flow, account and pagination regressions, plus the new selector/helper/admin and full customization tests. Inline master-tailor help links save the latest private edit before navigating and use the account draft ID when available.
- `npm --prefix server run test:unit`: **82 tests passed across eight database-free files**, including **26 new separate-customization tests**. The command is provided explicitly so these checks do not start MongoDB or require an application runtime workaround.
- Client and server ESLint passed. Vite production build and server JavaScript syntax checks passed. Initial JavaScript is approximately 458 kB (136 kB gzip), with no chunk-size warning.

| Behavior | Evidence |
|---|---|
| Separate choices | Independent sleeve design/length and front/back IDs; six illustrated styles use published admin records and never numeric measurements |
| Pricing | Original defaults included once; a replacement removes the old charge; length-only adjustments; explicit combined adjustment replaces standalone amounts; references/help/missing rules remain pending |
| Compatibility | Explicit supported sleeve lengths; missing matrix pending; symmetric neck exclusions; no silent counterpart mutation; unsupported future craft additions rejected |
| Sleeveless | Suppresses parked sleeve fees/availability/reference association and all sleeve measurements; switching back restores the choice, values and applicable confirmation requirements |
| Additions/materials | Individual selection/removal, explicit empty choices, included catalogue additions, unavailable saved-choice removal, exact-copy materials explanation and explicit labor/material scope |
| Draft/review | All five Edit actions, cancellation, unchecked parked choices, unrelated notes/references/logistics preservation, ordinary-only recovery with missing private parked reference, source-aware summaries |
| Submission | Real estimateInput/calculateEstimate/orderInput used by client integration tests; hidden confirmation flags and inapplicable numeric values excluded from submission, retained in raw saved draft; new order instructions contain effective choices |
| Administration | Bilingual text, imagery, display order/status, compatibility/combined prices, numeric widths, original defaults and included additions; bounded choices preserve saved selections |

## Browser verification

`npm run browser:customization` **passed** on the final production build with zero uncaught browser exceptions. Real Chrome used a deterministic localhost HTTP fixture backed by the actual estimate schema and pricing engine. The journey exercised all five sections and review Edit actions, six illustrations, replacement/combined prices, independent neckline exclusions, individual add-on removal/included pricing/material labels, body measurements, arranged inbound transport, Sleeveless suppression and restoration/reconfirmation, and Hindi draft preservation. Layouts fit 320/390/768/1440px. The captured review screenshot `artifacts/request-customization-390.png` was visually inspected.

`npm run browser:paging` also **passed** on the final build, covering catalogue page two, Hindi server search, bounded loading through component choice 60 and selection preservation. An original selected catalogue option can remain pinned outside the first loaded batch.

No live data, MongoDB, authentication provider, ImageKit account or deployment was involved. These are practical interaction/layout checks, not a full screen-reader or WCAG certification.

## Verification limits

MongoDB-dependent HTTP/integration suites were not rerun: the standard Windows VC++ runtime prerequisite is absent. Earlier integration evidence is historical and does not establish the new routes' database behavior. No Ollama commands or installation-directory runtime workaround were used.

The server formatter write command was rejected by the tool with `Rejected("rejected by user")`; it supplied no further reason. The command was not retried or replaced with another formatting write. Read-only `format:check` reports style issues in nine changed server/test files. **Server formatting remains pending**, despite passing syntax, lint and database-free behavior checks.

Administrators still need to publish actual length/options records, approved front/back images, explicit combinations and genuine pricing/material statements. No live catalogue seed or fabricated product prices were created. Existing external-provider, deployment and business-policy prerequisites continue to apply.
