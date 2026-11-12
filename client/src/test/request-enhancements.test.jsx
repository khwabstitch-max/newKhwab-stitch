import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {} }));
vi.mock("../lib/api", async (original) => ({
  ...(await original()),
  api: boundary.api,
}));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
import { RequestWizard } from "../pages/Request";
import { createDraft, saveDraft, loadDraft } from "../lib/drafts";
const designId = "aaaaaaaaaaaaaaaaaaaaaaaa",
  sleeveId = "bbbbbbbbbbbbbbbbbbbbbbbb",
  referenceId = "cccccccccccccccccccccccc";
const design = {
  _id: designId,
  garment: "kurti",
  title: "Garden kurti",
  code: "K-01",
  startingPricePaise: 65000,
  defaultComponents: {},
};
const sleeve = {
  _id: sleeveId,
  kind: "sleeve",
  name: "Full sleeve",
  description: "Long sleeves",
  garments: ["kurti"],
  active: true,
  priceMode: "additional",
  amountPaise: 15000,
  sleeveStyle: "full",
};
const list = (data) => ({
  data,
  pagination: { page: 1, pages: 1, total: data.length },
});
function Destination() {
  const p = useLocation();
  return <output data-testid="destination">{p.pathname + p.search}</output>;
}
function mount(path = `/request?design=${designId}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/request" element={<RequestWizard />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  boundary.auth = {
    profile: {
      _id: "dddddddddddddddddddddddd",
      name: "Meera",
      phone: "919876543210",
    },
  };
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  boundary.api.mockReset().mockImplementation(async (path, options = {}) => {
    if (path.startsWith("/designs")) return list([design]);
    if (path.startsWith("/options")) return list([sleeve]);
    if (path.startsWith("/services")) return list([{ itemTypes: ["kurti"] }]);
    if (path === "/pricing/estimate")
      return {
        data: {
          knownSubtotalPaise:
            65000 +
            (options.body.configuration.components.sleeve?.optionId
              ? 15000
              : 0),
          lineItems: [],
          pendingItems: [],
          hasPending: false,
          components: {},
          configurationVersion: "a".repeat(64),
        },
      };
    if (path.includes("/access"))
      return { data: { url: "https://private.example.test/signed-image" } };
    if (path === "/drafts")
      return {
        data: {
          _id: "eeeeeeeeeeeeeeeeeeeeeeee",
          revision: 0,
          data: options.body.data,
        },
      };
    return list([]);
  });
});
it("guest review preserves the full draft and asks for login without creating an order", async () => {
  boundary.auth = {};
  mount();
  const user = userEvent.setup();
  await screen.findByText("Same as shown");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText(/^Your name/), "Guest customer");
  await user.type(screen.getByLabelText(/^WhatsApp/), "9876543210");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(
    screen.getByRole("checkbox", { name: /I provide the fabric/ }),
  );
  await user.click(
    screen.getByRole("button", { name: "Submit Stitching Request" }),
  );
  const destination = await screen.findByTestId("destination");
  expect(destination).toHaveTextContent("/login?returnTo=");
  const route = new URL(
      destination.textContent,
      "https://test.invalid",
    ).searchParams.get("returnTo"),
    id = new URL(route, "https://test.invalid").searchParams.get("draft");
  expect(loadDraft(id).customer.name).toBe("Guest customer");
  expect(loadDraft(id).designId).toBe(designId);
  expect(boundary.api.mock.calls.some(([p]) => p === "/orders")).toBe(false);
});
it("only the requested component appears, and choosing a sleeve proceeds directly to measurements", async () => {
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText("Customize this design"));
  await user.click(
    screen.getByRole("checkbox", { name: "Sleeve design", exact: true }),
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    screen.getByRole("heading", { level: 2, name: "Sleeve design" }),
  ).toBeInTheDocument();
  await user.click(await screen.findByRole("radio", { name: /Full sleeve/ }));
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "₹800" })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    screen.getByRole("heading", { name: "Your fit", level: 2 }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Front neck design", level: 2 }),
  ).not.toBeInTheDocument();
});
it("cancel editing restores that section and preserves unrelated notes and selections", async () => {
  const d = createDraft({
    designId,
    step: "review",
    customer: { name: "Original customer", phone: "919876543210" },
    notes: "Keep this instruction",
  });
  saveDraft(d);
  mount(`/request?draft=${d.id}&step=review`);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Edit Fabric and transport" }),
  );
  await user.clear(screen.getByLabelText(/^Your name/));
  await user.type(screen.getByLabelText(/^Your name/), "Changed customer");
  await user.click(screen.getByRole("button", { name: "Cancel changes" }));
  expect(screen.getByText(/Original customer/)).toBeInTheDocument();
  expect(screen.getByText("Keep this instruction")).toBeInTheDocument();
  expect(screen.queryByText(/Changed customer/)).not.toBeInTheDocument();
});
it("following a reference hides that component gallery while the next component may use catalogue options", async () => {
  const d = createDraft({
    step: "component-sleeve",
    configuration: {
      source: "reference",
      mode: "custom",
      changedParts: ["sleeve", "neck", "back"],
      components: {},
      addonIds: [],
    },
    referenceMediaIds: [referenceId],
  });
  saveDraft(d);
  mount(`/request?draft=${d.id}&step=component-sleeve`);
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Follow my uploaded reference"));
  expect(
    screen.queryByRole("radio", { name: /Full sleeve/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Price after tailor review/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    screen.getByRole("heading", { name: "Front neck design", level: 2 }),
  ).toBeInTheDocument();
  await user.click(screen.getByLabelText("Choose from Khwab Stitch designs"));
  expect(
    screen.getByText(
      /No design options|No matching|No options|No compatible options/i,
    ),
  ).toBeInTheDocument();
});

it("parks a catalogue sleeve through reference mode and refreshes admin edits without losing its notes", async () => {
  const d = createDraft({ designId, step: "component-sleeve", referenceMediaIds: [referenceId], configuration: { source: "catalogue", mode: "custom", changedParts: ["sleeve"], components: { sleeve: { source: "option", optionId: sleeveId, notes: "Keep this sleeve note" } }, addonIds: [] } });
  saveDraft(d);
  mount(`/request?draft=${d.id}&step=component-sleeve`);
  const user = userEvent.setup();
  expect(await screen.findByRole("radio", { name: /Full sleeve/ })).toBeChecked();
  const sleeveRequests = () => boundary.api.mock.calls.filter(([path]) => path.startsWith("/options?") && new URL(path, "https://test.invalid").searchParams.get("kind") === "sleeve").length;
  const before = sleeveRequests();
  await user.click(screen.getByLabelText("Follow my uploaded reference"));
  expect(screen.queryByRole("radio", { name: /Full sleeve/ })).not.toBeInTheDocument();
  expect(sleeveRequests()).toBe(before);
  await user.click(screen.getByLabelText("Choose from Khwab Stitch designs"));
  expect(await screen.findByRole("radio", { name: /Full sleeve/ })).toBeChecked();
  expect(screen.getByLabelText("Notes for this part (optional)")).toHaveValue("Keep this sleeve note");
  const fallback = boundary.api.getMockImplementation();
  boundary.api.mockImplementation(async (path, options) => path.startsWith("/options?") && new URL(path, "https://test.invalid").searchParams.get("kind") === "sleeve" ? list([{ ...sleeve, name: "Refreshed sleeve" }]) : fallback(path, options));
  await user.click(screen.getByRole("button", { name: "Refresh designs" }));
  expect(await screen.findByRole("radio", { name: /Refreshed sleeve/ })).toBeChecked();
  expect(screen.getByLabelText("Notes for this part (optional)")).toHaveValue("Keep this sleeve note");
});

it("shows a retryable selector failure before a genuinely empty successful result", async () => {
  const fallback = boundary.api.getMockImplementation();
  let fail = true;
  boundary.api.mockImplementation(async (path, options) => {
    if (path.startsWith("/options?") && new URL(path, "https://test.invalid").searchParams.get("kind") === "sleeve") {
      if (fail) return Promise.reject(new Error("Designs could not be loaded. Please retry."));
      return list([]);
    }
    return fallback(path, options);
  });
  const d = createDraft({ designId, step: "component-sleeve", configuration: { source: "catalogue", mode: "custom", changedParts: ["sleeve"], components: { sleeve: { source: "option" } }, addonIds: [] } });
  saveDraft(d);
  mount(`/request?draft=${d.id}&step=component-sleeve`);
  expect(await screen.findByText("Designs could not be loaded. Please retry.")).toBeInTheDocument();
  expect(screen.queryByText(/No compatible options are currently available/)).not.toBeInTheDocument();
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(/No compatible options are currently available/)).toBeInTheDocument();
  expect(screen.queryByText("Designs could not be loaded. Please retry.")).not.toBeInTheDocument();
});

it("loads later catalogue pages and preserves the chosen design through a server-side Hindi search", async () => {
  const later = {
    ...design,
    _id: "111111111111111111111111",
    title: "Later catalogue design",
  };
  const hindiMatch = {
    ...design,
    _id: "222222222222222222222222",
    title: "Lotus design",
    titleHi: "कमल डिज़ाइन",
  };
  const fallback = boundary.api.getMockImplementation();
  boundary.api.mockImplementation(async (path, options) => {
    if (path.startsWith("/designs/id/")) return { data: later };
    if (path.startsWith("/designs?")) {
      const query = new URL(path, "https://test.invalid").searchParams;
      expect(query.get("limit")).toBe("12");
      expect(query.get("garment")).toBe("kurti");
      if (query.get("search")) return list([hindiMatch]);
      const page = Number(query.get("page"));
      return {
        data: page === 1 ? [design] : [later],
        pagination: { page, pages: 2 },
      };
    }
    return fallback(path, options);
  });
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Load more catalogue designs" }),
  );
  await user.click(
    await screen.findByRole("radio", { name: /Later catalogue design/ }),
  );
  await user.type(
    screen.getByRole("searchbox", { name: "Find a design" }),
    "कमल",
  );
  expect(
    await screen.findByRole("radio", { name: /Lotus design/ }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByText("Later catalogue design")).toBeInTheDocument(),
  );
  expect(screen.getByLabelText("Same as shown")).toBeChecked();
  expect(screen.getByRole("searchbox", { name: "Find a design" })).toHaveValue(
    "कमल",
  );
});

it("reaches component choices beyond the first fifty with bounded requests and keeps earlier selections", async () => {
  const fallback = boundary.api.getMockImplementation();
  boundary.api.mockImplementation(async (path, options) => {
    if (path.startsWith("/options?")) {
      const query = new URL(path, "https://test.invalid").searchParams;
      if (query.get("kind") !== "sleeve") return list([]);
      expect(query.get("garment")).toBe("kurti");
      expect(query.get("limit")).toBe("12");
      const page = Number(query.get("page"));
      return {
        data: Array.from({ length: 12 }, (_, index) => ({
          ...sleeve,
          _id: String((page - 1) * 12 + index + 1).padStart(24, "0"),
          name: `Sleeve choice ${(page - 1) * 12 + index + 1}`,
          active: undefined,
        })),
        pagination: { page, pages: 5 },
      };
    }
    return fallback(path, options);
  });
  const draft = createDraft({
    designId,
    step: "component-sleeve",
    configuration: {
      source: "catalogue",
      mode: "custom",
      changedParts: ["sleeve"],
      components: {},
      addonIds: [],
    },
  });
  saveDraft(draft);
  mount(`/request?draft=${draft.id}&step=component-sleeve`);
  const user = userEvent.setup();
  // This scenario checks bounded paging and retained IDs; radio naming and
  // keyboard behavior are covered by the visual-options tests. Query the
  // stable input value instead of repeatedly naming every growing card.
  const firstChoice = await screen.findByDisplayValue("1".padStart(24, "0"));
  expect(firstChoice).toHaveAttribute("type", "radio");
  await user.click(firstChoice);
  for (let page = 2; page <= 5; page += 1) {
    await user.click(screen.getByText("Load more designs", { selector: "button" }));
    expect(await screen.findByDisplayValue(String(page * 12).padStart(24, "0"))).toBeVisible();
  }
  expect(screen.getByDisplayValue("1".padStart(24, "0"))).toBeChecked();
  expect(screen.getByDisplayValue("60".padStart(24, "0"))).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Load more designs" }),
  ).not.toBeInTheDocument();
});

it("shows public additions without an active field and keeps a checked addition when more load", async () => {
  const fallback = boundary.api.getMockImplementation();
  boundary.api.mockImplementation(async (path, options) => {
    if (path.startsWith("/options?") && path.includes("kind=extra")) {
      const page = Number(
        new URL(path, "https://test.invalid").searchParams.get("page"),
      );
      return {
        data: [
          {
            ...sleeve,
            _id: String(page).padStart(24, "0"),
            kind: "extra",
            name: `Addition ${page}`,
            active: undefined,
          },
        ],
        pagination: { page, pages: 2 },
      };
    }
    return fallback(path, options);
  });
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText("Customize this design"));
  await user.click(
    screen.getByRole("checkbox", { name: "Extra add-ons", exact: true }),
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(await screen.findByRole("checkbox", { name: /Addition 1/ }));
  await user.click(screen.getByRole("button", { name: "Load more additions" }));
  await screen.findByRole("checkbox", { name: /Addition 2/ });
  expect(screen.getByRole("checkbox", { name: /Addition 1/ })).toBeChecked();
});

it("recovers an original component outside the loaded gallery independently of the replacement estimate", async () => {
  const originalId = "999999999999999999999999";
  const fallback = boundary.api.getMockImplementation();
  boundary.api.mockImplementation(async (path, options) => {
    if (path.startsWith("/designs?"))
      return list([{ ...design, defaultComponents: { sleeve: originalId } }]);
    if (path === "/pricing/estimate") {
      const result = await fallback(path, options);
      result.data.components = {
        sleeve:
          options.body.configuration.mode === "exact"
            ? {
                source: "original",
                optionId: originalId,
                name: "Original hidden sleeve",
              }
            : { source: "option", optionId: sleeveId, name: "Full sleeve" },
      };
      return result;
    }
    return fallback(path, options);
  });
  const draft = createDraft({
    designId,
    step: "component-sleeve",
    configuration: {
      source: "catalogue",
      mode: "custom",
      changedParts: ["sleeve"],
      components: {
        sleeve: { source: "option", optionId: sleeveId, notes: "" },
      },
      addonIds: [],
    },
  });
  saveDraft(draft);
  mount(`/request?draft=${draft.id}&step=component-sleeve`);
  await waitFor(() =>
    expect(
      screen.getByText(/Original hidden sleeve.*Full sleeve/),
    ).toBeInTheDocument(),
  );
  await screen.findByRole("heading", { name: "₹800" });
  expect(
    screen.getByText(/Original hidden sleeve.*Full sleeve/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("radio", { name: /Original hidden sleeve/ }),
  ).not.toBeInTheDocument();
});

it("links the active wizard step visually to the current form section", async () => {
  const { container } = mount(`/request?design=${designId}`);
  await screen.findByRole("heading", { name: "Your garment" });
  const shell = container.querySelector(".wizard-progress-shell");
  expect(shell).toBeInTheDocument();
  const activeStep = shell.querySelector('li[aria-current="step"]');
  expect(activeStep).toHaveClass("active");
  expect(shell.querySelectorAll(".step-arrow").length).toBeGreaterThanOrEqual(
    1,
  );
  const toolbarIndicator = shell.querySelector(".wizard-active-link");
  expect(toolbarIndicator).toHaveTextContent(/Step 1 of \d+/);
  expect(toolbarIndicator).toHaveTextContent(/Your garment/);
  const formIndicator = container.querySelector(
    ".wizard-form .wizard-section-link",
  );
  expect(formIndicator).toHaveTextContent(/Step 1 of \d+/);
  expect(formIndicator).toHaveTextContent(/Your garment/);
  expect(
    screen.getByRole("button", { name: "Save draft" }),
  ).toHaveAttribute("type", "button");
});
