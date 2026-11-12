import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {} }));
vi.mock("../lib/api", async (original) => ({
  ...(await original()),
  api: boundary.api,
}));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
import { messages } from "../i18n/catalog";
import {
  t,
  setLanguage,
  getLanguage,
  getLocale,
  localize,
  labelToken,
  translateError,
  LANGUAGE_KEY,
  translationCatalogue,
  semanticCatalogue,
  contentTranslation,
  missingContentTranslations,
} from "../i18n/core";
import { LanguageProvider, LanguageSwitcher } from "../i18n/Language";
import { money, date, readable } from "../lib/api";
import { Login, Home } from "../pages/Public";
import { RequestWizard } from "../pages/Request";
import {
  AdminDesigns,
  AdminLayout,
  AdminSettings,
  AdminTaxonomy,
} from "../pages/Admin";
import { OrderDetails } from "../pages/Orders";
const paginated = (data) => ({
  data,
  pagination: { page: 1, pages: 1, total: data.length },
});
function mount(children, path = "/test", route = "/test") {
  return render(
    <LanguageProvider>
      <LanguageSwitcher />
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={children} />
          <Route path="*" element={<h1>destination</h1>} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}
const change = (language) =>
  fireEvent.change(
    screen.getByRole("combobox", { name: t("Choose language") }),
    { target: { value: language } },
  );
beforeEach(() => {
  setLanguage("en");
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  boundary.api.mockReset().mockResolvedValue(paginated([]));
  boundary.auth = {
    loading: false,
    user: null,
    profile: null,
    login: vi.fn().mockResolvedValue({}),
    register: vi.fn().mockResolvedValue({}),
    dismissError: vi.fn(),
  };
});
afterEach(() => {
  act(() => setLanguage("en"));
  vi.restoreAllMocks();
});
describe("English and Hindi language behaviour", () => {
  it("persists supported selections and rejects unsupported language values", () => {
    setLanguage("hi");
    expect(getLanguage()).toBe("hi");
    expect(getLocale()).toBe("hi-IN");
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe("hi");
    expect(setLanguage("fr")).toBe(false);
    expect(getLanguage()).toBe("hi");
    expect(document.documentElement.lang).toBe("hi");
  });
  it("works if browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("blocked");
    });
    expect(setLanguage("hi")).toBe(true);
    expect(t("Your fabric.")).toBe("आपका कपड़ा।");
  });
  it("resolves stable copy IDs, complete plural sentences and literal parameters without changing business keys", () => {
    expect(t("account.attachments.ready", { count: 1 })).toBe("1 private image ready to send");
    expect(t("account.attachments.ready", { count: 2 })).toBe("2 private images ready to send");
    setLanguage("hi");
    expect(t("account.attachments.ready", { count: 1 })).toBe("1 निजी तस्वीर भेजने के लिए तैयार है");
    expect(t("account.attachments.ready", { count: 2 })).toBe("2 निजी तस्वीरें भेजने के लिए तैयार हैं");
    expect(t("public.action.reference")).toBe(semanticCatalogue["public.action.reference"].hi);
    expect(t("K-CUSTOM-001")).toBe("K-CUSTOM-001");
    expect(t("Your own <design> note")).toBe("Your own <design> note");
  });
  it("reports missing owner translations explicitly and preserves authored originals", () => {
    const records = [{ _id: "custom-001", title: "Round", description: "Our own words", titleHi: "गोल" }];
    setLanguage("hi");
    expect(contentTranslation(records[0], "description")).toEqual({ text: "Our own words", sourceLanguage: "en", missingTranslation: true });
    expect(contentTranslation(records[0], "title")).toEqual({ text: "गोल", sourceLanguage: "hi", missingTranslation: false });
    expect(missingContentTranslations(records)).toEqual([{ id: "custom-001", field: "description" }]);
    expect(records[0].description).toBe("Our own words");
    setLanguage("en");
    expect(contentTranslation(records[0], "title").text).toBe("Round");
  });
  it("hides unknown technical string errors in Hindi and retains already translated known errors", () => {
    setLanguage("hi");
    expect(translateError("MongoServerSelectionError internal provider stack")).toBe(t("Request could not be completed. Please review the details and try again."));
    const known = t("The passwords do not match.");
    expect(translateError(known)).toBe(known);
  });
  it("translates sentence placeholders and converts already displayed messages back to English", () => {
    setLanguage("hi");
    expect(t("Page {0} of {1}", { 0: 2, 1: 4 })).toBe("कुल 4 में से पृष्ठ 2");
    const text = t("Accepted quote version {0}. Agreed amount {1}.", {
      0: 3,
      1: "₹900",
    });
    expect(text).toContain("3");
    expect(t("Quote version 3 sent.")).toBe("कोटेशन संस्करण 3 भेजा गया।");
    setLanguage("en");
    expect(t(text)).toBe("Accepted quote version 3. Agreed amount ₹900.");
  });
  it("preserves literal template parameters and never interprets customer strings as markup", () => {
    setLanguage("hi");
    expect(t("Remove {0}", { 0: "<img onerror=alert(1)>" })).toContain(
      "<img onerror=alert(1)>",
    );
    expect(t(null)).toBeNull();
    expect(localize({ title: "My own title" }, "title")).toBe("My own title");
  });
  it("chooses owner Hindi text and falls back to the original text", () => {
    setLanguage("hi");
    expect(
      localize({ title: "Custom embroidery", titleHi: "खास कढ़ाई" }, "title"),
    ).toBe("खास कढ़ाई");
    expect(
      localize({ title: "Custom embroidery", titleHi: " " }, "title"),
    ).toBe("Custom embroidery");
    setLanguage("en");
    expect(
      localize({ title: "Custom embroidery", titleHi: "खास कढ़ाई" }, "title"),
    ).toBe("Custom embroidery");
  });
  it("localizes dates, money, status, units and measurement names without changing codes", () => {
    setLanguage("hi");
    expect(date("2026-11-06")).toMatch(/नव/);
    expect(money(65025)).toContain("650.25");
    expect(readable("request_received")).toBe("अनुरोध प्राप्त हुआ");
    expect(readable("sleeveLength")).toBe(messages["Sleeve Length"]);
    expect(labelToken("cm")).toBe(messages.Cm);
    expect(labelToken("in")).toBe(messages.In);
  });
  it("translates backend validation details and measurement bounds", () => {
    setLanguage("hi");
    const text = translateError({
      message: "Please check the submitted details.",
      details: [
        {
          path: "measurements.values.bust",
          message: "Enter between 10 and 100 in.",
        },
      ],
    });
    expect(text).toContain(messages.Bust);
    expect(text).toContain("10");
    expect(text).toContain("100");
    expect(text).not.toContain("Enter between");
    expect(
      translateError({
        message: "Please check the submitted fields.",
        details: [
          { path: "quantity", message: "Too small: expected number to be >=1" },
        ],
      }),
    ).toContain(t("Enter a value of at least {0}.", { 0: 1 }));
    expect(
      translateError({
        message: "Please check the submitted fields.",
        details: [
          {
            path: "mediaIds",
            message: "Too big: expected array to have <=8 items",
          },
        ],
      }),
    ).toContain(t("Select no more than {0} items.", { 0: 8 }));
    expect(
      translateError({ message: "Unexpected provider exception" }),
    ).not.toContain("provider");
  });
  it("has valid nonempty Hindi text and matching parameters for every catalogue entry", () => {
    for (const [en, hi] of Object.entries(translationCatalogue)) {
      expect(hi.trim(), en).not.toBe("");
      expect([...en.matchAll(/\{[^{}]+\}/g)].map((x) => x[0]).sort(), en).toEqual(
        [...hi.matchAll(/\{[^{}]+\}/g)].map((x) => x[0]).sort(),
      );
      expect(hi, en).not.toMatch(/�/);
    }
  });
  it("renders Hindi home content, follows cross-tab preferences and returns to English", async () => {
    mount(<Home />);
    change("hi");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      t("public.hero.headline"),
    );
    expect(document.title).toContain("जहाँ");
    fireEvent(
      window,
      new StorageEvent("storage", { key: LANGUAGE_KEY, newValue: "en" }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      t("public.hero.headline"),
    );
  });
  it("preserves login input, password and mode while switching and sends unchanged credentials", async () => {
    mount(<Login />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/^Email address/),
      "meera@example.test",
    );
    await user.type(screen.getByLabelText(/^Password/), "MyStrongPass123!");
    change("hi");
    expect(
      screen.getByLabelText(new RegExp("^" + t("Email address"))),
    ).toHaveValue("meera@example.test");
    expect(document.getElementById("auth-password")).toHaveValue(
      "MyStrongPass123!",
    );
    await user.click(
      screen.getByRole("button", { name: t("Sign in"), exact: true }),
    );
    expect(boundary.auth.login).toHaveBeenCalledWith({
      email: "meera@example.test",
      password: "MyStrongPass123!",
    });
  });
  it("localizes native validation and clears previous errors on edit and language switch", () => {
    mount(<Login />);
    change("hi");
    const input = screen.getByLabelText(new RegExp("^" + t("Email address")));
    fireEvent.invalid(input);
    expect(input.validationMessage).toBe(t("Please fill out this field."));
    fireEvent.input(input, { target: { value: "name@example.test" } });
    expect(input.validationMessage).toBe("");
    change("en");
    expect(input.validationMessage).toBe("");
  });
  it("preserves request step, numbers and canonical option values across language switches", async () => {
    boundary.auth.profile = { name: "Meera", phone: "919876543210" };
    const user = userEvent.setup();
    boundary.api.mockImplementation(async (path) =>
      path.startsWith("/designs")
        ? paginated([
            {
              _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
              title: "Test design",
              garment: "kurti",
              code: "K-1",
              startingPricePaise: 65000,
            },
          ])
        : path.startsWith("/services")
          ? paginated([{ itemTypes: ["kurti"] }])
          : paginated([]),
    );
    mount(<RequestWizard />, "/test?design=aaaaaaaaaaaaaaaaaaaaaaaa");
    await user.clear(screen.getByLabelText(/^Quantity/));
    await user.type(screen.getByLabelText(/^Quantity/), "2");
    change("hi");
    expect(screen.getByLabelText(new RegExp("^" + t("Quantity")))).toHaveValue(
      2,
    );
    await user.click(screen.getByRole("button", { name: t("Continue") }));
    const method = screen.getByLabelText(
      t("What is being measured?"),
    );
    fireEvent.change(screen.getByLabelText(t("Who will take the measurements?")), { target: { value: "self" } });
    fireEvent.change(method, { target: { value: "body" } });
    expect(method).toHaveValue("body");
    expect(
      screen.getByLabelText(new RegExp("^" + t("Measurement unit"))),
    ).toHaveValue("in");
    const bust = document.getElementById("measure-bust");
    fireEvent.change(bust, { target: { value: "36" } });
    change("en");
    expect(document.getElementById("measure-bust")).toHaveValue(36);
    expect(
      screen.getByLabelText("What is being measured?"),
    ).toHaveValue("body");
  });
  it("translates admin task navigation and searches using the selected language", () => {
    setLanguage("hi");
    mount(<AdminLayout />);
    for (const text of [
      "admin.nav.dashboard",
      "admin.nav.orders",
      "admin.nav.designs",
      "admin.nav.categories",
      "admin.nav.customers",
      "admin.nav.website",
      "admin.nav.audit",
    ]) {
      fireEvent.change(screen.getByLabelText(t("admin.searchTasks")), { target: { value: t(text) } });
      expect(
        screen.getByRole("link", { name: t(text), exact: true }),
      ).toBeInTheDocument();
    }
  });
  it("saves Hindi design fields alongside the original English content", async () => {
    mount(<AdminDesigns />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "New design" }));
    await user.type(screen.getByLabelText(/Design title/), "Cotton embroidery");
    await user.type(
      screen.getByLabelText("Hindi title (optional)"),
      "खास कढ़ाई",
    );
    await user.type(
      screen.getByLabelText("Hindi description (optional)"),
      "आपकी पसंद की कढ़ाई।",
    );
    await user.type(screen.getByLabelText(/Design code/), "K-TEST");
    await user.type(
      document.getElementById("description"),
      "A custom stitching reference.",
    );
    fireEvent.submit(document.getElementById("designTitle").form);
    await waitFor(() =>
      expect(boundary.api).toHaveBeenCalledWith(
        "/admin/designs",
        expect.objectContaining({
          body: expect.objectContaining({
            title: "Cotton embroidery",
            titleHi: "खास कढ़ाई",
            descriptionHi: "आपकी पसंद की कढ़ाई।",
            garment: "kurti",
            status: "draft",
          }),
        }),
      ),
    );
  });
  it("offers optional Hindi category/option fields and website/FAQ fields", async () => {
    const view = mount(<AdminTaxonomy />);
    await userEvent.click(screen.getByRole("button", { name: "New category" }));
    expect(screen.getByLabelText("Hindi name (optional)")).toBeInTheDocument();
    view.unmount();
    boundary.api.mockImplementation(async (path) =>
      path === "/admin/settings"
        ? {
            data: {
              revision: 0,
              faqs: [{ question: "Question", answer: "Answer" }],
            },
          }
        : paginated([]),
    );
    mount(<AdminSettings />, "/test?section=contact");
    expect(
      await screen.findByLabelText("Hindi about text (optional)"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Hindi question (optional)"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Hindi answer (optional)"),
    ).toBeInTheDocument();
  });
  it("renders Hindi order snapshots and notes without translating customer contact data", async () => {
    setLanguage("hi");
    boundary.api.mockResolvedValue({
      data: {
        _id: "order-one",
        orderNumber: "KS-TEST-001",
        garment: "kurti",
        quantity: 1,
        status: "quote_sent",
        designSnapshot: { title: "Custom embroidery", titleHi: "खास कढ़ाई" },
        measurements: { method: "assistance", unit: "in" },
        customer: { name: "Meera Test", phone: "919876543210" },
        address: { line1: "My Delhi home" },
        preferences: { neck: "Custom neck" },
        preferenceLabelsHi: { neck: "खास गला" },
        timeline: [
          {
            status: "under_review",
            note: "Under review",
            noteHi: "आपके अनुरोध की समीक्षा जारी है।",
          },
        ],
        quotes: [
          {
            version: 1,
            amountPaise: 65000,
            deliveryDate: "2026-12-10",
            notes: "Custom quote notes",
            notesHi: "कढ़ाई की कीमत शामिल है।",
          },
        ],
      },
    });
    mount(<OrderDetails />, "/orders/order-one", "/orders/:id");
    expect(
      await screen.findByRole("heading", { name: "खास कढ़ाई" }),
    ).toBeInTheDocument();
    expect(screen.getByText("खास गला")).toBeInTheDocument();
    expect(screen.getByText("कढ़ाई की कीमत शामिल है।")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Meera Test");
  });
});
