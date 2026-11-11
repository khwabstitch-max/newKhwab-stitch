# Khwab Stitch

Custom stitching and alterations using customer-provided fabric. A request is reviewed by the atelier; a current versioned quote must be explicitly accepted before work progresses. Fabric, delivery, materials and custom work are never silently promised.

## Current implementation

React 19/Vite JavaScript frontend, Express/Mongoose backend, MongoDB, local password/JWT authentication and ImageKit. Firebase remains removed. Optional Google Identity Services and Resend extend the same accounts. Current deployment target is **GitHub + one Vercel project**; the previous Render entry/configuration remain compatibility material.

Catalogue/exact-copy/selective/reference customization, free sleeve length, measurements/guides, private drafts and login continuation, logistics/quotes/history, admin CRUD, assistance/messages/complaints/reviews and worker applications/assignments are implemented. Offers, loyalty, referrals and stitching-credit ledgers now exist with **all programmes disabled by default** until the owner configures terms and verifies production behavior.

Current evidence: **221 server tests, 189 client tests, three Chrome journeys, lint and production builds passed**. Tests use disposable local MongoDB and mocked external providers. This review did not read any environment files or use configured provider credentials. Actual Vercel deployment, production Atlas/ImageKit privacy/email delivery, backups and restore remain unverified. See [project status](docs/project-status.md), [verification](docs/review-verification.md), [requirement matrix](docs/requirement-matrix.md) and [readiness](docs/production-readiness.md).

## Structure

| Path | Responsibility |
|---|---|
| `client/src` | Customer/admin/worker UI, language catalogues, API client and private draft state |
| `server/src` | Authenticated APIs, validation, pricing, commerce, Mongo schemas and provider adapters |
| `api/index.js` | Vercel Node entry; cached initialization without listening or dotenv |
| `server/scripts` | Explicit operator migrations, import, provisioning and cleanup |
| `scripts` | Workspace orchestration, isolated checks, browser/load/source checks |
| `docs` | Current architecture, workflows, deployment and labelled historical evidence |
| `artifacts` | Ignored local test reports, runtime prerequisites and contact sheets |

## Installation and local development

Use a supported Node 24.x security patch and npm. Install exact committed lockfiles:

```powershell
npm run setup
npm run dev
```

Ordinary local development supports the existing environment configuration through the standalone entry. This review intentionally did not open, modify or validate real environment files or examples. Required variable names/scopes are documented in [Vercel deployment](docs/deployment-vercel.md). Never commit real secrets or put server secrets in `VITE_` variables.

MongoDB requires a transaction-capable replica set. Before a reviewed rollout, back up and run `npm run db:indexes` against the intended environment. Register the owner, independently verify control, then use `npm --prefix server run admin:provision -- owner@example.com`; sign in again after promotion. No default admin/password/public promotion endpoint exists. Development seed is production-blocked and must not populate a live catalogue.

## Environment-isolated verification

These commands disable Vite environment-file loading, remove configured provider/test connection values from children, and keep temporary files inside this repository:

```powershell
# Windows only, if the local Mongo test binary lacks its C++ runtime:
npm run test:runtime
npm run check:isolated
node scripts/isolated.mjs browser --customization --report artifacts/browser-customization.txt
node scripts/isolated.mjs browser --paging --report artifacts/browser-paging.txt
node scripts/isolated.mjs browser-auth --report artifacts/browser-auth.txt
npm run load:local -- 1000 20
npm run source:check
```

The Windows helper verifies an official Microsoft package and extracts test runtime files into ignored artifacts; no system install/global PATH change is made. Linux CI uses its normal runtime. See [local runtime provenance](docs/local-test-runtime.md).

`check:isolated` runs both linters, all server/client tests and builds. For a pure-only diagnostic use `node scripts/verify-project.mjs --unit-only`. Individual checks use `node scripts/isolated.mjs client-test`, `server-test`, `server-unit`, `client-build`, `server-build`, `client-lint` or `server-lint`. Report paths must remain under artifacts.

Standard `npm run lint`, `npm test`, `npm run build` and `npm run check` remain available for ordinary configured development. Browser checks use an installed Chrome executable, a repository-local temporary profile and isolated fixtures. They do not establish live ImageKit/email/Google behavior. The local load script cannot target production.

## Deployment and operations

[Exact Vercel settings](docs/deployment-vercel.md): root `.`, preset Other, install `npm run setup`, build `npm run build`, output `client/dist`, Node 24.x, function `api/index.js`. API/health routes precede SPA fallback. Use same-origin `/api`.

Business use needs an appropriate commercial Vercel plan. No publishing, paid purchase, GitHub push or live customer-data migration was performed. Configure exact origins, required secrets, production indexes, private-media policy, email delivery/recovery and backup/monitoring before launch. Source rollback does not undo ledger/order/provider changes.

Read [HLD](docs/hld.md), [LLD](docs/lld.md), [API](docs/api.md), [authentication](docs/authentication.md), [ImageKit](docs/imagekit.md), [customer workflow](docs/customer-workflow.md), [admin guide](docs/admin-guide.md), [commerce](docs/commerce.md), [operations](docs/operations.md), [capacity plan](docs/capacity-plan.md) and [visual system](docs/visual-system.md). Historical `agent.md`/`ARCHITECTURE.md` and Render reports remain source history; newer requirements take precedence.
