Act as a senior software architect, full-stack engineer, and security-focused reviewer.

Design and implement a production-oriented application for **Khwab Stitch**, using the requirements below. Provide proper **High-Level Design (HLD)** and **Low-Level Design (LLD)** before implementation, then build and verify the application.

Do not label the application “production-ready” merely because it builds. Separate verified functionality, untested integrations, deployment prerequisites, and remaining launch blockers.

## 1. Business requirements

Khwab Stitch is a home-based ladies’ custom stitching and alteration service.

- Customers provide their own fabric.
- Services include kurtis, suits/kameez, blouses, and alterations.
- Catalogue entries represent stitching designs/services, not ready-made garments.
- Display “Stitching starting from…” and “Fabric provided by customer.”
- Final pricing and delivery commitments require admin review.
- Submitting a request must not automatically confirm the order.
- Customers can select catalogue designs or provide reference images.
- Customers provide garment-specific measurements.
- Admin manages designs, photos, website content, customers, quotes, and orders.
- Initially exclude payment gateways, SMS OTP, marketplace sellers, and unnecessary infrastructure.

Build a responsive, accessible interface suitable for mobile customers and desktop administration.

## 2. Required technology and hosting

Use:

- React + Vite + TypeScript for frontend.
- React Router for routing.
- Node.js + Express + TypeScript for backend.
- MongoDB Atlas with Mongoose.
- Firebase Authentication with Google sign-in.
- Firebase Admin SDK for backend identity verification.
- ImageKit for images.
- GitHub for source control.
- Render Static Site for frontend.
- Render Web Service for the Express backend.

Do not use Netlify Functions or substitute another hosting platform.

Prefer a modular monolith with clear boundaries. Avoid microservices and unnecessary paid services.

Use supported stable dependency versions and lockfiles. Verify current provider documentation before selecting SDK methods, runtime versions, pricing assumptions, or deployment settings.

If an existing project is supplied, inspect it first. Preserve working features, branding, and data. Explain necessary changes before making substantial structural changes. If no project is supplied, scaffold a new repository and state that assumption.

## 3. Required deliverables

Produce:

1. Requirements and assumptions.
2. HLD with architecture diagrams.
3. LLD with schemas, interfaces, API contracts, and workflows.
4. Complete working frontend and backend.
5. Setup and deployment documentation.
6. Automated tests for critical behavior.
7. Security and reliability review.
8. Evidence-based readiness report.

Store documentation in:

- `docs/requirements.md`
- `docs/hld.md`
- `docs/lld.md`
- `docs/api.md`
- `docs/security.md`
- `docs/deployment-render.md`
- `docs/operations.md`
- `docs/readiness.md`

Use Mermaid for useful architecture, sequence, and state diagrams.

## 4. HLD requirements

Explain:

- System boundaries and external integrations.
- Public, customer, and admin capabilities.
- Frontend/backend responsibilities.
- Authentication and authorization boundaries.
- Database and image-storage responsibilities.
- Public versus private customer data.
- Deployment topology and environment separation.
- Main request flows and failure handling.
- Cost assumptions and capacity limits.
- Backup, recovery, monitoring, and scaling approach.

Include diagrams for:

- Overall architecture.
- Google login and backend verification.
- Customer order submission.
- Authorized image upload and private image access.
- Admin quote and order-status updates.

Define realistic initial availability and performance targets. Label assumptions explicitly.

Distinguish:

- A free-tier development/demo deployment.
- A production deployment for real customer orders.

Do not claim a sleeping Render Free backend provides always-on production reliability. Explain the smallest hosting upgrade needed when appropriate, without inventing prices or uptime guarantees.

## 5. LLD requirements

Define:

- Modules and dependency boundaries.
- Folder/file structure.
- Request validation schemas.
- MongoDB models and indexes.
- API request/response examples.
- Error format and HTTP status codes.
- Authentication middleware.
- Admin and resource-ownership checks.
- Order state machine and allowed transitions.
- Quote versioning and acceptance rules.
- Image lifecycle and cleanup.
- Pagination, filtering, and sorting.
- Concurrency controls and idempotency.
- Audit logging.
- Configuration validation.
- Startup, shutdown, and database connection behavior.

For each important endpoint specify:

- Method and path.
- Authentication requirements.
- Roles and ownership checks.
- Input validation.
- Response example.
- Error cases.
- Side effects.
- Retry/idempotency behavior where relevant.

## 6. Frontend scope

Public pages:

- Home.
- Design catalogue.
- Design details.
- How stitching works.
- Contact.
- Privacy policy.
- Service terms.

Customer pages:

- Google login.
- Profile.
- New stitching request.
- My orders.
- Order details.
- Quote acceptance or rejection.
- Account deletion request.

Admin pages:

- Dashboard.
- Design management.
- Category management.
- Neck/sleeve/back option management.
- Media management.
- Order and quote management.
- Customer lookup.
- Website content/settings.
- Audit history.

Include loading, empty, error, success, unauthorized, and not-found states.

Handle backend cold starts and network failures without automatically repeating mutations or creating duplicate orders.

Provide accessible labels, keyboard navigation, responsive layouts, form validation, and destructive-action confirmations.

## 7. Authentication and authorization

Use Firebase Google sign-in.

- Frontend obtains ID tokens through the Firebase SDK.
- Protected API requests send `Authorization: Bearer <token>`.
- Backend verifies tokens using Firebase Admin SDK.
- Identify users by verified Firebase UID.
- Do not trust client-supplied email, user ID, role, price, or order ownership.
- Default all newly registered users to `customer`.
- Provision the first admin using a trusted server-side script.
- Do not expose public admin-promotion endpoints.
- Check backend authorization on every protected operation.
- Enforce ownership for customer orders and private media.
- Handle disabled accounts and privileged-access revocation.
- Use SDK-managed authentication persistence; do not manually store long-lived custom JWTs.
- Explain session persistence, logout, expiry, and token refresh.
- A manually entered WhatsApp number remains unverified.

Account deletion must define handling of Firebase identity, MongoDB records, private uploads, and any justified retention.

## 8. Database design

Design appropriate collections for:

- Users.
- Categories.
- Designs.
- Design options.
- Media assets.
- Orders.
- Site settings.
- Audit events.
- Idempotency records, if needed.

Requirements:

- Unique indexes for Firebase UID, design code, slug, and order number.
- Store money as integer paise with explicit currency.
- Store timestamps consistently in UTC.
- Store measurement units and measurement method.
- Store only image references/metadata in MongoDB.
- Snapshot relevant design details and accepted quote information in orders.
- Preserve historical orders when catalogue entries change.
- Use explicit allowed update fields to prevent mass assignment.
- Bound query sizes and paginate lists.
- Use optimistic concurrency where admins may overwrite each other.
- Define retention and archival rules.
- Provide safe migrations/index setup and clearly labelled development seed data.

Do not use fictional customer data as real production records.

## 9. Measurement and order workflow

Support:

- Kurti.
- Suit/kameez.
- Blouse.
- Alteration.

Measurement options:

- Inches or centimetres.
- Body measurements.
- Well-fitting garment measurements.
- Need assistance.

Display only relevant garment fields. Define field meaning, reasonable validation, optionality, and how assistance requests are handled. Do not silently interpret garment measurements as body measurements.

Capture:

- Garment and quantity.
- Catalogue design or reference image.
- Neck, sleeves, back, length, fit, and extra-work preferences.
- Measurement details.
- Customer fabric acknowledgement.
- Delivery address and PIN.
- Preferred date.
- Additional instructions.

Implement an explicit order state machine covering:

Request received → Under review → Quote sent → Customer accepted → Fabric received and inspected → Stitching → Ready → Dispatched → Delivered.

Include permitted cancellation/rejection paths and rules.

- Customer cannot set admin-controlled status.
- Preferred dates are requests, not guaranteed commitments.
- Quotes must be versioned.
- Customer must accept the current quote version.
- Store who changed status and when.
- Generate order numbers safely under concurrency.
- Prevent duplicate order creation from retries/double clicks.
- Validate price and state transitions on the backend.

## 10. Catalogue and admin CRUD

Admin can:

- Create drafts.
- Edit descriptions, categories, options, and starting prices.
- Upload and reorder images.
- Choose cover images.
- Publish/unpublish.
- Archive used designs.
- Permanently delete eligible unused drafts.
- Update banners, FAQs, contact links, and business instructions.

Define referential-integrity checks before deleting categories, designs, or images.

Require explicit confirmation for destructive actions. Record sensitive admin changes in audit history.

Public APIs must return only published, safe fields.

## 11. Image security and lifecycle

Use ImageKit with separate treatment for:

- Public catalogue/banner images.
- Private customer references and measurement images.

Requirements:

- Private keys remain on the backend.
- Authorize uploads and enforce user/role quotas.
- Validate actual file type, size, count, and intended purpose.
- Do not trust filename extensions or arbitrary client-provided URLs/file IDs.
- Ensure the upload mechanism cannot bypass private-access settings.
- Verify uploaded assets before attaching them to records.
- Use access-controlled private assets with short-lived authorized viewing.
- Random filenames alone are not privacy protection.
- Avoid unnecessarily retaining EXIF metadata.
- Prevent deletion of referenced assets.
- Define cleanup for abandoned uploads and partial failures.
- Do not store permanent uploads on Render’s local filesystem.
- Avoid logging signed private URLs or exposing private paths in public endpoints.

If a required provider feature is unavailable on the chosen plan, state that limitation and propose a safe fallback.

## 12. API and backend security

Implement:

- Schema-based input validation.
- Request body limits.
- Exact production CORS allowlist.
- Authentication and admin middleware.
- Resource-ownership checks.
- Appropriate security headers.
- Rate limits for sensitive endpoints and uploads.
- Proxy-aware rate-limit configuration.
- A clear shared-limit strategy before horizontal scaling.
- NoSQL injection and mass-assignment protection.
- Safe text/URL handling for admin-editable content.
- Request IDs and consistent error responses.
- Redacted structured logs.
- Provider request timeouts.
- Safe retries only for retryable operations.
- Appropriate database connection pooling.
- Graceful shutdown.
- Liveness/readiness behavior without exposing secrets.

Explain CSRF implications for the chosen authentication transport. If cookies are introduced, implement the corresponding CSRF and cookie controls explicitly.

Never place MongoDB credentials, Firebase service-account keys, or ImageKit private keys in frontend code or `VITE_` variables.

## 13. Render deployment

Use a GitHub repository with:

- `client/`
- `server/`
- `docs/`

Frontend:

- Render Static Site.
- Root: `client`.
- Build: `npm ci && npm run build`.
- Publish directory: `dist`.
- SPA rewrite: `/*` → `/index.html`.

Backend:

- Render Web Service.
- Root: `server`.
- Build: `npm ci && npm run build`.
- Start: `npm start`.
- Compile TypeScript and start the actual compiled entry point.
- Listen on Render’s `PORT` and `0.0.0.0`.

Provide:

- Valid package scripts and lockfiles.
- `.env.example` files with placeholders.
- Appropriate `.gitignore`.
- Supported Node runtime pinning.
- Render configuration, optionally `render.yaml`.
- Health-check configuration.
- MongoDB network-access setup.
- Firebase authorized-domain setup.
- Exact frontend/backend origin configuration.
- ImageKit configuration.
- Admin provisioning instructions.
- Rollback procedure.
- Post-deployment smoke tests.

Keep secrets out of repository files and chat output. Document safe secret configuration through provider settings.

Do not publish externally, enable paid plans, or modify live customer data without appropriate authorization.

## 14. Tests and acceptance criteria

Add meaningful automated tests covering:

- Missing, invalid, and expired authentication.
- Customer attempts to access admin APIs.
- Customer attempts to access another customer’s orders/media.
- Role escalation and mass assignment.
- Public draft-design visibility.
- CRUD validation and deletion constraints.
- Duplicate order submission.
- Concurrent quote/status updates.
- Stale quote acceptance.
- Invalid measurements.
- Unauthorized uploads and media access.
- Provider failures.
- Database failures.
- Pagination and invalid query inputs.

Add frontend/integration tests for critical flows:

- Login.
- Browse design.
- Submit order.
- View own order.
- Admin create/edit/publish design.
- Admin quote/status update.

Mock external providers in automated tests where appropriate, and distinguish mock coverage from real-provider verification.

Run type checks, lint, tests, and production builds. Report exact outcomes; never invent successful test results.

## 15. Operations and launch readiness

Document:

- Database and media backup strategy.
- Restore verification.
- Error monitoring and basic alerts.
- Usage/quota monitoring.
- Dependency updates.
- Secret rotation.
- Admin account protection.
- Incident response.
- Data retention and deletion.
- Rollback and recovery.

Finish with a readiness table:

- Implemented and tested.
- Implemented but awaiting provider verification.
- Credentials/configuration still required.
- Deployment tasks remaining.
- Free-tier limitations.
- Production launch blockers.

## Execution instructions

Start by inspecting supplied files and identifying gaps. Ask only for genuinely blocking missing information; otherwise proceed with explicit assumptions.

First create the HLD and LLD. Then implement the application in functional milestones and keep documentation consistent with the code.

Do not stop after presenting an architecture or folder tree. When code access is available, deliver working files, tests, and deployment configuration.

If live credentials or access are missing, complete everything that can be implemented and tested locally. Clearly list the remaining integration steps without claiming the application is already connected or deployed.


