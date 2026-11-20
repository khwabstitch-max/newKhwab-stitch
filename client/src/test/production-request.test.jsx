import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { calculateEstimate, estimateInput } from "../../../server/src/pricing.js";
import { orderInput } from "../../../server/src/domain.js";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {} }));
vi.mock("../lib/api", async original => ({ ...(await original()), api: boundary.api }));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
import { RequestWizard } from "../pages/Request";
import { createDraft, saveDraft, loadDraft } from "../lib/drafts";
import { setLanguage, t } from "../i18n/core";

const id = n => n.toString(16).padStart(24, "0");
const design = { _id: id(1), garment: "kurti", code: "K-0", title: "Floral kurti", titleHi: "फ्लोरल कुर्ती", startingPricePaise: 30000, defaultComponents: {}, coverImageUrl: "/design-library/teal-kurti-board.png", images: [{ url: "/design-library/teal-kurti-board.png" }] };
const sleeve = { _id: id(2), code: "SD-0", kind: "sleeve", name: "Straight sleeve", nameHi: "सीधी आस्तीन", garments: ["kurti"], status: "published", active: true, priceMode: "additional", amountPaise: 5000, imageUrl: "/guides/design/sleeve-straight.webp" };
const address = { line1: "12 Test road", city: "Delhi", state: "Delhi", pin: "110001" };
const settings = { serviceAreas: [{ name: "Delhi local", nameHi: "दिल्ली स्थानीय", pinPrefixes: ["110001"], enabled: true, inboundPaise: 8000, outboundPaise: 10000 }] };
const list = data => ({ data, pagination: { page: 1, pages: 1, total: data.length } });
let currentDesign;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); setLanguage("en", false);
  currentDesign = design;
  boundary.auth = { profile: { _id: id(50), name: "Meera", phone: "919876543210" } };
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  boundary.api.mockReset().mockImplementation(async (path, request = {}) => {
    if (path.startsWith("/designs/id/")) return { data: currentDesign };
    if (path.startsWith("/designs")) return list([currentDesign]);
    if (path.startsWith("/services")) return list([{ itemTypes: ["kurti", "suit", "blouse", "alteration"] }]);
    if (path.startsWith("/options")) return list([sleeve]);
    if (path === "/settings") return { data: settings };
    if (path === "/pricing/estimate") return { data: calculateEstimate(estimateInput.parse(request.body), { design: request.body.configuration.source === "reference" ? null : currentDesign, options: [sleeve], settings }) };
    if (path.includes("/access")) return { data: { url: "/private-reference.jpg" } };
    if (path === "/drafts") return { data: { _id: id(60), revision: 0, data: request.body.data } };
    if (path === "/orders") return { data: { _id: id(70) } };
    return list([]);
  });
});
afterEach(() => { vi.restoreAllMocks(); setLanguage("en", false); });
function mount(initial = {}) {
  const draft = createDraft({ designId: currentDesign._id, garment: currentDesign.garment, step: "design", customer: { name: "Meera", phone: "919876543210" }, ...initial });
  saveDraft(draft);
  render(<MemoryRouter initialEntries={["/request?draft=" + draft.id + "&step=" + draft.step]}><Routes><Route path="/request" element={<RequestWizard />} /><Route path="*" element={<p>Submitted request</p>} /></Routes></MemoryRouter>);
  return draft;
}
it("keeps pricing in final review and gives garment-specific customization checkboxes", async () => {
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText("Customize this design"));
  expect(screen.getByText(/For your kurti:/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Sleeve design", exact: true })).not.toBeChecked();
  expect(screen.queryByText("YOUR STITCHING ESTIMATE")).not.toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "Sleeve design", exact: true }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(await screen.findByRole("radio", { name: /Straight sleeve/ }));
  expect(screen.queryByText("YOUR STITCHING ESTIMATE")).not.toBeInTheDocument();
});
it("requires a sample acknowledgement, excludes parked numeric values and saves the measurement plan on submission", async () => {
  const draft = mount({ step: "measurements", measurements: { takenBy: "self", method: "body", unit: "cm", values: { bust: 90 }, reconfirmFields: ["bust"] } });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("radio", { name: /I will send a well-fitting stitched garment/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Confirm that you will include the sample garment");
  await user.click(screen.getByRole("checkbox", { name: /I will include the well-fitting sample/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("How will your fabric and sample garment reach us?")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "₹300" });
  await user.click(screen.getByRole("checkbox", { name: /I provide the fabric/ }));
  await user.click(screen.getByRole("button", { name: "Submit Stitching Request" }));
  await waitFor(() => expect(boundary.api.mock.calls.some(([path]) => path === "/orders")).toBe(true));
  const body = boundary.api.mock.calls.find(([path]) => path === "/orders")[1].body;
  expect(body.measurements).toMatchObject({ takenBy: "sample", method: "garment", sampleGarmentIncluded: true, values: {}, reconfirmFields: [] });
  expect(orderInput.safeParse(body).success).toBe(true);
  expect(draft.id).toBeTruthy();
});
it("supports online help in Hindi and preserves manual values when switching back", async () => {
  setLanguage("hi", false);
  const draft = mount({ step: "measurements", measurements: { takenBy: "self", method: "body", unit: "cm", values: { bust: 90 } } });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("radio", { name: new RegExp(t("request.measurement.assistance")) }));
  expect(screen.getByText(t("request.measurement.helpNote"))).toBeInTheDocument();
  expect(screen.queryByRole("spinbutton", { name: /Bust/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: new RegExp(t("request.measurement.self")) }));
  expect(screen.getByLabelText(t("What is being measured?"))).toHaveValue("body");
  expect(loadDraft(draft.id).measurements.values.bust).toBe(90);
});
it("shows charged pickup and delivery, PIN-specific line items and the preferred date reason in final review", async () => {
  mount({ step: "logistics", logistics: { inbound: { method: "business", address }, outbound: { method: "business", address } }, preferredDate: "2027-01-20", preferredDateReason: "Family celebration" });
  const user = userEvent.setup();
  expect(await screen.findAllByText(t("request.transport.paidHint"))).toHaveLength(2);
  expect(screen.queryByText("YOUR STITCHING ESTIMATE")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "₹480" });
  const price = screen.getByText("YOUR STITCHING ESTIMATE").closest("section");
  expect(within(price).getByText("₹80")).toBeInTheDocument();
  expect(within(price).getByText("₹100")).toBeInTheDocument();
  expect(within(price).getAllByText(/110001/)).toHaveLength(2);
  expect(screen.getByText(/Family celebration/)).toBeInTheDocument();
});
it("reviews uploaded references without advertising a fixed stitching price", async () => {
  mount({ designId: "", step: "review", referenceMediaIds: [id(30)], configuration: { source: "reference", mode: "custom", changedParts: ["sleeve"], components: { sleeve: { source: "option", optionId: sleeve._id } }, addonIds: [] } });
  await screen.findByRole("heading", { name: t("request.uploadedPrice") });
  expect(screen.getByText(t("request.uploadedPriceNote"))).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "₹300" })).not.toBeInTheDocument();
  const images = await screen.findByRole("region", { name: t("request.reviewImages") });
  expect(within(images).getByText("SD-0")).toBeInTheDocument();
  await waitFor(() => expect(document.querySelector('img[src="/private-reference.jpg"]')).toBeTruthy());
});
it("treats alteration as an existing-garment service and drops garment-style customization", async () => {
  currentDesign = { ...design, garment: "alteration", code: "A-0", title: "Garment Fitting & Alterations", startingPricePaise: 15000, designDetails: { scope: "Waist, sleeve and hem adjustments", fitting: "Confirm garment margins first" } };
  const draft = mount({ configuration: { source: "catalogue", mode: "custom", changedParts: ["sleeve"], components: { sleeve: { source: "option", optionId: sleeve._id } } } });
  await screen.findByRole("heading", { name: t("request.alterationTitle") });
  expect(screen.queryByLabelText("Customize this design")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Sleeve design", exact: true })).not.toBeInTheDocument();
  expect(loadDraft(draft.id).configuration.components).toEqual({});
  expect(screen.getAllByText(t("request.alterationNotice")).length).toBeGreaterThan(0);
});

it("uses an existing-garment acknowledgement for alteration review", async () => {
 currentDesign = { ...design, garment: "alteration", code: "A-0", title: "Garment Fitting & Alterations", startingPricePaise: 15000 };
 mount({step:"review",measurements:{method:"assistance",takenBy:"assistance",values:{},notes:"Shorten the hem"}});
 await screen.findByRole("heading",{name:"₹150"});
 expect(screen.getByRole("checkbox",{name:/I will provide the existing garment/})).toBeInTheDocument();
 expect(screen.queryByRole("checkbox",{name:/I provide the fabric/})).not.toBeInTheDocument();
});
