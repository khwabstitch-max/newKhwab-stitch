import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original()),
  api: boundary.api,
}));
import { DesignGallery, DesignPresentation } from "../components/DesignGallery";
import { AdminDesigns } from "../pages/Admin";
import { LanguageProvider, LanguageSwitcher } from "../i18n/Language";
import { t, setLanguage } from "../i18n/core";
import template from "../data/teal-kurti.json";
const mediaId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const paginated = (data) => ({
  data,
  pagination: { page: 1, pages: 1, total: data.length },
});
function fixture() {
  return {
    ...structuredClone(template.design),
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
    views: template.design.imageViews.map((view) => ({
      ...view,
      id: mediaId,
      url: template.boardAsset,
      width: 1536,
      height: 1024,
    })),
    images: [
      { id: mediaId, url: template.boardAsset, width: 1536, height: 1024 },
    ],
  };
}
function mount(children) {
  return render(
    <LanguageProvider>
      <LanguageSwitcher />
      <MemoryRouter>{children}</MemoryRouter>
    </LanguageProvider>,
  );
}
beforeEach(() => {
  setLanguage("en");
  boundary.api.mockReset();
  boundary.api.mockImplementation(async (path, options = {}) =>
    path === "/media/presets/teal-kurti"
      ? { data: { _id: mediaId, width: 1536, height: 1024 } }
      : path.includes("/access")
        ? { data: { url: template.boardAsset, width: 1536, height: 1024 } }
        : options.method === "POST"
          ? { data: { _id: mediaId } }
          : paginated([]),
  );
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function () {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function () {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  act(() => setLanguage("en"));
  vi.restoreAllMocks();
});
it("shows all source-board details and four stitching-only rates without treating basic stitching as full embroidery", () => {
  mount(<DesignPresentation design={fixture()} />);
  expect(
    screen.getByRole("heading", { level: 1, name: template.design.title }),
  ).toBeInTheDocument();
  expect(screen.getByText("Keyhole with tie & tassel")).toBeInTheDocument();
  expect(
    screen.getByText("Cotton / linen / cambric — customer’s fabric"),
  ).toBeInTheDocument();
  expect(screen.getByText("Fabric provided by customer.")).toBeInTheDocument();
  const row = screen.getByText("With embroidery / handwork").closest("div");
  expect(row).toHaveTextContent("₹550+");
  expect(screen.getByText(template.design.serviceNotes)).toHaveTextContent(
    "₹300 basic rate does not include",
  );
  expect(
    screen.getByRole("link", { name: /Make this your own/ }),
  ).toHaveAttribute(
    "href",
    "/request?design=bbbbbbbbbbbbbbbbbbbbbbbb&garment=kurti",
  );
});
it("switches front/side/back previews, uses the source crop and opens/closes a modal zoom", async () => {
  const user = userEvent.setup();
  mount(<DesignGallery design={fixture()} />);
  const front = screen.getByRole("button", { name: "Front view", exact: true });
  expect(front).toHaveAttribute("aria-pressed", "true");
  await user.click(
    screen.getByRole("button", { name: "Side view", exact: true }),
  );
  expect(front).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: "Enlarge image" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("open");
  const rect = dialog
    .querySelector(".design-photo")
    .getAttribute("viewBox")
    .split(" ")
    .map(Number);
  expect(rect[0]).toBeCloseTo(356);
  expect(rect[2]).toBeCloseTo(241);
  await user.click(
    within(dialog).getByRole("button", { name: "Close image preview" }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Next preview" }));
  expect(
    screen.getByRole("button", { name: "Back view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
it("renders translated gallery labels, facts and service notes in Hindi", () => {
  setLanguage("hi");
  mount(<DesignPresentation design={fixture()} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    template.design.titleHi,
  );
  expect(
    screen.getByRole("button", { name: "सामने से", exact: true }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(template.design.designDetails.backHi),
  ).toBeInTheDocument();
  expect(screen.getByText(template.design.serviceNotesHi)).toBeInTheDocument();
  expect(
    screen.getByText(t("Fabric provided by customer.")),
  ).toBeInTheDocument();
});
it("prefills the editable board and saves seven previews against one included image with exact paise", async () => {
  const user = userEvent.setup();
  mount(<AdminDesigns />);
  await user.click(
    screen.getByRole("button", { name: "Use teal kurti template" }),
  );
  expect(screen.getByLabelText(/^Design title/)).toHaveValue(
    template.design.title,
  );
  expect(
    screen.getByLabelText("Neck design", { selector: "input" }),
  ).toHaveValue("Notched V neck with embroidery");
  fireEvent.change(document.getElementById("detail-neck"), {
    target: { value: "Personal neckline" },
  });
  fireEvent.change(document.getElementById("rate-amount-1"), {
    target: { value: "425.50" },
  });
  fireEvent.change(document.getElementById("crop-0-x"), {
    target: { value: "1" },
  });
  await user.click(screen.getByRole("button", { name: "Save design" }));
  await waitFor(() =>
    expect(boundary.api).toHaveBeenCalledWith(
      "/admin/designs",
      expect.objectContaining({ method: "POST" }),
    ),
  );
  const body = boundary.api.mock.calls.find(
    ([path, options]) =>
      path === "/admin/designs" && options?.method === "POST",
  )[1].body;
  expect(body.mediaIds).toEqual([mediaId]);
  expect(body.coverMediaId).toBe(mediaId);
  expect(body.imageViews).toHaveLength(7);
  expect(body.imageViews.every((view) => view.mediaId === mediaId)).toBe(true);
  expect(body.designDetails.neck).toBe("Personal neckline");
  expect(body.priceOptions[1].amountPaise).toBe(42550);
  expect(body.startingPricePaise).toBe(30000);
  expect(body.imageViews[0].crop.x).toBe(1);
  expect(body.priceOptions[1]).not.toHaveProperty("amount");
  expect(
    boundary.api.mock.calls.filter(
      ([path]) => path === "/media/presets/teal-kurti",
    ),
  ).toHaveLength(1);
});
it("keeps the attached board after a failed save so retry does not attach or upload it twice", async () => {
  let attempts = 0;
  boundary.api.mockImplementation(async (path, options = {}) => {
    if (path === "/media/presets/teal-kurti") return { data: { _id: mediaId } };
    if (path.includes("/access"))
      return { data: { url: template.boardAsset, width: 1536, height: 1024 } };
    if (path === "/admin/designs" && options.method === "POST") {
      if (++attempts === 1)
        throw Object.assign(new Error("Please try again."), { status: 503 });
      return { data: { _id: "design" } };
    }
    return paginated([]);
  });
  const user = userEvent.setup();
  mount(<AdminDesigns />);
  await user.click(
    screen.getByRole("button", { name: "Use teal kurti template" }),
  );
  await user.click(screen.getByRole("button", { name: "Save design" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Please try again.",
  );
  await user.click(screen.getByRole("button", { name: "Save design" }));
  await waitFor(() => expect(attempts).toBe(2));
  expect(
    boundary.api.mock.calls.filter(
      ([path]) => path === "/media/presets/teal-kurti",
    ),
  ).toHaveLength(1);
});
it("detaching a board removes all its preview references", async () => {
  const user = userEvent.setup();
  mount(<AdminDesigns />);
  await user.click(
    screen.getByRole("button", { name: "Use teal kurti template" }),
  );
  expect(
    screen.getAllByRole("button", { name: /Remove preview \d/ }),
  ).toHaveLength(7);
  await user.click(screen.getByRole("button", { name: "Detach image 1" }));
  expect(
    screen.queryAllByRole("button", { name: /Remove preview \d/ }),
  ).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Save design" }));
  await waitFor(() =>
    expect(boundary.api).toHaveBeenCalledWith(
      "/admin/designs",
      expect.objectContaining({
        body: expect.objectContaining({
          mediaIds: [],
          imageViews: [],
          coverMediaId: null,
        }),
      }),
    ),
  );
  expect(
    boundary.api.mock.calls.filter(
      ([path]) => path === "/media/presets/teal-kurti",
    ),
  ).toHaveLength(0);
});
it("preserves admin crop values and price rows while changing language and opening customer preview", async () => {
  const user = userEvent.setup();
  mount(<AdminDesigns />);
  await user.click(
    screen.getByRole("button", { name: "Use teal kurti template" }),
  );
  fireEvent.change(document.getElementById("crop-0-x"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Choose language" }), {
    target: { value: "hi" },
  });
  expect(document.getElementById("crop-0-x")).toHaveValue(2);
  expect(document.getElementById("rate-amount-0")).toHaveValue(300);
  await user.click(screen.getByText(t("Live customer preview")));
  expect(
    screen.getByRole("heading", { name: template.design.titleHi }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
});
