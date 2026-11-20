// Generated references for the explicitly matched development catalogue.
// Existing uploads and unrelated designs keep their own photography.
const photoRoot = "/atelier/catalogue";

export const GARMENT_PHOTOGRAPHY = Object.freeze({
  kurti: photoRoot + "/cotton-kurti/category.webp",
  suit: photoRoot + "/classic-suit/category-v2.webp",
  blouse: photoRoot + "/celebration-blouse/category-v2.webp",
  alteration: photoRoot + "/alterations/category-v2.webp",
});

const references = Object.freeze({
  "DEMO-K01": { id: "6aec91f75fea93612231bd80", slug: "demo-cotton-kurti", garment: "kurti", folder: "cotton-kurti", prefix: "K" },
  "DEMO-S01": { id: "6aec91f75fea93612231bd81", slug: "demo-classic-suit", garment: "suit", folder: "classic-suit", prefix: "KS" },
  "DEMO-B01": { id: "6aec91f75fea93612231bd82", slug: "demo-celebration-blouse", garment: "blouse", folder: "celebration-blouse", prefix: "B" },
  "DEMO-A01": { id: "6aec91f75fea93612231bd83", slug: "demo-alteration", garment: "alteration", folder: "alterations", prefix: "A" },
});

// Bounds follow the photographed dividers, in pixels on the 1536 × 1024 board.
const garmentPanels = {
  kurti: [[0, 0, 384, 1024], [384, 0, 384, 1024], [768, 0, 384, 1024]],
  suit: [[4, 4, 378, 1016], [392, 4, 340, 1016], [744, 4, 400, 1016]],
  blouse: [[4, 38, 412, 636], [424, 38, 318, 636], [750, 78, 398, 596]],
};
const detailPanels = {
  kurti: [[1152, 0, 384, 338], [1152, 344, 384, 336], [1152, 687, 384, 337]],
  suit: [[1154, 4, 378, 333], [1154, 346, 378, 307], [1154, 660, 378, 360]],
  blouse: [[1156, 4, 377, 333], [1156, 345, 377, 302], [1156, 656, 377, 364]],
};
const alterationPanels = [[0, 0, 760, 1024], [770, 0, 766, 334], [770, 345, 766, 313], [770, 670, 766, 354]];
const garmentLabels = [["Front view", "सामने से"], ["Side view", "बगल से"], ["Back view", "पीछे से"]];
const detailLabels = [["Neck design", "गले का डिज़ाइन"], ["Sleeve design", "आस्तीन का डिज़ाइन"], ["Back design", "बैक डिज़ाइन"]];
const alterationLabels = [["Waist fitting", "कमर की फिटिंग"], ["Sleeve adjustment", "आस्तीन की फिटिंग"], ["Hem shortening", "घेरा छोटा करना"], ["Shoulder finish", "कंधे की फिनिशिंग"]];
const alterationPreviews = [["Waist", "कमर"], ["Sleeve", "आस्तीन"], ["Hem", "घेरा"]];

function cropFromPixels([left, top, width, height]) {
  return { x: left / 1536 * 100, y: top / 1024 * 100, width: width / 1536 * 100, height: height / 1024 * 100 };
}
function hasPhotography(design) {
  return Boolean(
    design.coverView || design.coverImageUrl || design.coverMediaId ||
    design.images?.length || design.views?.length ||
    design.mediaIds?.length || design.imageViews?.length,
  );
}

export function withDesignPhotography(design) {
  if (!design || typeof design !== "object") return design;
  const legacyReference = Object.hasOwn(references, design.code) ? references[design.code] : null;
  const reference = legacyReference || Object.values(references).find(item =>
    String(design._id || "") === item.id &&
    typeof design.code === "string" && design.code.startsWith(item.prefix + "-") && /^[0-9]+$/.test(design.code.slice(item.prefix.length + 1)),
  );
  if (!reference || reference.slug !== design.slug || reference.garment !== design.garment || hasPhotography(design)) return design;

  const folder = photoRoot + "/" + reference.folder;
  const suffix = design.garment === "kurti" ? "" : "-v2";
  const board = { id: "generated-" + reference.folder + "-board", url: folder + "/board" + suffix + ".webp", width: 1536, height: 1024 };
  const view = (labels, pixels) => ({ ...board, label: labels[0], labelHi: labels[1], crop: cropFromPixels(pixels) });
  const views = design.garment === "alteration"
    ? alterationPanels.map((pixels, index) => ({
        ...view(alterationLabels[index], pixels), kind: index === 0 ? "service" : "detail",
        ...(alterationPreviews[index] ? { previewLabel: alterationPreviews[index][0], previewLabelHi: alterationPreviews[index][1] } : {}),
      }))
    : [
        ...garmentPanels[design.garment].map((pixels, index) => ({ ...view(garmentLabels[index], pixels), kind: "garment" })),
        ...detailPanels[design.garment].map((pixels, index) => ({ ...view(detailLabels[index], pixels), kind: "detail" })),
      ];
  const images = [board];
  if (design.garment === "suit" || design.garment === "blouse") {
    const front = { id: "generated-" + reference.folder + "-front", url: GARMENT_PHOTOGRAPHY[design.garment], width: 640, height: 800 };
    images.push(front);
    views[0] = { ...front, label: garmentLabels[0][0], labelHi: garmentLabels[0][1], kind: "garment", crop: null };
  }
  views.push({ ...board, kind: "board", label: design.garment === "alteration" ? "Alterations work" : "Full design board", labelHi: design.garment === "alteration" ? "फिटिंग और अल्टरेशन का काम" : "पूरा डिज़ाइन बोर्ड", crop: null });
  return { ...design, images, views, coverView: views[0], coverImageUrl: folder + "/front" + suffix + ".webp" };
}
