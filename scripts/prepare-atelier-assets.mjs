import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const sharp = createRequire(path.join(root, "server/package.json"))("sharp");
const generated = process.argv[2];
if (!generated || path.extname(generated).toLowerCase() !== ".png") throw new Error("Pass the generated craft PNG as a literal absolute path.");
const out = path.join(root, "client/public/atelier");
await fs.mkdir(out, { recursive: true });
const outputs = [];
for (const width of [480, 768, 1280]) {
  const target = path.join(out, `embroidery-${width}.webp`);
  await sharp(generated).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(target);
  outputs.push(target);
}
const garment = path.join(out, "kurti-reference.webp");
await sharp(path.join(root, "client/public/design-library/teal-kurti-board.png")).extract({ left: 0, top: 0, width: 345, height: 946 }).resize({ width: 480 }).webp({ quality: 85 }).toFile(garment);
outputs.push(garment);
const logo = path.join(out, "monogram.webp");
await sharp(path.join(root, "client/public/brand/khwab-monogram.png")).resize({ width: 144, height: 144, fit: "inside" }).webp({ quality: 90 }).toFile(logo);
outputs.push(logo);
for (const target of outputs) {
  const stat = await fs.stat(target);
  console.log(JSON.stringify({ file: path.relative(root, target), bytes: stat.size }));
}
