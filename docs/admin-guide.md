# Administrator guide

Updated 2026-11-10. Use an existing authorized administrator account; registration/worker approval/browser roles do not grant admin access. GitHub + Vercel is the owner's current target. Previous Render rollout instructions are superseded; the standalone entry remains compatible. Use [Vercel deployment](deployment-vercel.md). This guide describes repository behavior; earlier import/provider results are historical, and no environment files/live external configuration were inspected in this review. Current exact checks are in [verification](review-verification.md), with blockers in [project status](project-status.md) and [readiness](production-readiness.md).

## Review the supplied visual import

The source inventory accounts for **62 files**, identifies duplicates and preserves the originals. Seven contact sheets and staged hash-addressed assets are in [artifacts/visual-import](../artifacts/visual-import/). Inspect [inventory.json](../artifacts/visual-import/inventory.json) and [manifest.json](../artifacts/visual-import/manifest.json) alongside the contact sheets before publishing anything.

The historical configured import run recorded **31 design-option drafts, 3 measurement-guide drafts and 47 public assets**, with zero additional uploads on repeat. These figures are prior-run records, not a fresh remote count, current publication status or provider check. Inspect the actual admin catalogue before any action. The preparation manifest intentionally retains staging flags; it is not a new execution receipt.

Imported options are inactive drafts because garment applicability, actual charges and compatibility require business confirmation. Supporting outfit photographs are not automatically converted into additional invented component designs. The clipped ruffle-front image is quarantined and must not be published as a complete design. Body-measurement guides were not supplied. Guide conventions and ambiguous labels require review.

Stable import keys, hashes, source filenames and whole-image crop coordinates preserve provenance. The supplied individual images do not include parent-board crop coordinates; none are fabricated. Multiple views are grouped where they represent one design. Use the staged assets/contact sheets for comparison, without enlarging a low-resolution image into a claim of additional detail.

The operator scripts `visual:prepare` and `visual:import` under `server/` prepare/preview before execution. `visual:import -- --execute --owner <existing-admin-email>` uploads public catalogue assets and creates drafts; it never provisions roles or publishes. Review the target environment and back up before any execution. Repeat imports reuse stable records/assets, reject conflicting keys or unrelated reused codes, and preserve admin edits instead of overwriting them. Do not reset the database or delete source files to rerun an import.

## Catalogue designs and images

Use **Admin → Designs** to create/edit a catalogue entry, its code/slug, garment/category, descriptions, images, starting price/rate rows and status. Use only approved public catalogue imagery. Add useful English/Hindi text where available. Reorder attached views, choose the intended cover, and preview crops against the original. A crop must preserve the intended garment detail; it must not imply a view that was not supplied.

Map the design's actual original sleeve length, sleeve design, front neck, back neck, fit and included extras to compatible published options. Missing legacy defaults stay pending confirmation; do not invent them. Included components/additions are not charged again. Archive referenced records to preserve order history. Permanent deletion is restricted to eligible unused records and must pass backend reference checks.

Public catalogue media, customer reference/measurement photos, support attachments and worker portfolios have separate purposes. Upload public images with the catalogue purpose. Never repurpose a customer's private photograph as a public design without an independently authorized publication workflow. Removing a media reference is not permission to delete a shared asset that another record still uses.

All upload pickers use the shared image helper: sources up to 5 MiB/24 MP are inspected, and larger accepted sources are prepared within the3 MiB serverless payload budget without upscaling or changing originals. Preparation failures show a retryable choice error, not a saved attachment. Backend decoding, ownership, public-admin permission and private-policy verification remain authoritative. Do not bypass that proxy with a generic browser-upload signature. See [ImageKit/media](imagekit.md).

## Component cards and prices

Use **Admin → Options** for front neck (`neck`), back neck (`back`), sleeve design (`sleeve`), sleeve length (`sleeveLength`), fit and finishing extras (`extra`). Each record can carry a stable code, name, description, accessible alt text, ordered images, display order, garment applicability, status, measurement keys and compatibility rules. Preview available image views before publication. Change front/back rules independently; do not infer compatibility from a picture alone.

Configure one explicit price status for a paid component:

| Mode | Customer meaning |
|---|---|
| Included | No additional charge for this configured option |
| Additional | Configured non-negative stitching adjustment per garment |
| Replacement | Explicit configured replacement adjustment per garment; no original component value is guessed/subtracted |
| Pending | Price after review; missing pricing is not free |

API amounts are integer INR paise: ₹120 is `12000`. A known zero additional/replacement adjustment is explicitly free. Keep pending prices pending until confirmed; no production prices are inferred from imported photographs. Catalogue defaults and included extras suppress duplicate adjustments. Replacements remove the previous active adjustment, and deselected extras no longer contribute.

**All sleeve lengths add ₹0.** The length editor has no surcharge control; backend validation, public output and new estimates enforce zero. Sleeve design retains its separately configured amount, independent of length. Legacy combined-per-length pricing metadata is not a source of a hidden length fee in new calculations. Do not publish a different design price just to recreate a length surcharge.

Select compatible length preferences for each sleeve design. Unknown combinations remain review-needed; explicitly incompatible choices are blocked. Set any incompatible option IDs, additional measurement keys and material coverage accurately. For finishing extras, distinguish labor-only, specified supplied materials and review-needed coverage. Only supported stitching additions can be activated; future embroidery/painting/knitting metadata is not a working service.

Use draft/published/archived states and active status deliberately. Archive is the normal removal path for historical options. **Delete unused option permanently** calls a separate guarded endpoint; used options, catalogue defaults and references from orders/drafts/proposals block deletion. Public media reference counts are updated transactionally rather than deleting shared provider files blindly.

The controlled `db:free-lengths` script previews its migration unless `-- --execute` is supplied. It normalizes length records and invalidates cached estimates in editable drafts while preserving choices/measurements. It does not rewrite submitted orders, accepted quotes or standalone sleeve-design amounts. New runtime estimates already enforce the rule. Execution requires the reviewed environment, backup and rollback procedure in [deployment](deployment.md).

## Measurement guides

Use **Admin → Measurement guides** to create/edit a stable code, name, garment, measurement method (`body` or `garment`), language (`en`, `hi`, or language-neutral `und`), instructions, explained measurement keys, ordered public images, display order and publication status. Attach at least one public image before publishing. Preview available views and verify the guide against the selected garment and method.

The three imported blouse/kurti/suit guides explain garment illustrations only and remain drafts until approved. They must not be labelled body guides. Clarify “Sleeve Arm”, flat-width/circumference conventions and omitted fields before publication. Do not use the pictured numbers as customer values. Supply or commission a real missing guide rather than substituting a different garment's image.

Customers separately choose **who measures** (self, own tailor, help) and **what is measured** (body or garment). Both self and own-tailor flows receive the same garment/method/language match. If no suitable published guide exists, a clear fallback directs the customer to help. Guide IDs marked used are checked again at submission; mismatched, removed or unpublished guides require review. Archive used guides. Permanent deletion is allowed only when usage/reference checks pass.

## Orders, quotes and fulfilment

Review the submitted component sources, protected references, measurements, fabric, quantity, both transport legs and acknowledged policy version. The estimate is a known subtotal plus pending items, not a final commercial agreement. Check reference feasibility, material needs and unclear measurements with the customer before work.

Move the request into review and send a final quote with a confirmed amount/date. Optional quote breakdown rows contain labels, scope, quantity and **line-total** paise. Their sum must equal the final amount; garment row quantity matches the request and shipment/order rows have quantity one. Show front-neck, back-neck and sleeve-design adjustments separately where applicable. Do not add a sleeve-length fee in a manual quote.

Each revision of an unaccepted quote creates a new version. The customer must accept the current version and order revision. General status controls cannot skip that acceptance. Accepted quotes remain immutable; later commercial changes need an explicit separately approved process. Stale edits return a conflict and require reload/review rather than repeated overwrites.

When configured offers/credits are enabled, itemize actual stitching rows (`scope:"garment"`) separately from transport so eligibility can be calculated. A pending customer benefits preview does not debit a wallet. Current-quote acceptance commits eligible credit/offer events and snapshots gross/discount/credits/net; a changed rule/balance requires renewed review. Cancellation/rejection restores committed credits and offer capacity once. Only an actual recorded qualifying delivered transition issues configured referral/milestone rewards; never mark delivery merely to grant a benefit.

Record only actual production events: fabric received, stitching, ready, dispatched and delivered. Fulfilment stores separate inbound/outbound transport status, known HTTPS courier links, completion estimates, delay notes, outbound-address reconfirmation and alteration-margin exceptions. These facts do not book a carrier or alter the accepted price. Customer-requested changes, corrections and transport follow the business's approved policy.

## Support and master-tailor guidance

Use **Admin → Support** for assistance and complaints. Filters return the queue to page one; list paging is separate from the selected ticket. Reply in the private linked conversation and distinguish receipt, human response and resolution. The customer explicitly controls the offered context. Do not assume measurements or addresses were shared automatically. Assign only approved staff/workers with the required assistance permission.

Configured support hours determine a first-human-response target. This is not an instant callback or six-hour physical correction promise. Resolved/closed tickets require a resolution note and can be reopened where permitted. For a shared editable draft, propose component changes with a summary and price/measurement impacts; the customer must accept the current proposal. A stale draft, changed price or submitted order blocks silent updates.

## Applications, workers and reviews

Review applications privately, request information and retain internal assessment notes separately from the applicant conversation. Approval creates worker capability while preserving customer history. It does not grant admin access. Active status, assistance permission and a specific job/help assignment are separate controls.

Assign/reassign individual jobs with requirements and deadlines. Workers receive only their active assigned work and necessary details. Worker progress is a proposal for administrator confirmation; it does not advance the customer's order status. Revoking an assignment removes that access. Payout, commission, payroll and guaranteed-work features are not implemented.

Applications, workers, assignments, reviews, service definitions and guides have bounded list pages. Application/assignment forms and assessment/moderation text survive paging. Assignment order/worker choices load further batches as needed. Some legacy media reference pickers remain bounded to their first batch; consult the current status matrix rather than assuming all selectors are unbounded.

Publish reviews only for eligible delivered orders with public-display consent. Preserve the customer's original wording/rating. Moderate consistently for spam, abuse, private information, irrelevance or missing consent and record a reason when hiding/rejecting. Criticism alone is not a removal reason. Public testimonials are selected/moderated, not a fabricated complete review history or aggregate rating.

## Content, configuration and unavailable features

Website settings contain approved welcome/about/policy text, FAQs, validated social/contact links, announcements and a banner image. Clear unavailable channels rather than adding example links. Use only the public banner purpose for its image. Support hours, policy versions and PIN-based inbound/outbound transport rates require actual business confirmation. No matching rate means quote/serviceability review, not free transport.

**Offers, referrals, rewards and credit redemption are implemented but disabled by default.** Under the commerce admin area (`/admin/commerce`), publish clear programme terms, enable only intended features, configure supported garments/date/minimum/cap/use limits, credit redemption limits and actual referral/milestone amounts. Do not invent or pre-enable business rates. Offer deletion archives; revision conflicts require review. Customer selection is tied to the current itemized quote, not an automatic discount on every estimate.

Credit adjustments require the intended customer, a reason, a nonzero integer paise delta and a stable client ID. Reusing that ID with identical details is a retry; changed details conflict. Use the ledger/audit trail, never edit balances directly. Positive credit balance blocks account erasure until settled. Monitor cancellation restorations, offer-use capacity and delivery reward events with [commerce](commerce.md) and [operations](operations.md). These are stitching benefits, not a cash gateway/refund or payroll system. Unsupported future service adapters remain inactive.

Authentication remains the application's email/password and short-lived JWT model. Optional Google Identity Services and Resend email actions require owner configuration and real-provider checks. Firebase is not an active login dependency. Trusted admin provisioning remains an operator CLI task; do not promote someone from a supplied email or worker application. Keep credentials in server configuration and use only the actually configured contact/recovery methods.

For exact contracts use [LLD](lld.md), [API](enhancement-api.md) and [account/support API](account-support-api.md). For backups, media failures and access incidents use [operations](operations.md). Publication and configuration should follow the evidence and open blockers in [production readiness](production-readiness.md).
