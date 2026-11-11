# Supplied visual library

Source used: the folder supplied by the owner (`C:\Users\HP\Downloads\images`). The chat boards are visual references; the local individual files are the actual imported sources. Preparation is reproducible and reads originals without modifying them.

| Group | Records | Treatment |
|---|---:|---|
| Front neck | 8 | Round, V, boat, collar, square, sweetheart, high, mandarin |
| Back neck | 7 | Simple, round, V, square, deep, button, cut-out; “as per photo” stays a reference action |
| Sleeve design | 11 | Front/side grouped; shared duplicate assets; ruffle front quarantined |
| Sleeve length | 5 | Sleeveless, short, elbow, three-quarter, full; all free; no fixed size imported |
| Measurement guides | 3 | Kurti/blouse/suit, garment method, bilingual/neutral (`und`), unpublished |

There are 62 files, 53 unique source byte hashes, 34 draft records and 47 selected public upload assets. Supporting outfit/design-code duplicates are inventoried, not promoted to extra products. Existing custom-length/admin options are supported without inventing a missing source image. Suitability, construction/material supply, prices and compatibility are not established by a photo. Decorative embroidery visible in a source does not enable an embroidery service.

```powershell
node server/scripts/prepare-visual-import.js --source 'C:\Users\HP\Downloads\images'
```

Inspect `artifacts/visual-import/inventory.json`, `manifest.json` and all seven `contact-*.png` sheets. Original copied assets retain exact bytes and real format extensions even when a supplied filename was misleading. Full-file rectangles are genuine provenance; no original board pixel coordinates are claimed. No upscaling or AI replacement was applied. Source images are preserved separately from provider-normalized display images.

From `server`:

```powershell
node scripts/import-visual-assets.js --manifest ../artifacts/visual-import/manifest.json
# Preview above; after source/configuration review:
node scripts/import-visual-assets.js --manifest ../artifacts/visual-import/manifest.json --execute
node scripts/verify-visual-import.js
```

The configured import was executed during this review, then repeated: first run created34/uploaded47/published0; second created0/skipped34/uploaded0. Deterministic keys/hashes refuse conflicting source changes and preserve admin edits. The importer requires an existing active administrator; it does not grant roles. Public catalogue uploads are re-encoded without enlargement, checked and pinned transactionally. Failed provider/database compensation is an operator-reconciliation boundary, not an atomic cloud transaction.

`manifest.json` is immutable preparation evidence and therefore still says `databaseImported:false`/`providerUploaded:false`; those flags describe preparation, not the later run. `verification.json` records current read-only database/provider evidence. Import audit entries retain review flags. No records are automatically published. To publish, review code/name/images, correct applicability/compatibility, exact measurement keys, material wording, standalone price and order. Length fees stay zero. Do not publish the supplied garment guides as body guides.

The optional `db:free-lengths` migration defaults to a plan. Its execution changes legacy length metadata and invalidates estimates only in editable drafts, preserving input and accepted/submitted order snapshots. It was not executed on the configured application database. Back up and rehearse before operator execution.
