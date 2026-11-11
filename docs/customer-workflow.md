# Customer workflow

Updated 2026-11-10. This guide describes current application behavior, not a live provider/configuration check. Published designs, guides, benefits and sign-in methods depend on approved configuration; historical import records do not establish the current remote catalogue. GitHub + Vercel is the current hosting target; previous Render deployment instructions are superseded for rollout. See [Vercel deployment](deployment-vercel.md), [verification](review-verification.md), [project status](project-status.md) and [readiness](production-readiness.md).

## Browse and choose a starting point

Open the homepage, browse the catalogue and open a design to inspect its images, details and starting price. Catalogue photographs describe stitching inspiration; customers provide their own fabric. A starting price or calculated estimate is not an accepted final quote.

The catalogue offers search and additional batches of designs. Component galleries have search and load-more controls; search applies to options already loaded. Loading, an unavailable service, an empty result and an actual missing photo have distinct states. Use **Refresh designs** to reload current options after an administrator's change. Live approved catalogue images/multiple views take priority over bundled illustration guidance, and static guide rates cannot turn a pending backend price into a known charge. Names, descriptions, codes and applicability identify choices. Image previews support available views, Escape and focus return; actual missing images have labelled fallbacks.

Choose one of these branches:

- **Same as shown** retains the catalogue's included components and skips unnecessary customization. Missing details on an older design remain for tailor review.
- **Customize this design** opens only the sections you choose to change: sleeve length, sleeve design, front neck, back neck and optional extras. Fit can also be configured. Keep or restore the original for an individual component without restarting the request.
- **Your own reference** uses a protected image uploaded after sign-in. For each relevant component, independently follow that reference, choose a Khwab Stitch option or request master-tailor guidance. Mixed catalogue/reference instructions are supported. Hidden details are not inferred from a photograph.

Selecting a reference/help source hides that component's option gallery and stops its option fetch; choosing our options again restores recoverable choices/notes. It does not clear other components. Complete an authenticated upload before relying on it: selecting a local file is not a saved upload. The picker accepts supported sources up to 5 MiB and may prepare a smaller version for upload without altering your original; unreadable/oversized files show an error. Private storage must be available and verified. See [media behavior](imagekit.md).

## Components and prices

Front neck, back neck and sleeve design are separate selections. Their configured adjustments appear separately in the estimate; replacing a selection replaces its applicable adjustment. Optional extras can be removed, including a previously chosen extra that is no longer available. Components already included in the catalogue design do not receive another charge.

Price labels distinguish **Included**, **No additional charge**, **Additional ₹X per garment** and **Price after review**. Missing pricing is not treated as free. A reference, unclear construction detail or unconfigured compatible combination needs review. Fabric suitability and supplied lining, lace or other materials must be confirmed; a photograph alone does not establish what the atelier supplies.

**Choose sleeve length — no additional charge.** All sleeve-length preferences add ₹0. A sleeve-design charge remains separate and cannot silently increase because of length. Length illustrations express a preference, not a numeric measurement. Enter your own exact sleeve length later in inches/cm, or request assistance.

Sleeveless hides the sleeve-design step and suppresses its fee and sleeve-specific measurement requirements. The draft keeps recoverable prior choices for switching back. Configured incompatible combinations are blocked; an unknown combination needs tailor review. Front-neck changes never automatically rewrite the back-neck selection. Historical accepted quotes remain unchanged by the free-length rule for new estimates.

## Measurements and guides

Make two separate choices:

1. **Who will take the measurements?** Yourself, your own tailor, or assistance.
2. **What is being measured?** Your body or a well-fitting garment. A tailor can measure either; choosing a tailor does not imply garment measurements.

Enter values in inches or centimetres. Applicable fields follow the garment and selected components. You can explicitly apply and confirm an owned saved measurement profile. Editing that profile later does not rewrite submitted requests. Legitimate unusual values may need review; check the unit and the confirmation prompt rather than assuming an illustrated size applies to you.

The guide section requests published guides for the selected garment, measurement method and interface language, including language-neutral guides. Both self-measurement and measurements taken by your tailor use that same matching rule. Choose **Load more guides** when another batch is available. Open a guide to enlarge it, inspect its available views and mark it used if appropriate. No illustrated numbers are automatically entered.

The supplied blouse, kurti and suit/kameez illustrations were imported as **draft garment-measurement guides**. They are not body guides and require the atelier's approval before publication. Ambiguous labels, flat-width versus circumference conventions and missing fields need clarification. If no matching published guide exists, the interface explains this and offers master-tailor help; it does not substitute another garment's picture.

Switching garments or changing relevant sleeve/neck details updates the guide/required fields and can require reconfirming affected measurements. Recoverable values remain with the draft; verify them before submission. Assistance leaves measurements pending confirmation before work begins.

## Fabric, transport and review

Describe your fabric and acknowledge that you provide it. Select inbound transport to the atelier separately from outbound transport for the finished garment. Drop-off/collection, your own courier and business-arranged transport have different responsibilities. Your own courier is paid directly by you. Business transport depends on configured PIN serviceability and separate leg rates; absent rates remain pending. Selecting a method does not book a courier.

At review, inspect selections, references, measurements, contact/address details, fabric, both transport legs and policy acknowledgement. Known charges and pending work are separated. Use a section's Edit action, then Save changes or Cancel changes; unrelated fields stay with the draft. Reference reproduction, final timing, material needs and unpriced work require human confirmation.

The initial request estimate remains stitching/transport plus pending work, not an accepted price. Optional offers/referrals/stitching credits are implemented but disabled until the atelier publishes real rules and terms. When enabled, **Account → Benefits** shows your eligible programme state, own balance/ledger and any referral controls. If using a referral, record it before your first active request; self-referral is not allowed and a code claim alone does not issue a reward.

## Save, sign in and submit

Ordinary signed-out design choices are recoverable on the current browser/device for 30 days. Measurements, addresses, contact details, notes and private reference IDs remain in the current tab's session storage rather than persistent local storage. Explicit logout clears private tab drafts; ending that browser session can also require re-entry. This is not cross-device guest storage.

Signed-in customers have private cloud drafts under **Account → Saved drafts**. Saving, saved, failed and conflict states need attention: a failed save is not a saved cloud draft, and a newer version from another tab must be reviewed rather than overwritten. Resuming/editing restores the stored selections and details that remain available.

Use email/password, or Google if enabled. Matching email addresses do not automatically link Google to an existing account: sign in first and prove your current password under **Account → Security**. Optional verification/recovery emails require the configured mail provider. Google-only users manage their Google password through Google. Password change/reset ends existing application sessions.

After sign-in the request returns to the saved step/review. **Login never submits an order.** A temporary session check failure has a Retry action and keeps the session/draft instead of forcing another login; an expired/revoked session still requires signing in. Wrong current-password checks do not end a valid session. Explicit logout clears private tab drafts immediately even if server revocation is slow; an old completion cannot erase a newer account's draft. See [authentication](authentication.md). Submit explicitly and wait for a real saved request number. Network failure retains the draft; identical retries reuse the key. Changed estimates/policies/revisions require review.

## Quotes, progress and support

Find saved requests under **Account → Orders**. The atelier reviews feasibility, fabric, measurements, timing and price, then sends a versioned final quote. Accept only the current quote. A changed quote requires a fresh acceptance; an old response cannot accept a different amount. A submitted order's snapshot is separate from later profile, catalogue or measurement-profile edits.

If benefits are enabled, review an eligible offer and credit amount on the current **itemized final quote**. They apply to identified stitching charges, never transport. Saving a selection previews the net amount but does not spend or guarantee a hold on credits. Explicit quote acceptance rechecks current rules, offer limits and balance and records the accepted gross/discount/credits/net breakdown. If eligibility changed, refresh/review rather than assuming an old preview still applies. Cancellation/rejection restores committed credits once under the workflow; configured referral/milestone rewards wait for a real qualifying recorded delivery. No online cash payment/refund or automatic carrier booking is implied. See [benefits rules](commerce.md).

Tracking shows actual recorded stages and dates. Stitching stages, inbound/outbound logistics, courier links and delay explanations are distinct. A courier link appears only when staff record it. No elapsed-time progress percentage or automatic carrier booking is implied.

Use **Need Help from a Master Tailor?** at a request step or **Account → Support** for an asynchronous question or complaint. Select the appropriate draft/order context and explicitly choose what to share. Measurements and addresses are not automatically attached as consented assistance context. Private attachments remain protected. An automated receipt, human response and resolution are different events. Configured response hours are a first-response target, not an instant callback or physical correction guarantee.

Staff can propose changes to a shared editable draft with a summary and price/measurement impacts. Review and explicitly accept the current proposal; submitted orders cannot be silently rewritten through this route. Order changes and disputes need staff review. A resolved support request can be reopened where the workflow permits it.

After an eligible delivered order, submit one honest review and decide whether it may be displayed publicly. Public testimonials are selected/moderated with consent; staff do not rewrite your rating or wording. **Work with us** opens a separate private application and does not grant admin access or promise paid assignments.

For technical contracts and the boundaries of local verification, see [LLD](lld.md), [API](enhancement-api.md) and [readiness](production-readiness.md).
