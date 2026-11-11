import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { connect } from "./runtime.js";
import { imageIds } from "../src/visual-catalogue.js";
import { mediaUrl } from "../src/media-storage.js";

const root = path.resolve("../artifacts/visual-import");
const inventory = JSON.parse(await fs.readFile(path.join(root, "inventory.json"), "utf8"));
let verifiedOriginals = 0;
for (const entry of inventory.entries) {
  const source = await fs.readFile(path.join(inventory.sourceRoot, entry.sourceFilename));
  const staged = await fs.readFile(path.join(root, entry.asset));
  if ([source, staged].some(bytes => createHash("sha256").update(bytes).digest("hex") !== entry.sha256)) throw Error("Source or staged original has changed.");
  verifiedOriginals++;
}
const ctx = await connect();
try {
  const query = { importKey: /^supplied-visual-v1:/ };
  const [options, guides] = await Promise.all([ctx.models.DesignOption.find(query).lean(), ctx.models.MeasurementGuide.find(query).lean()]);
  const ids = [...new Set([...options, ...guides].flatMap(imageIds))];
  const assets = await ctx.models.MediaAsset.find({ _id: { $in: ids }, private: false, purpose: "catalogue", deletingAt: null }).lean();
  if (options.length !== 31 || guides.length !== 3 || assets.length !== 47) throw Error("Imported record or media count differs; review the environment.");
  const response = await fetch(mediaUrl(ctx.images, assets[0], 3600), { method: "HEAD", signal: AbortSignal.timeout(15000) });
  const report = {
    checkedAt: new Date().toISOString(), mode: "read-only configured database/provider verification",
    sourceFilesHashVerified: verifiedOriginals, uniqueSourceImages: inventory.uniqueAssets,
    importedOptions: options.length, importedGuides: guides.length, selectedPublicAssets: assets.length,
    draftRecords: [...options, ...guides].filter(record => record.status === "draft").length,
    publishedRecords: [...options, ...guides].filter(record => record.status === "published").length,
    importedLengthOptionsHaveZeroCharge: options.filter(option => option.kind === "sleeveLength").every(option => option.priceMode === "included" && option.amountPaise === 0),
    representativePublicImageDelivery: { status: response.status, contentType: response.headers.get("content-type"), checkedAssets: 1 },
    privatePolicyGateEnabled: ctx.config.IMAGEKIT_PRIVATE_POLICY_VERIFIED === "true",
    googleConfigured: Boolean(ctx.config.GOOGLE_CLIENT_ID), recoveryEmailConfigured: Boolean(ctx.config.RESEND_API_KEY),
    customersChanged: false, ordersChanged: false, assetsUploaded: 0,
  };
  if (!response.ok || !report.representativePublicImageDelivery.contentType?.startsWith("image/")) throw Error("Representative public delivery failed.");
  await fs.writeFile(path.join(root, "verification.json"), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report, null, 2));
} finally { await ctx.disconnect(); }
