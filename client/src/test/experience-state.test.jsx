import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { LanguageProvider, LanguageSwitcher } from "../i18n/Language";
import { setLanguage, t } from "../i18n/core";
import { createDraft, saveDraft } from "../lib/drafts";
import { GuideModal } from "../components/GuideModal";
import { SiteProvider } from "../lib/hooks";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {} }));
vi.mock("../lib/api", async original => ({ ...(await original()), api: boundary.api }));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
import { RequestWizard } from "../pages/RequestFlow";
import { OrderList } from "../pages/Orders";

const paginated = (data = []) => ({ data, pagination: { page: 1, pages: 3, total: data.length } });
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setLanguage("en");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  boundary.auth = { loading: false, user: null, profile: null };
  boundary.api.mockReset().mockResolvedValue(paginated());
});
afterEach(() => { act(() => setLanguage("en")); vi.restoreAllMocks(); });
function RouteState() {
  const location = useLocation(), navigate = useNavigate();
  return <><output aria-label="Current route">{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Browser back</button></>;
}
function mount(content, route) {
  return render(<LanguageProvider><LanguageSwitcher /><MemoryRouter initialEntries={[route]}>{content}<RouteState /></MemoryRouter></LanguageProvider>);
}
function language(value) {
  fireEvent.change(screen.getByRole("combobox", { name: t("Choose language") }), { target: { value } });
}
it("opens a fresh reference request from the homepage CTA and preserves it when the language changes", async () => {
  mount(<RequestWizard />, "/request?source=reference&garment=blouse");
  expect(screen.getByRole("radio", { name: "Upload my own reference" })).toBeChecked();
  expect(screen.queryByLabelText("Find a design")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Quantity/), { target: { value: "3" } });
  language("hi");
  expect(screen.getByRole("radio", { name: t("Upload my own reference") })).toBeChecked();
  expect(screen.getByLabelText(new RegExp("^" + t("Quantity")))).toHaveValue(3);
  expect(screen.getByLabelText("Current route").textContent).toContain("/request?");
  expect(boundary.api.mock.calls.some(([, options]) => options?.method === "POST" && options?.body?.submissionKey)).toBe(false);
  await waitFor(() => expect(screen.getByRole("radio", { name: t("Blouse") })).toBeChecked());
});
it("does not let a reference-entry query overwrite a restored catalogue draft, measurements or private notes", async () => {
  const draft = createDraft({
    garment: "kurti", quantity: 2,
    designId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    configuration: { source: "catalogue", mode: "exact" },
    measurements: { unit: "in", method: "body", values: { bust: 36 } },
    notes: "Please keep my own English note",
  });
  saveDraft(draft);
  mount(<RequestWizard />, `/request?draft=${draft.id}&source=reference`);
  expect(screen.getByRole("radio", { name: "Choose a Khwab Stitch design" })).toBeChecked();
  expect(screen.getByLabelText(/^Quantity/)).toHaveValue(2);
  language("hi");
  expect(screen.getByRole("radio", { name: t("Choose a Khwab Stitch design") })).toBeChecked();
  const stored = JSON.parse(sessionStorage.getItem(`khwab:request:v2:${draft.id}`));
  expect(JSON.stringify(stored)).toContain("Please keep my own English note");
  expect(JSON.stringify(stored)).toContain("36");
  await waitFor(() => expect(screen.getByLabelText(new RegExp("^" + t("Quantity")))).toHaveValue(2));
});
it("sends a guest to sign-in before a private file picker with a saved draft and safe return route", () => {
  mount(<RequestWizard />, "/request?source=reference");
  const action = screen.getByRole("link", { name: "Sign in for private uploads" });
  const target = new URL(action.href);
  expect(target.pathname).toBe("/login");
  expect(target.searchParams.get("returnTo")).toMatch(/^\/request\?draft=[a-f\d-]+&step=design$/);
  expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  fireEvent.click(action);
  const key = Object.keys(localStorage).find(value => value.startsWith("khwab:request:v2:"));
  expect(JSON.parse(localStorage.getItem(key)).data.configuration.source).toBe("reference");
  expect(boundary.api.mock.calls.some(([url]) => url.startsWith("/media"))).toBe(false);
});
it("shows owner-authored Hindi policies, preserves English wording and identifies a missing policy translation", async () => {
  const draft = createDraft({
    configuration: { source: "reference", mode: "custom", changedParts: [] },
    measurements: { method: "body", takenBy: "self", unit: "in", values: { bust: 36 } },
    step: "measurements",
  });
  saveDraft(draft);
  boundary.api.mockImplementation(async url => url === "/settings" ? { data: { policies: { assurance: "Owner's exact assurance", assuranceHi: "मालिक की तय भरोसे की नीति", alterationMargin: "Owner's exact margin conditions" } } } : paginated());
  setLanguage("hi");
  mount(<SiteProvider><RequestWizard /></SiteProvider>, `/request?draft=${draft.id}&step=measurements`);
  expect(await screen.findByText("मालिक की तय भरोसे की नीति")).toBeInTheDocument();
  expect(screen.getByText("Owner's exact margin conditions")).toHaveAttribute("lang", "en");
  expect(screen.getByText(t("Policy text is shown in its original English because a Hindi translation has not been added. Ask our team if you need help."))).toBeInTheDocument();
  language("en");
  expect(screen.getByText("Owner's exact assurance")).toBeInTheDocument();
  expect(screen.queryByText("मालिक की तय भरोसे की नीति")).not.toBeInTheDocument();
});
it("honors valid dashboard status links and preserves filters through language switching and browser back", async () => {
  mount(<OrderList admin />, "/admin/orders?status=request_received&source=dashboard");
  expect(screen.getByLabelText("Filter status")).toHaveValue("request_received");
  await waitFor(() => expect(boundary.api).toHaveBeenCalledWith(expect.stringContaining("status=request_received"), expect.anything()));
  fireEvent.change(screen.getByLabelText("Filter status"), { target: { value: "ready" } });
  language("hi");
  expect(screen.getByLabelText(t("Filter status"))).toHaveValue("ready");
  expect(screen.getByLabelText("Current route").textContent).toContain("source=dashboard");
  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  await waitFor(() => expect(screen.getByLabelText(t("Filter status"))).toHaveValue("request_received"));
});
it("excludes invalid status query values from protected order requests", async () => {
  mount(<OrderList admin />, "/admin/orders?status=__private_role_override__&page=-3");
  expect(screen.getByLabelText("Filter status")).toHaveValue("");
  await waitFor(() => expect(boundary.api).toHaveBeenCalled());
  expect(boundary.api.mock.calls[0][0]).toBe("/admin/orders?page=1&limit=15");
});
it("keeps guide focus inside the dialog and returns focus after native cancel and keyboard close", () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Open guide</button>{open && <GuideModal title="Measurement guide" imageUrl="/guides/test.jpg" onClose={() => setOpen(false)} />}</>;
  }
  mount(<Example />, "/request");
  const opener = screen.getByRole("button", { name: "Open guide" });
  opener.focus(); fireEvent.click(opener);
  const close = screen.getByRole("button", { name: "Close guide" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  fireEvent.click(opener);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(opener).toHaveFocus();
});
