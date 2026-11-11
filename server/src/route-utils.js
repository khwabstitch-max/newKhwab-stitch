import { mediaUrl } from "./media-storage.js";
import { z } from "zod";
import { objectId, paginationInput } from "./domain.js";
import { fail, requireFound } from "./errors.js";
export const idOf = (req) => objectId.parse(req.params.id);
export const plain = (doc) => (doc?.toObject ? doc.toObject() : doc);
export const sameId = (a, b) => String(a || "") === String(b || "");
export function pageQuery(query, fields = {}) {
  return paginationInput.extend(fields).strict().parse(query);
}
export const pageResult = (items, total, { page, limit }) => ({
  data: items,
  pagination: { page, limit, total, pages: Math.ceil(total / limit) },
});
export const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function checkRevision(document, revision) {
  if (document.revision !== revision)
    fail(
      409,
      "REVISION_CONFLICT",
      "This record changed. Refresh it and try again.",
    );
}
export async function audit(
  ctx,
  req,
  action,
  resourceType,
  resourceId,
  session,
  metadata = {},
) {
  await ctx.models.AuditEvent.create(
    [
      {
        actor: req.user?._id,
        action,
        resourceType,
        resourceId: String(resourceId),
        requestId: req.id,
        metadata,
      },
    ],
    { session },
  );
}
export async function pinMedia(
  ctx,
  ids,
  session,
  { owner, private: privateFile, purposes },
) {
  for (const id of ids) {
    const filter = {
      _id: id,
      private: privateFile,
      purpose: { $in: purposes },
      deletingAt: null,
      ...(owner ? { owner } : {}),
    };
    const updated = await ctx.models.MediaAsset.updateOne(
      filter,
      { $inc: { references: 1 } },
      { session },
    );
    if (updated.modifiedCount !== 1)
      fail(
        400,
        "INVALID_MEDIA",
        "An image is unavailable or cannot be used for this purpose.",
      );
  }
}
export async function releaseMedia(ctx, ids, session) {
  for (const id of ids)
    await ctx.models.MediaAsset.updateOne(
      { _id: id, references: { $gt: 0 } },
      { $inc: { references: -1 } },
      { session },
    );
}
export async function changeCategory(ctx, oldId, newId, session) {
  if (sameId(oldId, newId)) return;
  if (newId) {
    const r = await ctx.models.Category.updateOne(
      { _id: newId, active: true },
      { $inc: { designRefs: 1 } },
      { session },
    );
    if (r.modifiedCount !== 1)
      fail(400, "INVALID_CATEGORY", "Choose an active category.");
  }
  if (oldId)
    await ctx.models.Category.updateOne(
      { _id: oldId, designRefs: { $gt: 0 } },
      { $inc: { designRefs: -1 } },
      { session },
    );
}
export async function publicDesign(ctx, document) {
  const d = plain(document);
  const assets = await ctx.models.MediaAsset.find({
    _id: { $in: d.mediaIds },
    private: false,
    deletingAt: null,
  }).lean();
  const byId = new Map(assets.map((a) => [String(a._id), a]));
  const images = d.mediaIds
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((a) => ({
      id: String(a._id),
      url: mediaUrl(ctx.images, a, 3600),
      width: a.width,
      height: a.height,
    }));
  const views = (d.imageViews || []).flatMap((view) => {
    const image = images.find((image) => image.id === String(view.mediaId));
    return image
      ? [
          {
            ...image,
            label: view.label,
            labelHi: view.labelHi || "",
            crop: view.crop || null,
          },
        ]
      : [];
  });
  const coverView =
    views.find((view) => view.id === String(d.coverMediaId)) ||
    views[0] ||
    null;
  return {
    _id: d._id,
    title: d.title,
    titleHi: d.titleHi || "",
    descriptionHi: d.descriptionHi || "",
    code: d.code,
    slug: d.slug,
    garment: d.garment,
    description: d.description,
    designDetails: d.designDetails || {},
    defaultComponents: d.defaultComponents || {},
    includedAddonIds: d.includedAddonIds || [],
    serviceNotes: d.serviceNotes || "",
    serviceNotesHi: d.serviceNotesHi || "",
    priceOptions: d.priceOptions || [],
    views,
    coverView,
    category: d.category,
    startingPricePaise: d.startingPricePaise,
    currency: "INR",
    images,
    coverImageUrl:
      images.find((a) => a.id === String(d.coverMediaId))?.url ||
      images[0]?.url ||
      null,
  };
}
export function safeOrder(document) {
  const o = plain(document);
  const { idempotencyKey: _key, requestHash: _hash, publicMediaPins: _pins, ...safe } = o;
  return safe;
}
export function safeMedia(document) {
  const {
    _id,
    purpose,
    storage,
    private: privateFile,
    mime,
    bytes,
    width,
    height,
    createdAt,
    references,
    deletingAt,
  } = plain(document);
  return {
    _id,
    purpose,
    storage,
    private: privateFile,
    mime,
    bytes,
    width,
    height,
    createdAt,
    references,
    deleting: !!deletingAt,
  };
}
export const searchField = z.string().trim().max(100).optional();
export async function ownedOrder(ctx, req, session) {
  return requireFound(
    await ctx.models.Order.findOne({
      _id: idOf(req),
      ...(req.user.role === "admin" ? {} : { owner: req.user._id }),
    }).session(session || null),
    "Request not found.",
  );
}
