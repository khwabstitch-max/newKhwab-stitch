# Setup, migration and Render deployment

Updated 2026-11-10. Use [deployment.md](deployment.md) as the current runbook and [project status](project-status.md)/[production readiness](production-readiness.md) for evidence and blockers. This companion preserves useful Render and legacy migration steps. It does not authorize publication, a paid plan or production data changes. Earlier development index-only statements describe that historical operation, not the later configured visual draft import.

## Local setup/secrets

Use a current Node24.x security patch and npm. npm run setup installs both lockfiles. Preserve existing .env database/image values. The optional one-time `node scripts/configure-local-auth.mjs` helper removes obsolete FIREBASE_/VITE_FIREBASE_ and GOOGLE_APPLICATION_CREDENTIALS assignments and generates a JWT secret if needed without printing it. It preserves current optional GOOGLE_CLIENT_ID and email configuration. It is a local helper, not database migration or a production secret manager.

| Server variable | Purpose |
|---|---|
| NODE_ENV / PORT | development/3000 locally; production/Render port remotely |
| MONGODB_URI | Explicit DB, restricted user, replica-set transactions |
| CORS_ORIGINS | Exact frontend origins, local http://localhost:5173 and production exact HTTPS origin |
| TRUST_PROXY_HOPS |0local/1Render; review changed proxy topology |
| JWT_SECRET | Backend-only canonical base64url for >=48 decoded random bytes, distinct per environment |
| IMAGEKIT_PRIVATE_KEY / IMAGEKIT_URL_ENDPOINT | Backend key and HTTPS image endpoint |
| IMAGEKIT_PRIVATE_POLICY_VERIFIED | false until live privacy checks pass |
| LOG_LEVEL | Normally info, never private request/password/token logging |
| GOOGLE_CLIENT_ID | Optional Google Identity Services web client ID; register actual frontend origins |
| RESEND_API_KEY / EMAIL_FROM / PUBLIC_WEB_URL | Optional email actions; configure together with approved sender and exact trusted frontend origin |

The frontend's required application variable is **VITE_API_BASE_URL**, including `/api`, e.g. http://localhost:3000/api or https://YOUR_API.onrender.com/api. Optional sign-in capabilities are fetched from the server. No Firebase configuration or browser signing secret is needed. Vite values are public/build-time, requiring rebuild on change.

Configure MongoDB then run npm run db:indexes, development-only npm run seed, and npm run dev. Frontend-only preview: npm --prefix client run dev. Configuration failures never create a fake order success.

Register via /login registration mode, then from a trusted terminal run `npm --prefix server run admin:provision -- owner@example.com`. Verify the owner's control before promotion; unverified email alone is insufficient. Existing JWTs are revoked; sign in again. `--revoke` removes admin. There is no default/admin password.

Trusted reset: `npm --prefix server run password:reset -- customer@example.com`, then enter the password through hidden input. Never append a password argument. Optional Resend reset/verification actions work only when configured and verified; otherwise use approved out-of-band ownership checks. Registration alone does not verify email, and Google-only passwords remain with Google.

## Existing account migration

Only relevant to older Firebase/Google-created records. Preserve MongoDB IDs and historical order ownership. Matching an email never authorizes public account claiming.

1. Take a verified backup and rehearse on a staging copy. Review duplicate normalized emails and exact record IDs.
2. Run the explicit db:indexes script against the intended database. It verifies conflicts/index definitions, builds the partial unique email_credential_unique index for password-credential records **before** dropping only the verified obsolete firebaseUid_1 index. It preserves records and unrelated indexes. Startup does not silently drop/migrate the old index; follow its actionable migration error.
3. Legacy accounts without a hash cannot log in locally and public registration cannot overwrite them. Independently verify customer/operator ownership before enrollment.
4. Run `npm --prefix server run password:reset -- customer@example.com --migrate-legacy --user-id EXISTING_MONGO_ID`, then use hidden password input. Ambiguous legacy duplicates must be resolved deliberately; do not bulk assign a common password or admin role.
5. Verify unchanged IDs/order ownership, current role and invalidation of old sessions. Enroll each required account deliberately.
6. Remove obsolete provider secrets from deployment settings after verifying the new version. The former external identity account is not automatically deleted; any cleanup there is a separate owner-controlled action.

The configured development Atlas index migration was explicitly authorized and executed successfully, preserving account documents/IDs and removing only the obsolete index. This does not authorize production migration. Review final script flags/source and backup evidence before any further operator execution.

## Atlas

Separate development/staging/production databases/users. Restrict IP access to the development machine and service's documented outbound ranges, use TLS and explicit DB name. Transactions require a replica set; production autoIndex is disabled. The development seed is production-blocked and adds labelled catalogue examples only.

See [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/). Current [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) allow enabling daily backups with up to four retained snapshots. Verify the actual tier/settings and restore drill; this review has not established they are enabled. Supplement provider retention with monitored encrypted operator backups where business policy requires them. No paid backup option or point-in-time recovery is assumed.

## ImageKit privacy

Server uploads force customer privacy, strip EXIF and re-read provider metadata. Enable **Restrict all requests** for unsigned image delivery and review named transformations, another possible private-file access path.

Before private gate true: upload a disposable staging private image through provider dashboard; deny unsigned original and every named transformation. Only then enable gate in staging, upload through backend, verify private metadata/owner access, deny another account, test tampering and five-minute expiry, verify upload/delete/provider failures, then remove disposable asset. No public thumbnail/path or signed URL may leak in public responses/logs.

Keep gate false on any failure. If account features cannot enforce privacy, disable private uploads until a reviewed authenticated-delivery/private-storage alternative exists. Random filenames are not access control. See [ImageKit security](https://imagekit.io/docs/media-delivery-basic-security). These live checks remain unverified.

## Render

Root render.yaml is demo-only Free API compute with private-image gate false. sync:false secrets need private configuration; actual generated hostnames can differ. No paid plan enabled.

| Setting | Frontend Static Site | Backend Web Service |
|---|---|---|
| Root | client | server |
| Build | npm ci && npm run build | npm ci && npm run build |
| Publish/start | dist | npm start → node src/index.js |
| Health | Static host | /health/ready |
| Runtime | Node24 build | Node24,0.0.0.0:$PORT |
| Routing | Rewrite /*→/index.html | JSON API404 |

Backend build checks JavaScript syntax; no TypeScript compilation/nonexistent dist entry. Set API base to backend HTTPS `/api` and CORS to exact frontend origin. Custom domains need consistent API/CORS/PUBLIC_WEB_URL values and registered Google Identity Services JavaScript origins if enabled. Firebase authorized-domain setup is not part of this architecture.

See [Node selection](https://render.com/docs/node-version), [Static Sites](https://render.com/docs/static-sites), [Blueprint fields](https://render.com/docs/blueprint-spec), [Free limitations](https://render.com/docs/free). Local YAML parsing is not live deployment acceptance. Render advises against production use of Free compute: an idle API sleeps after 15 minutes, waking takes about a minute and disk is ephemeral. The blueprint is preview-only and the actual deployed tier is unverified. Real orders need reviewed non-sleeping compute, verified backup/restore, alerts and quota budgets. No prices/uptime guarantee is assumed.

## Post-deployment checks/rollback

### Enhancement rollout checklist — 2026-11-08

- Preserve the existing Static Site/Web Service roots, build/start commands, public URLs and database ownership. Run the explicit `npm --prefix server run db:indexes` against the reviewed target after backup; new collections and unique retry/Google indexes are required. No live migration is implied by local tests.
- Optional email variables are backend-only: RESEND_API_KEY, EMAIL_FROM, PUBLIC_WEB_URL, configured together. PUBLIC_WEB_URL is the exact production HTTPS frontend origin. Verify the sending domain and real inbox delivery/reset/verification; no secret belongs in VITE variables. The [Resend send API](https://resend.com/docs/api-reference/emails/send-email) is the implemented provider interface.
- Optional GOOGLE_CLIENT_ID is the public web client identifier, configured server-side and returned by capabilities. Register the actual frontend origins in Google Identity Services, check both new-account and same-email current-password linking, and apply unique identity/email-reservation indexes before enabling it. Normal API ownership still uses the same local JWT/user IDs. Follow [Google verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token); this is not a Firebase migration.
- Keep unsupported future service adapters inactive. Configure actual component/default mappings, service-area rates, support hours and versioned policy copy. Missing values must appear pending/unavailable. Do not publish invented courier prices, bookings, support hours or unlimited alterations.
- Retain the SPA rewrite so /request, /account, /worker and /password-help deep links load React. Email action secrets use URL fragments; do not copy them to logs or return query strings. Render documents the [SPA rewrite behavior](https://render.com/docs/redirects-rewrites).
- Before enabling private uploads, test actual unsigned-original/named-transform denial, signed-link expiry and unauthorized access under the configured [ImageKit security settings](https://imagekit.io/docs/media-delivery-basic-security). The private-policy flag is an owner-verified gate, not a test result.
- Smoke guest-to-login review recovery, cancelled login, draft conflicts, exact/custom/mixed references, pending prices, same-key retry, current/stale quotes, accepted-price immutability, separate fulfilment events, support permissions, worker revocation and moderated-review publication. Record backend/provider/browser evidence separately.
- Test a compatible source/data rollback and backup restoration before real order handling. See [migration/rollback](enhancement-migration.md), [current admin guide](admin-guide.md), [customer workflow](customer-workflow.md). Existing [Render Express deployment](https://render.com/docs/deploy-node-express-app) remains the hosting path; no alternate hosting was introduced.

Check liveness/readiness/DB failure, nested SPA/public draft hiding, stitching/fabric wording, mobile/keyboard flow, local register/login generic errors, expiry/logout/reset/role revocation, and no hash/password leaks. Use a second account to verify order/media/admin denial. Repeat exact order key/payload for one request, current/stale quote versions and full state progression. Verify admin CRUD/references/content/audit and actual ImageKit privacy/provider-failure handling. Logs exclude secrets/private customer data.

Record deployed SHA/IDs. Source rollback does not undo database/index/credential changes or image deletion. Restore a compatible source/data combination from tested backups; do not restore the old auth implementation against migrated credentials without a compatibility review. Detailed procedures: operations.md.

## Visual import and free-length rollout

Review the supplied inventory/contact sheets and the current [admin guide](admin-guide.md). Stable imports create inactive option/guide drafts and public catalogue media; they do not publish automatically. Confirm actual applicability, prices, compatibility and guide conventions before publication. The configured import run is not proof of a production import.

All sleeve-length adjustments are zero in new calculations. Preview the controlled free-length migration before a reviewed execution; it normalizes length records and editable draft estimate caches while preserving submitted orders and accepted quotes. Back up first, retain compatible source/data rollback evidence and follow [deployment.md](deployment.md).
