import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const { values } = parseArgs({ options: { source: { type: "string" }, output: { type: "string", default: fileURLToPath(new URL("../../artifacts/visual-import", import.meta.url)) } } });
if (!values.source) throw Error("Use --source <original-image-folder> [--output <staging-folder>]. This prepares files only; it never writes a database.");
const sourceRoot = await fs.realpath(values.source), outputRoot = path.resolve(values.output);
if (sourceRoot === outputRoot || outputRoot.startsWith(sourceRoot + path.sep)) throw Error("Keep staging outside the unchanged source folder.");
await fs.mkdir(path.join(outputRoot, "assets"), { recursive: true });
const groups = {
  neck_front: ["Round neck", "V-neck", "Boat neck", "Collar neck", "Square neck", "Sweetheart neck", "High neck", "Mandarin collar"],
  neck_back: ["Simple back", "Round back", "V-back", "Square back", "Deep back", "Button back", "Cut-out back"],
  sleeve_designs: ["Straight plain sleeve", "Puff sleeve", "Bell sleeve", "Ruffle sleeve", "Cap sleeve", "Bishop balloon sleeve", "Butterfly sleeve", "Cold shoulder sleeve", "Flutter sleeve", "Bell-cuff sleeve", "Pleated sleeve"],
  sleeve_lengths: ["Sleeveless", "1/4 sleeve", "1/2 sleeve", "3/4 sleeve", "Full sleeve"],
};
const categories = { neck_front: "neck", neck_back: "back", sleeve_designs: "sleeve", sleeve_lengths: "sleeveLength" };
const styles = ["sleeveless", "short", "elbow", "three_quarter", "full"];
const entries = [], records = new Map(), hashes = new Map(), previews = new Map();
const files = (await fs.readdir(sourceRoot, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).sort((a,b) => path.join(a.parentPath,a.name).localeCompare(path.join(b.parentPath,b.name)));
for (const entry of files) {
  const absolute = await fs.realpath(path.join(entry.parentPath, entry.name));
  if (!absolute.startsWith(sourceRoot + path.sep)) throw Error("A source link resolves outside the selected folder.");
  const relative = path.relative(sourceRoot, absolute).replaceAll(path.sep, "/"), folder = relative.split("/")[0];
  const buffer = await fs.readFile(absolute), sha = createHash("sha256").update(buffer).digest("hex");
  const metadata = await sharp(buffer, { limitInputPixels: 24_000_000, animated: false }).metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages || 1) > 1) throw Error(`Unsupported image: ${relative}`);
  const number = Number(entry.name.match(/^\d+/)?.[0]), name = groups[folder]?.[number - 1];
  const flags = [];
  if (Math.min(metadata.width, metadata.height) < 150) flags.push("Low-resolution or clipped detail: admin review required; never enlarge beyond native size.");
  if (metadata.format === "jpeg" && /\.png$/i.test(entry.name)) flags.push("Filename says PNG but original bytes are JPEG.");
  if (hashes.has(sha)) flags.push(`Exact duplicate of ${hashes.get(sha)}; reuse one asset.`);
  else hashes.set(sha, relative);
  const provenance = { sourceFilename: relative, sourceSha256: sha, crop: { left: 0, top: 0, width: metadata.width, height: metadata.height }, notes: "Supplied individual image; no parent-board pixel coordinates supplied. Original bytes unchanged." };
  const ext = metadata.format === "jpeg" ? "jpg" : metadata.format;
  const asset = `assets/${sha}.${ext}`;
  await fs.writeFile(path.join(outputRoot, asset), buffer);
  const row = { sourceFilename: relative, category: categories[folder] || (folder === "measurement_guides" ? "measurementGuide" : "supporting garment image"), detectedFormat: metadata.format, width: metadata.width, height: metadata.height, bytes: buffer.length, sha256: sha, asset, provenance, flags };
  entries.push(row);
  if (!previews.has(folder)) previews.set(folder, []);
  previews.get(folder).push({ buffer, label: relative, flags });
  if (name) {
    const kind = categories[folder], code = `KS-${{ neck: "FN", back: "BN", sleeve: "SD", sleeveLength: "SL" }[kind]}-${String(number).padStart(2,"0")}`;
    let record = records.get(code);
    if (!record) {
      record = { importKey: `supplied-visual-v1:${code}`, type: "option", code, name, kind, garments: [], status: "draft", active: false, displayOrder: number * 10, priceMode: kind === "sleeveLength" ? "included" : "pending", ...(kind === "sleeveLength" ? { amountPaise: 0, lengthStyle: styles[number - 1] } : {}), description: `${name} shows the visible outline or finishing detail in the supplied reference. Garment suitability, materials and construction are confirmed during review. ${kind === "sleeveLength" ? "Style preference only, with no additional charge; enter your own exact measurement later." : "Stitching price after review; decorative fabric in the photograph is not an included embroidery service."}`, imageAlt: `${name}, supplied design reference`, assets: [], sourceCrops: [], reviewFlags: ["Administrator must confirm applicable garments and compatibility before publication."] };
      records.set(code, record);
    }
    if (!record.assets.includes(asset)) record.assets.push(asset);
    record.sourceCrops.push(provenance);
    record.reviewFlags.push(...flags);
  } else if (folder === "measurement_guides") {
    const garment = ["kurti","blouse","suit"].find((kind) => entry.name.includes(kind));
    if (garment) {
      const code = `KS-MG-${garment.toUpperCase()}`, existing = records.get(code);
      if (existing) existing.sourceCrops.push(provenance);
      else records.set(code, { importKey: `supplied-visual-v1:${code}`, type: "measurementGuide", code, name: `${garment} garment measurement guide`, garment, method: "garment", language: "und", status: "draft", displayOrder: 10, instructions: "Supplied bilingual garment illustration. This is not a body measurement guide. Confirm the meaning of Sleeve Arm and any flat-width/circumference convention with the atelier; never prefill the illustrated numbers.", measurementFields: ["shoulder","frontNeckDepth","bust","waist",...(garment === "blouse" ? [] : ["hip"]),"length","sleeveLength"], assets: [asset], sourceCrops: [provenance], reviewFlags: ["Garment method inferred from garment illustration, requires administrator approval.", "Source Sleeve Arm is ambiguous; not mapped automatically to armhole.", "Body-measurement guides and underbust/neck-width instructions are missing."] });
    }
  }
}
const clippedRuffle = entries.find(entry=>entry.sourceFilename==="sleeve_designs/04_ruffle_front.jpg");
if(clippedRuffle){clippedRuffle.flags.push("Front detail is clipped and does not confidently show the labelled ruffle. Quarantined; use the complete side view pending administrator review.");const record=records.get("KS-SD-04");record.assets=record.assets.filter(asset=>asset!==clippedRuffle.asset);record.reviewFlags.push(...clippedRuffle.flags);}
for(const code of ["KS-SD-04","KS-SD-06","KS-SD-07","KS-SD-08","KS-SD-10","KS-SD-11"]){const record=records.get(code);const side=record?.sourceCrops.find(source=>source.sourceFilename.includes("_side"));const asset=entries.find(entry=>entry.sourceFilename===side?.sourceFilename)?.asset;if(asset&&record.assets.includes(asset))record.assets=[asset,...record.assets.filter(value=>value!==asset)];}
for(const code of ["KS-SL-02","KS-SL-03","KS-SL-05"])records.get(code)?.reviewFlags.push("Supplied low-resolution views do not establish an exact numeric length; source label retained as a preference only.");
for (const [folder, items] of previews) {
  const width = 1100, tileWidth = 220, tileHeight = 270, rows = Math.ceil(items.length / 5), layers = [];
  for (let index = 0; index < items.length; index++) {
    const x = index % 5 * tileWidth, y = Math.floor(index / 5) * tileHeight;
    const preview = await sharp(items[index].buffer).resize({ width: 204, height: 226, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    layers.push({ input: preview.data, left: x + Math.floor((tileWidth-preview.info.width)/2), top: y + 3 });
    const label = items[index].label.split("/").at(-1).replaceAll("&","&amp;").replaceAll("<","&lt;");
    layers.push({ input: Buffer.from(`<svg width="220" height="38"><text x="7" y="17" font-size="10" fill="#263b38">${label}</text><text x="7" y="32" font-size="9" fill="#934933">${items[index].flags.length ? "REVIEW FLAG" : "Supplied original"}</text></svg>`), left: x, top: y + 230 });
  }
  await sharp({ create: { width, height: rows * tileHeight, channels: 3, background: "#fbf7ef" } }).composite(layers).png().toFile(path.join(outputRoot, `contact-${folder}.png`));
}
const inventory = { version: 1, sourceRoot, originalFilesUnchanged: true, totalFiles: entries.length, uniqueAssets: hashes.size, entries };
const manifest = { version: 1, preparedOnly: true, databaseImported: false, providerUploaded: false, records: [...records.values()], omissions: ["As per Photo is a reference action, not an additional back design.", "No supplied custom-length image; existing admin-configured Custom length remains supported.", "No reliable body-method guide supplied.", "Individual files differ from the chat boards; no parent-board crop coordinates are fabricated.", "Supporting outfits and duplicate design-code images are inventoried but not made into additional garment designs without confirmed labels/prices."] };
await fs.writeFile(path.join(outputRoot, "inventory.json"), JSON.stringify(inventory,null,2));
await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest,null,2));
process.stdout.write(JSON.stringify({ status: "prepared-only", files: entries.length, uniqueAssets: hashes.size, optionRecords: manifest.records.filter(record=>record.type==="option").length, guideRecords: manifest.records.filter(record=>record.type==="measurementGuide").length, reviewFlags: entries.filter(row=>row.flags.length).length, output: outputRoot, databaseImported: false, providerUploaded: false },null,2));
