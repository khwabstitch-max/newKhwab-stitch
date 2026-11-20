import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sharp = createRequire(path.join(root, "server/package.json"))("sharp");
const source = process.argv[2];
if (!source || !path.isAbsolute(source) || path.extname(source).toLowerCase() !== ".png") throw new Error("Pass the generated four-panel stitching PNG as an absolute path.");
const metadata = await sharp(source).metadata();
if (!metadata.width || !metadata.height) throw new Error("The storyboard needs image dimensions.");
const halfWidth = Math.floor(metadata.width / 2);
const halfHeight = Math.floor(metadata.height / 2);
const frames = [
  ["fabric", { left: 0, top: 0, width: halfWidth, height: halfHeight }],
  ["design", { left: halfWidth, top: 0, width: metadata.width - halfWidth, height: halfHeight }],
  ["stitch", { left: 0, top: halfHeight, width: halfWidth, height: metadata.height - halfHeight }],
  ["wear", { left: halfWidth, top: halfHeight, width: metadata.width - halfWidth, height: metadata.height - halfHeight }],
];
const directory = path.join(root, "client/public/atelier/stitching");
await fs.mkdir(directory, { recursive: true });
for (const [name, crop] of frames) {
  for (const width of [300, 600]) {
    const target = path.join(directory, `${name}-${width}.webp`);
    await sharp(source).extract(crop).resize(width, width, { fit: "cover" }).webp({ quality: 83 }).toFile(target);
    const stat = await fs.stat(target);
    console.log(JSON.stringify({ file: path.relative(root, target), bytes: stat.size }));
  }
}
