# Account, support, reviews and worker extensions

Additive API contract, 2026-11-08. Existing JWT authentication and customer IDs remain authoritative. All paths below are prefixed `/api`. Successful responses use `{data}`; lists use the existing bounded `page`/`limit` pagination (maximum 50). Protected responses are private/no-store. Mutation errors preserve the submitted form client-side; the backend never returns a fake success.

## Account and saved measurements

`GET /account/overview` returns activeOrders, quotesAwaitingApproval, savedDrafts, openTickets, unreadNotifications, actionsNeeded, applications, five recentOrders and an active worker profile if approved. These are database counts/events, not fabricated progress.

`GET /account/preferences` returns revision, addresses and communication preferences. `PATCH` requires the current revision and the complete allowlisted values:

```json
{"revision":0,"addresses":[{"id":"a client-generated UUID","label":"Home","line1":"Address line","line2":"","city":"City","state":"State","pin":"110001"}],"communications":{"orderUpdates":true,"marketing":false}}
```

Address IDs must be UUIDs and unique within the customer's maximum ten saved addresses. Neither address nor measurement-profile updates modify a submitted order. Account IDs, roles, verification flags and credentials are not accepted here.

`GET /measurements?garment=kurti` lists only the current customer's profiles. `POST /measurements` accepts `{name,garments,unit,method,values,notes}`: garments are current supported garment keys, unit is `in|cm`, method is `body|garment`, and values contain at most forty finite positive dimensions. Unusual positive values can be saved for review; no standard fit is assumed. `PATCH /measurements/:id` adds the current revision. `DELETE` requires `{revision}`. Every access is owner-scoped. Selecting a saved profile at checkout must still require customer confirmation and produce an order snapshot.

`GET /notifications` optionally filters `unread=true`. `POST /notifications/:id/read {}` marks only an owned notification read. Notification records contain a kind and resource ID, without measurements, addresses or message excerpts.

## Private support and master-tailor assistance

`GET /support` lists owned tickets with optional kind/status filters. `POST /support` accepts:

```json
{"clientId":"UUID","kind":"assistance","category":"measurement","subject":"Measurement help","description":"Please explain how to measure the shoulder.","contextShared":true,"context":{"step":"measurements","garment":"kurti"},"preferredContact":"in_app","attachmentIds":[]}
```

Kinds: assistance, complaint. Categories: design, measurement, fabric, transport, pricing, stitching, other. Optional `orderId` must name an owned order. Optional `draftId` is an owned cloud draft ObjectId or a device UUID associated only within the authenticated owner's namespace. Context permits only step, component, designId and garment. It is discarded without explicit contextShared consent. Measurements, addresses, arbitrary reference links and tokens cannot enter this context object.

Up to five attachments must be existing private reference/measurement assets uploaded by the sender. They are pinned transactionally. A ticket receives a real unique ticket number and a persistent context conversation. The initial timeline entry is explicitly an automated receipt. Only `in_app` contact is implemented; no instant chat, booked callback or guaranteed physical correction is implied.

Retrying the same clientId and content returns the original ticket. Reusing it for changed content returns 409. `GET /support/:id` requires the owner, an admin, or an explicitly assigned active master tailor with assistance permission.

`PATCH /support/:id/status {revision,status,note}` is admin-controlled, except the customer can reopen their own resolved/closed ticket. States: open → acknowledged/under_review/awaiting_customer; review can lead to correction_proposed/in_progress/resolved; resolved can be closed or reopened. Closing/resolving needs a resolution note. Sending a message never resolves a ticket automatically.

The initial-response deadline is computed only when support hours are configured in site settings: `{timezone,responseHours,startHour,endHour,weekdays}`. Weekdays use Sunday=0 through Saturday=6. UTC timestamps retain a timezone-aware business-minute calculation, skipping closed days/hours. It is an initial human response target, separate from acknowledgement and resolution. Without approved support hours, no deadline is invented.

Admins use `GET /admin/support`, with status/kind/overdue filters, and `GET /admin/support/alerts` for unanswered tickets overdue or due in the next hour. Alerts expose ticket references/deadlines rather than private message text. `PATCH /admin/support/:id/assignment {revision,assignedTo}` accepts an active worker USER ID with explicit assistancePermission; null unassigns. Ordinary worker approval grants no assistance access. `GET /worker/assistance` lists only requests explicitly assigned to the active authorized master tailor.

## Context conversations

`GET /conversations` returns permitted contexts and unread message counts. `GET /conversations/:id/messages` lists bounded pages newest first. `POST` accepts `{clientId,text,attachmentIds}`. Text is plain text, 4,000 characters maximum. Empty messages require an attachment. Sender, timestamp and context are server-controlled. Each read and write rechecks current ownership, role, job assignment and worker permission. Unique conversation/sender/clientId plus content hashes prevent duplicate retry messages.

`POST /conversations/:id/read {}` records a per-user read timestamp. `GET /conversations/:id/attachments/:mediaId` checks both participation and actual attachment linkage before returning a five-minute signed URL. Application portfolios and ticket attachments use the same authorized conversation boundary. Never persist signed URLs in content or redirect parameters.

Messaging is persistent REST, not a claimed live connection. The UI may refresh messages explicitly. Reconnecting reads the stored history. Customer↔worker direct messaging remains unavailable; assignment conversations are worker↔admin and application conversations applicant↔admin. Staff guidance does not automatically alter design selections.

## Explicit design-change proposals

`GET /support/:ticketId/proposals` returns a bounded proposal list and top-level context metadata. Context is null unless the customer authorized sharing selected design details and the ticket is associated with an editable owned cloud draft. Permitted metadata is `{draftId,draftRevision,ticketRevision,garment,components,currentEstimate,estimateError}`; measurements, addresses and the rest of the private draft are never exposed to staff.

`POST /support/:ticketId/proposals` requires an admin or an active explicitly authorized assigned master tailor. Body: `{clientId,revision,draftRevision,summary,pricingImpact,measurementImpact,changes}`. Here revision is the ticket revision. Changes is a strict sleeve/neck/back/fit map using the existing component selection schema, not arbitrary draft JSON. The service stores before/after trusted estimates and the base draft revision, audits the proposal and notifies the customer. Creation does not change the draft. Retrying the same key returns the same proposal.

`POST /support/:ticketId/proposals/:proposalId/decision` accepts `{revision,draftRevision,decision:"accept"|"decline"}`, where revision is the proposal revision. Only the customer can decide. Acceptance requires the original cloud draft revision still to be current and the current trusted pricing configuration to match what was proposed. It applies only the explicit components, changes mode to custom, preserves all unaffected information and numeric values, marks applicable measurements for reconfirmation, updates estimateVersion, increments the draft revision and audits acceptance. Other pending proposals for that draft become superseded. Repeated identical decisions are idempotent. A stale draft, changed price/option or already submitted draft blocks acceptance and requires a fresh review. This action neither accepts a final quote nor submits an order. Submitted-order changes remain a private conversation and explicitly reviewed quote process.

## Worker applications and assignments

`GET/POST /applications` and `GET /applications/:id` operate on owned applications. Create fields: clientId, name, phone, city, skills[], garments[], experience, availability, capacity, equipment, introduction, portfolioMediaIds[], termsVersion, and optional draft/submitted status. No identity documents, commissions, compensation terms or admin role are created. Portfolio images remain private reference uploads.

`PATCH /applications/:id` updates only an owned draft or information-requested application and requires revision. `POST /applications/:id/withdraw {revision}` withdraws an eligible application. `GET /admin/applications` includes internal assessment notes; customer responses never expose internalNotes. `PATCH /admin/applications/:id {revision,status,reason,internalNotes}` enforces review before approval/rejection and requires reasons for information requests/rejections. Approval creates an additive WorkerProfile and resets support access to false; the user's customer role and order history remain intact.

`GET /admin/workers` lists approved profiles. `PATCH /admin/workers/:id {revision,active,assistancePermission}` controls suspension and explicit support authorization. These values are not customer-editable.

`GET/POST /admin/assignments` manages jobs. Create fields: orderId, worker USER ID, requirements, optional ISO deadline. Assigning serializes on the order revision, deactivates previous assignments and records reassignment history without changing operational status. `PATCH /admin/assignments/:id {revision,active,requirements,deadline?}` updates/unassigns. `GET /worker/profile`, `/worker/jobs`, `/worker/jobs/:id` require current active worker approval and job assignment. Job detail projects only design/measurements/requirements, excluding customer addresses/contact and business pricing. `GET /worker/jobs/:id/attachments/:mediaId` authorizes only that order's private reference images. Suspension/unassignment immediately removes API access, including conversations.

`POST /worker/jobs/:id/progress {revision,clientId,stage,note}` accepts cutting, stitching, quality_check, ready_for_review or blocked as a worker progress proposal. It never advances the customer's order timeline automatically. Authorized admins confirm real operational stages through the existing order API.

## Reviews

`GET /account/reviews` lists the customer's reviews. `POST {orderId,rating,text,consent}` requires an owned delivered order, integer rating 1–5, and customer wording. One review exists per order. A retry of identical content returns that record; a changed duplicate fails. Customers cannot set moderation state.

`GET /admin/reviews` lists moderation records. `PATCH /admin/reviews/:id {revision,status,reason}` supports pending/published/hidden/rejected and cannot edit rating/text. Publication requires public-display consent. Hiding/rejecting requires an internal reason; valid criteria are spam, abuse, personal information, irrelevant content and consent. Criticism alone is not a moderation reason. `GET /reviews` exposes only consented published rating/text/date and identifies them as selected moderated reviews, not a complete history. No synthetic reviews or aggregates are seeded.

## Service definitions

`GET /services` exposes active service definitions with a tested current adapter. Built-in customer-fabric stitching and alteration services preserve current behavior when no override exists. `GET /admin/services` includes stored definitions and builtinDefaults. `PATCH /admin/services/:code` requires revision, code/name/serviceType/active, audiences[], itemTypes[], componentKinds[], measurementFields[], workflowStages[], workerSkills[], materials and materialInstructions; basePricePaise is optional integer paise. Future embroidery/painting/knitting taxonomy and templates can be saved inactive. Activation requires additional tested ordering code: the API rejects a false operational claim.

## Retention, indexes and rollback

Application draft saves use the existing `POST /applications` with `status:"draft"`; incomplete fields are allowed only for that state. The owner can resume with `PATCH /applications/:id` and an expected revision. Submitting requires the complete validated application and terms acknowledgement; repeating the same successful submission returns the saved record. Drafts cannot be admin-approved, and the default admin queue shows submitted applications. The customer UI offers Save application draft, Resume application draft and Update requested information.

Explicit sign-out removes private browser-tab draft copies while retaining ordinary device-only design choices. Restoring those choices identifies missing private information. Cloud drafts remain owner-protected. Draft schemas preserve empty component/measurement containers, and old omitted containers are restored without discarding other values.

New collections are additive with owner/time indexes, unique retry/message/review constraints, worker assignment indexes and ticket deadline indexes. Password action tokens have hashed identifiers and TTL expiration; identity verification is separate from admin roles. Use the existing explicit index command after backup; do not reset existing collections.

The existing trusted deletion workflow calls cleanupExtensionAccount inside its transaction: release ticket/message/portfolio references, remove owned account/support/application/review/notification records, anonymize retained work history, and remove authorization links before provider cleanup. This preserves retryability and avoids private images remaining pinned forever. Retention of unresolved legal/business records requires an approved policy before production use. Rollback deploys prior code while retaining additive data; never drop records to roll back UI code.
