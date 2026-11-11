import {
  bundledBoardFields,
  mediaUrl,
  removeStoredMedia,
} from "./media-storage.js";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { AppError, fail, requireFound } from "./errors.js";
import {
  idOf,
  pageQuery,
  pageResult,
  safeMedia,
  audit,
} from "./route-utils.js";
export function mediaRoutes(app, ctx, auth, uploadLimit) {
  const { models } = ctx;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: (ctx.config.SERVERLESS ? 3 : 5) * 1024 * 1024, files: 1, fields: 1, parts: 2 },
  }).single("file");
  const receiveImage = (req, res, next) => upload(req, res, error => {
    if (ctx.config.SERVERLESS && error?.code === "LIMIT_FILE_SIZE")
      return next(new AppError(413, "IMAGE_PAYLOAD_TOO_LARGE", "The prepared upload must be at most 3 MiB. Use the app's image picker to prepare a larger source image."));
    next(error);
  });
  let activeUploads = 0;
  const uploadGate = (_req, res, next) => {
    if (activeUploads >= 2)
      fail(
        429,
        "UPLOAD_BUSY",
        "Image processing is busy. Please try again shortly.",
      );
    activeUploads++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeUploads--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
  app.get("/api/media", auth, async (req, res) => {
    const q = pageQuery(req.query, {
      purpose: z
        .enum(["reference", "measurement", "catalogue", "banner"])
        .optional(),
    });
    const filter = {
      ...(req.user.role === "admin" ? {} : { owner: req.user._id }),
      ...(q.purpose ? { purpose: q.purpose } : {}),
    };
    const [items, total] = await Promise.all([
      models.MediaAsset.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.MediaAsset.countDocuments(filter),
    ]);
    res.json(pageResult(items.map(safeMedia), total, q));
  });
  app.post(
    "/api/media/presets/teal-kurti",
    auth,
    uploadLimit,
    async (req, res) => {
      if (req.user.role !== "admin")
        fail(403, "FORBIDDEN", "Only administrators may upload public images.");
      z.object({})
        .strict()
        .parse(req.body || {});
      const fields = bundledBoardFields(req.user._id);
      const asset = await ctx.transaction(async (session) => {
        const account = await models.User.updateOne(
          { _id: req.user._id, role: "admin", disabled: false },
          { $inc: { mutationFence: 1 } },
          { session },
        );
        if (account.modifiedCount !== 1)
          fail(403, "FORBIDDEN", "This account is unavailable.");
        const existing = await models.MediaAsset.findOne({
          fileId: fields.fileId,
        }).session(session);
        if (existing) {
          if (existing.deletingAt)
            fail(
              409,
              "MEDIA_BUSY",
              "This image is being deleted. Please retry.",
            );
          return existing;
        }
        const [created] = await models.MediaAsset.create(
          [{ ...fields, references: 0 }],
          { session },
        );
        await audit(
          ctx,
          req,
          "media.preset_attached",
          "media",
          created._id,
          session,
          { preset: "teal-kurti" },
        );
        return created;
      });
      res.json({ data: safeMedia(asset) });
    },
  );
  app.post(
    "/api/media",
    auth,
    uploadLimit,
    uploadGate,
    receiveImage,
    async (req, res) => {
      const body = z
        .object({
          purpose: z.enum(["reference", "measurement", "catalogue", "banner"]),
        })
        .strict()
        .parse(req.body);
      const privateFile = ["reference", "measurement"].includes(body.purpose);
      if (!privateFile && req.user.role !== "admin")
        fail(403, "FORBIDDEN", "Only administrators may upload public images.");
      if (!req.file) fail(400, "IMAGE_REQUIRED", "Choose an image to upload.");
      let buffer, info;
      try {
        const input = sharp(req.file.buffer, {
          limitInputPixels: 24_000_000,
          animated: false,
          failOn: "warning",
        });
        const meta = await input.metadata();
        if (
          !["jpeg", "png", "webp"].includes(meta.format) ||
          (meta.pages || 1) > 1
        )
          fail(400, "INVALID_IMAGE", "Use a single JPEG, PNG or WebP image.");
        ({ data: buffer, info } = await input
          .rotate()
          .resize({
            width: 2400,
            height: 2400,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer({ resolveWithObject: true }));
      } catch (err) {
        if (err.status) throw err;
        fail(
          400,
          "INVALID_IMAGE",
          "The file could not be decoded as a safe image.",
        );
      }
      const today = new Date().toISOString().slice(0, 10);
      await models.User.updateOne(
        { _id: req.user._id, uploadDay: { $ne: today } },
        { $set: { uploadDay: today, uploadCount: 0 } },
      );
      const reserved = await models.User.updateOne(
        {
          _id: req.user._id,
          disabled: false,
          uploadDay: today,
          uploadCount: { $lt: req.user.role === "admin" ? 100 : 20 },
        },
        { $inc: { uploadCount: 1 } },
      );
      if (reserved.modifiedCount !== 1)
        fail(
          429,
          "UPLOAD_QUOTA",
          "Your daily image upload limit has been reached.",
        );
      const stored = await ctx.images.upload(buffer, {
        private: privateFile,
        purpose: body.purpose,
        owner: String(req.user._id),
      });
      let asset;
      try {
        asset = await ctx.transaction(async (session) => {
          const account = await models.User.updateOne(
            { _id: req.user._id, disabled: false },
            { $inc: { mutationFence: 1 } },
            { session },
          );
          if (account.modifiedCount !== 1)
            fail(403, "ACCOUNT_DISABLED", "This account is unavailable.");
          const [created] = await models.MediaAsset.create(
            [
              {
                owner: req.user._id,
                ...stored,
                purpose: body.purpose,
                private: privateFile,
                mime: "image/webp",
                bytes: buffer.length,
                width: info.width,
                height: info.height,
              },
            ],
            { session },
          );
          await audit(
            ctx,
            req,
            "media.uploaded",
            "media",
            created._id,
            session,
            { purpose: body.purpose },
          );
          return created;
        });
      } catch (err) {
        try {
          await ctx.images.remove(stored.fileId);
        } catch {
          req.log.error(
            { requestId: req.id, providerFileId: stored.fileId },
            "Orphaned image requires operator cleanup",
          );
        }
        throw err;
      }
      res.status(201).json({ data: safeMedia(asset) });
    },
  );
  app.get("/api/media/:id/access", auth, async (req, res) => {
    z.object({}).strict().parse(req.query);
    const asset = requireFound(
      await models.MediaAsset.findOne({
        _id: idOf(req),
        deletingAt: null,
        ...(req.user.role === "admin" ? {} : { owner: req.user._id }),
      }),
      "Image not found.",
    );
    res.set("Cache-Control", "private, no-store");
    res.json({
      data: {
        url: mediaUrl(ctx.images, asset, 300),
        width: asset.width,
        height: asset.height,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      },
    });
  });
  app.delete("/api/media/:id", auth, async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    const id = idOf(req);
    const filter = {
      _id: id,
      ...(req.user.role === "admin" ? {} : { owner: req.user._id }),
    };
    const existing = requireFound(
      await models.MediaAsset.findOne(filter),
      "Image not found.",
    );
    if (existing.references > 0)
      fail(
        409,
        "MEDIA_REFERENCED",
        "This image is in use and cannot be deleted.",
      );
    const reserved = await models.MediaAsset.findOneAndUpdate(
      {
        ...filter,
        references: 0,
        $or: [
          { deletingAt: null },
          { deletingAt: { $lt: new Date(Date.now() - 60000) } },
        ],
      },
      { $set: { deletingAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!reserved)
      fail(
        409,
        "MEDIA_BUSY",
        "This image changed or is already being deleted. Please refresh.",
      );
    try {
      await removeStoredMedia(ctx.images, reserved);
    } catch (err) {
      await models.MediaAsset.updateOne(
        { _id: id },
        { $unset: { deletingAt: 1 } },
      );
      throw err;
    }
    await ctx.transaction(async (session) => {
      await models.MediaAsset.deleteOne(
        { _id: id, references: 0, deletingAt: { $ne: null } },
        { session },
      );
      await audit(ctx, req, "media.deleted", "media", id, session);
    });
    res.json({ data: { deleted: true } });
  });
}
