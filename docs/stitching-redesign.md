# Stitching-first homepage revision — November 18, 2026

The homepage now focuses on on-demand custom stitching. Its main visual is a static four-frame story: unstitched fabric → design choice → machine stitching → the finished outfit being worn. Embroidery remains only where it belongs in actual catalogue records, custom work options and pricing terms; it is no longer a promoted hero service.

The header has clear catalogue/help navigation, search, language/account access and a persistent Start stitching action. The footer uses a light linen background with concise groups, real configured contact links, support hours and legal/fabric information. It has no dark panel or repeated large invitation.

## Working behavior

- Main actions still open the actual catalogue and reference-request routes.
- The story frames are illustrations, not fake interactive steps or customer portfolio claims.
- A configured owner hero photo can remain the design-reference frame.
- Exact previous shipped hero/footer templates are refreshed for display. Custom owner text, image references, CTA labels and stored API records remain unchanged.
- Measurement and quote-approval process steps remain separate from the visual material journey.
- Existing drafts, authentication, measurements, consent, estimate freshness and order-submission protections remain intact.

## Generated visual and workspace assets

Tool: built-in `image_gen`, using the imagegen skill. The single generated four-panel storyboard was divided into web-size derivatives with `scripts/prepare-stitching-story.mjs`. Original generated artwork and previous project assets were preserved.

Saved under `client/public/atelier/stitching/`:

| Stage | 300px file | Bytes | 600px file | Bytes |
|---|---|---:|---|---:|
| Fabric | fabric-300.webp | 18,358 | fabric-600.webp | 53,290 |
| Design | design-300.webp | 12,908 | design-600.webp | 36,134 |
| Stitch | stitch-300.webp | 12,886 | stitch-600.webp | 32,542 |
| Wear | wear-300.webp | 15,094 | wear-600.webp | 43,990 |

Exact generation prompt:

> Use case: photorealistic-natural. Asset type: ONE coherent four-panel photographic storyboard for an Indian custom stitching website. Produce an exact 2 by 2 contact sheet with four equal rectangular photographs, no gutters or borders, no written text, no logos, no watermarks. This is a chronological sewing journey using the SAME fabric in all four panels: warm ivory cotton with a very small muted dusty-rose block-print motif, NOT embroidery. Top-left panel: clearly UNSTITCHED fabric, a folded rectangular length of this cotton fabric on a light oak tailoring table with simple dressmaking scissors and a rolled measuring tape, no finished garment. Top-right panel: choosing the garment design, close-up of a woman's hands selecting between two simple kurti neckline silhouette sketches on unlettered paper beside a swatch of the same fabric; sketches should read as clothing design options without any text. Bottom-left panel: clearly MACHINE STITCHING, realistic hands guiding the same cotton under the needle and presser foot of a domestic sewing machine, with visible machine, fabric and ordinary seams, anatomically realistic hands. Bottom-right panel: the finished garment being WORN, an adult Indian woman standing comfortably in a bright simple studio, wearing a beautifully fitted everyday straight kurti made from the same ivory-and-dusty-rose printed cotton, with matching plain trousers; show the full outfit from head to below knees or full length. Simple stitched neckline and sleeves, NO embroidery, NO embroidery hoops, NO ornate handwork. Use consistent soft daylight, tactile cotton, warm cream and light wood, quiet refined tailor studio styling. Four independent tidy compositions fitted within their own quadrant, no subject crosses between panels. Story order must be unstitched fabric -> design choice -> sewing machine -> finished outfit worn. The photographs are illustrative website storytelling, not customer portfolio work.

## Verification

```powershell
node scripts/isolated.mjs client-lint
node scripts/isolated.mjs client-build
node scripts/isolated.mjs client-test --maxWorkers=1
node scripts/atelier-browser.mjs
node scripts/audit-translations.mjs
git diff --check
```

Verified locally: 266 frontend tests across 27 files passed; frontend lint, production build, translation audit and whitespace checks passed. The production build still reports a large main JavaScript chunk, which remains a separate performance optimization.

The browser helper renders the production build in installed Chrome with read-only local fixtures. All 44 page/language/viewport checks passed, including 320/390/768/1440px pages and the 1200/1201px header breakpoint. The fixture deliberately returns the previous saved embroidery template to verify its display refresh. Checks cover static story order, actual links/filtering, header mobile/desktop breakpoint, visible footer/contact, image loading and bounds in English/Hindi. No uncaught browser exceptions or visible overflow failures were recorded. Screenshots and current results are under ignored `artifacts/atelier-*`.

Fixture catalogue data is illustrative test data. This does not verify live provider integrations, deployed owner data, real order submission, Safari or every physical device.
