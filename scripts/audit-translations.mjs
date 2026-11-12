import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { messages } from "../client/src/i18n/catalog.js";
import { enhancements } from "../client/src/i18n/enhancements.js";
import { commerceMessages } from "../client/src/i18n/commerce.js";
import { experience, experienceCopy, runtimeEnumKeys } from "../client/src/i18n/experience.js";
import { publicCopy } from "../client/src/i18n/public-experience.js";
import { adminCopy } from "../client/src/i18n/admin-experience.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../client/package.json", import.meta.url));
const { parse } = require("@babel/parser");
const semantic = { ...experienceCopy, ...publicCopy, ...adminCopy };
const catalogue = { ...enhancements, ...messages, ...commerceMessages, ...experience };
for (const copy of Object.values(semantic)) if (typeof copy.en === "string") catalogue[copy.en] = copy.hi;
const known = new Set([...Object.keys(catalogue), ...Object.values(catalogue).filter(value => typeof value === "string"), ...Object.keys(semantic)]);
const normalize = value => value.trim().replace(/\s+/g, " ");
const parameters = value => [...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort().join(",");
function visit(node, callback) {
  if (!node || typeof node !== "object") return;
  callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => visit(child, callback));
    else if (value && typeof value === "object") visit(value, callback);
  }
}
function staticAlternatives(node) {
  if (node?.type === "StringLiteral") return [node.value];
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return [node.quasis[0].value.cooked];
  if (node?.type === "ConditionalExpression") return [...staticAlternatives(node.consequent), ...staticAlternatives(node.alternate)];
  return [];
}
export async function auditTranslations() {
  const missing = new Map(), dynamic = [], templates = [], enumLabels = [];
  let staticCalls = 0;
  async function scan(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!["test", "i18n"].includes(entry.name)) await scan(absolute);
        continue;
      }
      if (!/\.(jsx?|tsx?)$/.test(entry.name)) continue;
      const source = await fs.readFile(absolute, "utf8");
      const ast = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
      const location = node => `${path.relative(root, absolute).replaceAll("\\", "/")}:${node.loc.start.line}`;
      visit(ast, node => {
        if (node.type !== "CallExpression") return;
        if (node.callee.name === "labelToken") enumLabels.push(location(node));
        if (node.callee.name !== "t") return;
        const first = node.arguments[0], values = staticAlternatives(first);
        for (const value of values) {
          staticCalls++;
          const key = normalize(value);
          if (key && !known.has(key)) {
            if (!missing.has(key)) missing.set(key, []);
            missing.get(key).push(location(node));
          }
        }
        if (first?.type === "TemplateLiteral" && first.expressions.length) {
          templates.push({ location: location(node), template: first.quasis.map((part, index) => part.value.cooked + (index < first.expressions.length ? `{${index}}` : "")).join("") });
        } else if (!values.length) dynamic.push({ location: location(node), expression: source.slice(first?.start, first?.end) });
      });
    }
  }
  await scan(path.join(root, "client/src"));
  const invalidEntries = [];
  const enumCoverage = runtimeEnumKeys.map(key => {
    const label = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_.]/g, " ").replace(/\b\w/g, value => value.toUpperCase());
    return { key, label, translated: catalogue[label] || "" };
  });
  for (const [key, hi] of Object.entries(catalogue)) {
    if (typeof hi !== "string" || !hi.trim() || /�/.test(hi) || parameters(key) !== parameters(hi)) invalidEntries.push(key);
  }
  for (const [key, copy] of Object.entries(semantic)) {
    for (const lang of ["en", "hi"]) {
      const variants = typeof copy[lang] === "string" ? [copy[lang]] : Object.values(copy[lang] || {});
      if (!variants.length || variants.some(value => !value.trim() || /�/.test(value))) invalidEntries.push(`${key}:${lang}`);
      const english = typeof copy.en === "string" ? copy.en : copy.en?.other;
      if (variants.some(value => parameters(value) !== parameters(english || ""))) invalidEntries.push(`${key}:${lang}:parameters`);
    }
  }
  return {
    scope: "Static t() literals and conditional string alternatives. Dynamic labels, business enums, authored content and free text are reported separately and require rendered review.",
    staticCalls, legacyEntries: Object.keys(catalogue).length, semanticEntries: Object.keys(semantic).length,
    missing: [...missing].map(([key, locations]) => ({ key, locations })), invalidEntries: [...new Set(invalidEntries)],
    dynamicCalls: dynamic, templateCalls: templates, enumLabelCalls: enumLabels,
    enumCoverage, missingEnumLabels: enumCoverage.filter(entry => !entry.translated).map(entry => entry.key),
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await auditTranslations();
  const destination = process.argv[2];
  if (destination) {
    const absolute = path.resolve(root, destination);
    if (!absolute.startsWith(path.join(root, "artifacts") + path.sep)) throw Error("Reports must stay in workspace artifacts.");
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, JSON.stringify(report, null, 2));
  }
  process.stdout.write(JSON.stringify({ staticCalls: report.staticCalls, legacyEntries: report.legacyEntries, semanticEntries: report.semanticEntries, missing: report.missing, invalidEntries: report.invalidEntries, dynamicCalls: report.dynamicCalls.length, templateCalls: report.templateCalls.length, enumLabelCalls: report.enumLabelCalls.length, auditedRuntimeEnums: report.enumCoverage.length, missingEnumLabels: report.missingEnumLabels }, null, 2) + "\n");
  process.exitCode = report.missing.length || report.invalidEntries.length || report.missingEnumLabels.length ? 1 : 0;
}
