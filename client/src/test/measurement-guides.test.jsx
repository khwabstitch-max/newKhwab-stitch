import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const boundary = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (original) => ({ ...(await original()), api: boundary.api }));
import { MeasurementGuides } from "../components/MeasurementGuides";
import { AdminMeasurementGuides } from "../pages/AdminMeasurementGuides";
import { setLanguage } from "../i18n/core";

const guideId = "a".repeat(24), publicId = "b".repeat(24), privateId = "c".repeat(24);
const list = (data = []) => ({ data, pagination: { page: 1, pages: 1, total: data.length, limit: 20 } });
const guide = (rest = {}) => ({
  _id: guideId, code: "KURTI-BODY", name: "Body tape guide", nameHi: "शरीर का नाप",
  garment: "kurti", method: "body", language: "und", instructions: "Use your own bust circumference; the pictured 36 inches is an example only.",
  instructionsHi: "अपने शरीर का नाप लें; चित्र में दिया गया नाप केवल उदाहरण है।",
  measurementFields: ["bust"], imageMediaIds: [publicId], images: [{ id: publicId, url: "/public-guide.jpg" }],
  status: "published", revision: 6, displayOrder: 2, ...rest,
});

beforeEach(() => { setLanguage("en", false); boundary.api.mockReset(); });

function Customer({ garment = "kurti", method = "body" }) {
  const [ids, setIds] = useState([]);
  return <><MeasurementGuides garment={garment} method={method} selectedIds={ids} onSelect={setIds} /><output data-testid="chosen-guides">{JSON.stringify(ids)}</output></>;
}

it("matches garment, method, language and publication without prefilling illustrated measurements", async () => {
  boundary.api.mockResolvedValue(list([
    guide(), guide({ _id: "d".repeat(24), garment: "blouse", name: "Wrong garment guide" }),
    guide({ _id: "e".repeat(24), method: "garment", name: "Wrong method guide" }),
    guide({ _id: "f".repeat(24), language: "hi", name: "Hindi only guide" }),
    guide({ _id: "1".repeat(24), status: "draft", name: "Draft instructions" }),
  ]));
  const { container } = render(<Customer />);
  expect(await screen.findByRole("heading", { name: "Body tape guide" })).toBeInTheDocument();
  for (const text of ["Wrong garment guide", "Wrong method guide", "Hindi only guide", "Draft instructions"]) expect(screen.queryByText(text)).not.toBeInTheDocument();
  expect(container.querySelector('input[type="number"]')).toBeNull();
  expect(screen.getByTestId("chosen-guides")).toHaveTextContent("[]");
  await userEvent.click(screen.getByRole("checkbox", { name: "I used this guide" }));
  expect(screen.getByTestId("chosen-guides")).toHaveTextContent(guideId);
  expect(boundary.api.mock.calls[0][0]).toMatch(/garment=kurti.*method=body.*language=en/);
});

it("does not request unrelated guides while measurement assistance is selected", async () => {
  boundary.api.mockResolvedValue(list());
  render(<Customer method="assistance" />);
  await screen.findByText(/No matching guide is available/);
  expect(boundary.api).not.toHaveBeenCalled();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("uses Hindi instructions in both guide cards and the enlarged guide", async () => {
  setLanguage("hi", false);
  boundary.api.mockResolvedValue(list([guide()]));
  render(<Customer />);
  const title = await screen.findByRole("heading", { name: "शरीर का नाप" });
  expect(title).toBeInTheDocument();
  expect(screen.getByText(guide().instructionsHi)).toBeInTheDocument();
  const enlarge = screen.getByRole("button", { name: /शरीर का नाप/ });
  await userEvent.click(enlarge);
  const dialog = screen.getByRole("dialog", { name: "शरीर का नाप" });
  expect(within(dialog).getByText(guide().instructionsHi)).toBeInTheDocument();
  expect(within(dialog).queryByText(guide().instructions)).not.toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(enlarge).toHaveFocus();
});

it("shows an honest missing-guide state without submitting any fabricated values", async () => {
  boundary.api.mockResolvedValue(list());
  render(<Customer garment="blouse" method="garment" />);
  expect(await screen.findByText(/No matching guide is available/)).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(boundary.api.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
});

it("loads later guide pages while retaining the customer's earlier guide selection", async () => {
  const laterId = "9".repeat(24);
  boundary.api.mockImplementation(async (path) => ({
    data: path.includes("page=2") ? [guide({ _id: laterId, name: "Later-page guide", code: "LATER" })] : [guide()],
    pagination: { page: path.includes("page=2") ? 2 : 1, pages: 2, total: 21, limit: 20 },
  }));
  render(<Customer />);
  await screen.findByRole("heading", { name: "Body tape guide" });
  await userEvent.click(screen.getByRole("checkbox", { name: "I used this guide" }));
  await userEvent.click(screen.getByRole("button", { name: "Load more guides" }));
  await screen.findByRole("heading", { name: "Later-page guide" });
  const earlier = screen.getByRole("heading", { name: "Body tape guide" }).closest("article");
  expect(within(earlier).getByRole("checkbox")).toBeChecked();
  expect(screen.getByTestId("chosen-guides")).toHaveTextContent(guideId);
  expect(screen.queryByRole("button", { name: "Load more guides" })).not.toBeInTheDocument();
});

function adminApi(initial = []) {
  let rows = initial;
  boundary.api.mockImplementation(async (path, options = {}) => {
    if (path.startsWith("/media?")) return list([
      { _id: publicId, purpose: "catalogue", private: false, url: "/public.jpg" },
      { _id: privateId, purpose: "reference", private: true, url: "/private-photo.jpg" },
    ]);
    if (path === `/media/${publicId}/access`) return { data: { url: "/public.jpg" } };
    if (options.method === "POST") { const saved = { ...options.body, _id: guideId, revision: 1 }; rows = [...rows, saved]; return { data: saved }; }
    if (options.method === "PATCH") { rows = rows.map(row => row._id === guideId ? { ...row, ...options.body, revision: row.revision + 1 } : row); return { data: rows[0] }; }
    if (options.method === "DELETE") return { data: {} };
    return list(rows);
  });
}
const writes = method => boundary.api.mock.calls.filter(([, options]) => options?.method === method);

it("creates a published guide using public media and persists its instructions after reload", async () => {
  adminApi(); render(<AdminMeasurementGuides />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "New measurement guide" }));
  const code = screen.getByLabelText(/Stable guide code/);
  await user.clear(code);
  await user.type(code, "KURTI-SELF");
  await user.type(screen.getByLabelText(/^Guide name/), "Safe self-measurement guide");
  await user.type(screen.getByLabelText("Guide instructions"), "Measure around the fullest point without tightening the tape.");
  await user.selectOptions(screen.getByLabelText("What is being measured?"), "body");
  await user.selectOptions(screen.getByLabelText("Guide status"), "published");
  await waitFor(() => expect(document.querySelectorAll('img[src="/public.jpg"]')).toHaveLength(1));
  expect(document.querySelector('img[src="/private-photo.jpg"]')).toBeNull();
  await user.click(screen.getByRole("checkbox", { name: "Catalogue image 1" }));
  await user.click(screen.getByRole("button", { name: "Save guide" }));
  await waitFor(() => expect(writes("POST")).toHaveLength(1));
  const body = writes("POST")[0][1].body;
  expect(body).toMatchObject({ code: "KURTI-SELF", name: "Safe self-measurement guide", garment: "kurti", method: "body", status: "published", imageMediaIds: [publicId] });
  expect(body).not.toHaveProperty("measurements");
  expect(body).not.toHaveProperty("revision");
  expect(await screen.findByRole("heading", { name: "Safe self-measurement guide" })).toBeInTheDocument();
  expect(screen.getByText("Measure around the fullest point without tightening the tape.")).toBeInTheDocument();
});

it("edits using the current revision while preserving images, method and existing instructions", async () => {
  adminApi([guide()]); render(<AdminMeasurementGuides />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit guide" }));
  await user.clear(screen.getByLabelText(/^Guide name/));
  await user.type(screen.getByLabelText(/^Guide name/), "Revised tape guide");
  await user.click(screen.getByRole("button", { name: "Save guide" }));
  await waitFor(() => expect(writes("PATCH")).toHaveLength(1));
  expect(writes("PATCH")[0]).toMatchObject([
    `/admin/measurement-guides/${guideId}`,
    { body: { revision: 6, name: "Revised tape guide", instructions: guide().instructions, imageMediaIds: [publicId], method: "body", status: "published" } },
  ]);
  expect(await screen.findByRole("heading", { name: "Revised tape guide" })).toBeInTheDocument();
});

it("keeps unsaved changes visible when a concurrent edit rejects the save", async () => {
  adminApi([guide()]);
  const original = boundary.api.getMockImplementation();
  boundary.api.mockImplementation((path, options) => options?.method === "PATCH" ? Promise.reject(new Error("This guide changed. Reload before saving.")) : original(path, options));
  render(<AdminMeasurementGuides />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit guide" }));
  const instructions = screen.getByLabelText("Guide instructions");
  await user.clear(instructions);
  await user.type(instructions, "Keep this unsaved instruction for recovery.");
  await user.click(screen.getByRole("button", { name: "Save guide" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("This guide changed.");
  expect(screen.getByLabelText("Guide instructions")).toHaveValue("Keep this unsaved instruction for recovery.");
});

it("sends revision-checked archive or permanent-delete intent instead of silently deleting references", async () => {
  adminApi([guide()]);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<AdminMeasurementGuides />);
  await userEvent.click(await screen.findByRole("button", { name: "Archive guide" }));
  await waitFor(() => expect(writes("DELETE")).toHaveLength(1));
  expect(writes("DELETE")[0]).toMatchObject([`/admin/measurement-guides/${guideId}`, { body: { revision: 6, permanent: false } }]);
  await userEvent.click(screen.getByRole("button", { name: "Delete unused guide permanently" }));
  await waitFor(() => expect(writes("DELETE")).toHaveLength(2));
  expect(writes("DELETE")[1][1].body).toEqual({ revision: 6, permanent: true });
  confirm.mockRestore();
});
