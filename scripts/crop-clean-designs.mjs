import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('server/package.json'));
const sharp = require('sharp');

const brainUserUploaded = 'C:/Users/HP/.gemini/antigravity/brain/7d5e6347-920f-4a8d-ac1e-0b44fac7132f/.user_uploaded';

const neckSource = path.join(brainUserUploaded, 'media_1794299550486_33944266.jpg');
const backSource = path.join(brainUserUploaded, 'media_1794305141781_cfd3f247.jpg');
const sleeveSource = path.join(brainUserUploaded, 'media_1794299541522_bb18370b.jpg');
const lengthSource = path.join(brainUserUploaded, 'media_1794299507868_e96f617e.jpg');

async function main() {
  await fs.mkdir('client/public/crops/neck', { recursive: true });
  await fs.mkdir('client/public/crops/back', { recursive: true });
  await fs.mkdir('client/public/crops/sleeve', { recursive: true });
  await fs.mkdir('client/public/crops/length', { recursive: true });
  await fs.mkdir('client/public/guides', { recursive: true });

  // Copy full guides
  await fs.copyFile(neckSource, 'client/public/guides/neck-designs-guide.jpg');
  await fs.copyFile(backSource, 'client/public/guides/back-designs-guide.jpg');
  await fs.copyFile(sleeveSource, 'client/public/guides/sleeve-designs-guide.jpg');
  await fs.copyFile(lengthSource, 'client/public/guides/sleeve-length-guide.jpg');

  // 1. CROPPING NECK FRONT (pure photo, no text)
  // 4 cols: x = [9, 263, 518, 774], width = 241
  // Row 1: y = 98, height = 225
  // Row 2: y = 489, height = 225
  const neckCols = [9, 263, 518, 774];
  const neckRow1Y = 98, neckRow2Y = 489, neckW = 241, neckH = 225;
  const neckFiles = [
    { name: 'round-neck.jpg', col: 0, y: neckRow1Y },
    { name: 'v-neck.jpg', col: 1, y: neckRow1Y },
    { name: 'boat-neck.jpg', col: 2, y: neckRow1Y },
    { name: 'collar-neck.jpg', col: 3, y: neckRow1Y },
    { name: 'square-neck.jpg', col: 0, y: neckRow2Y },
    { name: 'sweetheart-neck.jpg', col: 1, y: neckRow2Y },
    { name: 'high-neck.jpg', col: 2, y: neckRow2Y },
    { name: 'mandarin-collar.jpg', col: 3, y: neckRow2Y },
  ];
  for (const item of neckFiles) {
    const outPath = path.join('client/public/crops/neck', item.name);
    await sharp(neckSource)
      .extract({ left: neckCols[item.col], top: item.y, width: neckW, height: neckH })
      .jpeg({ quality: 95 })
      .toFile(outPath);
    console.log('Cropped neck:', outPath);
  }

  // 2. CROPPING BACK NECK (pure photo, no text)
  // 4 cols: x = [10, 265, 520, 775], width = 240
  // Row 1: y = 103, height = 272
  // Row 2: y = 480, height = 265
  const backCols = [10, 265, 520, 775];
  const backRow1Y = 103, backRow2Y = 480, backW = 240;
  const backFiles = [
    { name: 'simple-back.jpg', col: 0, y: backRow1Y, h: 272 },
    { name: 'round-back.jpg', col: 1, y: backRow1Y, h: 272 },
    { name: 'v-back.jpg', col: 2, y: backRow1Y, h: 272 },
    { name: 'square-back.jpg', col: 3, y: backRow1Y, h: 272 },
    { name: 'deep-back.jpg', col: 0, y: backRow2Y, h: 265 },
    { name: 'button-back.jpg', col: 1, y: backRow2Y, h: 265 },
    { name: 'cutout-back.jpg', col: 2, y: backRow2Y, h: 265 },
    { name: 'as-per-photo.jpg', col: 3, y: backRow2Y, h: 265 },
  ];
  for (const item of backFiles) {
    const outPath = path.join('client/public/crops/back', item.name);
    await sharp(backSource)
      .extract({ left: backCols[item.col], top: item.y, width: backW, height: item.h })
      .jpeg({ quality: 95 })
      .toFile(outPath);
    console.log('Cropped back:', outPath);
  }

  // 3. CROPPING SLEEVE DESIGNS (pure photo, no banner text)
  // 4 cols: [8, 262, 516, 773], width = 243
  // Row 1: y = 142, height = 250 (142 to 392)
  // Row 2: y = 445, height = 250 (445 to 695)
  // Row 3: y = 752, height = 250 (752 to 1002)
  const sleeveCols = [8, 262, 516, 773];
  const sleeveW = 243, sleeveH = 250;
  const sleeveFiles = [
    { name: 'straight-plain.jpg', col: 0, y: 142 },
    { name: 'puff-sleeve.jpg', col: 1, y: 142 },
    { name: 'bell-sleeve.jpg', col: 2, y: 142 },
    { name: 'ruffle-sleeve.jpg', col: 3, y: 142 },
    { name: 'cap-sleeve.jpg', col: 0, y: 445 },
    { name: 'bishop-balloon.jpg', col: 1, y: 445 },
    { name: 'butterfly-sleeve.jpg', col: 2, y: 445 },
    { name: 'cold-shoulder.jpg', col: 3, y: 445 },
    { name: 'flutter-sleeve.jpg', col: 0, y: 752 },
    { name: 'bell-cuff.jpg', col: 1, y: 752 },
    { name: 'pleated-sleeve.jpg', col: 2, y: 752 },
  ];
  for (const item of sleeveFiles) {
    const outPath = path.join('client/public/crops/sleeve', item.name);
    await sharp(sleeveSource)
      .extract({ left: sleeveCols[item.col], top: item.y, width: sleeveW, height: sleeveH })
      .jpeg({ quality: 95 })
      .toFile(outPath);
    console.log('Cropped sleeve:', outPath);
  }

  // 4. CROPPING SLEEVE LENGTHS (pure photo, no text)
  // 5 cols: [12, 221, 424, 625, 821]
  // Front view photo: y = 237, height = 316
  const lengthCols = [
    { name: 'sleeveless.jpg', left: 12, width: 199 },
    { name: 'short-1-4.jpg', left: 221, width: 194 },
    { name: 'elbow-1-2.jpg', left: 424, width: 192 },
    { name: 'three-quarter-3-4.jpg', left: 625, width: 187 },
    { name: 'full-sleeve.jpg', left: 821, width: 192 },
  ];
  for (const item of lengthCols) {
    const outPath = path.join('client/public/crops/length', item.name);
    await sharp(lengthSource)
      .extract({ left: item.left, top: 237, width: item.width, height: 316 })
      .jpeg({ quality: 95 })
      .toFile(outPath);
    console.log('Cropped length:', outPath);
  }

  console.log('All crops generated cleanly without text!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
