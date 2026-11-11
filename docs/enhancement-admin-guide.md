# Admin guide: custom requests and account operations

> **Historical document — superseded 2026-11-10.** Use [project status](project-status.md), [production readiness](production-readiness.md), the [current admin guide](admin-guide.md) and [customer workflow](customer-workflow.md) for the final implementation and evidence. **Every sleeve length adds zero:** earlier standalone length fees or combined per-length pricing instructions no longer apply. Submitted orders and accepted quotes remain preserved. Test counts, command results, provider limits and deployment/data statements below describe their dated runs, including earlier work on the same date; they are not current verification or launch approval.

Use the existing authorized admin account. These changes do not grant administrator access through registration, an application approval, or a browser-supplied role. Back up data and follow [enhancement-migration.md](enhancement-migration.md) before configuring a live deployment.

## Configure design options

1. In component/options management, create a sleeve, front neck (`neck`), back neck (`back`), fit, or optional extra. Set a useful name, description, applicable garment types and accessible image description.
2. Upload a **public catalogue** image using the existing media uploader and attach its media ID. Use only images approved for public display. Customer reference photos, support attachments and worker portfolios stay private. An option without a photo remains usable with a labelled fallback.
3. Set pricing deliberately. Included means no extra charge. Additional means the entered amount is a per-garment surcharge. Replacement means the explicitly configured replacement adjustment is added to the bundle; the system never estimates an original component cost to subtract. Pending means tailor review is needed. All API values are paise: ₹120 is 12000 paise. Negative replacement adjustments are not implemented; quote such reductions manually.
4. Configure sleeve style and only genuinely required extra measurement fields. Sleeveless options suppress sleeve length. Published option changes affect future estimates; existing order snapshots remain intact.
5. Archive an option instead of destroying a historical reference. The delete API now performs this archive action. An archived option cannot be chosen as a new customization; an original included in an existing published catalogue configuration can still be identified.

For each catalogue design, map its actual included sleeve, front neck, back neck and optional fit to the appropriate defaults. Do not guess missing defaults on older designs. Their request retains the design code and flags missing details for review. Preserve the supplied logo, current photos, existing design URLs and bilingual content.

## Configure content, policies and transport

Website settings support welcome title/tagline/description, FAQs, social links and policy copy. Only publish policy wording approved by the business. Clear an unused social channel instead of inserting an example URL. Instagram/Facebook require the validated HTTPS hosts; WhatsApp uses the configured business number. Do not put measurements, private photo URLs or addresses in social-link text or public query strings.

Transport service areas use PIN prefixes and separate inbound/outbound integer rates. For example, a configured prefix can cover a local area; a more specific matching prefix wins. Enter null when a manual quote is required. The price is per shipment leg, not multiplied by garment quantity. No matching enabled area means serviceability/quote pending, not free transport. Configure scheduling conditions in area notes. This application does not book a carrier.

Configure a policy `version` with assurance, alteration margin and correction-transport wording. The order acknowledges the current version. A suggested qualified margin statement is: “Where the fabric and design allow, we aim to leave approximately 1.5 inches of alteration margin on each side. We will confirm the available margin when reviewing your garment.” Confirm the construction meaning and applicability with the business before publishing an exact guarantee. Changes requested by a customer, fabric limitations, and correction transport need separate approved explanations; no lifetime/unlimited policy is implied.

Support settings contain actual start/end hours, weekdays, responseHours and Asia/Kolkata timezone. Leave these unconfigured if the operating calendar is unconfirmed; the app then has no invented deadline. A six-hour target is an initial **human response** target within configured hours, not a six-hour physical correction promise. Holiday exceptions and automated external alerts are not implemented.

## Review and quote a request

Review the customer's actual submitted design, protected reference images, per-part sources, measurements, fabric notes and both transport choices. Known subtotal is not a final quote. Reference work and unresolved pricing require human feasibility review before work begins. Do not promise exact reproduction from an unclear image.

Move the request into review using the real operational status controls. Send a final quote and date. Optional quote breakdown rows contain label, scope, quantity and **line-total** amount; all rows must add up to the final amount. Garment row quantity matches the request; shipment/order rows use one. The customer must accept the latest version. Editing an unaccepted quote creates a new version and invalidates the earlier response. Accepted quotes are protected; a later commercial change needs an explicit separately approved process rather than an overwrite.

Record actual inbound/outbound transport statuses, a public HTTPS courier link, estimated completion date only when known, delay explanation, outbound-address reconfirmation and actual alteration-margin confirmation/exceptions in fulfilment details. These updates preserve stitching stage and accepted pricing. Record only events that actually happened. A confirmed transport status is an operator statement, not proof of an integrated carrier booking.

## Support, applications and workers

Use the assistance/complaints queue and its linked conversation. Acknowledge receipt, respond privately, and keep resolution distinct from a reply. A resolved/closed request requires a resolution note; the customer can reopen it. The queue highlights approaching/overdue configured human-response targets. Assistance receives only the context the customer explicitly shared. Ask before requesting additional personal details. For an editable shared draft, propose specific component changes with a summary and price/measurement impacts. The customer must explicitly accept the current proposal; stale drafts/prices block acceptance, and affected measurements require reconfirmation. A submitted order cannot be silently changed through a draft proposal.

Review an applicant's skills, availability, samples and collaboration terms. Request further information through the private application conversation and record internal assessment notes. Approval creates limited worker capability while preserving customer history; it does not grant admin access. Set assistance permission separately and assign individual help requests explicitly. Suspend access when required.

Assign/reassign jobs through administration. Workers see only their active assigned work, necessary design/measurement details and protected job attachments. Worker progress is a proposal for admin confirmation; it does not advance the customer's operational timeline. No payout, commission, contract or guaranteed callback feature is implied.

Applications, approved workers, assignments, moderation reviews and services have independent page controls. Order and worker selectors load additional bounded batches without clearing entered assignment requirements. Paging preserves unsent assessment/moderation text and an open service editor. Changing a support filter returns its list to page one. Category/options and catalogue-default choices now load more bounded batches; some legacy media reference pickers still show a bounded first 50 records.

## Separate sleeve/neck/finishing administration

Manage sleeve design and sleeve length as separate option kinds. Create the six actual length-style records (Sleeveless, Short, Elbow length, Three-quarter, Full length, Custom length), with useful names/descriptions, publication status and display order. Length records may use approved imagery or the built-in preference illustration. They never prefill a numeric measurement.

For every sleeve design, explicitly select supported length styles. Preserve legacy sleeveStyle metadata when editing old records; the separate length preference takes precedence. Choose separate pricing or configure combined per-length total adjustments. A combined amount replaces both standalone sleeve adjustments. A missing rule remains pending; it is not interpreted as zero or universally compatible.

Configure front and back necks independently with clear front/back imagery, required numeric depth/width fields and excluded opposite-neck choices. The estimate rejects incompatible choices and does not rewrite either side. Configure garment applicability and measurement requirements for each published option.

For finishing extras, state labor-only, specified supplied materials or review-needed coverage. Publishing a supplied-material addition requires explicit material notes. No embroidery/painting/future craft can become an active add-on without an implemented service. Map original length/defaults and included additions on each catalogue design so included components are not charged again. Use draft/published/archived status deliberately; archive historical options without deleting their meaning from saved orders.

New raw drafts preserve parked choices, while the submitted worker-facing configuration contains effective instructions. Selecting Sleeveless therefore does not expose the saved old sleeve as a current job instruction. Verify configured images, combinations, prices and material statements against the atelier's actual services before publishing them.

## Moderate reviews fairly

Reviews require an actual delivered order and public-display consent. Publishing/unpublishing changes moderation status; it must not rewrite the customer's rating or text. Apply consistent rules for spam, abuse, exposed personal information, irrelevant content and missing consent. Record an internal reason when hiding/rejecting. Do not suppress a review solely because it is critical. Public reviews are described as selected/moderated testimonials; they are not a complete review history or a fabricated aggregate rating.

Service templates separate service type, audience, item types, components, measurements, stages, skills and material rules. Current ordering supports existing customer-fabric stitching/alteration adapters. Future embroidery/painting/knitting metadata can be drafted, but activation requires additional tested code; the server rejects unsupported activation.

Email recovery/verification needs the backend variables and owner/provider checks in [deployment-render.md](deployment-render.md). Optional Google sign-in needs GOOGLE_CLIENT_ID, registered origins and live-provider verification. Existing customers must sign in and prove their current password to link a same-email Google identity; no automatic email claim is allowed. Google-only passwords are managed by Google. Never promote an account merely because someone supplies an email address. See [enhancement-api.md](enhancement-api.md) for exact contracts and [readiness.md](readiness.md) for observed verification boundaries.
