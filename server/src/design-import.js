import { createHash, randomUUID } from "node:crypto";
import { TEAL_BOARD } from "./media-storage.js";
import sharp from "sharp";
import mongoose from "mongoose";
import { designInput } from "./domain.js";
import { fail } from "./errors.js";

// Operator import for one explicitly supplied design board. Existing designs are never overwritten.
export async function importDesignBoard(
  ctx,
  { template, buffer, ownerEmail, publish = false, bundled = false },
) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 5 * 1024 * 1024)
    fail(400, "INVALID_IMAGE", "Choose an image smaller than 5 MiB.");
  if (
    bundled &&
    createHash("sha256").update(buffer).digest("hex") !== TEAL_BOARD.sha256
  )
    fail(
      400,
      "INVALID_BUNDLED_MEDIA",
      "The bundled preset must use the included original design board.",
    );
  const mediaId = new mongoose.Types.ObjectId();
  const source = template.design;
  const fields = designInput.parse({
    ...source,
    mediaIds: [String(mediaId)],
    coverMediaId: String(mediaId),
    imageViews: (source.imageViews || []).map((view) => ({
      ...view,
      mediaId: String(mediaId),
    })),
    status: publish ? "published" : "draft",
  });
  const existing = await ctx.models.Design.findOne({ code: fields.code });
  if (existing) return { created: false, design: existing };
  const admins = await ctx.models.User.find({
    role: "admin",
    disabled: false,
    ...(ownerEmail ? { email: ownerEmail.trim().toLowerCase() } : {}),
  }).limit(2);
  if (admins.length !== 1)
    fail(
      409,
      "ADMIN_REQUIRED",
      "Choose one existing active administrator as the image owner.",
    );
  const owner = admins[0];
  let data, info;
  try {
    const image = sharp(buffer, {
      limitInputPixels: 24_000_000,
      animated: false,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !["png", "jpeg", "webp"].includes(metadata.format) ||
      (metadata.pages || 1) > 1
    )
      fail(400, "INVALID_IMAGE", "Use a single JPEG, PNG or WebP image.");
    ({ data, info } = await image
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true }));
  } catch (error) {
    if (error.status) throw error;
    fail(
      400,
      "INVALID_IMAGE",
      "The file could not be decoded as a safe image.",
    );
  }
  const uploaded = bundled
    ? {
        fileId: "bundled-teal-import-" + randomUUID(),
        filePath: TEAL_BOARD.path,
        storage: "bundled",
      }
    : await ctx.images.upload(data, {
        private: false,
        purpose: "catalogue",
        owner: String(owner._id),
      });
  let created;
  try {
    created = await ctx.transaction(async (session) => {
      const active = await ctx.models.User.updateOne(
        { _id: owner._id, role: "admin", disabled: false },
        { $inc: { mutationFence: 1 } },
        { session },
      );
      if (active.modifiedCount !== 1)
        fail(403, "FORBIDDEN", "The administrator account is unavailable.");
      // Imported boards start without categories; category references are managed by the normal editor.
      if (fields.category)
        fail(
          400,
          "INVALID_CATEGORY",
          "Choose a category in the admin editor after importing.",
        );
      await ctx.models.MediaAsset.create(
        [
          {
            _id: mediaId,
            owner: owner._id,
            ...uploaded,
            purpose: "catalogue",
            private: false,
            mime: bundled ? "image/png" : "image/webp",
            bytes: bundled ? buffer.length : data.length,
            width: info.width,
            height: info.height,
            references: 1,
          },
        ],
        { session },
      );
      const [design] = await ctx.models.Design.create([fields], { session });
      await ctx.models.AuditEvent.create(
        [
          {
            actor: owner._id,
            action: "design.imported",
            resourceType: "design",
            resourceId: String(design._id),
            metadata: {
              source: "operator-design-import",
              status: fields.status,
            },
          },
        ],
        { session },
      );
      return design;
    });
  } catch (error) {
    try {
      if (!bundled) await ctx.images.remove(uploaded.fileId);
    } catch {
      fail(
        503,
        "MEDIA_ORPHAN",
        "Import failed and image cleanup requires operator review.",
      );
    }
    if (error.code === 11000) {
      const record = await ctx.models.Design.findOne({ code: fields.code });
      if (record) return { created: false, design: record };
    }
    throw error;
  }
  return { created: true, design: created };
}
