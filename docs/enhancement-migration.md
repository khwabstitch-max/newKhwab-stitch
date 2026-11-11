# Compatible schema rollout and rollback

This release extends the existing MongoDB/Express/React project. It does not seed/reset live data, replace credentials, reassign account IDs or migrate hosting. Existing order and catalogue URLs remain valid. No live database migration or provider operation was performed as part of the code changes.

## Schema changes

Existing collections receive optional fields:

| Collection | Added data / backward-compatible interpretation |
|---|---|
| DesignOption | Description/public image, price mode and amounts, measurement fields, sleeve style. Absent pricing metadata means pending, not free |
| Design | Default component ID mapping. Absent mapping preserves catalogue identity and requests admin confirmation |
| Order | Explicit configuration, logistics, trusted estimate/version snapshot, policyVersion, draftId and fulfilment/history. Legacy requests keep existing preferences/measurements/quotes |
| SiteSettings | Service areas/rates, base prices, assurance policies/version, support calendar, welcome copy, feature choices and Facebook URL. Missing values do not activate fictional capabilities |
| User | Optional private emailReservation on new local/Google accounts, with partial uniqueness; legacy users are not rewritten |

New collections are defined by the existing `createModels` entry point plus `createExtensionSchemas`: Draft, PasswordAction, AccountIdentity, AccountPreferences, MeasurementProfile, Conversation, Message, SupportTicket, WorkerApplication, WorkerProfile, WorkAssignment, Review, Notification and ServiceDefinition. These are related modules in the same application/database, not separate authentication/order systems.

Indexes include unique owner/clientId draft/application/ticket keys; unique conversation/sender/clientId message retries; one review per order; unique identity/preferences/profile ownership where applicable; worker/active assignment lookup and assignment idempotency; and owner/date/status list indexes. PasswordAction expiry has a TTL index; expired action validity is also checked at use, without relying on TTL deletion timing. Authenticated drafts have **no automatic TTL** because private-media references require orderly release.

## Rollout checklist

Optional Google support also requires the unique partial User.emailReservation and AccountIdentity.googleSubject indexes. The startup assertion checks these before enabling GOOGLE_CLIENT_ID. No legacy email/UID backfill or ownership reassignment is performed. SupportProposal records extend the same support/draft relationships; their draft/proposal revisions preserve explicit customer acceptance rather than changing submitted orders.

1. Record source SHA, deployed settings and a tested database/media backup. Verify restore access and a suitable Atlas replica set for transactions. Use a separate disposable test database for verification.
2. Run client/server checks and the disposable-Mongo integration tests. Windows native Mongo needs a compatible Visual C++ runtime; a developer's temporary process PATH workaround is not a production configuration.
3. Inspect duplicate keys/index definitions before applying `npm --prefix server run db:indexes` to the intended environment. This command creates the new indexes through the existing checked operator path. The previously documented legacy authentication-index migration still refuses unexpected definitions/conflicts; do not remove unrelated indexes or user documents manually.
4. Deploy compatible API and frontend together. Existing functionality remains available while old options lack photos or prices. Populate option descriptions/images/prices and map real catalogue defaults through authorized admin APIs; there is no guessed bulk backfill.
5. Configure real policies, service areas/rates, support calendar and any enabled service template. Keep untested future adapters unavailable. Existing builtin stitching/alteration behavior is available without inserting duplicate defaults.
6. Configure optional email delivery privately only when ready. Verify production origins, deep-link rewrite, recovery/verification, current-password change, old-session revocation, ownership, a sample private upload and signed-link expiry. Do not enable the ImageKit private-policy flag before actual provider privacy tests.
7. Verify an old catalogue item, an old order, a new exact-copy request, mixed reference request, draft/login recovery, same-key retry, new quote acceptance, admin fulfilment and role boundaries. Record actual evidence in readiness notes.

## Retention and erasure

Current production startup also checks all mandatory enhancement retry/uniqueness/action-token TTL indexes, independently of optional Google enablement. It never creates or changes live indexes. Complete the reviewed index command before switching application versions. Draft empty objects are explicitly preserved; older minimized drafts are handled by the browser restoration defaults.

Browser-local ordinary design choices expire after 30 days. Sensitive form data (measurements, addresses, customer details, notes, protected reference IDs) is isolated in the current tab's session storage and may be unavailable after that session ends; restore flags explain the missing private state. Persistent local storage contains only the draft helper's explicit ordinary-choice whitelist. Browser writes expose quota/unavailable errors and compare local revisions.

Authenticated drafts are retained until user deletion/submission cleanup/account erasure; no scheduled age-based purge is implemented. Submitted draft records may remain as history until deletion. Protected reference counts are transferred/released transactionally at submission/deletion. A business-approved age-based retention job remains required if the business adopts time-based draft/message/application retention.

Account deletion continues through the existing trusted operator workflow after a customer request and no active orders. It now scrubs configuration/logistics/fulfilment/private estimate component context, deletes drafts and extension-owned private records, releases their media references, revokes credentials/sessions and performs retryable provider cleanup. Staff audit/financial retention still needs an approved policy. Provider failure leaves a disabled retryable account rather than claiming completion.

## Separate customization extension — 2026-11-10

The new sleeve-length option kind and compatibility, publication, ordering, materials and included-addition fields are additive. They need no destructive data conversion or new index migration. Existing required application indexes and backup requirements still apply. Existing records without publication metadata remain available according to their active state; existing accepted snapshots are unchanged.

Use administration to create/publish the six actual length preferences, configure explicit supported sleeve combinations and any combined adjustment, attach approved front/back images, and map catalogue defaults/included additions. Unconfigured combinations remain pending review; do not bulk assume every sleeve supports every length. No live catalogue records or prices were invented or seeded in this task.

Raw browser/cloud drafts retain parked selections and private measurement/reference data under the existing storage boundaries. Legacy selected additions migrate into the separate extras step on recovery. New submitted snapshots contain effective choices and material scope; workers do not receive a parked contradictory sleeve instruction. Numeric widths use the existing measurement units and privacy rules.

An older release cannot validate `sleeveLength`, `help` or `addonsChanged`. If rolling back, pause new customization entry points and retain the newer draft data for recovery; do not discard these fields or rewrite completed orders to make an old form accept them.

## Rollback procedure

Roll back source and configuration first using the recorded compatible deployment. Leave additive fields/new collections intact; never drop them as an automatic rollback. Older code cannot manage the new drafts/support/worker capability, so pause those entry points while using an older application. Existing accepted quote/order snapshots and owner IDs must be retained. Do not run seed or restore a stale whole database over new customer work.

If rollback must remove the release's data, obtain an approved targeted backup/export and a written mapping of records/media references first. Release references before deleting owned drafts/messages/applications. Restore database and provider assets as a consistent set; source rollback alone cannot reverse sent emails, customer acceptance, worker disclosure, or deleted media. A restore rehearsal is an outstanding deployment prerequisite, not a claim established by unit tests.
