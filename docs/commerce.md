# Offers, loyalty, referrals and stitching credits

This optional module extends the existing Express/MongoDB application. No production programme or business rates were enabled. Defaults are disabled, with zero reward amounts, no milestones and no published offers. No fixture price is a business price.

## Customer flow

Use **Account → Offers and stitching credits** (`/account/benefits`). Customers see only their own balance/history. Published offers appear when their programme is enabled. A customer can create a referral code and record one friend's code before the first active request. Self-referrals and changing an existing referral are rejected. Recording a referral is not a reward or order confirmation.

Benefits apply to a current **itemized final quote**, after ordinary request submission and tailor review. Choose the owned order, optional offer code and explicit credit amount. Saving creates a pending selection and increments the order revision; it neither spends credits nor accepts the quote. Return to the order, review gross/discount/credit/net and explicitly accept the current version.

The quote screen waits for fresh metadata and disables acceptance on loading, failure, stale revision/version or changed eligibility. Retry/refresh is available. Saved benefits can be cleared even after a programme is disabled. The backend rechecks terms, offer eligibility/limits and balance transactionally at acceptance; a failed check never silently changes the agreement to a gross price. Accepted snapshots retain the original gross quote and the explicit discount, credit and net amounts.

## Scope and arithmetic

Amounts are integer paise. Percentage discounts use basis points: 100 basis points = 1%. Discounts round down once, obey their cap and never exceed eligible stitching. Credit redemption is bounded by balance, remaining stitching after discount and the configured percentage. Neither credits nor discounts pay transport.

Eligible stitching is the sum of `scope: "garment"` final-quote lines. Unitemized/inconsistent quotes cannot use benefits. Admins must classify labour/finishing as garment-scope charges and transport/materials/other expenses separately. Eligibility is never guessed from a free-text label or an old estimate. The authoritative estimate still enforces free sleeve length/included components; pending custom work does not promise a final promotional price.

Credits are a stitching benefit, not a cash payment gateway. There is no automatic credit expiry. Settle expiry, disputes/refunds, accounting and legal programme terms before enabling live use. No payment, delivery or reward is confirmed automatically.

## Administration and lifecycle

Use **Admin → Offers and credits** (`/admin/commerce`). Configure actual terms, subprogramme flags, redemption percentage, qualifying subtotal, referral/new-customer rewards and explicit loyalty milestones. Milestone codes are stable identities: renaming a paid code creates a new reward rule.

Offers support stable code, bilingual content, draft/published/archived status, fixed-paise/basis-point discount, maximum discount, minimum stitching, applicable garments, UTC validity window, total/per-customer uses and display order. Archive preserves historical references. Expired, exhausted, unpublished and incompatible offers are rejected. Public listing alone does not establish personal eligibility.

Administrators can make bounded signed credit adjustments with an explicit reason and generated client event ID. A debit cannot make the wallet negative. Identical retries return the original ledger event; changed details under that event ID conflict. Reconcile an uncertain outcome before intentionally starting a different adjustment. Customers have no adjustment API.

Cancellation/rejection releases committed benefits once, restoring spent credits and active coupon capacity. Historical accepted snapshots remain unchanged. A genuine manual `delivered` transition records a unique qualifying completion and issues each configured referral/milestone reward once. Replayed delivery events cannot grant duplicate benefits. Completion counts start with recorded events under the enabled programme; historical orders are not silently backfilled.

Account erasure is blocked while an unspent credit balance remains. Resolve it with an audited, approved settlement. Minimal commerce records need an operator retention/deidentification policy; this module does not silently forfeit balances or rewrite historical financial evidence.

## API

Authenticated responses are private/no-store. Ownership comes from the existing local JWT/current database user, never caller-supplied query IDs.

| Method and path | Purpose |
|---|---|
| `GET /api/commerce/capabilities` | Public flags/terms |
| `GET /api/commerce/offers?garment=&page=&limit=` | Bounded currently published offers, no private usage history |
| `GET /api/commerce/account` | Own balance, flags, referral and completion summary |
| `GET /api/commerce/ledger?page=&limit=` | Own bounded ledger; hides actor/owner/internal hashes/other-customer order IDs |
| `POST /api/commerce/referral-code {}` | Create/retrieve own code when enabled |
| `POST /api/commerce/referrals {code}` | One immutable non-self claim before first active request |
| `GET /api/commerce/quote-benefits/:orderId` | Own selection/preview/current revision/version and live validity/message |
| `POST /api/commerce/quote-benefits` | `{orderId,revision,quoteVersion,offerCode,creditPaise}`; save/clear, no debit |
| `GET/PATCH /api/admin/commerce/settings` | Rules; PATCH includes expected `revision` |
| `GET/POST /api/admin/commerce/offers` | Paged list/create |
| `PATCH/DELETE /api/admin/commerce/offers/:id` | Revision-checked edit/archive |
| `POST /api/admin/commerce/credits` | `{owner,clientId,deltaPaise,reason}`; admin-only idempotent adjustment |

Unknown fields/fractional paise are rejected. A new quote version requires fresh selection. Safe errors disclose business state, not tokens or raw database details.

## Models, indexes and operations

`CommerceSettings` owns flags/rules; `CommerceOffer` owns discount definitions/counts; `CommerceWallet` holds a conditional nonnegative balance and referral code. `CommerceLedger` is append-only and unique by owner/event key. `CommerceReservation` is unique by order/version with pending/committed/released state. `CommerceOfferUse` tracks active/released uses; `CommerceReferral` has a unique referred owner; `CommerceMilestone` is unique by owner/code; `CommerceCompletion` is unique by order.

The additive `db:indexes` operator script creates these indexes. Shared deployment-index checks verify critical unique definitions; production does not silently migrate live indexes. Back up and rehearse first. MongoDB replica-set transactions, conditional writes and the existing owner mutation fence serialize wallet/usage changes; in-process memory is not financial truth.

Monitor conflicting event IDs, rejected balances, coupon capacity and ledger/wallet reconciliation. Retry uncertain operations with the same identity. Source rollback does not reverse balances/rewards. Restore wallets, ledger, reservations, offer uses and order snapshots together, then reconcile later writes. No reward-payout scheduler or new external queue was added.

## Verification

Twelve isolated unit tests cover disabled defaults, transport exclusion, itemization, deterministic rounding, eligibility, caps, validation, idempotent changed-payload handling and a simulated atomic balance guard. The simulated store does not prove MongoDB transaction behavior.

Eight disposable local-MongoDB API tests cover authorization/privacy, adjustment replay, quote save/accept snapshots, simultaneous wallet spending, global single-use offer contention, exact-once reversal, changed/disabled eligibility and referral/milestone delivery replay. Root's final verification report records the actual run result; configured application databases and `.env` files are not used by these fixtures.

Frontend tests verify loading/failure/staleness, net-price confirmation, Hindi snapshots, disabled programme balances and retaining a credit event ID through uncertain retries. Existing current/stale quote journeys now include benefit metadata. No live programme, external payment or real customer reward was exercised.
