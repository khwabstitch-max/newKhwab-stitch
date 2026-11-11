import { randomUUID } from "node:crypto";
import ImageKit from "@imagekit/nodejs";
import { AppError, fail } from "./errors.js";
export function imageProvider(config, clientOverride) {
  const key = config.IMAGEKIT_PRIVATE_KEY;
  const endpoint = config.IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
  const client =
    clientOverride ||
    (key && endpoint
      ? new ImageKit({
          privateKey: key,
          maxRetries: 0,
          timeout: 15000,
          logLevel: "off",
        })
      : null);
  const ready = () => {
    if (!client)
      fail(503, "MEDIA_UNAVAILABLE", "Image storage is not configured.");
  };
  const encode = (path) =>
    path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  return {
    async upload(buffer, { private: privateFile, purpose, owner }) {
      ready();
      if (privateFile && config.IMAGEKIT_PRIVATE_POLICY_VERIFIED !== "true")
        fail(
          503,
          "PRIVATE_MEDIA_UNVERIFIED",
          "Private image storage has not been verified by the operator.",
        );
      const folder =
        "/khwab/" +
        (privateFile ? "private" : "public") +
        "/" +
        purpose +
        "/" +
        owner;
      let uploaded;
      try {
        uploaded = await client.files.upload({
          file: buffer.toString("base64"),
          fileName: randomUUID() + ".webp",
          folder,
          isPrivateFile: privateFile,
          useUniqueFileName: true,
        });
        // Re-read provider metadata; never trust a client-supplied URL or file ID.
        const checked = await client.files.get(uploaded.fileId);
        if (
          checked.fileId !== uploaded.fileId ||
          typeof checked.filePath !== "string" ||
          !checked.filePath.startsWith(folder + "/") ||
          checked.isPrivateFile !== privateFile ||
          checked.fileType !== "image"
        )
          throw new Error("Unexpected upload metadata");
        return { fileId: checked.fileId, filePath: checked.filePath };
      } catch (err) {
        if (uploaded?.fileId) {
          try {
            await client.files.delete(uploaded.fileId);
          } catch {
            throw new AppError(
              503,
              "MEDIA_ORPHAN",
              "Upload failed and cleanup requires operator review.",
            );
          }
        }
        if (err instanceof AppError) throw err;
        throw new AppError(
          503,
          "MEDIA_PROVIDER_FAILURE",
          "Image storage is temporarily unavailable.",
        );
      }
    },
    async remove(fileId) {
      ready();
      try {
        await client.files.delete(fileId);
      } catch (err) {
        if (err.status !== 404)
          throw new AppError(
            503,
            "MEDIA_PROVIDER_FAILURE",
            "Could not remove the stored image.",
          );
      }
    },
    url(filePath, expiresIn = 300) {
      ready();
      return client.helper.buildSrc({
        urlEndpoint: endpoint,
        src: encode(filePath),
        signed: true,
        expiresIn,
      });
    },
  };
}
