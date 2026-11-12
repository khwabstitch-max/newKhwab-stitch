import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async original => ({ ...(await original()), api: boundary.api }));
import { QuoteAcceptance, QuoteBenefitBreakdown } from "../components/QuoteBenefits";
import { AccountCommerce, AdminCommerce } from "../pages/Commerce";
import { setLanguage } from "../i18n/core";
const order = { _id: "a".repeat(24), revision: 4 }, quote = { version: 2, amountPaise: 45000 };
const preview = { grossAmountPaise: 45000, discountPaise: 5000, creditPaise: 10000, amountPaise: 30000, offerCode: "TEST" };
const list = data => ({ data, pagination: { page: 1, pages: 1, limit: 20, total: data.length } });
const mount = element => render(<MemoryRouter>{element}</MemoryRouter>);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { setLanguage("en", false); boundary.api.mockReset(); vi.restoreAllMocks(); });

it("waits for authoritative current benefits and confirms the net amount using the current quote revision", async () => {
  const pending = deferred(), action = vi.fn();
  boundary.api.mockReturnValue(pending.promise); vi.spyOn(window, "confirm").mockReturnValue(true);
  mount(<QuoteAcceptance order={order} quote={quote} action={action} />);
  const accept = screen.getByRole("button", { name: "Accept current quote" });
  expect(accept).toBeDisabled(); expect(screen.getByRole("status")).toHaveTextContent("Checking");
  pending.resolve({ data: { revision: 4, quoteVersion: 2, preview } });
  await waitFor(() => expect(accept).toBeEnabled());
  expect(screen.getByText("Payable after benefits").nextElementSibling).toHaveTextContent("₹300");
  await userEvent.click(accept);
  expect(window.confirm).toHaveBeenCalledWith("Accept quote version 2 for ₹300?");
  expect(action).toHaveBeenCalledWith(`/orders/${order._id}/quote-response`, { revision: 4, quoteVersion: 2, decision: "accept" });
  expect(screen.getByRole("link", { name: "Choose or remove offers and stitching credits" })).toHaveAttribute("href", "/account/benefits");
});
it("a failed benefits request cannot silently accept a gross or stale price and retry restores the action", async () => {
  boundary.api.mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValue({ data: { revision: 4, quoteVersion: 2, preview: null } });
  const action = vi.fn(); mount(<QuoteAcceptance order={order} quote={quote} action={action} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
  expect(screen.getByRole("button", { name: "Accept current quote" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Accept current quote" })).toBeEnabled());
  expect(action).not.toHaveBeenCalled();
});
it("stale benefit metadata requires refreshing the order and never invokes acceptance", async () => {
  boundary.api.mockResolvedValue({ data: { revision: 3, quoteVersion: 1, preview } });
  const action = vi.fn(), reloadOrder = vi.fn(); mount(<QuoteAcceptance order={order} quote={quote} action={action} reloadOrder={reloadOrder} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Your quote or benefits changed");
  expect(screen.getByRole("button", { name: "Accept current quote" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reloadOrder).toHaveBeenCalledOnce(); expect(action).not.toHaveBeenCalled();
});
it("changed programme eligibility blocks acceptance even when the quote version itself is unchanged", async () => {
  boundary.api.mockResolvedValue({ data: { revision: 4, quoteVersion: 2, preview, valid: false, validationMessage: "Offers are currently unavailable." } });
  const action = vi.fn(); mount(<QuoteAcceptance order={order} quote={quote} action={action} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Offers are currently unavailable.");
  expect(screen.getByRole("button", { name: "Accept current quote" })).toBeDisabled(); expect(action).not.toHaveBeenCalled();
});
it("historical benefits show original and agreed values in Hindi without translating the offer code", () => {
  setLanguage("hi", false); mount(<QuoteBenefitBreakdown preview={preview} />);
  expect(screen.getByText("लाभ के बाद देय राशि").nextElementSibling).toHaveTextContent("₹300");
  expect(screen.getByText("मूल कोटेशन")).toBeInTheDocument();
  expect(screen.getByText(/ऑफ़र की छूट · TEST/)).toBeInTheDocument();
  expect(screen.getByText("लाभ के बाद देय राशि")).toBeInTheDocument();
  expect(boundary.api).not.toHaveBeenCalled();
});
it("disabled programmes keep balances and history visible while hiding unavailable offer and referral actions", async () => {
  boundary.api.mockImplementation(async path => {
    if (path === "/commerce/account") return { data: { enabled: false, balancePaise: 12345, terms: "", milestones: [] } };
    return list([]);
  });
  mount(<AccountCommerce />);
  expect(await screen.findByText("₹123.45")).toBeInTheDocument();
  expect(screen.getByText(/Benefits are currently unavailable/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create my referral code" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save quote benefits" })).not.toBeInTheDocument();
  expect(boundary.api.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});
it("admin credit retries preserve the event ID and exact paise after an uncertain failure", async () => {
  let fail = true;
  const customer = { _id: order._id, name: "Test customer", email: "customer@example.test" };
  vi.spyOn(window, "confirm").mockReturnValue(true);
  boundary.api.mockImplementation(async (path, options) => {
    if (path === "/admin/commerce/settings") return { data: { enabled: false } };
    if (path.startsWith("/admin/commerce/offers")) return list([]);
    if (path.startsWith("/admin/customers?")) return list([customer]);
    if (path === "/admin/commerce/credits" && options?.method === "POST") { if (fail) { fail = false; throw Error("The result is uncertain."); } return { data: { balancePaise: 12345 } }; }
    return list([]);
  });
  mount(<AdminCommerce />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Find a customer by name or email"), "customer");
  await user.click(await screen.findByRole("radio", { name: /Test customer.*customer@example.test/ }));
  await user.type(screen.getByLabelText("Credit amount (₹)"), "123.45");
  await user.type(screen.getByLabelText("Reason for adjustment", { exact: false }), "Approved service adjustment");
  await user.click(screen.getByRole("button", { name: "Save credit adjustment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("uncertain");
  expect(screen.getByLabelText("Find a customer by name or email")).toBeDisabled();
  expect(screen.getByLabelText("Credit amount (₹)")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Retry same request" }));
  await screen.findByText(/Credit adjustment saved/);
  const calls = boundary.api.mock.calls.filter(([path]) => path === "/admin/commerce/credits");
  expect(calls).toHaveLength(2); expect(calls[0][1].body).toEqual(calls[1][1].body);
  expect(calls[0][1].body).toMatchObject({ owner: customer._id, deltaPaise: 12345, reason: "Approved service adjustment" });
  expect(calls[0][1].body.clientId).toEqual(expect.any(String));
  expect(window.confirm).toHaveBeenCalledTimes(1);
});
