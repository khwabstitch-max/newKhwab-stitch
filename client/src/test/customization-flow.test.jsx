import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  calculateEstimate,
  estimateInput,
} from "../../../server/src/pricing.js";
import { orderInput } from "../../../server/src/domain.js";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {} }));
vi.mock("../lib/api", async (original) => ({
  ...(await original()),
  api: boundary.api,
}));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
import { RequestWizard } from "../pages/Request";
import { createDraft, saveDraft, loadDraft } from "../lib/drafts";
import { setLanguage } from "../i18n/core";

const id = (number) => number.toString(16).padStart(24, "0");
const option = (number, kind, name, extra = {}) => ({
  _id: id(number),
  kind,
  name,
  garments: ["kurti"],
  active: true,
  status: "published",
  priceMode: "included",
  revision: 0,
  ...extra,
});
const records = [
  option(1, "sleeve", "Plain sleeve", {
    compatibleLengthStyles: ["full", "short"],
  }),
  option(2, "sleeve", "Puff sleeve", {
    compatibleLengthStyles: ["full", "short"],
    priceMode: "additional",
    amountPaise: 12000,
    measurementFields: ["armhole"],
  }),
  option(3, "sleeveLength", "Full length", { lengthStyle: "full" }),
  option(4, "sleeveLength", "Sleeveless", { lengthStyle: "sleeveless" }),
  option(5, "sleeveLength", "Short", {
    lengthStyle: "short",
    priceMode: "additional",
    amountPaise: 3000,
  }),
  option(6, "neck", "Round front", {
    measurementFields: ["frontNeckDepth", "frontNeckWidth"],
  }),
  option(7, "back", "Closed back", {
    measurementFields: ["backNeckDepth", "backNeckWidth"],
  }),
  option(8, "neck", "V front", {
    priceMode: "additional",
    amountPaise: 8000,
    incompatibleOptionIds: [id(9)],
  }),
  option(9, "back", "Cut-out back", { incompatibleOptionIds: [id(8)] }),
  option(10, "extra", "Pocket", { materialCoverage: "labor_only" }),
  option(11, "extra", "Lining", {
    priceMode: "additional",
    amountPaise: 6000,
    materialCoverage: "labor_and_materials",
    materialNotes: "Includes the specified lining material",
  }),
  option(12, "extra", "Future embroidery", { serviceType: "embroidery" }),
];
const design = {
  _id: id(1000),
  title: "Separate sections kurti",
  garment: "kurti",
  code: "SEP-01",
  startingPricePaise: 65000,
  defaultComponents: {
    sleeve: id(1),
    sleeveLength: id(3),
    neck: id(6),
    back: id(7),
  },
  includedAddonIds: [id(10)],
};
const list = (data) => ({
  data,
  pagination: { page: 1, pages: 1, total: data.length },
});
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setLanguage("en", false);
  boundary.auth = {};
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  boundary.api.mockReset().mockImplementation(async (path, options = {}) => {
    if (path.startsWith("/designs/id/")) return { data: design };
    if (path.startsWith("/designs?")) return list([design]);
    if (path.startsWith("/options?")) {
      const kind = new URL(path, "https://test.invalid").searchParams.get(
        "kind",
      );
      return list(records.filter((record) => record.kind === kind));
    }
    if (path.startsWith("/services")) return list([{ itemTypes: ["kurti"] }]);
    if (path === "/pricing/estimate")
      return {
        data: calculateEstimate(estimateInput.parse(options.body), {
          design,
          options: records,
        }),
      };
    return list([]);
  });
});
afterEach(() => vi.restoreAllMocks());
function mount(initial = {}, { ordinaryOnly = false } = {}) {
  const draft = createDraft({
    designId: design._id,
    step: "review",
    quantity: 1,
    notes: "Keep unrelated request notes",
    fabricDetails: "Cotton already chosen",
    customer: { name: "Meera", phone: "919876543210" },
    referenceMediaIds: [id(30)],
    measurements: {
      method: "assistance",
      unit: "cm",
      values: {
        bust: 91,
        waist: 74,
        hip: 96,
        shoulder: 36,
        length: 105,
        sleeveLength: 58,
        armhole: 41,
      },
      notes: "Keep my measurements",
      reconfirmFields: [],
    },
    configuration: {
      source: "catalogue",
      mode: "custom",
      changedParts: ["sleeveLength", "sleeve", "neck", "back", "extra"],
      extraInitialized: true,
      addonIds: [id(10), id(11)],
      components: {
        sleeve: {
          source: "option",
          optionId: id(2),
          notes: "Keep puff note",
          referenceMediaId: id(30),
        },
        sleeveLength: { source: "option", optionId: id(3), notes: "" },
        neck: { source: "option", optionId: id(8), notes: "Keep front note" },
        back: { source: "original", notes: "Keep back note" },
      },
    },
    ...initial,
  });
  saveDraft(draft);
  if (ordinaryOnly) sessionStorage.clear();
  render(
    <MemoryRouter
      initialEntries={[`/request?draft=${draft.id}&step=${draft.step}`]}
    >
      <RequestWizard />
    </MemoryRouter>,
  );
  return draft;
}

it("can remove a saved addition that is no longer available without clearing unrelated work", async () => {
  const draft = mount({
    step: "component-extra",
    configuration: {
      source: "catalogue",
      mode: "custom",
      changedParts: ["extra"],
      extraInitialized: true,
      addonIds: [id(999)],
      components: {},
    },
  });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Remove Saved addition 1" }),
  );
  await screen.findByRole("heading", { name: "₹650" });
  await waitFor(() =>
    expect(loadDraft(draft.id).configuration.addonIds).toEqual([]),
  );
  expect(loadDraft(draft.id).notes).toBe("Keep unrelated request notes");
});

it("saves the latest private component note immediately before opening its tailor-help link", async () => {
  const draft = mount({ step: "component-sleeve" });
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText("Notes for this part (optional)"),
    " + latest edit",
  );
  const links = screen.getAllByRole("link", {
    name: "Need Help from a Master Tailor?",
  });
  await user.click(links[1]);
  expect(loadDraft(draft.id).configuration.components.sleeve.notes).toBe(
    "Keep puff note + latest edit",
  );
  expect(localStorage.getItem(localStorage.key(0))).not.toContain(
    "latest edit",
  );
});

it("sleeveless removes sleeve fees and fields, then restores the saved design and values when switched back", async () => {
  const draft = mount();
  const user = userEvent.setup();
  await screen.findAllByRole("heading", { name: "₹910" });
  await user.click(screen.getByRole("button", { name: "Edit Sleeve length" }));
  await user.click(await screen.findByRole("radio", { name: /Sleeveless/ }));
  await screen.findByRole("heading", { name: "₹790" });
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(
    screen.getByText(
      "Not applicable with Sleeveless. Your previous sleeve selection is saved.",
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit Sleeve design" }));
  expect(
    screen.queryByRole("radio", { name: /Puff sleeve/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel changes" }));
  await user.click(screen.getByRole("button", { name: "Edit Sleeve length" }));
  await user.click(await screen.findByRole("radio", { name: /Full length/ }));
  await screen.findAllByRole("heading", { name: "₹910" });
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(
      loadDraft(draft.id).configuration.components.sleeveLength.optionId,
    ).toBe(id(3)),
  );
  const saved = loadDraft(draft.id);
  expect(saved.configuration.components.sleeve.optionId).toBe(id(2));
  expect(saved.configuration.components.sleeve.notes).toBe("Keep puff note");
  expect(saved.measurements.values.sleeveLength).toBe(58);
  expect(saved.measurements.unit).toBe("cm");
  expect(saved.notes).toBe("Keep unrelated request notes");
  expect(saved.referenceMediaIds).toEqual([id(30)]);
});

it("keeps front/back neck choices independent, hides incompatible back choices and supports pending tailor help", async () => {
  const draft = mount({ step: "component-back" });
  const user = userEvent.setup();
  await screen.findByRole("radio", { name: /Closed back/ });
  expect(
    screen.queryByRole("radio", { name: /Cut-out back/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Your other neckline has not been changed/),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole("radio", { name: "Need help from a master tailor" }),
  );
  await screen.findByText(
    "Price after tailor review. Request guidance for this part; your other choices stay saved.",
  );
  await waitFor(() =>
    expect(loadDraft(draft.id).configuration.components.back.source).toBe(
      "help",
    ),
  );
  expect(loadDraft(draft.id).configuration.components.neck.optionId).toBe(
    id(8),
  );
  expect(
    boundary.api.mock.calls.some(
      ([path, request]) =>
        path === "/pricing/estimate" &&
        request.body.configuration.components.back?.source === "help",
    ),
  ).toBe(true);
});

it("adds and removes individual finishing details, preserves included prices and states materials coverage", async () => {
  const draft = mount({ step: "component-extra" });
  const user = userEvent.setup();
  const lining = await screen.findByRole("checkbox", { name: /Lining/ });
  expect(lining).toBeChecked();
  expect(
    screen.getByText(/Stitching labor only; materials are not supplied/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Includes stitching labor and the materials listed/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: /Future embroidery/ }),
  ).not.toBeInTheDocument();
  await user.click(lining);
  await screen.findByRole("heading", { name: "₹850" });
  await user.click(screen.getByRole("checkbox", { name: /Pocket/ }));
  await waitFor(() =>
    expect(loadDraft(draft.id).configuration.addonIds).toEqual([]),
  );
  expect(screen.getByRole("heading", { name: "₹850" })).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: /Pocket/ }));
  await waitFor(() =>
    expect(loadDraft(draft.id).configuration.addonIds).toEqual([id(10)]),
  );
  expect(loadDraft(draft.id).fabricDetails).toBe("Cotton already chosen");
});

it("provides an Edit action for all five sections and cancels a section edit without changing other data", async () => {
  const draft = mount();
  const user = userEvent.setup();
  await screen.findAllByRole("heading", { name: "₹910" });
  for (const name of [
    "Sleeve design",
    "Sleeve length",
    "Front neck design",
    "Back neck design",
    "Extra add-ons",
  ])
    expect(
      screen.getByRole("button", { name: `Edit ${name}` }),
    ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit Extra add-ons" }));
  await user.click(await screen.findByRole("checkbox", { name: /Lining/ }));
  await user.click(screen.getByRole("button", { name: "Cancel changes" }));
  await waitFor(() =>
    expect(loadDraft(draft.id).configuration.addonIds).toEqual([
      id(10),
      id(11),
    ]),
  );
  expect(screen.getByText("Keep unrelated request notes")).toBeInTheDocument();
});

it("recovers an ordinary-only sleeveless draft without requiring its parked private sleeve reference", async () => {
  mount(
    {
      configuration: {
        source: "catalogue",
        mode: "custom",
        changedParts: ["sleeveLength", "sleeve"],
        components: {
          sleeveLength: { source: "option", optionId: id(4) },
          sleeve: {
            source: "reference",
            referenceMediaId: id(30),
            notes: "Private parked note",
          },
        },
        addonIds: [],
      },
    },
    { ordinaryOnly: true },
  );
  await screen.findAllByRole("heading", { name: "₹650" });
  expect(
    screen.queryByText(/Choose the reference for this part/),
  ).not.toBeInTheDocument();
  expect(localStorage.getItem(localStorage.key(0))).not.toContain(
    "Private parked note",
  );
  const estimates = boundary.api.mock.calls.filter(
    ([path]) => path === "/pricing/estimate",
  );
  expect(
    estimates.some(
      ([, request]) =>
        request.body.configuration.components.sleeve?.referenceMediaId ===
        undefined,
    ),
  ).toBe(true);
});

it("keeps an active missing reference incomplete and names the selected help source instead of its parked option", async () => {
  mount({
    step: "component-sleeve",
    configuration: {
      source: "catalogue",
      mode: "custom",
      changedParts: ["sleeve"],
      components: { sleeve: { source: "reference", optionId: id(2) } },
      addonIds: [],
    },
  });
  const user = userEvent.setup();
  await screen.findByLabelText("Reference for this component");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByLabelText("Reference for this component")).toBeInvalid();
  expect(
    screen.getByRole("heading", { name: "Sleeve design", level: 2 }),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole("radio", { name: "Need help from a master tailor" }),
  );
  expect(screen.getByText(/Original → Your selection/)).toHaveTextContent(
    "Master-tailor guidance requested",
  );
  expect(screen.getByText(/Original → Your selection/)).not.toHaveTextContent(
    "Puff sleeve",
  );
});

it("parks an unchecked customization without erasing its values and replaces a single sleeve charge", async () => {
  const draft = mount({ step: "design" });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("checkbox", { name: "Sleeve design", exact: true }),
  );
  await waitFor(() =>
    expect(loadDraft(draft.id).configuration.changedParts).not.toContain(
      "sleeve",
    ),
  );
  expect(loadDraft(draft.id).configuration.components.sleeve.optionId).toBe(
    id(2),
  );
  expect(loadDraft(draft.id).configuration.components.sleeve.notes).toBe(
    "Keep puff note",
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Sleeve design", exact: true }),
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Sleeve length", level: 2 });
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(await screen.findByRole("radio", { name: /Plain sleeve/ }));
  await screen.findByRole("heading", { name: "₹790" });
  expect(screen.getByRole("radio", { name: /Plain sleeve/ })).toBeChecked();
  expect(screen.getByRole("radio", { name: /Puff sleeve/ })).not.toBeChecked();
});

it("explains materials for included exact-copy additions while skipping customization steps", async () => {
  mount({
    configuration: {
      source: "catalogue",
      mode: "exact",
      components: {},
      addonIds: [],
    },
  });
  await screen.findByRole("heading", { name: "Included finishing details" });
  expect(
    screen.getAllByText(/Stitching labor only; materials are not supplied/)
      .length,
  ).toBeGreaterThan(0);
  expect(
    screen.queryByRole("button", { name: "Edit Extra add-ons" }),
  ).not.toBeInTheDocument();
});

it("submits only applicable measurements and confirmations while preserving hidden values in the saved draft", async () => {
  boundary.auth = {
    profile: { _id: id(90), name: "Meera", phone: "919876543210" },
  };
  const fallback = boundary.api.getMockImplementation();
  boundary.api.mockImplementation(async (path, request = {}) => {
    if (path === "/drafts" && request.method === "POST")
      return { data: { _id: id(91), revision: 0, data: request.body.data } };
    if (path === "/orders" && request.method === "POST")
      return { data: { _id: id(92) } };
    return fallback(path, request);
  });
  mount({
    fabricAcknowledged: true,
    measurements: {
      method: "body",
      unit: "cm",
      values: {
        bust: 91,
        waist: 74,
        hip: 96,
        shoulder: 36,
        length: 105,
        sleeveLength: 58,
        armhole: 41,
        frontNeckDepth: 10,
        frontNeckWidth: 15,
        backNeckDepth: 5,
        backNeckWidth: 14,
      },
      notes: "Keep hidden sizes",
      reconfirmFields: ["sleeveLength", "armhole"],
    },
    configuration: {
      source: "catalogue",
      mode: "custom",
      changedParts: ["sleeveLength", "sleeve"],
      components: {
        sleeveLength: { source: "option", optionId: id(4) },
        sleeve: { source: "option", optionId: id(2) },
      },
      addonIds: [],
    },
  });
  const user = userEvent.setup();
  await screen.findAllByRole("heading", { name: "₹650" });
  await user.click(
    screen.getByRole("button", { name: "Submit Stitching Request" }),
  );
  await waitFor(() =>
    expect(boundary.api.mock.calls.some(([path]) => path === "/orders")).toBe(
      true,
    ),
  );
  const submitted = boundary.api.mock.calls.find(
    ([path]) => path === "/orders",
  )[1].body;
  expect(submitted.measurements.reconfirmFields).toEqual([]);
  expect(submitted.measurements.values).not.toHaveProperty("sleeveLength");
  expect(submitted.configuration.components).not.toHaveProperty("sleeve");
  expect(orderInput.safeParse(submitted).success).toBe(true);
  const saved = boundary.api.mock.calls.find(([path]) => path === "/drafts")[1]
    .body.data;
  expect(saved.measurements.values.sleeveLength).toBe(58);
  expect(saved.measurements.reconfirmFields).toEqual([
    "sleeveLength",
    "armhole",
  ]);
});
