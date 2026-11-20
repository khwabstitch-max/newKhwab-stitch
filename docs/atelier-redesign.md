# Khwab Stitch atelier redesign

The hero and header/footer were revised on November 18 to emphasize custom stitching and a light footer. See [the current stitching revision](stitching-redesign.md). The embroidery-led visual below documents the earlier iteration.

The November 17, 2026 local redesign uses warm ivory, deep wine, olive and antique brass. Stitching, embroidery and alterations lead the homepage, followed by actual configured catalogue records, four process steps, tailor help and real published reviews. No sample designs, prices, reviews or offers were added to application data.

The original logo and reference library remain. New optimized assets live in `client/public/atelier/`. The embroidery hero is generated craft inspiration, not a claim of customer work; its homepage caption identifies it as inspiration. The garment image is a crop of the existing design reference.

## Styling and interaction

- `tokens.css`: semantic palette and compatibility aliases.
- `atelier-base.css`: shared typography, buttons, fields, tabs, notices and surfaces.
- `atelier-home.css`: visual homepage composition.
- `atelier-shell.css`: responsive header and footer.
- `atelier-flow.css`: request and account layout refinements.
- Existing language support, owner-authored complete content blocks, login continuation, drafts, quote acceptance, fabric consent and uncertain-submission behavior are preserved.
- Mandatory conditions remain visible where customers decide; supporting specifications and privacy explanations use native disclosures.
- Shared Google Fonts are Cormorant Garamond, Plus Jakarta Sans and Noto Sans Devanagari, with local fallbacks. The font CDN is external.

## Image generation and optimized assets

Mode: built-in `image_gen` through the imagegen skill. Source generation remains in the default Codex generated-images folder; project references point only to workspace derivatives.

Exact generation prompt:

> Use case: photorealistic-natural. Asset type: editorial craft photograph for the homepage of Khwab Stitch, an Indian made-to-order ladies tailoring and embroidery service. Create a beautiful natural close-up photograph of an artisan's hands hand-embroidering delicate muted rose and olive floral motifs on warm ivory fabric held in a wooden embroidery hoop on a walnut worktable. Beside it, tasteful antique brass dressmaking scissors, a measuring tape, wine/burgundy thread spools and a small drape of deep wine linen. Hands have natural realistic anatomy, the needle and thread visibly connect to the work. Warm soft window light, tactile thread and woven cloth detail, restrained old-world atelier mood, rich warm ivory, walnut, dusty wine and antique brass palette. Wide landscape editorial composition, craft fills the frame, main embroidery hoop and working hands towards center right, natural depth, genuine texture, believable stitching, sophisticated photographic styling. This is an illustrative brand visual, not a customer portfolio photograph. No text, letters, logos, collage, borders, design board, watermark, graphics, people faces or extra fingers.

Project assets:

- `client/public/atelier/embroidery-480.webp` — 28,112 bytes
- `client/public/atelier/embroidery-768.webp` — 67,930 bytes
- `client/public/atelier/embroidery-1280.webp` — 195,604 bytes
- `client/public/atelier/kurti-reference.webp` — 80,674 bytes
- `client/public/atelier/monogram.webp` — 7,720 bytes

`scripts/prepare-atelier-assets.mjs` recreates web derivatives from a supplied generated PNG and the original project references; it does not replace the originals.

## Reproducible verification

```powershell
node scripts/isolated.mjs client-lint
node scripts/isolated.mjs client-build
node scripts/isolated.mjs client-test --maxWorkers=1
node scripts/atelier-browser.mjs
node scripts/audit-translations.mjs
git diff --check
```

Local regression verification passed: 263 frontend tests across 27 files, frontend lint, production build, translation audit (no missing/invalid entries), and whitespace checks. The production build reports a roughly 625 KB minified main JavaScript chunk; further code splitting remains a performance optimization.

The browser helper renders the actual production bundle in installed Chrome with clearly labeled read-only API fixtures. It checks 40 route/language/viewport combinations at 320/390/768/1440px, visible footer contact, image loading, keyboard menu behavior, resizing and actual CTA/filter clicks. Catalogue prices/records in its screenshots are test data. It uses no live account, database or provider and performs no real order submission. Reports and screenshots go under ignored `artifacts/atelier-*`. The current browser result is recorded in `artifacts/atelier-browser-report.json`. Real Safari/device behavior, live owner content, account workflows and deployment require their own validation.
