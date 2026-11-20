import { fail } from "./errors.js";

export const DESIGN_CODE_PREFIXES = Object.freeze({ kurti: "K", suit: "KS", blouse: "B", alteration: "A" });
export const OPTION_CODE_PREFIXES = Object.freeze({ sleeve: "SD", sleeveLength: "SL", neck: "FN", back: "BN", fit: "FT", extra: "AD" });
const initialization = new WeakMap();

export function catalogueCodePrefix(type, fields) {
  const prefix = (type === "design" ? DESIGN_CODE_PREFIXES[fields.garment] : OPTION_CODE_PREFIXES[fields.kind]);
  if (!prefix) fail(400, "INVALID_CATALOGUE_TYPE", "Choose a supported garment or design option type.");
  return prefix;
}
export function catalogueCodeNumber(code, prefix) {
  const match = new RegExp("^" + prefix + "-(0|[1-9]\\d*)$").exec(String(code || ""));
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) ? number : null;
}
export async function prepareCatalogueCodes(models) {
  const Counter = models.CatalogueCodeSequence;
  if (!Counter) throw new Error("Catalogue code sequence model is unavailable.");
  if (!initialization.has(Counter)) {
    const ready = (async () => {
      await Counter.createCollection();
      const keys = [
        ...Object.values(DESIGN_CODE_PREFIXES).map(prefix => "design:" + prefix),
        ...Object.values(OPTION_CODE_PREFIXES).map(prefix => "option:" + prefix),
      ];
      try {
        await Counter.bulkWrite(keys.map(key => ({
          updateOne: { filter: { _id: key }, update: { $setOnInsert: { value: 0 } }, upsert: true },
        })), { ordered: false });
      } catch (error) {
        // A second process may initialize the same unique counter IDs.
        if (error.code !== 11000 || await Counter.countDocuments({ _id: { $in: keys } }) !== keys.length) throw error;
      }
    })().catch(error => {
      initialization.delete(Counter);
      throw error;
    });
    initialization.set(Counter, ready);
  }
  await initialization.get(Counter);
}
export async function allocateCatalogueCode(models, type, fields, session) {
  const prefix = catalogueCodePrefix(type, fields);
  const Model = type === "design" ? models.Design : models.DesignOption;
  const records = await Model.find({ code: { $regex: "^" + prefix + "-(0|[1-9]\\d*)$" } }).select("code").session(session || null).lean();
  const floor = records.reduce((max, record) => Math.max(max, catalogueCodeNumber(record.code, prefix) ?? -1), -1) + 1;
  const key = type + ":" + prefix;
  // The counter retains reservations even when an unused record is deleted.
  // Existing canonical codes establish a floor when upgrading a catalogue.
  await models.CatalogueCodeSequence.updateOne({ _id: key }, { $max: { value: floor } }, { upsert: true, session });
  const reserved = await models.CatalogueCodeSequence.findOneAndUpdate({ _id: key }, { $inc: { value: 1 } }, { returnDocument: "after", session });
  const number = reserved.value - 1;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("Catalogue code sequence exhausted.");
  return prefix + "-" + number;
}
export function assertCatalogueIdentity(current, fields, type) {
  if (fields.code !== undefined && fields.code !== current.code)
    fail(409, "CATALOGUE_CODE_IMMUTABLE", "This code identifies an existing record and cannot be changed. Create a new record for a different design.");
  const key = type === "design" ? "garment" : "kind";
  if (fields[key] !== undefined && fields[key] !== current[key])
    fail(409, "CATALOGUE_TYPE_IMMUTABLE", "Create a new record when changing the garment or option type.");
}
