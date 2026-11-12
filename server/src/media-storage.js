import { fail } from "./errors.js";
export const TEAL_BOARD = Object.freeze({
  path: "/design-library/teal-kurti-board.png",
  width: 1536,
  height: 1024,
  bytes: 2618135,
  sha256: "5afbd28ed691d74c0e887fa45f0ae4fd1f38a3f0828fcdb3b46a53784080b22f",
});
function checkBundled(asset) {
  if (
    asset.private !== false ||
    asset.purpose !== "catalogue" ||
    asset.filePath !== TEAL_BOARD.path
  )
    fail(503, "INVALID_BUNDLED_MEDIA", "This catalogue image is unavailable.");
}
export function mediaUrl(images, asset, seconds = 300) {
  if (asset.storage === "bundled") {
    checkBundled(asset);
    return TEAL_BOARD.path;
  }
  return images.url(asset.filePath, seconds);
}
export async function removeStoredMedia(images, asset) {
  if (asset.storage === "bundled") {
    checkBundled(asset);
    return;
  }
  await images.remove(asset.fileId);
}
export function bundledBoardFields(owner) {
  return {
    owner,
    fileId: "bundled-teal-board-" + String(owner),
    filePath: TEAL_BOARD.path,
    storage: "bundled",
    purpose: "catalogue",
    private: false,
    mime: "image/png",
    bytes: TEAL_BOARD.bytes,
    width: TEAL_BOARD.width,
    height: TEAL_BOARD.height,
  };
}
