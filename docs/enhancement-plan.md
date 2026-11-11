# Khwab Stitch enhancement plan

The 2026-11-10 extension for separate sleeve design/length, independent necks and finishing details is tracked in [separate-customization-plan.md](separate-customization-plan.md), with [verification evidence](separate-customization-test-report.md).

Date: 2026-11-08. Scope: all three supplied specifications, sections 1–41.

## Baseline and compatibility

The supplied application is a JavaScript React/Vite + Express modular monolith, MongoDB/Mongoose, ImageKit, and local bcrypt/JWT authentication. Existing customer IDs, catalogue URLs, orders, quotes, bilingual content, brand assets and Render deployment remain authoritative. Historical Firebase requirements conflict with the implemented authentication migration: do not replace current accounts or silently link identities by email. Google sign-in and provider-managed recovery need a configured identity/email integration and verified linking.

Existing foundations: owner-scoped order history, genuine admin timelines, versioned quotes/current acceptance, idempotent transactional submission, optimistic revisions, private media validation, admin catalogue/settings/FAQ/audit tools, and English/Hindi presentation. The previous readiness report describes an earlier test run; rerun checks for this change.

Gaps: transient login-gated request form; dropdown-only components; no explicit included-component mapping, authoritative estimate, separate transport arrangements, durable drafts, saved measurement profiles, contextual assistance, moderated reviews, messaging/tickets, worker applications/assignments, or account overview. Measurement method/unit changes currently erase values.

## Implementation sequence

1. Extend HLD/LLD and document backward-compatible schemas and API boundaries.
2. Add admin visual option and catalogue-default configuration, server pricing and logistics configuration. Never guess legacy bundle component costs.
3. Replace the request UI with catalogue exact/custom and per-component reference branches, conditional measurements, explicit editable review, and trusted price breakdown.
4. Add opaque guest drafts with device retention, owner-scoped cloud drafts with revisions, validated login continuation and stable submission keys.
5. Add account navigation, saved measurements/addresses, genuine tracking, support conversations/tickets and consent-based master-tailor assistance.
6. Add order-linked moderated reviews, applications, restricted worker assignments, configuration and audit events.
7. Apply accessible responsive styling using existing branding; preserve old routes.
8. Run focused domain/API/UI tests, regression suite, lint and production builds. Update API/admin/customer/migration/deployment guides and evidence-based feature matrix.

## Safeguards

All prices use integer paise and trusted server records. Unconfigured replacement/custom/transport costs remain pending. Included catalogue parts incur no extra charge. Existing accepted quotes and submitted snapshots remain immutable. Protect every private read/write with ownership, participation or explicit assignment. Approval never grants an admin role. No automatic operational progress, fabricated testimonials, public customer images, fake courier bookings, unsupported login buttons or unverified delivery promises.

## Migration and rollout

Use additive optional fields and new indexed collections. Legacy orders retain their existing validation/display behavior. Existing components without a photo remain selectable with a labelled fallback; pricing defaults to pending review. Legacy catalogue items without explicit defaults retain descriptive details and a review flag. Apply indexes with the existing operator command only after backup. Do not run migrations against live data in this task. Roll back by deploying the prior app; retain new fields/collections, do not drop customer data or indexes required by active writers. External-provider and business-policy gaps must remain explicit in the final feature matrix.

## Follow-up completed — 2026-11-09

1. Replace the request wizard's first-50 catalogue/options fetches with garment-filtered batches of 12. Preserve selected records, original defaults, measurements and local searches while loading additional batches; cancel stale filter requests and retry failed pages.
2. Add independent pagination to saved drafts, reviews/completed-order choices, notifications, applications, worker jobs/assistance and the new admin review/service/application/worker/assignment screens. Keep unsent forms and selected assignment choices when navigating pages.
3. Translate the visual option gallery, its preview/search/accessibility/price labels and missing wizard heading/save/progress labels into Hindi.
4. Verify frontend regressions, lint, production build and a deterministic real-Chrome pagination journey without MongoDB. Document remaining legacy reference-picker and external-provider limits separately.
