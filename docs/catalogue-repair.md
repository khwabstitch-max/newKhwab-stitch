# Catalogue selector repair

## Current evidence

This review reads source and uses isolated fixture tests. The owner's `.env` files and configured application database are not accessed. Consequently there is no new claim about which live records are currently published. The prior imported library was deliberately saved as inactive drafts with unconfirmed applicability; those records must not be silently published to fill an empty selector.

The review found three concrete source defects:

1. Selector images and previews preferred a bundled name-matched style guide over the actual catalogue/ImageKit URL. An administrator could replace an option image, refetch successfully, and still see the old illustration. Live images and their multiple views now take priority; static references are a fallback only when no catalogue image is attached.
2. A pending option price could fall back to hardcoded style-guide prices, including a false “Included” label. Only the backend option's pricing metadata now controls selector prices. The separate style explorer labels its examples as references with price after tailor review. Sleeve lengths remain free.
3. Publication checks excluded only a few known inactive strings, accidentally admitting unknown status values. Public queries, pricing and selectors now accept explicit published status or the established active legacy record with absent/null status. Other statuses fail closed.

The request flow suppresses catalogue requests/gallery content while following a reference or requesting help, preserves parked choices when switching back, and offers explicit refresh. Loading, API failure and successful empty results are distinct; a failed request no longer also claims there are no compatible designs. Existing length/neck compatibility rules remain enforced and explain hidden combinations.

## Eligibility and owner review

An option must be active, published (or a supported pre-status legacy record), assigned to the chosen garment and in the correct canonical section. Extras must be available stitching services. A sleeve/length pair requires the administrator's explicit compatibility list; unknown combinations are not invented. The selected catalogue design's original configuration remains available through its original snapshot. Numeric sleeve length is collected later, never copied from a guide illustration.

Imported draft cards with `garments:[]` remain unavailable until an administrator confirms suitability. Empty results are not repaired with hardcoded products. API failures offer Retry, and Refresh designs refetches current records without changing entered notes, measurements, logistics or parked component choices.

## Safe metadata repair

`server/src/option-maintenance.js` contains the pure eligibility filter and repeatable repair planner. Known legacy kind spellings (`sleeve_design`, `sleeve_length`, `front_neck`, `back_neck`, `add_on`), canonical garment case/whitespace and explicit status case can be normalized. Unknown values are flagged, not guessed. It never sets `active:true`, invents compatibility, assigns garments to empty imports or creates business rates. Length metadata is normalized to zero fee, preserving current policy.

From the repository root, a no-access plan is safe:

```powershell
node server/scripts/repair-option-metadata.js
node server/scripts/repair-option-metadata.js --input artifacts/reviewed-options.json
```

The input must be a reviewed JSON array exported into this repository. The script does not load `.env` files. It was not executed against a configured or production database during this review.

An operator may separately review a backup and execute against an explicitly confirmed database, with `MONGODB_URI` supplied through the process/hosting secret environment:

```powershell
node server/scripts/repair-option-metadata.js --execute --confirm-database EXACT_REVIEWED_DB --backup-confirmed
```

That command changes only option metadata using expected revisions, skips concurrent conflicts and reports counts without names, URLs or secrets. It never updates orders/accepted quotes. Repeating a completed normalization yields no changes. Take a backup and rehearse on a disposable copy before any operational execution. No production execution is authorized by this documentation.

## Verification scope

Regression tests cover live-image replacement/multiple views, pending-price integrity, unavailable publication states, distinct loading/failure/empty UI, restored choice behavior, pure migration idempotency and zero-length fees. The length illustration matcher also now checks exact/three-quarter names before the generic word “quarter,” which previously selected the short-sleeve picture for three-quarter styles. The required pricing fixture uses ₹300 base + ₹50 sleeve design + ₹0 length + ₹30 front neck + ₹20 back neck = ₹400; these are test values only, never seeded as business prices. Targeted selector tests passed33/33 across four files; broader customization/language/admin/paging tests passed37/37; maintenance/pricing tests passed30/30. These groups overlap with the aggregate suite and must not be added as unique counts.

Local integration-test runtime provenance and the official Microsoft package checksum are documented in [local-test-runtime.md](local-test-runtime.md). The workspace-only runtime enables isolated MongoDB tests without touching `.env` files or an external application database. Current aggregate command outcomes belong in the overall review report.
