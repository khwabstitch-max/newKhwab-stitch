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

Open **/admin/settings?section=business**, then **Fabric pickup and outfit delivery**. Set the atelier's six-digit origin PIN and choose a pricing method:

| Method | Admin setup | Customer review |
| --- | --- | --- |
| Connected courier | Select Shiprocket or Delhivery; connect the account below | Account quote for each shipment, its carrier, PIN route and chargeable weight |
| Minimum charge and per-kilometre rate | Set pickup and delivery minimums/rates separately; choose a formula | Approximate PIN-area distance, rounded billable kilometres and the exact calculation |
| PIN-area flat rates | Maintain the existing named service areas and PIN prefixes | Matching configured pickup/delivery fee |

Nothing is charged for a customer-arranged drop-off, collection or courier by the atelier. The customer pays their own courier directly. Transport applies once per shipment in each direction, independently of garment quantity.

Per-km pricing supports **minimum + ceil(distance km) x rate** or **max(minimum, ceil(distance km) x rate)**. Enter explicit rates, including zero where intended; no business prices or origin PIN were invented. Distance is the approximate geographical distance between postal-area centroids, clearly labelled as such. It is not a road route or a courier's commercial zone. Missing PIN coordinates leave the charge pending. Derived GeoNames India coordinates are bundled on the server; see [data attribution](../server/data/GEONAMES-LICENSE.md).

The legacy flat-rate method keeps longest-prefix matching. A blank rate remains pending and does not inherit a broader area's fee. Switching methods preserves inactive settings without mixing prices from different methods.

### Courier accounts

Production first needs a stable, server-only **COURIER_CREDENTIALS_KEY**, the canonical base64url encoding of exactly 32 random bytes. Generate it in your secure server setup:

`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`

Set it in the backend hosting environment, never a VITE_ variable or frontend settings. Keep the same key across replicas and retain it through deployments. Replacing it requires reconnecting saved accounts. Local development/test derives a separate purpose-specific key from JWT_SECRET when the explicit key is absent; production does not use that fallback. An absent/invalid production key disables account saving without disabling the rest of the site.

In admin, paste the provider-issued API token into its password field and save. Delhivery also supports Surface or Express mode. Credentials are AES-256-GCM encrypted in a separate collection; public settings, admin status responses, audit records and browser drafts never contain tokens. The form clears the token after saving. Account status distinguishes saved credentials from a successfully verified live quote. Expired tokens must be replaced. Disconnect removes the saved connection.

Use **Test a live courier quote** with real PINs, parcel weight/dimensions and declared value where needed. This checks rates only and never books, pays for or schedules a shipment. The live quote uses fixed official provider endpoints, bounded JSON responses, timeouts and a short cache. Direct Blue Dart account pricing remains unavailable until its official account-specific API contract is supplied; Blue Dart may be offered by Shiprocket where the connected account and PIN route support it.

Customer parcel weight and dimensions are optional and never invented. Shiprocket inbound pickup also needs declared parcel value. A customer who does not yet know the packed dimensions can continue with a pending transport quote. Incomplete numeric entries remain in the editable draft but are not sent as a fabricated complete parcel. Only PIN codes and parcel data are sent to a courier for a rate check.

The final review shows inbound pickup and outbound delivery separately. Optional admin minimums are billing policy: if a minimum exceeds the carrier quote, the difference appears as a separate minimum-charge adjustment. Missing credentials, unavailable service, incomplete parcel information or lookup failures leave the charge pending rather than free. Submission recalculates prices and requires review if the amount/configuration changed. Saved orders retain parcel details and quote metadata; courier timestamps are not part of the price-change fingerprint.

Courier rates are account estimates and remain subject to the provider's final billed weight and charges. The atelier reviews the request and issues the final quote before stitching. Actual courier accounts and production credentials have not been connected by this work.

Provider references: [Shiprocket API](https://apidocs.shiprocket.in/), [Delhivery shipping-charge API](https://delhivery-express-api-doc.readme.io/reference/invoice-shipping-charge-api), [Delhivery volumetric weight](https://help.delhivery.com/docs/calculating-volumetric-weight).

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

## Alteration pricing after garment review ? 20 November 2026

Alteration service prices are always pending until the tailor reviews the garment and required changes. Home, catalogue, design detail, request selection, final review and submitted estimates show ?Price after garment review?. Public catalogue/settings/service responses hide legacy alteration rates. Only configured pickup/delivery charges may be known before the alteration quote. Reviewed and accepted quote amounts remain visible and unchanged.

Verification: 43 client tests, 68 server unit checks and one isolated API workflow passed; client build/lint and server syntax/lint passed. 12 English/Hindi browser layouts at desktop/mobile widths passed, including a check that the alteration price heading contains no numeric currency amount. Evidence: artifacts/alteration-review-client.txt, alteration-review-unit.txt, alteration-review-api.txt and alteration-review-browser-report.json. No configured database prices were changed.

## Shipping integration verification - 21 November 2026

- Full server regression: 351 passing tests, including encrypted credential storage, admin authorization, connection save/disconnect, quote validation and both pricing methods.
- Full client regression: 358 passing tests across 37 files. Focused customer shipping, breakdown and translation checks: 13 passing; admin delivery controls and credentials have additional client tests.
- Final client production build, client/server lint, server syntax checks and source credential-pattern check passed; environment files were not inspected. The existing large shared client bundle still produces a non-failing Vite chunk-size advisory.
- Actual Chrome with Express and disposable MongoDB: 27 checks passed, including 18 English/Hindi layouts at 1440, 390 and 320 pixels, secure account saving and a submitted request retaining both parcel/quote snapshots.
- Browser courier responses are injected fixtures. No configured business database, real courier account, real shipment or provider billing was used.

Evidence: artifacts/courier-delivery-server-all.txt, artifacts/customer-shipping-flow-tests.txt, artifacts/shipping-client-all.txt, artifacts/shipping-browser-report.json and artifacts/shipping-client-build.txt. Screenshots begin shipping-admin-, shipping-distance- and shipping-courier-.
