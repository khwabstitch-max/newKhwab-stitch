import { Worker } from "node:worker_threads";
import { AppError, fail } from "./errors.js";
export const REFERENCE_PDF_MAX_BYTES = 3 * 1024 * 1024;
export const REFERENCE_PDF_MAX_PAGES = 10;
export function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
export async function prepareReferencePdf(buffer) {
  if (buffer.length > REFERENCE_PDF_MAX_BYTES)
    fail(413, "PDF_PAYLOAD_TOO_LARGE", "Choose a PDF up to 3 MiB.");
  if (!isPdfBuffer(buffer)) fail(400, "INVALID_PDF", "Choose a valid, unencrypted PDF.");
  // Parsing an untrusted document stays off the HTTP thread and has a fixed
  // time/heap budget. PDF JavaScript is never evaluated by this parser.
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./reference-pdf-worker.js", import.meta.url), {
      stdout: true, stderr: true,
      workerData: { bytes: buffer, maxPages: REFERENCE_PDF_MAX_PAGES, maxBytes: REFERENCE_PDF_MAX_BYTES },
      resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16 },
    });
    worker.stdout.resume(); worker.stderr.resume();
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate();
      if (error) reject(error); else resolve({ buffer: Buffer.from(result.bytes), pageCount: result.pageCount });
    };
    const invalid = () => new AppError(400, "INVALID_PDF", "This PDF could not be read. Use an unencrypted PDF with up to 10 pages, without interactive content or attachments.");
    const timer = setTimeout(() => finish(invalid()), 7000);
    worker.once("message", result => {
      if (!result.ok) return finish(new AppError(result.status || 400, result.code || "INVALID_PDF", result.message || invalid().message));
      finish(null, result);
    });
    worker.once("error", () => finish(invalid()));
    worker.once("exit", () => { if (!settled) finish(invalid()); });
  });
}
