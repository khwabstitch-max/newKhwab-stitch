const kinds = new Map([
  ["neck", "neck"], ["frontneck", "neck"], ["neckfront", "neck"],
  ["back", "back"], ["backneck", "back"], ["neckback", "back"],
  ["sleeve", "sleeve"], ["sleevedesign", "sleeve"], ["sleevedesigns", "sleeve"],
  ["sleevelength", "sleeveLength"], ["fit", "fit"],
  ["extra", "extra"], ["addon", "extra"], ["addons", "extra"],
]);
const garments = new Set(["kurti", "blouse", "suit", "alteration"]);
const token = value => typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";

// Legacy active records did not carry a status. Preserve that established
// behavior, but never treat unknown or explicitly unpublished statuses as live.
export const isPublishedOptionRecord = option => Boolean(option?.active === true && (option.status == null || option.status === "published"));

export function publicOptionFilter({ garment, kind } = {}) {
  return {
    active: true,
    status: { $in: ["published", null] },
    $or: [{ kind: { $ne: "extra" } }, { serviceType: "stitching" }, { serviceType: { $exists: false } }],
    ...(garment ? { garments: garment } : {}),
    ...(kind ? { kind } : {}),
  };
}

// An explicit owner-reviewed migration may normalize known spellings; it never
// invents applicability, compatibility, prices, or a publication decision.
export function planOptionRepair(record) {
  const changes = {}, review = [];
  const kind = kinds.get(token(record.kind));
  if (!kind) review.push("Unknown option kind: choose a canonical section manually.");
  else if (record.kind !== kind) changes.kind = kind;
  if (record.status != null) {
    const status = typeof record.status === "string" ? record.status.trim().toLowerCase() : "";
    if (["draft", "published", "archived"].includes(status)) {
      if (status !== record.status) changes.status = status;
    } else review.push("Unknown publication status remains unavailable; review it manually.");
  }
  if (record.active !== true && record.active !== false) review.push("Active status is missing or invalid; no automatic activation.");
  const source = typeof record.garments === "string" ? [record.garments] : record.garments;
  if (!Array.isArray(source) || !source.length) review.push("Applicable garments need administrator confirmation.");
  else {
    const normalized = [...new Set(source.map(token))];
    if (normalized.every(value => garments.has(value))) {
      if (JSON.stringify(record.garments) !== JSON.stringify(normalized)) changes.garments = normalized;
    } else review.push("Unknown garment names remain unchanged; no suitability is assumed.");
  }
  if (kind === "sleeve" && !record.compatibleLengthStyles?.length) review.push("Sleeve/length compatibility needs administrator confirmation.");
  if (kind === "sleeveLength") {
    if (record.priceMode !== "included") changes.priceMode = "included";
    if (record.amountPaise !== 0) changes.amountPaise = 0;
    if (record.replacementAdjustmentPaise !== 0) changes.replacementAdjustmentPaise = 0;
  }
  return { id: String(record._id || ""), revision: record.revision, changes, review };
}
