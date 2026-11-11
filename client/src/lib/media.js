import { api, ApiError } from "./api";

export const SOURCE_IMAGE_LIMIT = 5 * 1024 * 1024;
export const UPLOAD_IMAGE_LIMIT = 3 * 1024 * 1024;
export const IMAGE_PIXEL_LIMIT = 24_000_000;
const imageError = (message, code = "INVALID_IMAGE") => new ApiError(message, 400, code);
const cancelled = signal => {
  if (signal?.aborted) throw new ApiError("Image upload cancelled.", 0, "REQUEST_ABORTED");
};

function readBytes(file) {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer().then(buffer => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(imageError("This image could not be read. Please choose it again."));
    reader.readAsArrayBuffer(file);
  });
}

// Inspect dimensions before allocating a decoded bitmap/canvas. MIME and names
// are hints only; the backend still performs the authoritative full decode.
export function imageDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  let width, height;
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(1, 3) === "PNG" && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10 && ascii(12, 4) === "IHDR") {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = ascii(offset, 4), size = view.getUint32(offset + 4, true), payload = offset + 8;
      if (payload + size > bytes.length) break;
      if (chunk === "VP8X" && size >= 10) {
        if (bytes[payload] & 2) throw imageError("Use a single, non-animated JPEG, PNG or WebP image.");
        width = 1 + bytes[payload + 4] + (bytes[payload + 5] << 8) + (bytes[payload + 6] << 16);
        height = 1 + bytes[payload + 7] + (bytes[payload + 8] << 8) + (bytes[payload + 9] << 16);
        break;
      }
      if (chunk === "VP8L" && size >= 5 && bytes[payload] === 47) {
        const bits = view.getUint32(payload + 1, true);
        width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff); break;
      }
      if (chunk === "VP8 " && size >= 10 && bytes[payload + 3] === 157 && bytes[payload + 4] === 1 && bytes[payload + 5] === 42) {
        width = view.getUint16(payload + 6, true) & 0x3fff;
        height = view.getUint16(payload + 8, true) & 0x3fff; break;
      }
      offset = payload + size + (size % 2);
    }
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && size >= 7) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += size;
    }
  }
  if (!width || !height) throw imageError("Use a readable JPEG, PNG or WebP image.");
  if (width * height > IMAGE_PIXEL_LIMIT) throw imageError("Choose an image with at most 24 megapixels.", "IMAGE_PIXEL_LIMIT");
  return { width, height };
}

async function decodeImage(file) {
  if (typeof globalThis.createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    return { image, width: image.naturalWidth, height: image.naturalHeight, release: () => { image.onload = null; image.onerror = null; image.src = ""; URL.revokeObjectURL(url); } };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function prepareMediaFile(file, { signal } = {}) {
  cancelled(signal);
  if (!file || !Number.isFinite(file.size) || file.size <= 0) throw imageError("Choose an image to upload.");
  if (file.size > SOURCE_IMAGE_LIMIT) throw imageError("Choose an image up to 5 MiB.", "IMAGE_SOURCE_TOO_LARGE");
  imageDimensions(await readBytes(file));
  cancelled(signal);
  if (file.size <= UPLOAD_IMAGE_LIMIT) return file;
  let decoded, canvas;
  try {
    decoded = await decodeImage(file);
    cancelled(signal);
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > IMAGE_PIXEL_LIMIT) throw imageError("Choose an image with at most 24 megapixels.", "IMAGE_PIXEL_LIMIT");
    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw imageError("This browser could not prepare the image. Choose a smaller image or try another browser.", "IMAGE_PREPARATION_FAILED");
    const scale = Math.min(1, 2400 / Math.max(decoded.width, decoded.height));
    for (let pass = 0; pass < 3; pass++) {
      canvas.width = Math.max(1, Math.floor(decoded.width * scale * 0.8 ** pass));
      canvas.height = Math.max(1, Math.floor(decoded.height * scale * 0.8 ** pass));
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.88, 0.78, 0.68, 0.58]) {
        cancelled(signal);
        const blob = await new Promise((resolve, reject) => {
          try { canvas.toBlob(resolve, "image/webp", quality); } catch (error) { reject(error); }
        });
        cancelled(signal);
        if (blob?.size && blob.size <= UPLOAD_IMAGE_LIMIT) {
          const extension = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
          return new File([blob], `${(file.name || "image").replace(/\.[^.]*$/, "")}.${extension}`, { type: blob.type || "image/webp", lastModified: file.lastModified });
        }
      }
    }
    throw imageError("This image could not be reduced safely. Choose a smaller image up to 3 MiB.", "IMAGE_PREPARATION_FAILED");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw imageError("This image could not be prepared. Choose a smaller JPEG, PNG or WebP image.", "IMAGE_PREPARATION_FAILED");
  } finally {
    decoded?.release();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export async function uploadMedia(file, purpose, { signal, timeout } = {}) {
  if (!["reference", "measurement", "catalogue", "banner"].includes(purpose)) throw imageError("Choose a valid image purpose.");
  const prepared = await prepareMediaFile(file, { signal });
  cancelled(signal);
  const body = new FormData();
  body.append("purpose", purpose);
  body.append("file", prepared);
  return api("/media", { method: "POST", body, signal, ...(timeout ? { timeout } : {}) });
}
