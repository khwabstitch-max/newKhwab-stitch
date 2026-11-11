import { z } from "zod";
import { objectId } from "./domain.js";
import { fail } from "./errors.js";

const uniqueIds = (values, limit) => [...new Set(z.array(objectId).max(limit).parse(values).map(id => id.toLowerCase()))];
export function draftReferenceIds(data) {
  return {
    optionIds: uniqueIds([
      ...Object.values(data?.configuration?.components || {}).map(component => component?.optionId).filter(Boolean),
      ...(Array.isArray(data?.configuration?.addonIds) ? data.configuration.addonIds : []),
    ], 50),
    guideIds: uniqueIds(Array.isArray(data?.measurements?.guideIds) ? data.measurements.guideIds : [], 5),
  };
}

// A new referencing record and permanent deletion must write the same target.
// This turns a snapshot-isolation write skew into a transaction retry. Unchanged
// stale IDs are retained in incomplete drafts so the customer can repair them.
export async function fenceNewReferences(ctx, next, previous = {}, session = null) {
  for (const [Model, key, code, label] of [
    [ctx.models.DesignOption, "optionIds", "OPTION_CHANGED", "design option"],
    [ctx.models.MeasurementGuide, "guideIds", "GUIDE_CHANGED", "measurement guide"],
  ]) {
    const before = new Set((previous[key] || []).map(id => String(id).toLowerCase()));
    const added = uniqueIds(next[key] || [], key === "guideIds" ? 5 : 100).filter(id => !before.has(id));
    for (const id of added) {
      const changed = await Model.updateOne({ _id: id }, { $inc: { referenceFence: 1 } }, { session });
      if (changed.modifiedCount !== 1) fail(409, code, `A newly selected ${label} is no longer available. Keep your other choices and select an available replacement before saving.`);
    }
  }
}

export function snapshotMeasurementGuide(guide, images = []) {
  const ids = [...new Set((guide.imageMediaIds || []).map(String))];
  const byId = new Map(images.map(image => [String(image._id), image]));
  return {
    guideId: String(guide._id), code: guide.code, revision: guide.revision || 0,
    name: guide.name, nameHi: guide.nameHi || "", garment: guide.garment,
    method: guide.method, language: guide.language, instructions: guide.instructions || "",
    instructionsHi: guide.instructionsHi || "", measurementFields: [...(guide.measurementFields || [])],
    imageMediaIds: ids,
    images: ids.map(id => ({ mediaId: id, ...(byId.has(id) ? { width: byId.get(id).width, height: byId.get(id).height } : {}) })),
  };
}

export function orderPublicMediaPins(order) {
  const unique = ids => [...new Set(ids.filter(Boolean).map(String))];
  if (order.publicMediaPins) return {
    optionImages: unique(order.publicMediaPins.optionImages || []),
    guideImages: unique(order.publicMediaPins.guideImages || []),
  };
  return {
    optionImages: unique([...Object.values(order.estimate?.components || {}), ...(order.estimate?.addons || [])].flatMap(component => component.imageMediaIds || [])),
    guideImages: unique((order.guideSnapshots || []).flatMap(guide => guide.imageMediaIds || [])),
  };
}
