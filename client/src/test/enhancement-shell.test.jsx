import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {} }));
vi.mock("../lib/api", async (original) => ({
  ...(await original()),
  api: boundary.api,
}));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
import { safeReturnTo } from "../lib/continuation";
import { Login } from "../pages/Public";
import { PasswordHelp } from "../pages/Security";
import { OrderFulfilment } from "../components/OrderEnhancements";
const id = "aaaaaaaaaaaaaaaaaaaaaaaa",
  draft = "197cf495-de52-4b98-8372-6ea018028515";
function Destination() {
  const loc = useLocation();
  return <output data-testid="destination">{loc.pathname + loc.search}</output>;
}
beforeEach(() => {
  window.location.hash = "";
  boundary.api.mockReset().mockResolvedValue({ data: {} });
  boundary.auth = {
    login: vi.fn().mockResolvedValue({}),
    register: vi.fn(),
    dismissError: vi.fn(),
    user: null,
    profile: null,
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = "";
});
describe("validated authenticated continuation", () => {
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/login?returnTo=/login",
    "/account/unknown",
    "/request?token=secret",
    "/request?address=private",
    "/request?draft=%0Aevil",
    "/request#secret",
    null,
  ])("rejects unsafe or unsupported return %s", (value) => {
    expect(safeReturnTo(value)).toBe("/account");
  });
  it("retains permitted draft/step routes and nested order routes", () => {
    expect(safeReturnTo(`/request?draft=${draft}&step=review`)).toBe(
      `/request?draft=${draft}&step=review`,
    );
    expect(safeReturnTo(`/admin/orders/${id}`)).toBe(`/admin/orders/${id}`);
  });
  it("returns to the preserved review after login without submitting an order", async () => {
    const returnTo = `/request?draft=${draft}&step=review`;
    render(
      <MemoryRouter
        initialEntries={[`/login?returnTo=${encodeURIComponent(returnTo)}`]}
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(
      screen.getByLabelText(/Email address/),
      "customer@example.test",
    );
    await userEvent.type(
      screen.getByLabelText(/^Password/),
      "A good password 2026!",
    );
    await userEvent.click(screen.getByRole("button", { name: /^Sign in$/ }));
    expect(await screen.findByTestId("destination")).toHaveTextContent(
      returnTo,
    );
    expect(boundary.api.mock.calls.some(([path]) => path === "/orders")).toBe(
      false,
    );
  });
});
describe("supported email recovery", () => {
  it("offers truthful contact guidance when email recovery is disabled", async () => {
    boundary.api.mockResolvedValue({ data: { passwordRecovery: false } });
    render(
      <MemoryRouter>
        <PasswordHelp />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/Email password recovery is not configured/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reset link/ }),
    ).not.toBeInTheDocument();
  });
  it("requests a generic recovery response through the configured provider endpoint", async () => {
    boundary.api.mockImplementation(async (path) =>
      path === "/auth/capabilities"
        ? { data: { passwordRecovery: true } }
        : {
            data: {
              message:
                "If an eligible account exists, a reset link will be sent.",
            },
          },
    );
    render(
      <MemoryRouter>
        <PasswordHelp />
      </MemoryRouter>,
    );
    await userEvent.type(
      await screen.findByLabelText(/Email address/),
      "customer@example.test",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Request a secure reset link/ }),
    );
    expect(
      await screen.findByText(/If an eligible account exists/),
    ).toBeInTheDocument();
    expect(boundary.api).toHaveBeenCalledWith(
      "/auth/recovery",
      expect.objectContaining({
        auth: false,
        method: "POST",
        body: { email: "customer@example.test" },
      }),
    );
  });
});
it("admin fulfilment edits record actual arrangements without changing accepted pricing", async () => {
  const reload = vi.fn();
  render(
    <OrderFulfilment
      admin
      order={{ _id: id, revision: 8, acceptedQuote: { amountPaise: 90000 } }}
      reload={reload}
    />,
  );
  await userEvent.selectOptions(
    screen.getByLabelText(/Fabric transport status/),
    "confirmed",
  );
  await userEvent.type(
    screen.getByLabelText(/Confirmed margin details/),
    "Available margin reviewed for this kurti.",
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Save confirmed handover details/ }),
  );
  await waitFor(() => expect(reload).toHaveBeenCalled());
  const body = boundary.api.mock.calls[0][1].body;
  expect(body.inboundStatus).toBe("confirmed");
  expect(body.revision).toBe(8);
  expect(body).not.toHaveProperty("acceptedQuote");
  expect(body).not.toHaveProperty("amountPaise");
});
