import { test } from "node:test";
import assert from "node:assert/strict";
import { imageProvider } from "../src/imagekit.js";
import { loadConfig } from "../src/config.js";
const config = {
  IMAGEKIT_PRIVATE_KEY: "private_test_only",
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/test",
  IMAGEKIT_PRIVATE_POLICY_VERIFIED: "true",
};
function fakeClient({
  badPrivacy = false,
  badPath = false,
  getFails = false,
  removeFails = false,
  fileType = "image",
  mime,
} = {}) {
  let uploadBody,
    removed = 0;
  return {
    files: {
      async upload(body) {
        uploadBody = body;
        return { fileId: "test-id" };
      },
      async get() {
        if (getFails) throw new Error("Provider outage");
        return {
          fileId: "test-id",
          filePath: badPath
            ? "/unrelated/asset.webp"
            : uploadBody.folder + "/" + uploadBody.fileName,
          isPrivateFile: badPrivacy ? false : uploadBody.isPrivateFile,
          fileType,
          ...(mime ? { mime } : {}),
        };
      },
      async delete() {
        removed++;
        if (removeFails) throw new Error("Delete outage");
      },
    },
    helper: {
      buildSrc: ({ src, signed, expiresIn }) =>
        "https://ik.imagekit.io/test" +
        src +
        "?signed=" +
        signed +
        "&seconds=" +
        expiresIn,
    },
    get removed() {
      return removed;
    },
    get uploadBody() {
      return uploadBody;
    },
  };
}
test("media adapter fails closed when provider is not configured", async () => {
  const provider = imageProvider({});
  assert.throws(() => provider.url("/asset.webp"), {
    code: "MEDIA_UNAVAILABLE",
  });
  await assert.rejects(
    provider.upload(Buffer.from("image"), {
      private: true,
      purpose: "reference",
      owner: "owner",
    }),
    { code: "MEDIA_UNAVAILABLE" },
  );
});
test("private upload requires an explicitly verified provider privacy policy", async () => {
  const sdk = fakeClient();
  const provider = imageProvider(
    { ...config, IMAGEKIT_PRIVATE_POLICY_VERIFIED: "false" },
    sdk,
  );
  await assert.rejects(
    provider.upload(Buffer.from("image"), {
      private: true,
      purpose: "reference",
      owner: "owner",
    }),
    { code: "PRIVATE_MEDIA_UNVERIFIED" },
  );
  assert.equal(sdk.uploadBody, undefined);
});

test("malformed optional privacy settings disable private uploads before contacting ImageKit", async () => {
  for (const flag of ["", "TRUE", " true ", "1", "yes", true, null]) {
    const parsed = loadConfig({
      ...config,
      MONGODB_URI: "mongodb://localhost/isolated",
      CORS_ORIGINS: "https://example.test",
      JWT_SECRET: Buffer.alloc(48, 7).toString("base64url"),
      IMAGEKIT_PRIVATE_POLICY_VERIFIED: flag,
    });
    const sdk = fakeClient();
    assert.equal(parsed.IMAGEKIT_PRIVATE_POLICY_VERIFIED, "false");
    await assert.rejects(imageProvider(parsed, sdk).upload(Buffer.from("image"), {
      private: true, purpose: "reference", owner: "owner",
    }), { code: "PRIVATE_MEDIA_UNVERIFIED" });
    assert.equal(sdk.uploadBody, undefined);
  }
});
test("private upload forces privacy folder and verifies metadata from provider", async () => {
  const sdk = fakeClient();
  const provider = imageProvider(config, sdk);
  const data = await provider.upload(Buffer.from("image"), {
    private: true,
    purpose: "reference",
    owner: "owner",
  });
  assert.equal(sdk.uploadBody.isPrivateFile, true);
  assert.equal(sdk.uploadBody.folder, "/khwab/private/reference/owner");
  assert.match(data.filePath, /^\/khwab\/private\/reference\/owner\/.*\.webp$/);
});
test("provider privacy mismatch is rejected and uploaded file is compensated", async () => {
  const sdk = fakeClient({ badPrivacy: true });
  await assert.rejects(
    imageProvider(config, sdk).upload(Buffer.from("image"), {
      private: true,
      purpose: "reference",
      owner: "owner",
    }),
    { code: "MEDIA_PROVIDER_FAILURE" },
  );
  assert.equal(sdk.removed, 1);
});
test("provider unexpected path or metadata failure compensates rather than attaching arbitrary assets", async () => {
  for (const options of [{ badPath: true }, { getFails: true }]) {
    const sdk = fakeClient(options);
    await assert.rejects(
      imageProvider(config, sdk).upload(Buffer.from("image"), {
        private: true,
        purpose: "reference",
        owner: "owner",
      }),
      { code: "MEDIA_PROVIDER_FAILURE" },
    );
    assert.equal(sdk.removed, 1);
  }
});
test("compensation failure is explicitly reported for operator cleanup", async () => {
  const sdk = fakeClient({ badPrivacy: true, removeFails: true });
  await assert.rejects(
    imageProvider(config, sdk).upload(Buffer.from("image"), {
      private: true,
      purpose: "reference",
      owner: "owner",
    }),
    { code: "MEDIA_ORPHAN" },
  );
});
test("all media URLs request signatures and bounded expiry", () => {
  const provider = imageProvider(config, fakeClient());
  assert.match(
    provider.url("/public/image.webp", 300),
    /signed=true&seconds=300$/,
  );
});

test("private PDF storage uses a PDF name and verifies document MIME and privacy from provider metadata", async () => {
  const sdk = fakeClient({ fileType: "non-image", mime: "application/pdf" });
  const result = await imageProvider(config, sdk).upload(Buffer.from("%PDF-1.7"), { private: true, purpose: "reference", owner: "owner", mime: "application/pdf" });
  assert.ok(result.filePath.endsWith(".pdf")); assert.equal(sdk.uploadBody.isPrivateFile, true);
  assert.match(sdk.uploadBody.fileName, /^[a-f0-9-]+[.]pdf$/);
});
test("PDF provider mismatches are cleaned up and non-reference PDF storage fails before upload", async () => {
  for (const fields of [{ fileType: "non-image", mime: "text/html" }, { fileType: "non-image", mime: "application/pdf", badPrivacy: true }]) {
    const sdk = fakeClient(fields);
    await assert.rejects(imageProvider(config, sdk).upload(Buffer.from("pdf"), { private: true, purpose: "reference", owner: "owner", mime: "application/pdf" }), { code: "MEDIA_PROVIDER_FAILURE" });
    assert.equal(sdk.removed, 1);
  }
  const sdk = fakeClient();
  await assert.rejects(imageProvider(config, sdk).upload(Buffer.from("pdf"), { private: false, purpose: "catalogue", owner: "owner", mime: "application/pdf" }), { code: "PDF_REFERENCE_ONLY" });
  assert.equal(sdk.uploadBody, undefined);
});
