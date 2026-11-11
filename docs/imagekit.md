# Image uploads, delivery and serverless payloads

The existing authenticated `/api/media` proxy and ImageKit adapter remain the only application upload flow. This change does not expose provider credentials, add a second upload system, enable private uploads automatically or claim a live provider check.

## Upload path

1. Every customer/admin image picker calls `client/src/lib/media.js`. Request references, conversation attachments, tailor portfolio examples, design images, media-library images and component/guide catalogue images share this helper.
2. The helper accepts source JPEG/PNG/WebP files up to 5 MiB. It inspects actual image headers and rejects images above24 megapixels before allocating a bitmap/canvas. This preliminary check is not a substitute for complete server decoding.
3. Files at or below3 MiB keep their original bytes. Larger accepted sources are decoded in the browser, resized within 2400 pixels without upscaling and encoded with bounded quality/dimension attempts until the prepared file fits3 MiB. Unsupported/failed decoding or output that cannot meet the budget produces a clear error before sending a request. The original `File` and source on disk are unchanged.
4. The prepared image travels as authenticated multipart data to the same application endpoint. The3 MiB file budget leaves room for multipart overhead below the Vercel request-body limit. It is not a promise that every arbitrary5 MiB photograph can be reduced successfully.
5. `server/src/routes-media.js` uses a3 MiB file limit when `ctx.config.SERVERLESS` is true and preserves the5 MiB standalone limit otherwise. The serverless adapter must preserve the raw multipart body. Upload limits, authentication, two-operation processing gate and daily quotas run before provider persistence.
6. The backend fully decodes actual bytes with Sharp, bounds pixels, rejects unsupported/multiple-frame inputs, applies orientation and resizes/re-encodes WebP without embedded source metadata. Caller filenames/MIME are not trusted as proof of image type.
7. The server selects owner, purpose, folder and privacy. `reference`/`measurement` uploads are private; `catalogue`/`banner` uploads require administrator access. Browser-supplied provider IDs, delivery URLs or privacy flags cannot select another owner or turn a customer image public.

Bitmap handles, fallback object URLs and canvas backing storage are released on success and encoding failure. Browser preparation is a payload adaptation, not a security boundary; full decoding and privacy decisions stay on the server.

## Provider and delivery boundaries

`server/src/imagekit.js` owns the backend-only ImageKit private key, folder construction, unique names, upload timeout and metadata re-read. Uploaded metadata must match the expected provider ID, exact folder boundary, image type and private flag. A mismatch or provider error rejects the upload and attempts compensation. Media database creation and audit occur transactionally; failed persistence attempts provider deletion rather than reporting a successful attachment.

Private uploads remain fail-closed unless the existing operator-verified private-policy gate is enabled. Required account-side denial of unsigned originals/named transformations, signed-link expiry and owner/other-account checks must be verified separately. A private key being present is not proof of delivery privacy. No such configuration or external account was inspected in this work.

Direct owner/admin access returns bounded short-lived signed URLs with private/no-store caching; support/worker attachment access uses its existing context-specific authorization. Public approved catalogue images remain separate from private references. The current provider URL helper and safe database projections are retained.

## Why the proxy remains

A generic reusable V1 browser-upload signature is not a replacement for the application's server-enforced folder/privacy/ownership decision. Direct uploads would require demonstrably bound security parameters, short expiry, file/pixel quotas, authorization, verified provider metadata and transactional finalization before attaching an asset. This implementation keeps those decisions in the established proxy instead of allowing caller-controlled privacy/folder fields.

An ImageKit V2 direct-upload design could be reviewed separately if its supported contract can enforce every required binding and has integration/failure tests. No new V2/beta flow or unverifiable provider capability is shipped or advertised here.

## Failure handling and operations

- An oversized unprepared serverless upload returns413/`IMAGE_PAYLOAD_TOO_LARGE`; it does not invoke the provider.
- Invalid actual image bytes return400 even when a filename/MIME claims PNG/JPEG. Public upload attempts by a customer remain403; missing authentication remains401.
- The client never automatically repeats a failed upload. Failed preparation sends no network request. Failed persistence attempts provider compensation; failed compensation is recorded for operator reconciliation.
- An uploaded but never attached asset can remain unreferenced. The existing reviewed media-cleanup process handles sufficiently old eligible assets; browser preparation does not delete customer originals or attached provider assets.

## Current verification

`client/src/test/media.test.js` covers source/payload/pixel limits, actual headers, no upscaling, bounded encoding failure, bitmap/canvas/object-URL cleanup and reuse of the authenticated API. Browser codecs/canvas are mocked in these unit tests; they do not prove real-device visual quality.

`server/tests/media-payload.test.js` uses actual multipart requests and Sharp with a database/provider fixture. It verifies the3 MiB serverless cap, unchanged standalone limit, MIME-spoof rejection, real-byte re-encoding, forced private ownership, admin-only public uploads and provider compensation after failed persistence. Existing `imagekit.test.js` verifies policy gates, metadata/privacy mismatches and compensation failures with an SDK fixture. No production credentials, environment files, external network calls or real provider uploads are used.
