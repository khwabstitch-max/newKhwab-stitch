import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original()),
  api: boundary.api,
}));
import { AdminTaxonomy } from "../pages/Admin";
import { DesignEditorExtras } from "../components/DesignEditorExtras";
import { setLanguage } from "../i18n/core";

const sleeveId = "a".repeat(24),
  backId = "b".repeat(24),
  neckId = "c".repeat(24),
  lengthId = "d".repeat(24),
  addonId = "e".repeat(24),
  fitId = "f".repeat(24);
const list = (data = [], page = 1, pages = 1) => ({
  data,
  pagination: { page, pages, total: data.length, limit: 30 },
});
const option = (fields = {}) => ({
  _id: sleeveId,
  name: "Puff sleeve",
  kind: "sleeve",
  garments: ["kurti"],
  active: true,
  revision: 4,
  description: "Keep this original explanation",
  priceMode: "additional",
  amountPaise: 12000,
  measurementFields: ["armhole"],
  sleeveStyle: "full",
  ...fields,
});
beforeEach(() => {
  setLanguage("en", false);
  boundary.api.mockReset();
});
function mockOptions(rows) {
  boundary.api.mockImplementation(async (path, options = {}) =>
    options.method && options.method !== "GET"
      ? { data: { _id: sleeveId } }
      : path.startsWith("/admin/options?")
        ? list(rows)
        : list(),
  );
}
const mount = (element = <AdminTaxonomy options />) =>
  render(<MemoryRouter>{element}</MemoryRouter>);
const savedBody = () =>
  boundary.api.mock.calls.find(([, options]) =>
    ["POST", "PATCH"].includes(options?.method),
  )?.[1].body;

it("creates a free length preference without editable surcharge controls", async () => {
  mockOptions([]);
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "New option" }));
  await user.type(screen.getByLabelText(/^Name/), "Elbow preference");
  await user.selectOptions(
    screen.getByLabelText("Option type"),
    "sleeveLength",
  );
  await user.selectOptions(
    screen.getByLabelText(/^Sleeve length preference/),
    "elbow",
  );
  expect(screen.queryByLabelText("Price treatment")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Additional charge (INR)")).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("Display order"));
  await user.type(screen.getByLabelText("Display order"), "3");
  await user.selectOptions(
    screen.getByLabelText("Option publication"),
    "published",
  );
  await user.click(screen.getByRole("button", { name: "Save option" }));
  await waitFor(() =>
    expect(savedBody()).toMatchObject({
      kind: "sleeveLength",
      lengthStyle: "elbow",
      amountPaise: 0,
      status: "published",
      displayOrder: 3,
    }),
  );
  expect(savedBody()).not.toHaveProperty("measurements");
});

it("edits compatibility without unpublishing a sleeve or enabling length-dependent prices", async () => {
  mockOptions([option({ compatibleLengthStyles: ["short"] })]);
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Edit", exact: true }),
  );
  expect(screen.getByLabelText("Option publication")).toHaveValue("published");
  await user.click(
    screen.getByRole("checkbox", { name: "Full length", exact: true }),
  );
  expect(screen.queryByLabelText("Sleeve adjustment pricing")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save option" }));
  await waitFor(() =>
    expect(savedBody()).toMatchObject({
      status: "published",
      revision: 4,
      sleeveStyle: "full",
      compatibleLengthStyles: ["short", "full"],
      sleevePricingMode: "separate",
      combinedLengthPrices: [],
      description: "Keep this original explanation",
      measurementFields: ["armhole"],
    }),
  );
});

it("configures independent neckline conflicts and numeric width requirements without editing the opposite option", async () => {
  const front = option({
    _id: neckId,
    name: "Round front",
    kind: "neck",
    measurementFields: ["frontNeckDepth"],
  });
  const back = option({ _id: backId, name: "Square back", kind: "back" });
  mockOptions([front, back]);
  mount();
  const user = userEvent.setup();
  await user.click(
    within(await screen.findByRole("row", { name: /Round front/ })).getByRole(
      "button",
      { name: "Edit" },
    ),
  );
  await user.click(
    await screen.findByRole("checkbox", { name: "Square back", exact: true }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Front Neck Width", exact: true }),
  );
  await user.click(screen.getByRole("button", { name: "Save option" }));
  await waitFor(() =>
    expect(savedBody()).toMatchObject({
      kind: "neck",
      incompatibleOptionIds: [backId],
      measurementFields: ["frontNeckDepth", "frontNeckWidth"],
    }),
  );
  expect(
    boundary.api.mock.calls
      .filter(([, options]) => options?.method === "PATCH")
      .map(([path]) => path),
  ).toEqual([`/admin/options/${neckId}`]);
});

it("requires explicit add-on supply coverage and retains the configured material details", async () => {
  mockOptions([option({ _id: addonId, name: "Cotton lining", kind: "extra" })]);
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Edit", exact: true }),
  );
  expect(screen.getByLabelText("Price covers")).toHaveValue("labor_only");
  await user.selectOptions(
    screen.getByLabelText("Price covers"),
    "labor_and_materials",
  );
  await user.type(
    screen.getByLabelText(/^Material and supply details/),
    "Includes plain cotton lining only, after confirming color.",
  );
  expect(screen.getByLabelText("Add-on service")).toHaveValue("stitching");
  expect(
    screen.queryByRole("option", { name: "Embroidery" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save option" }));
  await waitFor(() =>
    expect(savedBody()).toMatchObject({
      materialCoverage: "labor_and_materials",
      materialNotes:
        "Includes plain cotton lining only, after confirming color.",
      serviceType: "stitching",
    }),
  );
});

function DefaultHarness() {
  const [editing, setEditing] = useState({
    garment: "kurti",
    mediaIds: [],
    imageViews: [],
    defaultComponents: { fit: fitId },
    includedAddonIds: [],
    designDetails: { style: "Preserve original style" },
    serviceNotes: "Keep fabric instruction",
    priceOptions: [],
    startingPricePaise: 65000,
  });
  return (
    <>
      <DesignEditorExtras
        editing={editing}
        setEditing={setEditing}
        busy={false}
      />
      <output data-testid="edited-design">{JSON.stringify(editing)}</output>
    </>
  );
}
it("loads further original-component choices, maps included additions and preserves saved defaults and notes", async () => {
  boundary.api.mockImplementation(async (path) => {
    if (!path.startsWith("/admin/options?")) return list();
    const page = Number(
      new URL(path, "https://test.invalid").searchParams.get("page"),
    );
    return page === 1
      ? list([option()], 1, 2)
      : list(
          [
            option({
              _id: lengthId,
              kind: "sleeveLength",
              name: "Full length preference",
              lengthStyle: "full",
            }),
            option({
              _id: addonId,
              kind: "extra",
              name: "Cotton lining",
              serviceType: "stitching",
            }),
          ],
          2,
          2,
        );
  });
  mount(<DefaultHarness />);
  const user = userEvent.setup();
  expect(screen.getByLabelText("Fit")).toHaveValue(fitId);
  await user.click(
    await screen.findByRole("button", { name: "Load more component choices" }),
  );
  await screen.findByRole("option", { name: "Full length preference" });
  await user.selectOptions(screen.getByLabelText("Sleeve Length"), lengthId);
  await user.click(screen.getByRole("checkbox", { name: "Cotton lining" }));
  expect(
    JSON.parse(screen.getByTestId("edited-design").textContent),
  ).toMatchObject({
    defaultComponents: { fit: fitId, sleeveLength: lengthId },
    includedAddonIds: [addonId],
    serviceNotes: "Keep fabric instruction",
    designDetails: { style: "Preserve original style" },
  });
});
