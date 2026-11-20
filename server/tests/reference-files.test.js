import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { prepareReferencePdf, isPdfBuffer, REFERENCE_PDF_MAX_BYTES } from "../src/reference-pdf.js";
import { referenceFilename, mediaMetadata } from "../src/media-metadata.js";

async function pdf(pages = 1, mutate) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400, 600]).drawText("Front, side and back references", { x: 20, y: 500, size: 14 });
  if (mutate) await mutate(doc);
  return Buffer.from(await doc.save({ addDefaultPage: false }));
}
test("one board or multiple PDF pages are retained without requiring three separate files", async () => {
  for (const count of [1, 3, 10]) {
    const result = await prepareReferencePdf(await pdf(count));
    assert.equal(result.pageCount, count); assert.equal(isPdfBuffer(result.buffer), true);
    assert.equal((await PDFDocument.load(result.buffer)).getPageCount(), count);
  }
});
test("PDF validation rejects spoofed/truncated files, too many pages and oversized sources", async () => {
  await assert.rejects(prepareReferencePdf(Buffer.from("not a PDF")), { code: "INVALID_PDF" });
  await assert.rejects(prepareReferencePdf(Buffer.from("%PDF-1.7\nnot a valid document\n%%EOF")), { code: "INVALID_PDF" });
  const valid = await pdf();
  await assert.rejects(prepareReferencePdf(valid.subarray(0, valid.length - 15)), { code: "INVALID_PDF" });
  await assert.rejects(prepareReferencePdf(await pdf(11)), { code: "PDF_PAGE_LIMIT" });
  const large = Buffer.alloc(REFERENCE_PDF_MAX_BYTES + 1); large.write("%PDF-1.7");
  await assert.rejects(prepareReferencePdf(large), { code: "PDF_PAYLOAD_TOO_LARGE", status: 413 });
});
test("PDF scripts, forms and embedded files are rejected even inside compressed object streams", async () => {
  for (const mutate of [
    doc => doc.addJavaScript("run", "app.alert('unsafe')"),
    doc => doc.getForm().createTextField("interactive").setText("form"),
    doc => doc.attach(Buffer.from("embedded data"), "attachment.txt"),
    doc => doc.catalog.set(PDFName.of("OpenAction"), doc.context.obj({ S: "URI", URI: PDFString.of("https://example.test") })),
  ]) await assert.rejects(prepareReferencePdf(await pdf(1, mutate)), { code: "PDF_ACTIVE_CONTENT" });
});
test("PDF document metadata is omitted from the retained reference", async () => {
  const input = await pdf(1, doc => { doc.setAuthor("Private device author"); doc.setTitle("Old hidden title"); });
  const { buffer } = await prepareReferencePdf(input);
  const clean = await PDFDocument.load(buffer, { updateMetadata: false });
  assert.equal(clean.getAuthor(), undefined); assert.equal(clean.getTitle(), undefined);
});
test("reference names remove paths and controls while preserving Hindi combining marks and actual file extensions", () => {
  assert.equal(referenceFilename("../folder/\u0915\u0941\u0930\u094d\u0924\u0940 \u0928\u092e\u0942\u0928\u093e.pdf", "application/pdf"), "\u0915\u0941\u0930\u094d\u0924\u0940 \u0928\u092e\u0942\u0928\u093e.pdf");
  assert.equal(referenceFilename("C:\\fakepath\\front.jpg", "image/webp"), "front.webp");
  assert.equal(referenceFilename("evil\u202Ename\u0000.pdf", "application/pdf"), "evilname.pdf");
  assert.equal(referenceFilename("...", "application/pdf"), "design-reference.pdf");
  assert.deepEqual(mediaMetadata({ mime: "application/pdf", filename: "board.pdf", bytes: 300, pageCount: 3 }), { mime: "application/pdf", mimeType: "application/pdf", filename: "board.pdf", bytes: 300, pageCount: 3 });
});

test("encrypted references fail closed before any stored document is produced", async () => {
  const input = await pdf(1, doc => {
    doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: "Standard", V: 1, R: 2, O: PDFString.of("owner"), U: PDFString.of("user"), P: -4 }));
  });
  await assert.rejects(prepareReferencePdf(input), { code: "INVALID_PDF" });
});
