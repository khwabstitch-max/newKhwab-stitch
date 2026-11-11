import { z } from "zod";
import { imageIds } from "./visual-catalogue.js";
import { publicOptionFilter } from "./option-maintenance.js";
import { mediaUrl } from "./media-storage.js";
import { GARMENTS, defaultSettings, profileInput } from "./domain.js";
import { requireFound } from "./errors.js";
import { userProfile as profile } from "./auth.js";
import {
  pageQuery,
  pageResult,
  publicDesign,
  escaped,
  searchField,
  audit,
  idOf,
} from "./route-utils.js";
export function publicRoutes(app, ctx, auth) {
  const { models } = ctx;
  app.get("/api/designs", async (req, res) => {
    const q = pageQuery(req.query, {
      garment: z.enum(GARMENTS).optional(),
      category: z
        .string()
        .regex(/^[a-f\d]{24}$/i)
        .optional(),
      search: searchField,
      sort: z
        .enum(["recent", "price_asc", "price_desc", "title"])
        .default("recent"),
    });
    const filter = {
      status: "published",
      ...(q.garment ? { garment: q.garment } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.search
        ? {
            $or: ["title", "titleHi", "code"].map((field) => ({
              [field]: { $regex: escaped(q.search), $options: "i" },
            })),
          }
        : {}),
    };
    const sort = {
      recent: { createdAt: -1, _id: -1 },
      price_asc: { startingPricePaise: 1, _id: 1 },
      price_desc: { startingPricePaise: -1, _id: -1 },
      title: { title: 1, _id: 1 },
    }[q.sort];
    const [items, total] = await Promise.all([
      models.Design.find(filter)
        .sort(sort)
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.Design.countDocuments(filter),
    ]);
    res.json(
      pageResult(
        await Promise.all(items.map((d) => publicDesign(ctx, d))),
        total,
        q,
      ),
    );
  });
  app.get("/api/designs/:slug", async (req, res) => {
    const slug = z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100)
      .parse(req.params.slug);
    const d = requireFound(
      await models.Design.findOne({ slug, status: "published" }).lean(),
      "Design not found.",
    );
    res.json({ data: await publicDesign(ctx, d) });
  });
  app.get("/api/designs/id/:id", async (req, res) => {
    const design = requireFound(
      await models.Design.findOne({
        _id: idOf(req),
        status: "published",
      }).lean(),
      "Design not found.",
    );
    res.json({ data: await publicDesign(ctx, design) });
  });
  app.get("/api/categories", async (req, res) => {
    const q = pageQuery(req.query);
    const filter = { active: true };
    const [items, total] = await Promise.all([
      models.Category.find(filter)
        .select("_id name nameHi slug")
        .sort({ name: 1, _id: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.Category.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q));
  });
  app.get("/api/options", async (req, res) => {
    const q = pageQuery(req.query, {
      garment: z.enum(GARMENTS).optional(),
      kind: z.enum(["neck", "sleeve", "sleeveLength", "back", "fit", "extra"]).optional(),
    });
    const filter = publicOptionFilter(q);
    const [items, total] = await Promise.all([
      models.DesignOption.find(filter)
        .select(
          "_id code name nameHi kind garments description descriptionHi imageMediaId imageMediaIds imageAlt imageAltHi priceMode amountPaise replacementAdjustmentPaise measurementFields sleeveStyle lengthStyle compatibleLengthStyles incompatibleOptionIds materialCoverage materialNotes serviceType displayOrder status revision",
        )
        .sort({ kind: 1, displayOrder: 1, name: 1, _id: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.DesignOption.countDocuments(filter),
    ]);
    const assets = await models.MediaAsset.find({
      _id: { $in: [...new Set(items.flatMap(imageIds))] },
      private: false,
      deletingAt: null,
      purpose: "catalogue",
    }).lean();
    const assetMap = new Map(assets.map((asset) => [String(asset._id), asset]));
    res.json(
      pageResult(
        items.map((item) => {
          const images = imageIds(item).filter(id => assetMap.has(id)).map(id => {
            const asset = assetMap.get(id);
            return { id, url: mediaUrl(ctx.images, asset, 3600), alt: item.imageAlt || item.name, width: asset.width, height: asset.height };
          });
          return {
          ...item,
          imageUrl: images[0]?.url || null,
          images,
          priceMode: item.kind === "sleeveLength" ? "included" : item.priceMode || "pending",
          ...(item.kind === "sleeveLength" ? { amountPaise: 0, replacementAdjustmentPaise: 0 } : {}),
        }; }),
        total,
        q,
      ),
    );
  });
  app.get("/api/settings", async (_req, res) => {
    const s =
      (await models.SiteSettings.findOne({ key: "main" }).lean()) ||
      defaultSettings;
    const {
      key: _key,
      revision: _revision,
      _id: _id,
      createdAt: _created,
      updatedAt: _updated,
      ...safe
    } = s;
    let bannerImageUrl = null;
    if (s.bannerMediaId) {
      const asset = await models.MediaAsset.findOne({
        _id: s.bannerMediaId,
        private: false,
        deletingAt: null,
      });
      if (asset) bannerImageUrl = ctx.images.url(asset.filePath, 3600);
    }
    res.json({ data: { ...safe, bannerImageUrl } });
  });
  app.get("/api/me", auth, async (req, res) => {
    const identity = models.AccountIdentity
      ? await models.AccountIdentity.findOne({ owner: req.user._id }).lean()
      : null;
    res.json({
      data: {
        ...profile(req.user),
        emailVerified: Boolean(identity?.emailVerifiedAt),
      },
    });
  });
  app.patch("/api/me", auth, async (req, res) => {
    const body = profileInput.parse(req.body);
    const user = await models.User.findOneAndUpdate(
      { _id: req.user._id, disabled: false },
      { $set: body },
      { returnDocument: "after", runValidators: true },
    );
    res.json({
      data: {
        ...profile(requireFound(user, "This account is unavailable.")),
        emailVerified: Boolean(
          (await models.AccountIdentity.findOne({ owner: req.user._id }).lean())
            ?.emailVerifiedAt,
        ),
      },
    });
  });
  app.post("/api/me/deletion-request", auth, async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    const user = await ctx.transaction(async (session) => {
      const updated = await models.User.findOneAndUpdate(
        { _id: req.user._id, deletionRequestedAt: null },
        { $set: { deletionRequestedAt: new Date() } },
        { returnDocument: "after", session },
      );
      if (updated)
        await audit(
          ctx,
          req,
          "account.deletion_requested",
          "user",
          req.user._id,
          session,
        );
      return updated || req.user;
    });
    res.status(202).json({
      data: {
        requestedAt: user.deletionRequestedAt,
        message:
          "Your request has been recorded. The atelier will review active orders and contact you about deletion and any necessary retention.",
      },
    });
  });
}
