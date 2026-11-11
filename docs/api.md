# REST API — application JWT, visual configuration and benefits

Updated 2026-11-10. Base `/api`; health paths are outside it. Protected requests send `Authorization: Bearer <application access JWT>`. Optional Google credentials are accepted only by exchange/link endpoints, never as general API Bearer tokens. GitHub + Vercel is the current deployment target: the root API function preserves these paths and the same-origin client defaults to `/api`. Older Render deployment instructions are superseded for rollout; see [Vercel deployment](deployment-vercel.md). No external provider/environment configuration was inspected in this review.

Detailed visual/draft/fulfilment and account/support contracts also live in [LLD](lld.md), [enhancement API](enhancement-api.md) and [account/support API](account-support-api.md). Current free-length, guide-snapshot, auth-recovery, serverless media and commerce behavior below takes precedence over older historical descriptions. See [admin guide](admin-guide.md), [customer workflow](customer-workflow.md), [authentication](authentication.md), [media](imagekit.md), [commerce](commerce.md) and [verification](review-verification.md).

## Conventions

Success `{data:...}`; lists add `pagination:{page,limit,total,pages}`. Errors use `{error:{code,message,requestId,details?}}`. Examples are illustrative, not real accounts or successful provider evidence.

| Status | Meaning |
|---|---|
| 200 / 201 / 202 | Success or identical order replay / created / deletion request recorded |
| 400 / 401 / 403 / 404 | Invalid input / bad login or token / forbidden account-role / hidden or missing resource |
| 409 | Existing/legacy account conflict, stale revision/quote/state/key, referenced deletion |
| 413 / 429 / 503 | Oversized input / rate-quota-concurrency limit / required dependency unavailable |

Page 1..100000; limit 1..50; IDs 24 hex characters. Admin catalogue/content updates and order decisions supply a nonnegative expected revision. Money is integer INR paise. Timestamps UTC; non-past date-only validation uses Asia/Kolkata. Unknown fields fail. Mutations are never automatically retried.

## Authentication

| Endpoint | Validation/response | Side effects, errors and retry |
|---|---|---|
| `POST /api/auth/register` | `{name,email,password}`; normalized email; password >=12 Unicode code points and <=72 UTF-8 bytes | Customer-only create, bcrypt cost12; 201 `{data:{token,expiresAt,user}}`. No role/hash/owner assignment. Existing or legacy email is not overwritten/claimed. After uncertain response, try login rather than auto-register again |
| `POST /api/auth/login` | `{email,password}`; 200 `{data:{token,expiresAt,user}}` | Generic bad-credentials denial for missing/wrong/disabled account, dummy bcrypt comparison. No trusted role claim |
| `POST /api/auth/logout` | Auth; empty object | Increment authVersion to revoke issued tokens across sessions. Client clears local session even on network error, but that alone does not prove server-wide revocation |

```json
{"name":"Example Customer","email":"customer@example.com","password":"a-unique-private-passphrase"}
```

The sample password is not seeded or a default. JWT: HS256 only; issuer khwab-stitch-api; audience khwab-stitch-web; MongoDB subject/version; 30-minute expiry. Backend-only JWT_SECRET is canonical base64url for at least 48 random bytes. Protected requests verify signature/claims and current user/disabled/authVersion/role. No refresh token or auth cookie exists. Only token/expiry is persisted in tab sessionStorage; restoration verifies `/me`. Actual session401 clears only the request's token; wrong-current-password/Google credential rejection does not clear an otherwise valid session. Disabled-account403 clears locally; ordinary forbidden403 and network/5xx do not. Profile retry remains on the intended protected route.

Optional email verification/recovery requires configured delivery and real inbox checks; without it capability flags hide unavailable actions. Trusted operator reset/admin provisioning remains separate. Register limit 10/hour/IP and login30/15minutes/IP use shared MongoDB counters in production; bounded concurrent password hashing is per instance. Passwords above 72 UTF-8 bytes fail instead of truncating. `GET /api/auth/capabilities` reports enabled password/Google/recovery/verification capabilities; `POST /api/auth/password`, `/recovery`, `/reset`, `/verification`, `/verify` and Google exchange/linking retain their strict authenticated/one-use contracts in [enhancement API](enhancement-api.md).

## Public reads

| Endpoint | Query/visibility | Result/failure |
|---|---|---|
| `GET /health/live` | No auth | Independent process liveness; no database/provider probe |
| `GET /health/ready` | No auth | Await one native MongoDB ping using `timeoutMS:2000`; uncached 200 ready or 503 unavailable |
| `GET /api/designs` | page,limit,search,garment,category,sort (`recent`,`price_asc`,`price_desc`,`title`) | Published safe designs; invalid query400 |
| `GET /api/designs/:slug` | Published slug | Safe design; drafts/archived/missing404 |
| `GET /api/categories` | page,limit | Active categories |
| `GET /api/options` | page,limit,garment,kind | Active design options |
| `GET /api/measurement-guides` | page,limit,garment,method(body/garment),language(en/hi/und) | Matching published guides plus neutral-language fallback; no wrong-garment substitution |
| `GET /api/settings` | Public content | Business contact/FAQ/banner, no secrets |

Readiness returns `{data:{status:"ready"}}` or `{data:{status:"unavailable"}}` with `Cache-Control:no-store`. The probe reuses the existing native connection; absent database, ping failure or driver timeout reports unavailable without provider-error details. It does not create a new application-managed pool/reconnect or retry a business mutation. This checks database access, not complete provider or order readiness. Mongoose's stale-heartbeat state after serverless suspension can produce a false disconnected indication while queries work; the corrected probe does not establish the cause of a browser `NETWORK_ERROR`.

Design response: `_id,title,code,slug,garment,description,category,startingPricePaise,currency,images:[{id,url}],coverImageUrl`. UI must display “Stitching starting from” and “Fabric provided by customer.” These are services, not ready-made inventory.

## Profile and request submission

| Endpoint | Ownership/input | Side effects/failure |
|---|---|---|
| `GET /api/me` | Current JWT user | Safe profile/current role, never hash |
| `PATCH /api/me` | Optional name and normalized Indian phone only | Enabled current account; no email/role/owner/hash assignment. Phone unverified |
| `POST /api/me/deletion-request` | Same account, empty body | Durable idempotent request202; not immediate erasure |
| `POST /api/orders` | Current account; request body below; Idempotency-Key required | New201 request_received. Identical replay200 original receipt; changed payload with key409. Validate design/private media ownership transactionally |

Idempotency-Key:16..128 ASCII letters/digits/underscore/hyphen, stable for one intended submission. Unique owner/key plus canonical payload hash prevents concurrent duplicates. Reuse only the identical payload after uncertain submission.

```json
{
  "garment":"kurti","quantity":1,
  "preferences":{"neck":"Round","sleeve":"Three-quarter","back":"Simple","fit":"Comfort","length":"Knee length","extraWork":""},
  "measurements":{"unit":"in","method":"assistance","values":{},"notes":"Please help check fit."},
  "referenceMediaIds":[],
  "customer":{"name":"Example Customer","phone":"9876543210"},
  "address":{"line1":"Example address","line2":"","city":"Example City","state":"Example State","pin":"110001"},
  "notes":"Illustrative request only.","fabricAcknowledged":true
}
```

Optional designId must match a compatible published garment. Optional preferredDate must be non-past. Garment kurti/suit/blouse/alteration; quantity1..10; max5 distinct owned verified private references. No client price/status/owner/provider URL. Complete address/PIN and fabric acknowledgement required. Request receipt never confirms price or delivery.

Modern requests additionally supply the allowlisted `configuration` (`source`, exact/custom `mode`, `components`, `addonIds`, optional `addonsChanged`, `notes`), applicable measurements, separate inbound/outbound logistics, policy acknowledgement and optional draft/estimate versions. Component entries carry their original/option/reference/help source and allowed IDs/notes. Browser-only `changedParts` is not an API configuration field. The legacy-compatible example above is not a replacement for current workflow fields. The server re-resolves authoritative estimates; no client amount/status/role is trusted.

Measurements retain explicit in/cm unit, body/garment/legacy-assistance method, independent self/tailor/assistance actor, values, notes and optional used guide IDs. Applicable garment/component fields and reconfirmation are validated; sleeveless suppresses sleeve requirements and assistance can defer numbers. Exact dimensions are never inferred from style cards or illustrated guide sizes. Used guides must match publication/garment/method; new orders snapshot their instructions and original image references. All sleeve-length adjustments are zero; legacy combined prices cannot add a hidden length fee.

## Customer order decisions

| Endpoint | Ownership/body | Side effects/conflicts |
|---|---|---|
| `GET /api/orders` | Own; page,limit,status optional | Private owner list |
| `GET /api/orders/:id` | Owner/current admin | Snapshots, quotes/history; others404 |
| `POST /api/orders/:id/quote-response` | Owner; `{revision,quoteVersion,decision}` accept/reject | Current quote_sent only. Accept stored quote→customer_accepted; reject→under_review. Stale/version/state409, reload before retry |
| `POST /api/orders/:id/cancel` | Owner; `{revision}` | request_received/under_review/quote_sent only; actor/time/history. Later cancellation via operator |

## Media

| Endpoint | Access/input | Behavior/failure |
|---|---|---|
| `POST /api/media` | Auth before multipart, file+purpose reference/measurement/catalogue/banner; public purposes admin-only | Source picker up to 5 MiB/24 MP; client prepares to3 MiB. Serverless file cap3 MiB, standalone5 MiB. Backend fully decodes actual single JPEG/PNG/WebP, resizes inside 2400x2400/re-encodes WebP/stripsEXIF, forces privacy and verifies provider metadata |
| `GET /api/media` | Owner/admin;page,limit,purpose | Safe metadata, no private provider path/key |
| `GET /api/media/:id/access` | Owner/admin | `{data:{url,expiresAt}}`,5min signed link,no-store; unauthorized/missing404 |
| `DELETE /api/media/:id` | Owner/admin, unreferenced only | Provider delete+metadata/audit; in-use409, UI confirmation. Stale reservation retryable after60seconds |

Private uploads require verified IMAGEKIT_PRIVATE_POLICY_VERIFIED policy. Attach only API-returned media IDs, never URLs/provider IDs. Catalogue links signed1hour. Daily user quotas20customer/100admin; max2 concurrent uploads. Attempts can consume quota even when provider later fails. Partial failures require reconciliation rather than guaranteed-success claims.

Unprepared serverless files above3 MiB return413/`IMAGE_PAYLOAD_TOO_LARGE`. The shared browser helper never upscales or mutates originals and releases bitmap/canvas/object-URL resources. It sends no request if preparation fails. Server decoding/privacy remains authoritative; a direct-upload signature flow is not introduced. See [media](imagekit.md).

## Admin catalogue/content

All routes below require current database role admin and JWT. No client role/price/owner authority.

| Endpoint | Input | Side effects/errors |
|---|---|---|
| `GET /api/admin/dashboard` | Read only | Counts/recent requests |
| `GET /api/admin/designs` / `GET /api/admin/designs/:id` | list page,limit,status,garment,search or valid ID | Draft/archived management detail/revision |
| `POST /api/admin/designs` | Allowed design fields | Create/audit; invalid references400, duplicate code/slug409 |
| `PATCH /api/admin/designs/:id` | Full allowed fields+revision | Atomic edit/audit, stale409 |
| `DELETE /api/admin/designs/:id` | `{revision}` | Unused drafts only; used designs archived; conflict409 |
| `GET /api/admin/categories` / `GET /api/admin/options` | page,limit | Management lists |
| `POST /api/admin/categories` / `POST /api/admin/options` | Category{name,slug,active}; option{name,kind,garments,active} | Validated create/audit |
| `PATCH /api/admin/categories/:id` / `PATCH /api/admin/options/:id` | Full fields+revision | Atomic edit/audit |
| `DELETE /api/admin/categories/:id` / `DELETE /api/admin/options/:id` | `{revision}` | Referenced categories409; option deletion archives and preserves history |
| `DELETE /api/admin/options/:id/permanent` | `{revision}` | Only unused/unreferenced options; target fences protect concurrent reference writes; release media pins |
| `POST /api/admin/options/import` | `{items:[{importKey,option}]}` | Deterministic repeat/digest conflict; no automatic publication |
| `GET/POST /api/admin/measurement-guides` | Bounded list or strict guide input | Admin-only create/manage public guide images, provenance, applicability and publication |
| `PATCH/DELETE /api/admin/measurement-guides/:id` | Full fields+revision, or revision/permanent | Revisioned edit; archive by default, unused/reference-checked hard delete |
| `GET /api/admin/customers` | page,limit,search(name/email) | Private lookup/deletion requests |
| `GET /api/admin/settings` / `PATCH /api/admin/settings` | Full allowed settings+revision for edit | Singleton; safe contact/URL/banner, atomic update/audit |
| `GET /api/admin/audit` | page,limit,exact action/resourceType optional | Safe actor/action/resource metadata; no passwords/tokens/private bodies |

Design: title,code,slug,garment,description,category/null,startingPricePaise,mediaIds(max8 distinct public catalogue assets),coverMediaId/null(in mediaIds),status draft/published/archived. Image array controls order. Settings: businessName,tagline,whatsapp,instagram,contactEmail,announcement,about,faqs[{question,answer}],optional public bannerMediaId. Historical orders retain snapshots.

## Admin quotes/status

| Endpoint | Input | Guarded behavior |
|---|---|---|
| `GET /api/admin/orders` / `GET /api/admin/orders/:id` | list page,limit,status,search(orderNumber) or ID | Private operational data |
| `POST /api/admin/orders/:id/quotes` | `{revision,amountPaise,deliveryDate,notes,notesHi?,lineItems?}` | Under-review/quote-sent only; valid totals/scopes/quantities, non-past date; append next version/history/audit. Benefits need itemized stitching rows; no sleeve-length fee |
| `PATCH /api/admin/orders/:id/status` | `{revision,status,note}` | Allowed transition only, atomic revision/history/audit; cannot skip acceptance |

Progression: request_received→under_review→quote_sent→customer_accepted→fabric_received→stitching→ready→dispatched→delivered. Quote decisions own transitions; cancellation/rejection follows LLD. General API1000requests/15min/IP, order20/hour/IP, upload100/hour/IP and auth/security/support limits use MongoDB-backed production request buckets. TTL removes old bucket records; limits do not depend on one warm function's memory. Password/image concurrency gates remain per instance; user quotas are durable. ImageKit timeout15seconds, with no automatic mutation retry. Correct proxy/IP configuration is required.

## Optional offers, referrals and stitching credits

All programme flags default disabled. No business amounts/eligibility terms are invented. Public reads never expose wallet ownership/balances. Money remains integer paise; percentage fields use basis points. The detailed contract is [commerce](commerce.md).

| Endpoint | Access/body | Behavior |
|---|---|---|
| `GET /api/commerce/capabilities` | Public | Enabled flags/terms/redemption rules; no secret or wallet data |
| `GET /api/commerce/offers` | Public; page,limit,garment optional | Eligible published/time-valid offers only when enabled |
| `GET /api/commerce/account` / `/ledger` | Current owner; ledger paged | Own available balance, programme/referral state and safe ledger history |
| `POST /api/commerce/referral-code` | Owner; empty body | Enabled programme only; own generated code |
| `POST /api/commerce/referrals` | Owner; `{code}` | Before first active request; no self-referral; identical claim replay, changed existing claim conflicts |
| `GET /api/commerce/quote-benefits/:orderId` | Owner | Revalidates current quote selection and eligibility |
| `POST /api/commerce/quote-benefits` | Owner; `{orderId,revision,quoteVersion,offerCode,creditPaise}` | Save pending selection/preview, no debit or guaranteed hold |
| `GET/PATCH /api/admin/commerce/settings` | Admin; full settings+revision on PATCH | Programme flags, terms, redemption limits and reward/milestone rules |
| `GET/POST /api/admin/commerce/offers` | Admin; paged list or strict offer input | Create published/draft offer with date/garment/minimum/cap/use rules |
| `PATCH/DELETE /api/admin/commerce/offers/:id` | Admin; full fields+revision or revision | Revisioned update; DELETE archives |
| `POST /api/admin/commerce/credits` | Admin; `{owner,clientId,deltaPaise,reason}` | Audited conditional balance adjustment; stable UUID replay, conflicting details409 |

Only line-itemized final quote stitching (`scope:"garment"`) is eligible; transport is excluded. Current-quote acceptance atomically revalidates rules/balance/use limits, commits credit/offer events and snapshots gross/discount/credits/net in `acceptedQuote`. Stale terms or balance require review instead of silent repricing. Cancellation/rejection reverses committed credits and offer capacity once. Configured referral/milestone rewards require an actual qualifying delivered transition and unique events; claiming a code alone issues nothing. Positive credit balance blocks account erasure until settled. No cash gateway/refund or payroll is implied.
## Optional Hindi content

Admin design writes accept `titleHi` (120) and `descriptionHi` (4000); category/option writes accept `nameHi` (80). Public catalogue/category/option responses include these optional fields, and design search matches both titles. Settings accept `taglineHi` (180), `announcementHi` (300), `aboutHi` (3000), and per-FAQ `questionHi` (200) / `answerHi` (2000). Quote writes accept `notesHi` (2000); progress updates accept `noteHi` (1000). Lengths are character limits; values are optional trimmed strings, including empty strings to clear a translation. Existing English fields and revision checks remain required.

New requests preserve `designSnapshot.titleHi` and `preferenceLabelsHi` from matching active catalogue options. Clients submit original option names and canonical enums, never translated labels. Request hashing/idempotency and owner/admin authorization are unchanged. Server errors remain canonical; the UI translates their messages and field details. See [languages.md](languages.md).

## Detailed design boards

Design writes optionally accept `designDetails` (neck, sleeve, back, style, fabric, fabricRequirement, turnaround and matching `Hi` fields; each up to 300 characters), `serviceNotes` / `serviceNotesHi` (1500), up to six `priceOptions` (`label`, `labelHi`, integer `amountPaise`, `isStartingPrice`), and up to sixteen `imageViews` (`mediaId`, English/Hindi labels, optional percentage `crop`). Each view must reference an attached catalogue image. Crop rectangles must stay inside the original image, with width/height between 5 and 100 percent. The starting price must equal the lowest tier.

Public design responses retain existing fields and add specifications, rates, service notes, resolved `views`, a cropped `coverView`, and image dimensions. `POST /api/media/presets/teal-kurti` is admin-only, accepts an empty body and attaches/reuses only the known included public board. It accepts no client URL or path. Media access resolves that known asset without ImageKit. Other uploads remain on the existing ImageKit route; media reference/deletion checks remain enforced. See [design-board-upload.md](design-board-upload.md).
