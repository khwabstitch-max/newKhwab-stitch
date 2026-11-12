# Premium stitching experience and owner-panel plan

The existing React/Express/MongoDB/ImageKit application remains the implementation. Accounts, drafts, pricing, order history, authentication, catalogue IDs and the deployed collection-recovery policy are preserved. No environment files or live customer records are needed for this work.

## Baseline and prioritized findings

The unchanged application had 234 server tests, 219 client tests and passing hosted CI. Read-only live captures cover English/Hindi at 1366, 768 and 390 pixels: `artifacts/ux-before-home-{en|hi}-{width}.png`. The rendered first screen confirms Romanized English hero copy and English fragments in Hindi. The source audit found 311 unique missing literal translations, flat admin navigation and technical money/date/enum inputs. The existing forms already provide ordinary catalogue editing; the audit does not characterize them as a JSON-only interface.

1. Make the service immediately understandable: customer fabric, custom stitching, confirmed measurements and reviewed price/timeline. Keep a persistent bilingual hero, working design/reference/help actions and clear category discovery.
2. Make static English/Hindi complete and consistent, retaining stable legacy keys while introducing semantic keys for new UI. Preserve raw customer text and enum identifiers. Report dynamic content missing its second language; prominent published promotions require both languages.
3. Organize owner tasks into clear navigation groups and reuse existing routes/forms. Explain draft/published/hidden/archive/delete, display rupees/percentages and business time, provide labelled selectors and protect edits and async saves.
4. Add editable homepage sections and scheduled promotions within the existing site-settings record, with media/reference protection and backend offer availability. Keep new promotions inactive by default.
5. Verify language switching, customer branches and owner tasks in isolated browser/data fixtures. Capture after screens, test API authorization/persistence, check overflow/focus/contrast and report external-provider limits.

## Reference review

The current official [Myntra](https://www.myntra.com/) and [Nykaa Fashion](https://www.nykaafashion.com/) pages were read for their category navigation, search, account entry and discovery hierarchy. These findings initially come from extracted page content, not a claim of visual inspection of those reference layouts. Their brands, photographs, text and layouts are not copied. Khwab Stitch uses the relevant discovery principles for stitching customer-provided fabric.

## Existing-system boundaries

Homepage content extends `SiteSettings.homepage`; it does not create another content-management system. Legacy welcome/banner fields remain stored. Public serialization filters unpublished/expired offers and designs, validates public image references and retains authoritative backend pricing. Public sliders have manual controls, no autoplay and no invented default offer.

The admin navigation reuses existing URLs and adds query destinations for distinct component types and settings sections. No role is granted through navigation state. Money and business-time presentation convert back to the existing integer-paise/basis-point/UTC contracts. All business authorization, quote versions, ownership and revision checks remain server-side.

## Verification and evidence

Use environment-isolated commands and one client test worker on this workstation. Browser fixtures must use isolated accounts/data; provider mocks are identified explicitly. Keep screenshots and detailed test reports under ignored `artifacts`. Publish the final navigation map, terminology/fallback report, owner guide, visual choices, verification results and specific remaining limits after implementation.
