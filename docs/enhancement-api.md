# Enhancement API contracts — 2026-11-08

This extends [api.md](api.md). Existing customer IDs, catalogue URLs, order endpoints, authentication tokens and accepted quote ownership remain authoritative. Source schemas are in `server/src/domain.js`, `workflow-input.js`, `support-domain.js` and the corresponding `routes-*.js` files. All money is integer paise; all request objects reject unexpected fields unless the draft contract expressly permits JSON data.

Responses use `{data: ...}` and list responses also include `{pagination:{page,limit,total,pages}}`. Lists default to 12 and accept `page` and `limit` (maximum 50). Errors use the existing safe `{error:{code,message,requestId,...}}` envelope. Protected routes require `Authorization: Bearer <current session>`. Missing ownership is normally reported as 404; admin permission failures are 403; stale revisions or changed availability are 409.

`GET /api/designs/id/:id` recovers the current published design by validated ID when resuming a draft or following a catalogue request link beyond the visible gallery page. It uses the same safe public projection as the slug endpoint and hides draft/archived records. Catalogue search includes design code and bilingual titles.

## Components and catalogue defaults

Existing `POST/PATCH /api/admin/options` accept these additional optional fields:

| Field | Contract |
|---|---|
| `description`, `imageAlt` | Text, maximum 1000 and 250 characters respectively |
| `imageMediaId` | Public catalogue MediaAsset ID, or null; never a private customer image or external URL |
| `priceMode` | `included`, `additional`, `replacement`, `pending` |
| `amountPaise` | Nonnegative integer for additional work |
| `replacementAdjustmentPaise` | Explicit nonnegative replacement surcharge; never a guessed deduction from a bundle |
| `measurementFields` | Up to 11 keys: bust, underbust, waist, hip, shoulder, length, sleeveLength, frontNeckDepth, backNeckDepth, armhole, sleeveOpening |
| `sleeveStyle` | sleeveless, short, elbow, three_quarter, full, other |

Existing option kinds remain `sleeve`, `neck` (front neckline), `back`, `fit`, `extra`. Missing price metadata means pending review. `GET /api/options` returns these public fields and an authorized resolved `imageUrl` or null. A missing image is a labelled fallback, not a fabricated photograph. The existing active/garment/kind filters and bounded pagination apply. `DELETE /api/admin/options/:id {revision}` now archives the option and returns `{archived:true}`. Its record and referenced image remain available to historical snapshots.

Catalogue writes optionally accept `defaultComponents:{sleeve?,neck?,back?,fit?}` mapping each kind to an active compatible option ID. Public design responses include this mapping. Old designs remain valid with missing mappings; pricing reports their unknown original details for review instead of inventing defaults.

## Configuration and trusted estimate

`POST /api/pricing/estimate` is public and accepts only:

```json
{
  "garment":"kurti", "quantity":1, "designId":"<catalogue ObjectId>",
  "configuration":{
    "source":"catalogue", "mode":"custom",
    "components":{"sleeve":{"source":"option","optionId":"<option ObjectId>","notes":""}},
    "addonIds":[], "notes":""
  },
  "logistics":{"inbound":{"method":"dropoff"},"outbound":{"method":"collect"}}
}
```

Garments remain kurti/suit/blouse/alteration, with quantity 1–10. Configuration source is `catalogue` or `reference`; mode is `exact` or `custom`. Reference designs use custom mode. Component sources are `original`, `option` (requires optionId), or `reference` (requires referenceMediaId), with optional notes. Components are independent. Catalogue exact mode retains originals; custom mode retains unchanged originals. Uploaded-reference components remain pending tailor review. An order's component reference IDs must also belong to its protected `referenceMediaIds` array.

Inbound methods are `dropoff`, `customer_courier`, `business`; outbound methods are `collect`, `customer_courier`, `business`. Business-arranged transport requires an address at order submission: `{line1,line2?,city,state,pin}`. Estimates may omit an address to receive a pending transport quote. Customer couriers are paid directly by the customer; zero business transport charge does not mean a free courier.

The estimate returns:

```text
currency, pricingVersion, configurationVersion,
lineItems[{code,label,unitAmountPaise,quantity,scope,amountPaise,included?}],
pendingItems[{code,label,reason}], knownSubtotalPaise,
estimatedTotalPaise (null while anything is pending), hasPending,
components (trusted labels/configuration snapshot), measurementFields,
label, finalQuoteRequired:true
```

Garment lines multiply by quantity; shipment lines occur once per leg. Included originals are never charged twice. Replacement mode uses only the configured explicit adjustment. Inactive/incompatible newly selected options fail with `OPTION_UNAVAILABLE`. The public endpoint does not dereference private reference IDs or return private media. Prices supplied by the browser are rejected. Disabled services fail with `SERVICE_UNAVAILABLE`.

## Drafts and submission

| Endpoint | Request / behavior |
|---|---|
| `GET /api/drafts` | Own active drafts only, bounded pagination |
| `POST /api/drafts` | `{clientId:UUID,title?,data:JSON-object}`; unique owner/clientId makes creation retry-safe; replay returns the original draft without overwriting it |
| `GET /api/drafts/:id` | Own database draft ID only |
| `PATCH /api/drafts/:id` | `{revision,data,title?}`; atomic version check, 409 on concurrent edits |
| `DELETE /api/drafts/:id` | `{revision}`; release active draft media references and remove the owned draft |

Draft JSON is bounded to 60,000 serialized characters. Private media IDs in reference associations are validated, owner-checked and reference-counted. Draft storage is not a way to attach another customer's image. Server drafts persist across process restarts and are not automatically expired. Retention remains a business policy/operations decision; deletion and account erasure are implemented.

Existing `POST /api/orders` optionally adds `configuration`, `logistics`, `fabricDetails` (text, maximum 1000), `draftId` (database ID), `draftRevision`, `estimateVersion`, and `policyVersion`. A top-level address remains required for legacy requests; the new configuration flow omits it when transport is entirely customer-arranged, and business legs require their own valid addresses. Client-only revision/fingerprint acknowledgements are hashed for idempotency but are not persisted as model fields. `estimateVersion` must equal the displayed trusted `configurationVersion`; a changed estimate returns 409. `draftRevision`, when supplied, must still be current. Configured policy versions require acknowledgement. Design-dependent measurements must be present or use assistance; reconfirmation fields must be cleared through customer review or assistance.

The transaction computes and snapshots the trusted estimate, preserves the design/reference configuration, creates the real request, then marks its owned draft submitted and links matching draft support tickets. Failure rolls back those operations. Replays return the original order using the existing owner/idempotency key and payload hash; authentication alone never submits an order. `GET /api/orders` also accepts an optional status filter. Existing order history, quote decisions and owner checks remain unchanged.

## Final quotes and fulfilment

`POST /api/admin/orders/:id/quotes` retains `{revision,amountPaise,deliveryDate,notes,notesHi?}` and optionally accepts `lineItems:[{label,amountPaise,scope,quantity}]`. Here each amount is a **line total**. Their sum must equal the final quote amount. Scope is garment/shipment/order; garment quantity must match the order and other scopes have quantity one. Quotes without line items remain supported for legacy requests. Quotes are versioned; customer acceptance requires the current quote version/revision. Accepted/active orders cannot be silently requoted.

`PATCH /api/admin/orders/:id/fulfilment` accepts expected revision plus at least one of:

```text
inboundStatus?, outboundStatus?, trackingUrl?, estimatedCompletionDate?,
delayNote?, alterationMargin?:{confirmed,description,exceptions},
outboundReconfirmedAt?: ISO-datetime | null
```

Transport statuses are not_arranged, quote_pending, awaiting_confirmation, confirmed, in_transit, received, collected, delivered, cancelled. Tracking URLs must be HTTPS without URL credentials; empty text clears the link. Completion date accepts YYYY-MM-DD or empty/null to clear it. No date is generated automatically. Updates preserve accepted pricing and operational status, record an attributable fulfilment history, increment revision, append a genuine admin timeline event and audit the changed field names. New charges require a separately approved quote process; this endpoint cannot change prices.

## Account and password lifecycle

| Endpoint | Contract |
|---|---|
| `GET /api/auth/capabilities` | `{emailPassword:true,google,googleClientId,passwordRecovery,emailVerification}`; Google requires GOOGLE_CLIENT_ID, mail requires all configured email variables |
| `POST /api/auth/google` | `{credential}` from GIS callback; verified Google subject exchanges for the same local JWT/customer account; existing-email collision returns ACCOUNT_LINK_REQUIRED |
| `POST /api/auth/google/link` | Authenticated `{credential,currentPassword}`; proves the existing local account and same-email Google account before adding a unique subject link |
| `POST /api/auth/recovery` | `{email}`; same response for eligible/absent/disabled accounts; configured mail required |
| `POST /api/auth/reset` | `{token,password}`; one-use unexpired reset token; revoke existing sessions/reset links |
| `POST /api/auth/password` | Authenticated `{currentPassword,password}`; current-password proof and password rules; revoke sessions/reset links |
| `POST /api/auth/verification` | Authenticated empty object; send current-email verification link |
| `POST /api/auth/verify` | `{token}`; one-use current-account email proof |
| `GET /api/account/identity` | Own email verification state and methods password/google as actually linked |
| `GET /api/account/overview` | Real order/quote/draft/support/notification summaries and latest orders |
| `GET/PATCH /api/account/preferences` | Own addresses and communication choices; writes require revision, full address array and communications object |
| `GET/POST /api/measurements` | Own named measurement profiles; POST fields name, garments, unit, method, values, notes |
| `PATCH/DELETE /api/measurements/:id` | Owner-scoped expected revision; profile edits never modify submitted orders |
| `GET /api/notifications`; `POST /api/notifications/:id/read` | Owner-scoped notifications and marking read |

Reset links expire after 30 minutes; verification links after 24 hours. Only SHA-256 token hashes are stored. Action secrets are sent in the application's URL fragment, never a return URL query or server path. Passwords use existing bcrypt validation; no parallel password database is introduced. Sensitive routes share a process-local 10-per-15-minute IP limit and password work remains concurrency-bounded. Password changes/reset require signing in again on all existing sessions.

Email settings: `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_WEB_URL`, configured together on the backend. The web origin must be exact and HTTPS in production. Outbound delivery uses the [Resend send API](https://resend.com/docs/api-reference/emails/send-email). Delivery is unverified until the owner configures and tests the provider.

Google sign-in is optional code behind `GOOGLE_CLIENT_ID`. The JavaScript GIS callback posts JSON; this app does not implement Google's automatic cookie/form POST flow. The existing JWT library verifies RS256 using Google's fixed HTTPS JWK endpoint, audience, issuer, expiry, issued-at and subject. Keys are bounded/cached according to provider cache duration. User-controlled key URLs are never followed. New local and Google accounts share a unique optional email reservation, preventing duplicate-owner races. Existing emails are never automatically claimed or linked. Google-only accounts have no application password; reset responses remain generic and the UI directs Google password management to Google. Gmail/verified Workspace email authority can mark app email verified; a third-party Google email remains unverified unless separately proved. See [Google's verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token). Firebase is not reintroduced; its [account-linking guidance](https://firebase.google.com/docs/auth/web/account-linking) is background for any future provider migration, not the running authentication mechanism. RSA/JWK and linking behavior are tested with signed fixtures; live Google origin/client registration is unverified.

## Separate customization contract — 2026-11-10

`configuration.components` now accepts independent `sleeveLength`, `sleeve`, `neck`, `back` and existing `fit` keys. Each uses `source: original | option | reference | help`; active options require an existing option ID and active references require an owned reference ID. `help` remains pending tailor review. Sleeve-length preferences are option records, not numeric measurements.

| Record/field | Meaning |
|---|---|
| `DesignOption.kind: sleeveLength` | Separate style preference; `lengthStyle` is sleeveless, short, elbow, three_quarter, full or custom |
| `compatibleLengthStyles` | Explicit supported length styles on a sleeve design; an absent matrix with a separate length remains pending, and an explicit mismatch is rejected |
| `incompatibleOptionIds` | Symmetric validation of selected front/back combinations; neither choice is silently changed |
| `sleevePricingMode`, `combinedLengthPrices` | `separate` or `combined`; combined rows contain `{lengthStyle, amountPaise}` and replace both standalone sleeve adjustments with one configured total |
| `status`, `displayOrder` | draft/published/archived and integer display ordering; active legacy records without status retain publication behavior |
| `descriptionHi`, `imageAltHi` | Additive bilingual content alongside names, description and public catalogue imagery |
| `materialCoverage`, `materialNotes` | labor_only, labor_and_materials or review; explicit included-material notes are required before publishing supplied-material extras |
| `serviceType` | Finishing additions use the implemented stitching service; unsupported future crafts cannot publish or be selected |
| `Design.defaultComponents.sleeveLength` | Optional original included sleeve-length preference |
| `Design.includedAddonIds` | Original included finishing additions, stored separately from component defaults |
| `configuration.addonsChanged` | false retains catalogue additions; true uses the explicit selected `addonIds`, including an empty array to remove all; omission preserves legacy behavior |

Public option responses remain bounded and support garment/kind filters. The public projection includes the configured compatibility, publication, materials and pricing metadata. Estimate snapshots carry effective components and `addons`, required measurement keys and integer-paise line items. A changed pricing algorithm/configuration invalidates stale estimates. Customers cannot submit their own amounts or compatibility rules.

Sleeveless suppresses the sleeve design, its fee, active reference requirement and sleeveLength/armhole/sleeveOpening measurements. The full raw draft retains the previous choice and numeric values; new submitted configuration contains effective choices only. Client submission excludes hidden confirmation flags. Numeric frontNeckWidth/backNeckWidth are collected in the later measurement step where configured. A non-sleeveless separate length requires exact numeric sleeve length, or measurement assistance.

Exact catalogue requests ignore parked customization and retain original included additions. Choosing a default option again does not double-charge it. Custom reference work, missing compatibility or missing combined-price rules remain pending review. Existing accepted orders/quotes are not rewritten.

## Support, workers, reviews and services

| Routes | Authorization and writes |
|---|---|
| `/api/support` GET/POST; `/:id` GET; `/:id/status` PATCH | Owned assistance/complaints; UUID clientId for retry; optional owned order/draft, explicit contextShared, text/category, private attachments; customer may reopen resolved/closed tickets |
| `/api/conversations` GET; `/:id/messages` GET/POST; `/:id/read` POST | Context-authorized on every read/write; message clientId prevents duplicate sends; text and validated private attachment IDs |
| `/api/conversations/:id/attachments/:mediaId` GET | Current conversation permission plus attachment membership before a short-lived signed URL |
| `/api/admin/support` GET; `/alerts` GET; `/:id/assignment` PATCH | Admin queue, real business-hour response deadlines and explicit eligible master-tailor assignment |
| `/api/applications` GET/POST; `/:id` GET/PATCH; `/:id/withdraw` POST | Own application, portfolio, terms version and revision; submission grants no worker/admin role |
| `/api/admin/applications` GET; `/:id` PATCH; `/api/admin/workers` GET; `/:id` PATCH | Admin review, permission assignment/suspension; approval preserves the customer's account |
| `/api/admin/assignments` GET/POST; `/:id` PATCH | Admin-controlled job creation/reassignment; POST idempotency key and current approved worker |
| `/api/worker/profile`, `/api/worker/jobs`, `/api/worker/jobs/:id` GET | Active worker and assigned job only; excludes business quotes and unrelated customers |
| `/api/worker/jobs/:id/progress` POST | `{revision,clientId,stage,note}`; stage cutting/stitching/quality_check/ready_for_review/blocked; records a proposal needing admin confirmation |
| `/api/worker/jobs/:id/attachments/:mediaId` GET | Current active assignment plus actual order attachment |
| `/api/worker/assistance` GET | Explicit assistancePermission plus assignment; approval alone is insufficient |
| `/api/reviews` GET | Published, consented selected reviews; clear moderation notice, no fabricated aggregate |
| `/api/account/reviews` GET/POST | Own delivered order, one review/order, rating 1–5, original text, consent |
| `/api/admin/reviews` GET; `/:id` PATCH | Status/reason/revision moderation only; no silent rating/text editing |
| `/api/services` GET; `/api/admin/services` GET; `/:code` PATCH | Public active tested adapters; admin templates and revisions; unsupported future adapters cannot be activated |

Messaging is persistent HTTP messaging with explicit refresh, not an operational promise of instant live chat or callback. Customer-to-worker direct messaging is unavailable. Ticket receipt, first human response, and resolution are distinct. Support deadlines remain null until actual support hours are configured. Holiday exceptions require further implementation.

Draft design suggestions use explicit proposal records: authorized staff GET/POST `/api/support/:id/proposals`, and the draft owner POSTs `/api/support/:id/proposals/:proposalId/decision` with proposal revision, draftRevision and accept/decline. Acceptance checks the original current draft and trusted price version, applies only proposed components, preserves unrelated data, marks affected measurements for reconfirmation and audits the change. Staff cannot silently edit the draft. Submitted-order changes still require conversation and a separately approved quote process. The full fields and transition contracts are in [account-support-api.md](account-support-api.md).
