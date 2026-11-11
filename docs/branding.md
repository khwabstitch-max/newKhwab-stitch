# KhwabStitch visual identity

Updated 2026-11-06 from the logo supplied by the owner. The KS initials, sewing needle, looping rose thread, floral detail, brand spelling and tagline are retained. The header uses a compact horizontal lockup; the about section and footer use the circular seal.

## Palette

| Role | Color |
|---|---|
| Chocolate / primary text and buttons | `#4A271B` |
| Warm cream / page background | `#FCF5E9` |
| Dusty rose / thread and accents | `#C96B70` |
| Deep rose / readable large italic accents | `#A65E63` |
| Copper / rings and details | `#B77755` |
| Olive / leaves and supporting accents | `#77734D` |
| Soft line / borders | `#E5D1BE` |

CSS tokens live at the beginning of `client/src/styles.css`. The garment illustrations use matching rose, olive and warm neutral shades. Semantic error states retain distinct warning colors. Wordmark/tagline use local Georgia/Times serif fonts; interface text uses system sans-serif fonts, without external font requests.

## Assets and usage

- `client/public/brand/khwab-monogram.png`: refined 1254 × 1254 transparent PNG, generated with the built-in imagegen tool from the owner's supplied reference. Alpha verified with minimum 0 and maximum 255. Saved inside the project; the app does not depend on the generation cache.
- `client/public/brand/khwab-stitch-logo.svg`: standalone circular seal with cream background, copper rings, embedded monogram, vector wordmark and exact tagline, “Where Fabric Becomes Art”. Its monogram is embedded PNG artwork; this is not a claim that every element has been vector-traced.
- `client/public/favicon.svg`: compact KS/needle/thread favicon in the same palette.
- `Logo` in `client/src/components/Layout.jsx`: accessible home link using the horizontal mark by default and the circular seal for the footer.

Keep the transparent monogram on a light cream background. Use the cream-backed seal on dark backgrounds. Do not stretch the artwork, change the logo's letter shapes or place the delicate tagline at unreadably small sizes.

## Generation record

Mode: built-in `image_gen`, editing the most recent owner-supplied logo reference, transparent background enabled. No CLI/API-key fallback was used.

Exact prompt:

> Edit target: the user's attached KhwabStitch logo. Create a polished, faithful, transparent-background web monogram asset from this exact brand identity. Keep the recognizable intertwined uppercase K and S in elegant dark chocolate-brown high-contrast serif letterforms, the diagonal sewing needle with a clearly defined eye, the dusty-rose thread sweeping through the initials and looping near the upper-right needle, and the small dusty-rose petal with two muted-olive leaves at the lower-left. Preserve the original arrangement and delicate tailoring mood. Refine spacing, line consistency, crisp edges, and balance for a professional boutique identity. This specific asset is ONLY the KS / needle / thread / floral monogram: remove the cream paper background, the outer circular rings, the KhwabStitch wordmark, and the bottom tagline so these can be typeset separately as sharp accessible text in the website. Do not invent a different logo. Colors: chocolate #4A271B, dusty rose #C96B70, olive #77734D, subtle copper #B77755. Flat refined vector-like artwork, no texture, no mockup, no shadow, no bevel, no gold metallic effects, no white matte, no extra symbols or text. Square canvas, centered balanced mark with modest transparent padding, all needle/thread/leaf details contained within the frame. Actual alpha transparency.

## Verification for this visual update

- Client production build and lint passed.
- All 36 existing frontend tests passed; backend behavior was not changed.
- Actual Chrome checks passed public pages, login gates, keyboard navigation, and 320/390/768/1024px layouts without overflow or clipped hero text.
- Header monogram and circular images loaded successfully; desktop/mobile, about and footer screenshots were inspected.
- Local ignored previews: `artifacts/home-desktop.png`, `artifacts/home-mobile.png`, `artifacts/brand-story.png`, `artifacts/brand-footer.png`.

These checks cover the visual change. No deployment, database edit, authentication change, or new live ImageKit verification was performed for this branding task.
