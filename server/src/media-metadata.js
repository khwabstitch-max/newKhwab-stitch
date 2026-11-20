export function referenceFilename(filename, mime = "image/webp") {
  const extension = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp";
  const leaf = String(filename || "").split(/[\\/]/).at(-1).normalize("NFKC")
    .replace(/\p{C}/gu, "")
    .replace(/[^\p{L}\p{M}\p{N} ._-]/gu, "").replace(/^[. ]+|[. ]+$/g, "");
  const stem = leaf.replace(/\.[^.]*$/, "").slice(0, 100).trim() || "design-reference";
  return stem + "." + extension;
}
export function mediaMetadata(asset) {
  const mime = asset.mime || "image/webp";
  return { mime, mimeType: mime, filename: referenceFilename(asset.filename, mime), bytes: asset.bytes,
    ...(asset.width ? { width: asset.width } : {}), ...(asset.height ? { height: asset.height } : {}),
    ...(asset.pageCount ? { pageCount: asset.pageCount } : {}) };
}
