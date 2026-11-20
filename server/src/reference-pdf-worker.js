import { parentPort, workerData } from "node:worker_threads";
import { PDFDocument, PDFDict, PDFArray, PDFName, PDFStream } from "pdf-lib";

const rejectedKeys = new Set(["AA", "OpenAction", "JS", "JavaScript", "Launch", "RichMedia", "EmbeddedFiles", "EF", "AcroForm", "XFA", "Collection"]);
const rejectedNames = new Set(["JavaScript", "Launch", "URI", "GoToR", "GoToE", "SubmitForm", "ImportData", "Rendition", "RichMediaExecute", "FileAttachment", "RichMedia", "3D", "Movie", "Sound"]);
function reject(code, message, status = 400) { throw Object.assign(new Error(message), { code, status }); }
try {
  const bytes = Buffer.from(workerData.bytes);
  if (!/^%PDF-(?:1\.[0-7]|2\.0)/.test(bytes.subarray(0, 12).toString("ascii")) || !/%%EOF\s*$/.test(bytes.subarray(-1024).toString("latin1")))
    reject("INVALID_PDF", "Choose a valid, complete PDF file.");
  const source = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
  const pageCount = source.getPageCount();
  if (pageCount < 1 || pageCount > workerData.maxPages)
    reject("PDF_PAGE_LIMIT", "A reference PDF must contain between 1 and 10 pages.");
  const objects = source.context.enumerateIndirectObjects(), visited = new WeakSet();
  if (objects.length > 5000) reject("PDF_TOO_COMPLEX", "This PDF is too complex. Export a simpler PDF or upload JPEG/PNG references.");
  let nodes = 0;
  function inspect(value, depth = 0) {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    if (++nodes > 50000 || depth > 40) reject("PDF_TOO_COMPLEX", "This PDF is too complex. Export a simpler PDF.");
    visited.add(value);
    if (value instanceof PDFStream) {
      if (value.dict.has(PDFName.of("F"))) reject("PDF_ACTIVE_CONTENT", "Use a PDF without interactive content, external links or embedded attachments.");
      return inspect(value.dict, depth + 1);
    }
    if (value instanceof PDFName && rejectedNames.has(value.decodeText()))
      reject("PDF_ACTIVE_CONTENT", "Use a PDF without interactive content, external links or embedded attachments.");
    if (value instanceof PDFDict) for (const [key, entry] of value.entries()) {
      if (rejectedKeys.has(key.decodeText())) reject("PDF_ACTIVE_CONTENT", "Use a PDF without interactive content, forms or embedded attachments.");
      inspect(entry, depth + 1);
    }
    if (value instanceof PDFArray) for (let i = 0; i < value.size(); i++) inspect(value.get(i), depth + 1);
  }
  for (const [, value] of objects) inspect(value);
  for (const page of source.getPages()) {
    const { width, height } = page.getSize();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 20000 || height > 20000)
      reject("INVALID_PDF", "This PDF contains unsupported page dimensions.");
  }
  // Rebuild from the checked pages. Document metadata, unused objects,
  // incremental revisions and the original catalogue are not retained.
  const clean = await PDFDocument.create({ updateMetadata: false });
  for (const page of await clean.copyPages(source, source.getPageIndices())) clean.addPage(page);
  const output = await clean.save({ useObjectStreams: true, addDefaultPage: false });
  if (output.length > workerData.maxBytes) reject("PDF_PAYLOAD_TOO_LARGE", "The prepared PDF exceeds 3 MiB. Export a smaller PDF.", 413);
  parentPort.postMessage({ ok: true, bytes: output, pageCount });
} catch (error) {
  parentPort.postMessage({ ok: false, status: error.status || 400, code: error.code || "INVALID_PDF", message: error.code ? error.message : "This PDF could not be read. Use an unencrypted PDF with up to 10 pages." });
}
