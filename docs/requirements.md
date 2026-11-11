# Current requirements and review plan

Updated 10 November 2026. This document records the latest instruction for the existing project. The current verification record is [review-verification.md](review-verification.md); deployment decisions are in [deployment-vercel.md](deployment-vercel.md).

## Requirement precedence and repository boundary

The user's latest instruction selects **GitHub-connected Vercel deployment** and retains React/Vite JavaScript, Node 24/Express, MongoDB/Mongoose, ImageKit and the existing local password/JWT authentication. Firebase was removed and must not be reinstalled. No TypeScript/authentication/platform rewrite is justified by the earlier `agent.md` or `ARCHITECTURE.md`; those files remain historical source material. Render configuration is retained as a documented fallback, not the selected deployment path.

Work stays inside this repository. During this review no `.env` or `.env.*` file, including examples, is read or edited. Isolated tests/builds explicitly disable environment-file loading, remove configured service credentials from child environments, use local disposable databases/providers and keep temporary files/browser profiles inside ignored artifacts. Official provider documentation and the pinned Microsoft local-test prerequisite are external public resources, not access to outside local files. No application database/provider account is contacted using private configuration. No publishing, purchase or production-data mutation is authorized.

## Preserved business behavior

- Khwab Stitch stitches customer-provided fabric: kurti, suit/kameez, blouse and alterations. Catalogue entries are designs/services, not ready-made inventory. Show “Stitching starting from” and “Fabric provided by customer.”
- Requests begin at `request_received`; admin review determines a versioned final quote/date. Work cannot skip explicit acceptance of the current quote and revision.
- Preserve catalogue/reference branches, exact copy and selective customization, separate sleeve design/length/front/back, optional finishing details, garment-specific measurements and master-tailor help.
- Sleeve length always adds zero. A style preference is distinct from its exact numeric measurement. Sleeveless suppresses incompatible sleeve work/measurements and retains the parked selection for switching back.
- Backend pricing owns integer INR paise, quantity/scope/rounding and known versus pending work. Included components are not charged twice; customer prices are ignored. The test-only ₹300+₹50+₹0+₹30+₹20=₹400 fixture is not seeded as business pricing.
- Preserve independent pickup/return choices and genuine staff logistics/status updates. No automatic payment, delivery confirmation, courier booking or fabricated progress is introduced.
- Preserve drafts/login continuation, profiles/addresses, quotes/history/tracking, admin CRUD, support/messages/complaints, eligible moderated reviews, worker applications/approval/assignments, FAQs/social/banner content and future service/audience controls.
- Offers, loyalty milestones, referrals and stitching credits are implemented as an opt-in programme with owner-approved terms/amounts. Defaults disable every benefit. Redemption applies to eligible stitching in itemized current final quotes, not fabric/logistics. Atomic debit, use limits, duplicate-event prevention, delivered-order rewards and cancellation reversals must be verified before enabling.

## Priority fixes

1. Reproduce and fix sign-in/profile-initialization races; preserve unexpired sessions on temporary network/5xx errors, distinguish credential rejection from session rejection and prevent stale responses from overwriting a newer login.
2. Fix disappearing/stale selectors: eligible publication/garment/kind filters, paging/refetch, reference/help branching, correct image/view mapping, reliable empty/error states and draft preservation.
3. Preserve ImageKit public/private boundaries and reference pins. Handle Vercel request limits through bounded client preparation and backend validation; do not make private photos public or rely on local durable uploads.
4. Adapt the modular Express app to Vercel's entry point and warm connection reuse while preserving local development. Production limits must use a shared store, not pretend per-instance memory is global.
5. Complete the opt-in benefits workflow, security/ownership and repeatable option metadata normalization. Never auto-publish draft imports or invent business policy.
6. Run isolated logic/API/browser checks, builds/lint, review GitHub hygiene and create reproducible local load tooling. Report measured workload limits rather than arbitrary user-capacity claims.
7. Update architecture/API/workflows/security/deployment/operations/capacity/readiness from final code and observed evidence.

## Authentication, privacy and integrity

The app uses bcrypt password hashes and short-lived backend-issued HS256 JWTs. The browser stores only token/expiry as authentication metadata and gets identity/role from an authenticated server response. Refresh revalidates `/me` behind a loading/error state. There is no competing cookie auth or refresh-token mechanism. Expiry/revocation requires a clear reauthentication flow. Logout/password reset/role changes invalidate sessions through database `authVersion`.

Optional verified Google exchange/linking and Resend recovery/verification extend the same accounts. Tokens are expiring, one-use and hash-stored; same-email Google linking cannot claim an existing password account without its authenticated current-password check. Real provider configuration/delivery/origin checks remain operator work because this review does not inspect secrets.

Drafts keep private fields in tab session storage and owner-scoped cloud records; ordinary allowlisted design choices may persist locally. URLs contain only safe draft/step/return references. Editing one section supports Save/Cancel without clearing unrelated values. Login never automatically submits. Expected revisions and original retry keys prevent silent conflict overwrites and duplicate uncertain submissions.

Customer ownership, current admin role and worker assignment are enforced by backend queries, not hidden buttons or browser fields. Media is decoded/bounded/re-encoded and provider metadata checked; historical references stay pinned. Orders snapshot prices/configuration/used guides. Transactional references fence concurrent deletion; unused records may be deleted, referenced/history-bearing entries are archived.

## Deployment and verification gates

Vercel is the selected topology: a static frontend plus a Node function exporting the existing Express app, MongoDB for durable business/auth/limit state and ImageKit for durable images. The long-running local listener is not started inside a function. Warm initialization is cached per instance; it is not a session store. Function limits, pool multiplication and plan commercial suitability require the official documentation and deployment smoke tests.

A successful local build/test is not a published deployment, backup restore, verified private-image policy or real email delivery. Keep benefits/future services disabled until their actual terms/capabilities are configured. Real launch requires approved catalogue rates/applicability/compatibility/guides, production secrets/origins/indexes/network, live privacy/recovery checks, backup/restore/rollback evidence and alert ownership.

No payment gateway, SMS OTP, marketplace or automatic WhatsApp sender is added. These remain clearly unavailable rather than implied by UI text. Refer to [requirement matrix](requirement-matrix.md), [security](security.md), [catalogue repair](catalogue-repair.md), [authentication](authentication.md), [ImageKit](imagekit.md), [capacity plan](capacity-plan.md) and [production readiness](production-readiness.md).
