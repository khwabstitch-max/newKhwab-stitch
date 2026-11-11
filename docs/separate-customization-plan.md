# Separate garment customization — 2026-11-10

> **Historical document — superseded 2026-11-10.** Use [project status](project-status.md), [production readiness](production-readiness.md), the [current admin guide](admin-guide.md) and [customer workflow](customer-workflow.md) for the final implementation and evidence. **Every sleeve length adds zero:** earlier standalone length fees or combined per-length pricing instructions no longer apply. Submitted orders and accepted quotes remain preserved. Test counts, command results, provider limits and deployment/data statements below describe their dated runs, including earlier work on the same date; they are not current verification or launch approval.

Extend the existing request wizard and trusted estimate engine in place. Keep existing accounts, submitted snapshots, catalogue links, draft IDs, quantities, private references, notes, measurements and logistics.

1. Add `sleeveLength` beside sleeve design, front neck, back neck and optional extras. Length choices are published admin records with one of six `lengthStyle` values; illustrations explain preferences without inventing exact measurements or prices.
2. Keep raw draft choices when a section is deselected or Sleeveless is chosen. Send only requested customization to pricing/submission. Sleeveless suppresses sleeve-design charges and sleeve measurements, while switching back restores the saved sleeve choice.
3. Validate explicit sleeve/length compatibility and independent neckline exclusions. Missing compatibility remains subject to review. A configured combined sleeve rule replaces both standalone adjustments with one amount. Catalogue defaults and included add-ons remain included.
4. Put extras in a separate optional multi-select step, state labor/material coverage, and block unsupported future services. Use `addonsChanged` to distinguish retaining catalogue extras from explicitly removing them.
5. Extend admin images, bilingual descriptions, prices, compatibility, required numeric measurements, publication and display order. Preserve legacy metadata and do not seed invented live catalogue options.
6. Add explicit original/design/reference/help choices and a review Edit action for each section. Changes require reconfirming affected measurements without clearing their values.
7. Verify pure pricing/schema tests, client draft/selection/editing regressions, lint/build, and browser layout/interaction checks. Database integration checks require the normal MongoDB runtime prerequisite; no Ollama installation or model commands are part of this work.

Implemented and locally verified: see [the test report](separate-customization-test-report.md). The report records the unrun database integration suites and the formatter command rejection; no live data migration or publication was performed.
