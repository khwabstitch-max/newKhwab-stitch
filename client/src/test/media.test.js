import { afterEach, beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async original => ({ ...(await original()), api: boundary.api }));
import { imageDimensions, prepareMediaFile, uploadMedia, SOURCE_IMAGE_LIMIT, UPLOAD_IMAGE_LIMIT } from "../lib/media";

const pngHeader = (width = 4000, height = 3000, size = UPLOAD_IMAGE_LIMIT + 64) => {
  const bytes = new Uint8Array(size);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
};
const smallPng = () => new File([pngHeader(100, 80, 64)], "garment.png", { type: "image/png" });
const largePng = () => new File([pngHeader()], "garment.png", { type: "image/png", lastModified: 1234 });
let bitmap, canvases;
beforeEach(() => {
  boundary.api.mockReset();
  bitmap = { width: 4000, height: 3000, close: vi.fn() }; canvases = [];
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const element = create(tag, options);
    if (tag === "canvas") canvases.push(element);
    return element;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob([new Uint8Array(2048)], { type: "image/webp" })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps small supported images and source bytes unchanged without a canvas allocation", async () => {
  const file = smallPng();
  expect(await prepareMediaFile(file)).toBe(file);
  expect(file.name).toBe("garment.png");
  expect(createImageBitmap).not.toHaveBeenCalled();
  expect(canvases).toHaveLength(0);
});

it("rejects source size and spoofed unsupported content before network/decode", async () => {
  await expect(uploadMedia(new File([new Uint8Array(SOURCE_IMAGE_LIMIT + 1)], "too-large.jpg"), "reference")).rejects.toMatchObject({ code: "IMAGE_SOURCE_TOO_LARGE" });
  await expect(uploadMedia(new File(["<svg onload='unsafe()'/>"], "photo.png", { type: "image/png" }), "reference")).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  expect(boundary.api).not.toHaveBeenCalled();
  expect(createImageBitmap).not.toHaveBeenCalled();
});

it("bounds declared dimensions before bitmap allocation and uses actual header rather than filename/MIME", async () => {
  await expect(prepareMediaFile(new File([pngHeader(12000, 3000, 64)], "tiny.png"))).rejects.toMatchObject({ code: "IMAGE_PIXEL_LIMIT" });
  expect(createImageBitmap).not.toHaveBeenCalled();
  const mislabeled = new File([pngHeader(80, 90, 64)], "camera.bin", { type: "application/octet-stream" });
  expect(await prepareMediaFile(mislabeled)).toBe(mislabeled);
});

it("reads JPEG and WebP dimensions and rejects animated WebP", () => {
  const jpeg = new Uint8Array([255, 216, 255, 192, 0, 7, 8, 0, 100, 0, 80]);
  expect(imageDimensions(jpeg)).toEqual({ width: 80, height: 100 });
  const webp = new Uint8Array(30), view = new DataView(webp.buffer);
  webp.set([82, 73, 70, 70], 0); webp.set([87, 69, 66, 80, 86, 80, 56, 88], 8); view.setUint32(16, 10, true);
  webp[24] = 99; webp[27] = 79;
  expect(imageDimensions(webp)).toEqual({ width: 100, height: 80 });
  webp[20] = 2;
  expect(() => imageDimensions(webp)).toThrow("non-animated");
});

it("compresses a larger source below proxy budget without upscaling and releases bitmap/canvas memory", async () => {
  const file = largePng();
  const prepared = await prepareMediaFile(file);
  expect(prepared.size).toBeLessThanOrEqual(UPLOAD_IMAGE_LIMIT);
  expect(prepared.name).toBe("garment.webp");
  expect(prepared.lastModified).toBe(1234);
  expect(file.size).toBe(UPLOAD_IMAGE_LIMIT + 64);
  expect(file.name).toBe("garment.png");
  expect(HTMLCanvasElement.prototype.getContext.mock.results[0].value.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2400, 1800);
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(canvases[0].width).toBe(0); expect(canvases[0].height).toBe(0);
});

it("fails clearly instead of sending oversized output when encoding cannot meet budget", async () => {
  HTMLCanvasElement.prototype.toBlob.mockImplementation(callback => callback({ size: UPLOAD_IMAGE_LIMIT + 1, type: "image/webp" }));
  await expect(uploadMedia(largePng(), "reference")).rejects.toMatchObject({ code: "IMAGE_PREPARATION_FAILED" });
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(12);
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(canvases[0].width).toBe(0);
  expect(boundary.api).not.toHaveBeenCalled();
});

it("releases bitmap memory when browser canvas encoding fails", async () => {
  HTMLCanvasElement.prototype.toBlob.mockImplementation(() => { throw new Error("Canvas unavailable"); });
  await expect(prepareMediaFile(largePng())).rejects.toMatchObject({ code: "IMAGE_PREPARATION_FAILED" });
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(canvases[0].width).toBe(0);
});

it("revokes a fallback image object URL after preparation", async () => {
  vi.stubGlobal("createImageBitmap", undefined);
  const NativeURL = URL, revoke = vi.fn();
  vi.stubGlobal("URL", class extends NativeURL { static createObjectURL() { return "blob:local-image"; } static revokeObjectURL(value) { revoke(value); } });
  vi.stubGlobal("Image", class { naturalWidth = 1600; naturalHeight = 1200; set src(value) { if (value) queueMicrotask(() => this.onload?.()); } });
  await prepareMediaFile(largePng());
  expect(revoke).toHaveBeenCalledWith("blob:local-image");
  expect(HTMLCanvasElement.prototype.getContext.mock.results[0].value.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1600, 1200]);
});

it("uses authenticated existing media API with the requested purpose and a bounded multipart payload", async () => {
  boundary.api.mockResolvedValue({ data: { _id: "saved-media" } });
  expect(await uploadMedia(largePng(), "reference")).toEqual({ data: { _id: "saved-media" } });
  const [path, options] = boundary.api.mock.calls[0];
  expect(path).toBe("/media"); expect(options.method).toBe("POST");
  expect(options).not.toHaveProperty("auth", false);
  expect(options.body.get("purpose")).toBe("reference");
  expect(options.body.get("file").size).toBeLessThanOrEqual(UPLOAD_IMAGE_LIMIT);
  expect(options).not.toHaveProperty("headers");
});
