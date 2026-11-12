import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// Source only: no application bootstrap, dotenv, provider or database imports.
const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(root, "client", "src");
const require = createRequire(path.join(root, "client", "package.json"));
const { parse } = require("espree");
const sourceModules = ["catalog", "enhancements", "commerce", "experience", "public-experience", "admin-experience"];
const data = Object.assign({}, ...await Promise.all(sourceModules.map(async name => import(pathToFileURL(path.join(sourceRoot, "i18n", `${name}.js`)).href))));
const semantic = { ...data.experienceCopy, ...data.publicCopy, ...data.adminCopy };
const dictionary = {
  ...data.enhancements, ...data.messages, ...data.commerceMessages, ...data.experience,
  ...Object.fromEntries(Object.values(semantic).filter(item => typeof item.en === "string" && typeof item.hi === "string").map(item => [item.en, item.hi])),
};
const normalize = value => value.trim().replace(/\s+/g, " ");
const reverse = new Set(Object.values(dictionary));
const invariant = new Map([
  ["Khwab Stitch", "brand"], ["KhwabStitch", "brand"], ["English", "language name"], ["हिन्दी", "language name"],
  ["हिंदी", "language name"], ["WhatsApp", "service name"], ["Instagram", "service name"], ["Facebook", "service name"],
  ["YouTube", "service name"], ["Google", "provider name"], ["INR", "currency code"], ["cm", "unit code"], ["in", "unit code"],
]);
const attributes = new Set(["label", "title", "hint", "description", "placeholder", "aria-label", "alt", "legend", "emptyTitle", "emptyDescription"]);
const usages = new Map(), dynamic = [], encoding = [], parseFailures = [];
let scanned = 0, literalCalls = 0, literalProps = 0;
function record(value, file, node, kind) {
  const key = normalize(value);
  if (!key || !/[\p{L}]/u.test(key)) return;
  if (!usages.has(key)) usages.set(key, []);
  usages.get(key).push({ file: path.relative(root, file).replaceAll("\\", "/"), line: node.loc.start.line, kind });
}
function literal(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && !node.expressions.length) return node.quasis[0].value.cooked;
  return null;
}
function walk(node, file) {
  if (!node || typeof node !== "object") return;
  if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "t") {
    const value = literal(node.arguments[0]);
    if (value !== null) { literalCalls++; record(value, file, node, "t"); }
    else dynamic.push({ file: path.relative(root, file).replaceAll("\\", "/"), line: node.loc.start.line, kind: "runtime t expression" });
  }
  if (node.type === "JSXAttribute" && attributes.has(node.name.name) && node.value?.type === "Literal" && typeof node.value.value === "string") {
    literalProps++; record(node.value.value, file, node, `prop:${node.name.name}`);
  }
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "range", "tokens", "comments"].includes(key)) continue;
    if (Array.isArray(value)) for (const item of value) walk(item, file);
    else if (value && typeof value === "object") walk(value, file);
  }
}
async function scan(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name.startsWith(".env") || ["test", "__tests__", "node_modules", "dist", "coverage"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (!/\.(?:js|jsx|mjs)$/.test(entry.name)) continue;
    const source = await fs.readFile(file, "utf8"); scanned++;
    if (directory === path.join(sourceRoot, "i18n")) {
      for (const [index, line] of source.split(/\r?\n/).entries()) {
        if (/\?{3,}|\uFFFD|à[¤¥]|Ã[\u0080-\u00ff]|â[€‚]|ðŸ/u.test(line)) encoding.push({ file: path.relative(root, file).replaceAll("\\", "/"), line: index + 1 });
      }
      continue;
    }
    try { walk(parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, loc: true }), file); }
    catch (error) { parseFailures.push({ file: path.relative(root, file).replaceAll("\\", "/"), message: error.message }); }
  }
}
await scan(sourceRoot);
const missing = [...usages].filter(([key]) => !Object.hasOwn(dictionary, key) && !Object.hasOwn(semantic, key) && !reverse.has(key) && !invariant.has(key))
  .sort(([a], [b]) => a.localeCompare(b)).map(([key, locations]) => ({ key, locations }));
const semanticProblems = Object.entries(semantic).filter(([, copy]) => ["en", "hi"].some(language => {
  const phrase = copy[language];
  return typeof phrase === "string" ? !phrase.trim() : !phrase || typeof phrase.other !== "string" || !phrase.other.trim();
})).map(([key]) => key);
const placeholders = text => [...new Set((text.match(/\{([^{}]+)\}/g) || []))].sort().join("|");
const placeholderProblems = Object.entries(dictionary).filter(([en, hi]) => typeof hi !== "string" || placeholders(en) !== placeholders(hi)).map(([key]) => ({ key, kind: "phrase placeholders" }));
for (const [key, copy] of Object.entries(semantic)) {
  const english = typeof copy.en === "string" ? copy.en : copy.en?.other;
  const hindiForms = typeof copy.hi === "string" ? [copy.hi] : Object.values(copy.hi || {});
  if (typeof english === "string" && hindiForms.some(hi => typeof hi !== "string" || placeholders(english) !== placeholders(hi))) placeholderProblems.push({ key, kind: "semantic placeholders" });
}
const report = {
  mode: "Static English/Hindi source coverage; no application, environment file, provider or database access",
  generatedAt: new Date().toISOString(), scannedFiles: scanned, dictionaryEntries: Object.keys(dictionary).length,
  semanticKeys: Object.keys(semantic).length, literalTCalls: literalCalls, literalLabelProps: literalProps,
  uniqueStaticPhrases: usages.size, missingUniquePhrases: missing.length,
  missingUsages: missing.reduce((total, item) => total + item.locations.length, 0), missing, semanticProblems,
  encodingProblems: encoding, placeholderProblems, parseFailures, dynamicExpressionCount: dynamic.length, dynamicExpressions: dynamic,
  invariants: [...invariant].map(([value, reason]) => ({ value, reason })),
  limitations: "Checks literal t calls and common literal JSX copy props. Does not prove that every render path calls t(), resolve arbitrary runtime strings/arrays/conditions, check translation quality, or inspect authored database content. Browser and human language review are still required.",
};
const args = process.argv.slice(2), outputAt = args.indexOf("--report");
if (outputAt >= 0) {
  const output = path.resolve(root, args[outputAt + 1] || "");
  const artifactRoot = path.join(root, "artifacts") + path.sep;
  if (!output.startsWith(artifactRoot)) throw Error("Language audit report must be inside workspace artifacts.");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (parseFailures.length || semanticProblems.length || placeholderProblems.length || encoding.length || (args.includes("--strict") && missing.length)) process.exitCode = 1;
