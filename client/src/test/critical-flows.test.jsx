import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {} }));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  api: boundary.api,
}));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
import { Catalogue, DesignDetails, Login } from "../pages/Public";
import { RequestWizard } from "../pages/Request";
import { Orders, OrderDetails } from "../pages/Orders";
import { AdminDesigns } from "../pages/Admin";

const design = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  title: "Cotton daydream",
  code: "K-01",
  slug: "cotton-daydream",
  garment: "kurti",
  description: "A thoughtful custom kurti stitching reference.",
  startingPricePaise: 65025,
  currency: "INR",
  images: [],
  coverImageUrl: null,
  status: "draft",
  revision: 0,
  mediaIds: [],
  coverMediaId: null,
  category: null,
};
const orderId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const orderFixture = (changes = {}) => ({
  _id: orderId,
  orderNumber: "KS-TEST-001",
  garment: "kurti",
  quantity: 1,
  status: "quote_sent",
  revision: 7,
  createdAt: "2026-11-01T08:00:00.000Z",
  designSnapshot: { title: "My cotton kurti" },
  measurements: {
    method: "assistance",
    unit: "in",
    values: {},
    notes: "Please help with the fit.",
  },
  preferences: { neck: "Round neck" },
  customer: { name: "Meera Test", phone: "919876543210" },
  address: {
    line1: "Test home, lane1",
    line2: "",
    city: "Delhi",
    state: "Delhi",
    pin: "110001",
  },
  referenceMediaIds: [],
  timeline: [
    {
      status: "request_received",
      at: "2026-11-01T08:00:00.000Z",
      note: "Request received for review.",
    },
  ],
  quotes: [
    {
      version: 1,
      amountPaise: 60000,
      currency: "INR",
      deliveryDate: "2026-12-10",
      notes: "Previous offer",
    },
    {
      version: 2,
      amountPaise: 75123,
      currency: "INR",
      deliveryDate: "2026-12-12",
      notes: "Current offer",
    },
  ],
  ...changes,
});
const paginated = (data) => ({
  data,
  pagination: {
    page: 1,
    limit: 50,
    total: data.length,
    pages: Math.ceil(data.length / 50),
  },
});
const info = (path, options = {}) => ({
  url: new URL(path, "https://atelier.example.test"),
  method: options.method || "GET",
  body: options.body,
  options,
});
const mutations = (path) =>
  boundary.api.mock.calls.filter(
    ([p, o]) => p === path && o?.method && o.method !== "GET",
  );
function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="destination">
      {location.pathname}
      {location.search}
      <span>{location.state?.submitted ? "request received" : ""}</span>
    </div>
  );
}
function renderRoute(element, path = "/test", route = "/test") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}
function renderPublicJourney(path = "/catalogue") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/catalogue" element={<Catalogue />} />
        <Route path="/designs/:slug" element={<DesignDetails />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  boundary.api.mockReset();
  boundary.auth = {
    loading: false,
    user: { _id: "verified-test-user" },
    profile: {
      _id: "cccccccccccccccccccccccc",
      name: "Meera Test",
      phone: "919876543210",
      email: "meera@example.test",
      role: "customer",
    },
    login: vi.fn().mockResolvedValue({ user: { _id: "verified-test-user" } }),
    register: vi.fn().mockResolvedValue({ user: { _id: "new-user" } }),
    logout: vi.fn(),
    reloadProfile: vi.fn(),
  };
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  boundary.api.mockImplementation(async () => paginated([]));
});
afterEach(() => vi.restoreAllMocks());

describe("customer journeys with mocked identity and API boundaries", () => {
  it("awaits email/password sign-in and returns to the requested route", async () => {
    boundary.auth.user = null;
    boundary.auth.profile = null;
    let resolveLogin;
    boundary.auth.login.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );
    renderRoute(
      <Login />,
      { pathname: "/login", state: { from: "/request?garment=blouse" } },
      "/login",
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/^Email address/),
      "meera@example.test",
    );
    await user.type(screen.getByLabelText(/^Password/), "MyStrongPass123!");
    await user.click(
      screen.getByRole("button", { name: "Sign in", exact: true }),
    );
    expect(boundary.auth.login).toHaveBeenCalledWith({
      email: "meera@example.test",
      password: "MyStrongPass123!",
    });
    expect(
      screen.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeDisabled();
    expect(screen.queryByTestId("destination")).not.toBeInTheDocument();
    resolveLogin({ user: { _id: "verified-test-user" } });
    expect(await screen.findByTestId("destination")).toHaveTextContent(
      "/request?garment=blouse",
    );
  });
  it("keeps a rejected email/password login recoverable without navigating", async () => {
    boundary.auth.user = null;
    boundary.auth.profile = null;
    boundary.auth.login.mockRejectedValue(
      new Error("Email or password is incorrect."),
    );
    renderRoute(<Login />, "/login", "/login");
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/^Email address/),
      "meera@example.test",
    );
    await user.type(screen.getByLabelText(/^Password/), "IncorrectPass123!");
    await user.click(
      screen.getByRole("button", { name: "Sign in", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email or password is incorrect.",
    );
    expect(screen.queryByTestId("destination")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeEnabled();
  });
  it("creates an email/password account and allows returning from signup without submitting", async () => {
    boundary.auth.user = null;
    boundary.auth.profile = null;
    renderRoute(<Login />, "/login", "/login");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText(/^Your name/), "Meera");
    await user.type(screen.getByLabelText(/^Password/), "DiscardedPass123!");
    await user.click(screen.getByRole("button", { name: "Sign in instead" }));
    expect(screen.getByLabelText(/^Password/)).toHaveValue("");
    expect(boundary.auth.register).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(
      screen.getByLabelText(/^Email address/),
      "meera@example.test",
    );
    await user.type(screen.getByLabelText(/^Password/), "NewAccountPass123!");
    await user.type(
      screen.getByLabelText(/^Confirm password/),
      "NewAccountPass123!",
    );
    await user.click(
      screen.getByRole("button", { name: "Create account", exact: true }),
    );
    expect(boundary.auth.register).toHaveBeenCalledWith({
      name: "Meera",
      email: "meera@example.test",
      password: "NewAccountPass123!",
    });
    expect(await screen.findByTestId("destination")).toHaveTextContent(
      "/orders",
    );
  });
  it("rejects mismatched and overlong Unicode passwords without truncating or submitting", async () => {
    boundary.auth.user = null;
    boundary.auth.profile = null;
    renderRoute(<Login />, "/login?mode=register", "/login");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Your name/), "Meera");
    await user.type(
      screen.getByLabelText(/^Email address/),
      "meera@example.test",
    );
    await user.type(screen.getByLabelText(/^Password/), "NewAccountPass123!");
    await user.type(
      screen.getByLabelText(/^Confirm password/),
      "DifferentPass123!",
    );
    await user.click(
      screen.getByRole("button", { name: "Create account", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "passwords do not match",
    );
    await user.clear(screen.getByLabelText(/^Password/));
    const longPassword = "😀".repeat(19);
    await user.click(screen.getByRole("button", { name: "Show password" }));
    await user.type(screen.getByLabelText(/^Password/), longPassword);
    expect(screen.getByLabelText(/^Password/)).toHaveValue(longPassword);
    await user.click(
      screen.getByRole("button", { name: "Create account", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "72 UTF-8 bytes",
    );
    expect(boundary.auth.register).not.toHaveBeenCalled();
  });
  it("maps catalogue search to the API search contract and opens the design detail", async () => {
    boundary.api.mockImplementation(async (path) => {
      const { url } = info(path);
      if (url.pathname === "/designs/" + design.slug) return { data: design };
      if (url.pathname === "/designs") return paginated([design]);
      throw new Error("Unexpected read " + path);
    });
    renderPublicJourney("/catalogue?q=cotton");
    await screen.findByRole("link", { name: /cotton daydream/i });
    const initial = boundary.api.mock.calls.find(([p]) =>
      p.startsWith("/designs?"),
    )[0];
    expect(
      new URL(initial, "https://atelier.example.test").searchParams.get(
        "search",
      ),
    ).toBe("cotton");
    expect(
      new URL(initial, "https://atelier.example.test").searchParams.has("q"),
    ).toBe(false);
    const user = userEvent.setup();
    await user.clear(screen.getByRole("textbox", { name: "Search designs" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search designs" }),
      "cotton & silk",
    );
    await user.click(
      screen.getByRole("button", { name: "Search", exact: true }),
    );
    await waitFor(() =>
      expect(
        boundary.api.mock.calls.some(
          ([p]) =>
            new URL(p, "https://atelier.example.test").searchParams.get(
              "search",
            ) === "cotton & silk",
        ),
      ).toBe(true),
    );
    await user.click(
      await screen.findByRole("link", { name: /cotton daydream/i }),
    );
    expect(
      await screen.findByRole("heading", { name: design.title, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Fabric provided by customer."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /customize & stitch this design/i }),
    ).toHaveAttribute(
      "href",
      "/request?design=" + design._id + "&garment=kurti",
    );
    expect(screen.getByText("₹650.25")).toBeInTheDocument();
  });

  it("exact-copy skips customization and retries the same submitted snapshot after an uncertain result", async () => {
    localStorage.clear();
    sessionStorage.clear();
    let submitted = 0;
    boundary.api.mockImplementation(async (path, options = {}) => {
      const { url, method } = info(path, options);
      if (method === "GET" && url.pathname === "/designs")
        return paginated([design]);
      if (method === "GET" && url.pathname === "/services")
        return paginated([
          { itemTypes: ["kurti", "suit", "blouse", "alteration"] },
        ]);
      if (method === "GET") return paginated([]);
      if (url.pathname === "/pricing/estimate")
        return {
          data: {
            knownSubtotalPaise: 65025,
            lineItems: [],
            pendingItems: [],
            components: {},
            configurationVersion: "a".repeat(64),
          },
        };
      if (url.pathname === "/drafts")
        return {
          data: {
            _id: "dddddddddddddddddddddddd",
            revision: 0,
            data: options.body.data,
          },
        };
      if (url.pathname === "/orders") {
        submitted++;
        if (submitted === 1)
          throw Object.assign(
            new Error(
              "The result is uncertain because the connection timed out.",
            ),
            { status: 0 },
          );
        return { data: { _id: orderId } };
      }
      throw new Error("Unexpected " + path);
    });
    renderRoute(<RequestWizard />, "/request?design=" + design._id, "/request");
    const user = userEvent.setup();
    await screen.findByText("Same as shown");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Your fit", level: 2 }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Review", level: 2 }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: /I provide the fabric/ }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Submit Stitching Request" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Submit Stitching Request" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "result is uncertain",
    );
    expect(mutations("/orders")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Back", exact: true }),
    ).toBeDisabled();
    const first = mutations("/orders")[0][1];
    expect(first.body).toMatchObject({
      designId: design._id,
      configuration: { source: "catalogue", mode: "exact" },
      measurements: { method: "assistance" },
      customer: { name: "Meera Test" },
      logistics: {
        inbound: { method: "dropoff" },
        outbound: { method: "collect" },
      },
    });
    expect(first.body).not.toHaveProperty("address");
    await user.click(
      screen.getByRole("button", { name: "Retry same request" }),
    );
    const calls = mutations("/orders");
    expect(calls[1][1].body).toEqual(first.body);
    expect(calls[1][1].headers["Idempotency-Key"]).toBe(
      first.headers["Idempotency-Key"],
    );
    expect(await screen.findByTestId("destination")).toHaveTextContent(
      "/orders/" + orderId,
    );
  });

  it("enables review submission only after the matching estimate resolves, including quantity edits", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const pending = [];
    const estimate = (quantity) => ({
      data: {
        knownSubtotalPaise: 65025 * quantity,
        lineItems: [],
        pendingItems: [],
        components: {},
        configurationVersion: "a".repeat(64),
      },
    });
    boundary.api.mockImplementation(async (path, options = {}) => {
      const { url, method } = info(path, options);
      if (method === "GET" && url.pathname === "/designs")
        return paginated([design]);
      if (method === "GET" && url.pathname === "/services")
        return paginated([{ itemTypes: ["kurti"] }]);
      if (method === "GET") return paginated([]);
      if (url.pathname === "/pricing/estimate") {
        // The original-component lookup has no logistics. Only defer the
        // estimate for the customer's full current pricing request.
        if (!options.body.logistics) return estimate(1);
        return new Promise((resolve) => {
          pending.push({ quantity: options.body.quantity, resolve });
        });
      }
      throw new Error("Unexpected " + path);
    });
    renderRoute(
      <RequestWizard />,
      "/request?design=" + design._id + "&step=review",
      "/request",
    );
    const submit = () =>
      screen.getByRole("button", { name: "Submit Stitching Request" });
    expect(submit()).toBeDisabled();
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(pending[0].quantity).toBe(1);
    expect(submit()).toBeDisabled();
    await act(async () => pending[0].resolve(estimate(1)));
    await waitFor(() => expect(submit()).toBeEnabled());

    const editQuantity = (quantity) => {
      fireEvent.click(
        screen.getByRole("button", { name: "Edit Service / garment and design" }),
      );
      fireEvent.change(screen.getByRole("spinbutton", { name: /^Quantity/ }), {
        target: { value: String(quantity) },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    };
    editQuantity(2);
    // No event-loop yield: submission must already be blocked before the
    // debounced replacement request starts, even with the old price visible.
    expect(pending).toHaveLength(1);
    expect(submit()).toBeDisabled();
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1].quantity).toBe(2);
    expect(submit()).toBeDisabled();

    editQuantity(3);
    expect(submit()).toBeDisabled();
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[2].quantity).toBe(3);
    await act(async () => pending[1].resolve(estimate(2)));
    expect(submit()).toBeDisabled();
    await act(async () => pending[2].resolve(estimate(3)));
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(
      within(screen.getByRole("complementary")).getByRole("heading", {
        name: "₹1,950.75",
      }),
    ).toBeInTheDocument();
    expect(mutations("/orders")).toHaveLength(0);
  });

  it("opens its own request and accepts only the current quote version and revision", async () => {
    let order = orderFixture();
    boundary.api.mockImplementation(async (path, options = {}) => {
      const { url, method, body } = info(path, options);
      if (method === "GET" && url.pathname === "/orders")
        return paginated([order]);
      if (method === "GET" && url.pathname === "/orders/" + orderId)
        return { data: order };
      if (method === "GET" && url.pathname === "/commerce/quote-benefits/" + orderId)
        return { data: { revision: order.revision, quoteVersion: order.quotes.at(-1).version, preview: null } };
      if (
        method === "POST" &&
        url.pathname === "/orders/" + orderId + "/quote-response"
      ) {
        order = {
          ...order,
          status: "customer_accepted",
          revision: 8,
          acceptedQuote: { ...order.quotes.at(-1) },
        };
        expect(body).toEqual({
          revision: 7,
          quoteVersion: 2,
          decision: "accept",
        });
        return { data: order };
      }
      throw new Error("Unexpected operation " + method + " " + path);
    });
    render(
      <MemoryRouter initialEntries={["/orders"]}>
        <Routes>
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetails />} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: /KS-TEST-001/i }));
    expect(
      await screen.findByRole("heading", { name: "Your stitching details" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Meera Test/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "₹751.23" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept current quote" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Accept current quote" }));
    expect(
      await screen.findByText(/Accepted quote version 2/),
    ).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledWith(
      "Accept quote version 2 for ₹751.23?",
    );
    expect(mutations("/orders/" + orderId + "/quote-response")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Accept current quote" }),
    ).not.toBeInTheDocument();
    expect(
      boundary.api.mock.calls.every(
        ([p]) => !p.includes("owner=") && !p.includes("userId="),
      ),
    ).toBe(true);
  });

  it("refreshes a stale quote after409 before sending another acceptance", async () => {
    let order = orderFixture(),
      attempts = 0;
    boundary.api.mockImplementation(async (path, options = {}) => {
      const { method, url } = info(path, options);
      if (method === "GET" && url.pathname === "/commerce/quote-benefits/" + orderId)
        return { data: { revision: order.revision, quoteVersion: order.quotes.at(-1).version, preview: null } };
      if (method === "GET") return { data: order };
      attempts++;
      if (attempts === 1) {
        order = {
          ...order,
          revision: 8,
          quotes: [
            ...order.quotes,
            {
              version: 3,
              amountPaise: 88050,
              deliveryDate: "2026-12-15",
              notes: "Revised offer",
            },
          ],
        };
        throw Object.assign(
          new Error("This quote is no longer current. Refresh the request."),
          { status: 409 },
        );
      }
      order = {
        ...order,
        status: "customer_accepted",
        acceptedQuote: order.quotes.at(-1),
      };
      return { data: order };
    });
    renderRoute(<OrderDetails />, "/orders/" + orderId, "/orders/:id");
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Accept current quote" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept current quote" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Accept current quote" }));
    expect(
      await screen.findByRole("heading", { name: "₹880.5" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept current quote" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Accept current quote" }));
    const calls = mutations("/orders/" + orderId + "/quote-response");
    expect(calls[0][1].body).toEqual({
      revision: 7,
      quoteVersion: 2,
      decision: "accept",
    });
    expect(calls[1][1].body).toEqual({
      revision: 8,
      quoteVersion: 3,
      decision: "accept",
    });
  });
});

describe("atelier management journeys with API contracts", () => {
  it("creates a draft then edits and publishes it with exact integer paise and current revision", async () => {
    let catalogue = [];
    boundary.api.mockImplementation(async (path, options = {}) => {
      const { url, method, body } = info(path, options);
      if (method === "GET" && url.pathname === "/admin/categories")
        return paginated([]);
      if (method === "GET" && url.pathname === "/admin/designs")
        return paginated(catalogue);
      if (method === "POST" && url.pathname === "/admin/designs") {
        catalogue = [
          {
            ...body,
            _id: design._id,
            revision: 0,
            currency: "INR",
            usedCount: 0,
            createdAt: "2026-11-01",
          },
        ];
        return { data: catalogue[0] };
      }
      if (
        method === "PATCH" &&
        url.pathname === "/admin/designs/" + design._id
      ) {
        catalogue = [{ ...catalogue[0], ...body, revision: 1 }];
        return { data: catalogue[0] };
      }
      throw new Error("Unexpected operation " + method + " " + path);
    });
    renderRoute(<AdminDesigns />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "New design" }));
    await user.type(screen.getByLabelText(/Design title/), "Cotton daydream");
    await user.type(screen.getByLabelText(/Design code/), "K-01");
    await user.clear(screen.getByLabelText(/Stitching starting price/));
    await user.type(
      screen.getByLabelText(/Stitching starting price/),
      "650.25",
    );
    await user.type(
      screen.getByLabelText("Stitching description"),
      "A thoughtful custom kurti stitching reference.",
    );
    await user.click(screen.getByRole("button", { name: "Save design" }));
    expect(await screen.findByText(/Design saved/)).toBeInTheDocument();
    expect(mutations("/admin/designs")[0][1].body).toMatchObject({
      startingPricePaise: 65025,
      status: "draft",
      slug: "cotton-daydream",
    });
    await user.click(
      await screen.findByRole("button", { name: "Edit", exact: true }),
    );
    await user.clear(screen.getByLabelText(/Design title/));
    await user.type(
      screen.getByLabelText(/Design title/),
      "Cotton daydream refined",
    );
    await user.selectOptions(screen.getByLabelText("Publication"), "published");
    await user.click(screen.getByRole("button", { name: "Save design" }));
    await waitFor(() =>
      expect(mutations("/admin/designs/" + design._id)).toHaveLength(1),
    );
    const edited = mutations("/admin/designs/" + design._id)[0][1];
    expect(edited.method).toBe("PATCH");
    expect(edited.body).toMatchObject({
      title: "Cotton daydream refined",
      status: "published",
      startingPricePaise: 65025,
      revision: 0,
      slug: "cotton-daydream",
    });
    for (const field of ["_id", "currency", "usedCount", "createdAt"])
      expect(edited.body).not.toHaveProperty(field);
    expect(await screen.findByText("Published")).toBeInTheDocument();
  });

  it("disables catalogue upload when the eight-image limit has been reached", async () => {
    boundary.api.mockImplementation(async (path) =>
      new URL(path, "https://test.local").pathname === "/admin/categories"
        ? paginated([])
        : paginated([
            {
              ...design,
              mediaIds: Array.from({ length: 8 }, (_, i) =>
                String(i).padStart(24, "0"),
              ),
            },
          ]),
    );
    renderRoute(<AdminDesigns />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Edit", exact: true }));
    expect(screen.getByLabelText("Upload catalogue image")).toBeDisabled();
    expect(
      screen.getAllByRole("button", { name: /Detach image/ }),
    ).toHaveLength(8);
    expect(mutations("/media")).toHaveLength(0);
  });

  it("sends a versioned quote in paise and uses the refreshed revision for an allowed progress change", async () => {
    let order = orderFixture({
      status: "under_review",
      revision: 4,
      quotes: [],
    });
    boundary.api.mockImplementation(async (path, options = {}) => {
      const { url, method, body } = info(path, options);
      if (method === "GET") return { data: order };
      if (url.pathname.endsWith("/quotes")) {
        order = {
          ...order,
          status: "quote_sent",
          revision: 5,
          quotes: [
            {
              version: 1,
              amountPaise: body.amountPaise,
              deliveryDate: body.deliveryDate,
              notes: body.notes,
            },
          ],
        };
        return { data: order };
      }
      if (url.pathname.endsWith("/status")) {
        order = { ...order, status: body.status, revision: 6 };
        return { data: order };
      }
      throw new Error("Unexpected operation " + method + " " + path);
    });
    renderRoute(
      <OrderDetails admin />,
      "/admin/orders/" + orderId,
      "/admin/orders/:id",
    );
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Send a quote" });
    await user.type(screen.getByLabelText(/Total stitching price/), "1500.25");
    const deliveryDate = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    await user.type(
      screen.getByLabelText(/^Proposed delivery date/),
      deliveryDate,
    );
    await user.type(
      screen.getByLabelText("Quote notes"),
      "Includes lining and careful finishing.",
    );
    await user.click(
      screen.getByRole("button", { name: "Send quote", exact: true }),
    );
    expect(await screen.findByText("QUOTE · VERSION 1")).toBeInTheDocument();
    expect(
      mutations("/admin/orders/" + orderId + "/quotes")[0][1].body,
    ).toEqual({
      revision: 4,
      amountPaise: 150025,
      deliveryDate,
      notes: "Includes lining and careful finishing.",
    });
    const status = screen.getByLabelText("Next status");
    expect(
      within(status).queryByRole("option", { name: "Customer Accepted" }),
    ).not.toBeInTheDocument();
    expect(
      within(status).queryByRole("option", { name: "Fabric Received" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(status, "under_review");
    await user.type(
      screen.getByLabelText("Progress note"),
      "Review the requested neckline again.",
    );
    await user.click(screen.getByRole("button", { name: "Update status" }));
    await waitFor(() =>
      expect(mutations("/admin/orders/" + orderId + "/status")).toHaveLength(1),
    );
    expect(
      mutations("/admin/orders/" + orderId + "/status")[0][1],
    ).toMatchObject({
      method: "PATCH",
      body: {
        revision: 5,
        status: "under_review",
        note: "Review the requested neckline again.",
      },
    });
  });
});
