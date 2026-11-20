# Catalogue and stitching-request release preparation

Verified locally on 19 November 2026. This record covers the catalogue/request refactor; earlier deployment evidence in production-readiness.md remains historical.

## Customer flow

- Catalogue pages use proper English/Hindi descriptions and garment details. Alteration is an existing-garment service with scope, preparation, fitting and limitations.
- "Request alterations" replaces the design-personalization CTA for alterations. The request excludes sleeve/neckline customization for that service.
- Kurti, suit/kameez and blouse customization uses explicit checkboxes. Option applicability, sleeve lengths and incompatible neckline pairs are checked on the server.
- The three measurement plans are manual entry, online help and a well-fitting stitched sample. Sending a sample requires acknowledgement; parked numeric measurements are not submitted with sample/help plans.
- Self-arranged transport and atelier-arranged paid transport are separate choices in both directions. The preferred completion date supports an optional reason.
- The stitching estimate appears once, in final review, with selections, design/component images, private reference previews, transport and pending work.
- Uploaded designs remain unquoted for stitching/customization until tailor review. Known transport charges remain visible separately.
- Alteration wording acknowledges the existing garment; the final price requires assessment.

## Stable catalogue identities

| Record | Code |
| --- | --- |
| Teal Floral Embroidered Kurti | K-0 |
| Everyday Floral Cotton Kurti | K-1 |
| Sage Straight Kameez Set | KS-0 |
| Maroon Brocade Saree Blouse | B-0 |
| Garment Fitting & Alterations | A-0 |

Components use SD-0 onward for sleeve designs, SL-0 onward for sleeve lengths, FN-0 onward for front necklines and BN-0 onward for back necklines. Fit and extra work use FT/AD. Codes are allocated atomically, remain fixed during edits and are not reused after deletion. Applicability is stored separately, so one component can support several appropriate garment types.

Admin can create, edit, publish/archive and manage designs/options, compatible garments, images and pricing. Changing a record's garment/type requires a new record to preserve historical identity. Alteration service details have their own bilingual admin fields.

## Admin transport rates

Open **/admin/settings?section=business** and find **Fabric pickup and outfit delivery**.

1. Add a named service area, with an optional Hindi name.
2. Set PIN codes or PIN prefixes.
3. Set the inbound pickup and outbound delivery rates independently, in INR.
4. Enable the area and save.

The longest matching prefix wins. A blank rate stays pending and does not inherit a broader area's price. An explicit zero is valid. Rates apply once per shipment in each direction, independently of garment quantity. Self-arranged transport adds no atelier transport charge; customers pay their own courier directly. These settings do not book a courier.

No business transport rates were invented or changed in this refactor.

## Catalogue migration

Applied to the configured project database: five designs and 33 options updated. Existing IDs, URLs/slugs, media, prices, default component IDs, submitted orders and accepted quotes were preserved. Previous codes remain searchable aliases. Editable draft estimates were invalidated so review uses current data.

Pre-migration catalogue-only backup:

artifacts/catalogue-backups/catalogue-before-2026-11-19T17-56-50-366Z-3735396f-38f5-4072-981b-e6d771195581.json

Results: artifacts/catalogue-production-applied.json. Follow-up dry-run returned no design/option changes and no warnings. The CLI defaults to dry-run; --apply saves a backup before document mutation and uses one transaction with revision guards.

## Verification

- Complete client regression: 315 tests passing before the final alteration-acknowledgement copy adjustment; focused request regression rerun afterwards.
- Complete server regression: 280 tests passing, including concurrent code allocation and concurrent import recovery.
- Client/server lint and production build checks pass.
- Translation audit passes.
- Source credential-pattern check reports no findings without reading environment files.
- npm production dependency audits report zero known advisories for client and server at verification time.
- Actual Chrome: 36 request layouts in English/Hindi at 1440, 390 and 320 pixels, with no page overflow, broken visible images or uncaught exceptions. One price panel appears only in review; all three measurement plans and selection/reference images render.
- Browser cases use the current public catalogue snapshot and real pricing calculation with isolated fixture-only delivery rates. They do not submit real orders or verify live private media/provider operations.

Evidence: artifacts/production-client-all.txt, production-server-all.txt, production-client-build.txt, production-client-lint.txt, production-server-lint.txt and production-request-browser-report.json. Screenshots begin production-request-* and production-price-*.

The updated product is built and verified locally. This work does not establish a new live deployment or replace the remaining live-provider/account verification described in production-readiness.md.

## Reference upload follow-up

See [PDF and multi-file reference verification](reference-upload-flow.md) for the 20 November upload, quote-gallery and individual-selector changes and updated test evidence.
