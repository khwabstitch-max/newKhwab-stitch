import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { withDesignPhotography } from "../client/src/lib/design-photography.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const sharp = createRequire(path.join(root, "server/package.json"))("sharp");
const base = path.join(root, "client/public/atelier/catalogue");
const entries = [
  ["cotton-kurti", "DEMO-K01", "demo-cotton-kurti", "kurti"],
  ["classic-suit", "DEMO-S01", "demo-classic-suit", "suit"],
  ["celebration-blouse", "DEMO-B01", "demo-celebration-blouse", "blouse"],
  ["alterations", "DEMO-A01", "demo-alteration", "alteration"],
];
for (const [folder, code, slug, garment] of entries) {
  const output = path.join(base, folder);
  await fs.mkdir(output, { recursive: true });
  const version = garment === "kurti" ? "v1" : "v2";
  const suffix = garment === "kurti" ? "" : "-v2";
  const names = garment === "alteration" ? ["front", "sleeves", "hem", "shoulder"] : ["front", "side", "back", "neckline", "sleeves", "back-detail"];
  const board = await sharp(path.join(base, "source", folder + "-" + version + ".png")).resize(1536, 1024, { fit: "fill" }).webp({ quality: 88 }).toBuffer();
  const category = await sharp(path.join(base, "source", folder + "-category-" + version + ".png")).resize(640, 800, { fit: "cover", position: "centre" }).webp({ quality: 85 }).toBuffer();
  await fs.writeFile(path.join(output, "board" + suffix + ".webp"), board);
  await fs.writeFile(path.join(output, "category" + suffix + ".webp"), category);
  const design = withDesignPhotography({ code, slug, garment });
  for (let index = 0; index < names.length; index++) {
    const destination = path.join(output, names[index] + suffix + ".webp");
    const crop = design.views[index].crop;
    if (!crop) { await fs.writeFile(destination, category); continue; }
    const left = Math.round(crop.x * 1536 / 100), top = Math.round(crop.y * 1024 / 100);
    const width = Math.min(1536 - left, Math.round(crop.width * 1536 / 100));
    const height = Math.min(1024 - top, Math.round(crop.height * 1024 / 100));
    await sharp(board).extract({ left, top, width, height }).webp({ quality: 88 }).toFile(destination);
  }
  console.log(folder + ": " + (names.length + 2) + " optimized photos prepared (" + version + ").");
}
