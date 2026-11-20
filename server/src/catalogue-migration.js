import { catalogueCodePrefix, catalogueCodeNumber } from "./catalogue-codes.js";
import { productionDesignProfile, productionOptionFields } from "./catalogue-production.js";

const ordered = records => [...records].sort((a, b) =>
  (a.displayOrder || 0) - (b.displayOrder || 0) ||
  Number(String(a.code || "").match(/(\d+)$/)?.[1] || 0) - Number(String(b.code || "").match(/(\d+)$/)?.[1] || 0) ||
  String(a._id).localeCompare(String(b._id)));
const differences = (record, fields) => Object.fromEntries(Object.entries(fields).filter(([key, value]) => JSON.stringify(record[key]) !== JSON.stringify(value)));

export function productionCataloguePlan(designs, options, counters = []) {
  const next = new Map(counters.map(counter => [String(counter._id), counter.value || 0]));
  const used = { design: new Set(designs.map(item => item.code).filter(Boolean)), option: new Set(options.map(item => item.code).filter(Boolean)) };
  for (const [type, records] of [["design", designs], ["option", options]]) for (const record of records) {
    const prefix = catalogueCodePrefix(type, record), key = type + ":" + prefix;
    next.set(key, Math.max(next.get(key) || 0, (catalogueCodeNumber(record.code, prefix) ?? -1) + 1));
  }
  function codeFor(type, record) {
    const prefix = catalogueCodePrefix(type, record);
    if (catalogueCodeNumber(record.code, prefix) !== null) return record.code;
    const key = type + ":" + prefix;
    let number = next.get(key) || 0, code;
    do { code = prefix + "-" + number++; } while (used[type].has(code));
    next.set(key, number); used[type].add(code);
    return code;
  }
  const profileRank = record => {
    const profile = productionDesignProfile(record);
    return profile ? ["KS-TEAL-01", "DEMO-K01", "DEMO-S01", "DEMO-B01", "DEMO-A01"].indexOf(profile.legacyCode) : 99;
  };
  const designChanges = [...designs].sort((a, b) => profileRank(a) - profileRank(b) || String(a._id).localeCompare(String(b._id))).flatMap(record => {
    const code = codeFor("design", record), profile = productionDesignProfile(record);
    const fields = {
      ...(profile && (record.code === profile.legacyCode || /^demo(?:\s|[·:.-])/i.test(record.title || "")) ? structuredClone(profile.content) : {}),
      ...(code !== record.code ? { code, codeAliases: [...new Set([...(record.codeAliases || []), record.code].filter(Boolean))] } : {}),
    };
    const changed = differences(record, fields);
    return Object.keys(changed).length ? [{ id: String(record._id), revision: record.revision || 0, previousCode: record.code, code, fields: changed }] : [];
  });
  const optionChanges = ordered(options).flatMap(record => {
    const code = codeFor("option", record);
    const fields = {
      ...productionOptionFields(record),
      ...(code !== record.code ? { code, codeAliases: [...new Set([...(record.codeAliases || []), record.code].filter(Boolean))] } : {}),
    };
    const changed = differences(record, fields);
    return Object.keys(changed).length ? [{ id: String(record._id), revision: record.revision || 0, previousCode: record.code, code, name: record.name, kind: record.kind, fields: changed }] : [];
  });
  return {
    designChanges, optionChanges,
    sequences: [...next].map(([key, value]) => ({ key, value })),
    warnings: designs.filter(record => !productionDesignProfile(record) && (!record.titleHi?.trim() || !record.descriptionHi?.trim() || /^demo(?:\s|[·:.-])/i.test(record.title || ""))).map(record => ({ id: String(record._id), code: record.code, message: "Review bilingual title and description before publication." })),
    preserved: ["Document IDs", "Slugs and links", "Media and upload ownership", "Default component IDs", "Existing monetary amounts", "Submitted orders and accepted quotes"],
  };
}
export function productionCatalogueSummary(plan) {
  return {
    designs: plan.designChanges.map(item => ({ id: item.id, previousCode: item.previousCode, code: item.code, title: item.fields.title, titleHi: item.fields.titleHi, fields: Object.keys(item.fields) })),
    options: plan.optionChanges.map(item => ({ id: item.id, previousCode: item.previousCode, code: item.code, name: item.name, kind: item.kind, fields: Object.keys(item.fields), ...(item.fields.garments ? { garments: item.fields.garments } : {}), ...(item.fields.compatibleLengthStyles ? { compatibleLengthStyles: item.fields.compatibleLengthStyles } : {}) })),
    sequences: plan.sequences, warnings: plan.warnings, preserved: plan.preserved,
  };
}
