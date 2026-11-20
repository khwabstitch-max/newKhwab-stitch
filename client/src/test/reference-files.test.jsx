import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async original => ({ ...(await original()), api: boundary.api }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ profile: { _id: "f".repeat(24), role: "admin" } }) }));
import { ReferenceFilePreview } from "../components/ReferenceFilePreview";
import { OrderDetails, OrderReferenceGallery, PrivateImage } from "../pages/Orders";
import { setLanguage, t } from "../i18n/core";

beforeEach(() => { setLanguage("en", false); boundary.api.mockReset(); });
afterEach(() => { setLanguage("en", false); vi.restoreAllMocks(); });
it("renders a signed extensionless PDF as a document with a safe open link and no image or iframe", async () => {
  boundary.api.mockResolvedValue({ data: { url: "https://private.example.test/signed-token", mimeType: "application/pdf", filename: "front-side-back.pdf", bytes: 2048, pageCount: 3 } });
  render(<ReferenceFilePreview mediaId={"a".repeat(24)} label="My reference" />);
  const link = await screen.findByRole("link", { name: /Open PDF/ });
  expect(link).toHaveAttribute("href", "https://private.example.test/signed-token");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(document.querySelector("iframe")).toBeNull();
  expect(screen.getByText("3 pages · 2 KB")).toBeInTheDocument();
});
it("shows JPEG/PNG previews and can remove one file without affecting other references", async () => {
  const removed = vi.fn();
  boundary.api.mockResolvedValue({ data: { url: "/front.png", mime: "image/png", filename: "front.png" } });
  render(<ReferenceFilePreview mediaId={"b".repeat(24)} label="Front view" onRemove={removed} />);
  expect(await screen.findByRole("img", { name: "Front view" })).toHaveAttribute("src", "/front.png");
  await userEvent.click(screen.getByRole("button", { name: "Remove Front view" }));
  expect(removed).toHaveBeenCalledOnce();
});
it("retries denied access, refreshes expired image links and preserves PDF metadata through Hindi switching", async () => {
  boundary.api.mockRejectedValueOnce(new Error("Reference access failed")).mockResolvedValueOnce({ data: { url: "/view.jpeg", mimeType: "image/jpeg" } }).mockResolvedValueOnce({ data: { url: "/signed.pdf", mimeType: "application/pdf", filename: "reference.pdf" } });
  const user = userEvent.setup();
  render(<ReferenceFilePreview mediaId={"c".repeat(24)} />);
  await screen.findByText("Reference access failed");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  const image = await screen.findByRole("img");
  fireEvent.error(image);
  await screen.findByText(t("reference.file.unavailable"));
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: /Open PDF/ });
  act(() => setLanguage("hi", false));
  await screen.findByRole("link", { name: new RegExp(t("reference.file.openPdf")) });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("cancels reference access on unmount and keeps disabled upload-time removal inactive", async () => {
  let signal;
  boundary.api.mockImplementation((path, options) => { signal = options.signal; return new Promise(() => {}); });
  const removed = vi.fn();
  const view = render(<ReferenceFilePreview mediaId={"d".repeat(24)} label="Back" disabled onRemove={removed} />);
  expect(screen.getByRole("button", { name: "Remove Back" })).toBeDisabled();
  view.unmount();
  expect(signal.aborted).toBe(true);
});
it("keeps legacy manual private-image controls while showing PDF metadata after access", async () => {
  boundary.api.mockResolvedValue({ data: { url: "/document.pdf", mime: "application/pdf" } });
  render(<PrivateImage mediaId={"e".repeat(24)} />);
  expect(boundary.api).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "View private reference" }));
  await screen.findByRole("link", { name: /Open PDF/ });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("resolves snapshotted design, chosen components and multi-file references through historical order access for its quote", async () => {
  const orderId = "1".repeat(24), main = "2".repeat(24), sleeve = "3".repeat(24), front = "4".repeat(24), pdf = "5".repeat(24);
  const order = { _id: orderId, orderNumber: "KS-TEST", garment: "kurti", quantity: 1, status: "under_review", revision: 0, createdAt: "2026-11-20", designSnapshot: { title: "Submitted kurti", code: "K-0", imageMediaIds: [main], imageViews: [{ mediaId: main, label: "Front view" }] }, estimate: { knownSubtotalPaise: 30000, lineItems: [], pendingItems: [], components: { sleeve: { optionId: "6".repeat(24), name: "Puff sleeve", code: "SD-0", imageMediaIds: [sleeve] } } }, referenceMediaIds: [front, pdf], referenceSnapshots: [{ mediaId: pdf, mimeType: "application/pdf", filename: "board.pdf" }], configuration: { source: "catalogue", mode: "custom", components: { neck: { source: "reference", referenceMediaId: pdf } } }, measurements: { method: "assistance", values: {} }, customer: {}, quotes: [{ version: 1, amountPaise: 35000, deliveryDate: "2027-01-20", notes: "Reviewed against submitted references" }], timeline: [] };
  boundary.api.mockImplementation(async path => {
    if (path === "/admin/orders/" + orderId) return { data: order };
    if (path.startsWith("/orders/" + orderId + "/media/")) { const fileId = path.split("/").at(-1); return { data: { url: "/" + fileId + (fileId === pdf ? ".pdf" : ".png"), mimeType: fileId === pdf ? "application/pdf" : "image/png", filename: fileId === pdf ? "board.pdf" : "reference.png", width: 1536, height: 1024 } }; }
    return { data: [] };
  });
  render(<MemoryRouter initialEntries={["/admin/orders/" + orderId]}><Routes><Route path="/admin/orders/:id" element={<OrderDetails admin />} /></Routes></MemoryRouter>);
  await screen.findByRole("link", { name: /Open PDF/ });
  expect(screen.getByRole("link", { name: t("reference.quote.link") })).toHaveAttribute("href", "#order-design-references");
  expect(screen.getByRole("img", { name: "Submitted kurti · Front view" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Puff sleeve · SD-0/ })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Submitted reference 1" })).toBeInTheDocument();
  expect(screen.getByText("Submitted reference 2 · board.pdf")).toBeInTheDocument();
  expect(boundary.api.mock.calls.filter(([path]) => path.startsWith("/orders/" + orderId + "/media/"))).toHaveLength(4);
});
it("preserves known generated blouse photography for its immutable design snapshot", () => {
  render(<OrderReferenceGallery order={{ _id: "a".repeat(24), designId: "6aec91f75fea93612231bd82", designSnapshot: { title: "Submitted blouse", slug: "demo-celebration-blouse", garment: "blouse", code: "B-0" }, referenceMediaIds: [] }} />);
  expect(screen.getByRole("img", { name: "Submitted blouse · Front view" })).toHaveAttribute("src", "/atelier/catalogue/celebration-blouse/category-v2.webp");
  expect(boundary.api).not.toHaveBeenCalled();
});

it("keeps selected sleeve length, neckline and sleeve guide images in a quote without admin image uploads", () => {
 const part = (code, name, extra = {}) => ({source:"option",optionId:code,code,name,...extra});
 render(<OrderReferenceGallery order={{_id:"a".repeat(24),estimate:{components:{sleeveLength:part("SL-0","Sleeveless",{lengthStyle:"sleeveless"}),sleeve:part("SD-0","Straight sleeve"),neck:part("FN-0","Round neck"),back:part("BN-0","Simple back"),fit:part("FT-0","Comfort fit")},addons:[part("AD-0","Hand finishing")]},referenceMediaIds:[]}} />);
 expect(screen.getByRole("img",{name:"Sleeveless design option"})).toHaveAttribute("src","/crops/length/sleeveless.jpg");
 expect(screen.getByRole("img",{name:"Straight sleeve design option"})).toHaveAttribute("src","/crops/sleeve/straight-plain.jpg");
 expect(screen.getByRole("img",{name:"Round neck design option"})).toHaveAttribute("src","/crops/neck/round-neck.jpg");
 expect(screen.getByRole("img",{name:"Simple back design option"})).toHaveAttribute("src","/crops/back/simple-back.jpg");
 expect(screen.getAllByRole("img")).toHaveLength(4);
 expect(screen.getByText(/SL-0/)).toBeInTheDocument();
 expect(screen.queryByText(/FT-0/)).not.toBeInTheDocument();
 expect(screen.queryByText(/AD-0/)).not.toBeInTheDocument();
 expect(boundary.api).not.toHaveBeenCalled();
});
