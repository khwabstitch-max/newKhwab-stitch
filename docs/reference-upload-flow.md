# Reference uploads, selection previews and quotes

Verified locally on 20 November 2026.

## Customer behavior

Selecting **Upload my own reference** shows front, side and back guidance. All three views are requested so the tailor can review the design. They may be separate pictures, one combined picture, or a PDF; three separate files are not required.

The picker accepts multiple JPEG/JPG, PNG and PDF files in one selection, up to **5 files total**. Images retain the existing 5 MiB source / bounded image preparation behavior. Each PDF may contain **1?10 pages** and be at most **3 MiB**.

Uploads show progress and a file count. A failed file does not discard successful uploads, and the same file can be retried. Continue is disabled while a batch uploads. Removing a reference clears matching component associations while preserving other selections and notes.

Private uploads require sign-in. The preview shows images or a PDF document card, filename and page/size metadata, with open, retry/refresh and remove controls. PDFs open as documents rather than broken images.

## Review and quote

Final review includes all attached files and explicitly numbered component references. Existing selected catalogue designs and sleeve/neck/length details remain visible.

Submitted orders snapshot reference filenames, MIME types and page counts. Catalogue media and chosen component media are retained separately so later catalogue edits do not change the submitted reference. Owner/admin quote views link to the submitted design/file gallery. Options without uploaded media use the same existing individual guide images where available.

The PDF parser validates bounded documents in a worker, rejects malformed/encrypted or interactive documents, and preserves checked pages. Catalogue, banner and measurement uploads remain image-only.

## Individual design selectors

Removed redundant full ?Official Style Guide? banners/modals from sleeve length, sleeve design, front neckline and back neckline selectors. Each option retains its own image, selection control, details and larger preview.

## Verification

- **336 client tests pass** across 33 files: artifacts/reference-upload-client-all.txt.
- **293 server tests pass**: artifacts/reference-files-server-all.txt.
- Client build, lint, server syntax/changed-file lint, translation audit and source-integrity checks pass.
- Production dependency audit including pdf-lib reports no known npm advisories.
- **37 actual-browser checks pass**, with **18 screenshots**: artifacts/reference-upload-browser-report.json.
- Browser coverage includes one combined PDF, mixed JPEG/PNG/PDF upload, review, explicit submission, MIME-correct signed PDF content, owner/admin quote galleries, individual preview open/close and banner removal.
- Upload/review/quote layouts render in English/Hindi at 1440, 390 and 320 pixels without page overflow.
- Browser verification discovered and fixed a missing WhatsApp icon import on the real order screen; a full order-rendering regression now covers configured support settings and a PDF attachment.
- Backend API checks cover cross-customer/unattached-file denial, reference retention through accepted quotes, historical catalogue media and account-erasure cleanup.

The browser uses disposable MongoDB, temporary test identities and a signed local media provider. No configured customer database, live provider, deployment or courier operation is involved.

## Deployment files

The server production dependencies now include pdf-lib. Keep server/src/reference-pdf-worker.js with the server package when deploying; the current Express service uses the server root, and the file is not excluded by .vercelignore. Existing environment and business rates are unchanged.
