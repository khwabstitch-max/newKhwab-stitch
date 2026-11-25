import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { AdminChatDashboard } from "../pages/AdminChatDashboard";
import { CustomerChatWidget } from "../components/chat/CustomerChatWidget";
import { api } from "../lib/api";
import { claimChatPhotoRefresh, mergeChatMessages } from "../lib/chat-messages";

vi.mock("../lib/api", () => ({ api: vi.fn() }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { _id: "admin", name: "Admin" } }) }));
vi.mock("../lib/chat-socket", () => ({
  createAdminSocket: () => null,
  createCustomerSocket: () => null,
  getStoredChatSession: () => ({ customerId: "guest", guestToken: "guest-token" }),
  saveChatSession: vi.fn(),
  clearChatSession: vi.fn(),
}));

const conversation = (id) => ({ customerId: id, displayName: `Customer ${id}`, status: "active" });
const message = (id, content, extra = {}) => ({ _id: id, content, senderType: "customer", createdAt: "2026-11-24T00:00:00Z", ...extra });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const originalScrollTo = HTMLElement.prototype.scrollTo;

beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
  api.mockReset();
  api.mockImplementation(async (path) => {
    if (path.startsWith("/admin/chat/conversations?")) return { data: { conversations: [conversation("A"), conversation("B")] } };
    if (path.endsWith("/messages?limit=60")) return { data: { messages: [message(path.includes("/A/") ? "a" : "b", path.includes("/A/") ? "Message A" : "Message B")] } };
    if (path.endsWith("/A")) return { data: { conversation: conversation("A"), customer: { notes: "A notes" } } };
    if (path.endsWith("/B")) return { data: { conversation: conversation("B"), customer: { notes: "B notes" } } };
    return { data: {} };
  });
});
afterEach(() => { vi.useRealTimers(); HTMLElement.prototype.scrollTo = originalScrollTo; });
const openDashboard = () => render(<BrowserRouter><AdminChatDashboard /></BrowserRouter>);

it.each(["metadata", "messages"])("ignores late %s from the previously selected customer", async (stage) => {
  const pending = deferred();
  const normal = api.getMockImplementation();
  api.mockImplementation((path, options) => {
    if (path === (stage === "metadata" ? "/admin/chat/conversations/A" : "/admin/chat/conversations/A/messages?limit=60")) return pending.promise;
    return normal(path, options);
  });
  openDashboard();
  const customerA = await screen.findByText("Customer A");
  await act(async () => { fireEvent.click(customerA); });
  await act(async () => { fireEvent.click(screen.getByText("Customer B")); });
  expect(await screen.findByText("Message B")).toBeInTheDocument();
  await act(async () => { pending.resolve({ data: { conversation: conversation("A"), messages: [message("a", "Message A")] } }); });
  expect(screen.getByRole("heading", { name: "Customer B" })).toBeInTheDocument();
  expect(screen.queryByText("Message A")).not.toBeInTheDocument();
  expect(screen.getByText("Message B")).toBeInTheDocument();
});

it("receives REST history while the socket is unavailable", async () => {
  vi.useFakeTimers();
  await act(async () => { openDashboard(); });
  await act(async () => { fireEvent.click(screen.getByText("Customer A")); });
  expect(screen.getByText("Message A")).toBeInTheDocument();
  const normal = api.getMockImplementation();
  api.mockImplementation((path, options) => path.endsWith("/messages?limit=60")
    ? Promise.resolve({ data: { messages: [message("new", "Reply delivered through REST")] } })
    : normal(path, options));
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(screen.getByText("Reply delivered through REST")).toBeInTheDocument();
  expect(screen.getByText("Message A")).toBeInTheDocument();
});

describe("chat history merge", () => {
  it("renews a signed photo URL while retaining older and concurrent messages", () => {
    const current = [message("older", "Older"), message("photo", "", { attachment: { url: "expired" }, deliveryStatus: "read" }), message("new", "Concurrent")];
    const merged = mergeChatMessages(current, [message("photo", "", { attachment: { url: "renewed" }, deliveryStatus: "sent" })]);
    expect(merged).toHaveLength(3);
    expect(merged.find((entry) => entry._id === "photo")).toMatchObject({ attachment: { url: "renewed" }, deliveryStatus: "read" });
    expect(merged.map((entry) => entry._id)).toEqual(["older", "photo", "new"]);
  });
  it("reconciles a socket reply with its optimistic message", () => {
    const merged = mergeChatMessages([message("temporary", "Reply", { clientMessageId: "nonce" })], [message("server", "Reply", { clientMessageId: "nonce" })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]._id).toBe("server");
  });
});


it("renews an open conversation photo on focus without discarding other history", async () => {
  const normal = api.getMockImplementation();
  let signedUrl = "https://private.example/old";
  api.mockImplementation((path, options) => path.endsWith("/messages?limit=60")
    ? Promise.resolve({ data: { messages: [message("photo", "", { messageType: "image", attachment: { url: signedUrl } })] } })
    : normal(path, options));
  openDashboard();
  const customerA = await screen.findByText("Customer A");
  await act(async () => { fireEvent.click(customerA); });
  expect(screen.getByRole("img", { name: /design reference/i })).toHaveAttribute("src", signedUrl);
  signedUrl = "https://private.example/renewed";
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(screen.getByRole("img", { name: /design reference/i })).toHaveAttribute("src", signedUrl);
});


it.each(["admin", "customer"])("renews an off-page %s photo through its history window and bounds retries", async (role) => {
  const normal = api.getMockImplementation();
  const oldPhoto = message("old-photo", "", { messageType: "image", attachment: { url: "https://private.example/expired" } });
  const latest = message("latest", "Latest message", { createdAt: "2026-11-24T01:00:00Z" });
  let latestOnly = false;
  api.mockImplementation((path, options) => {
    if (path.includes("/messages?limit=100&before=")) return Promise.resolve({ data: { messages: [{ ...oldPhoto, attachment: { url: "https://private.example/renewed-old" } }] } });
    if (path === "/chat/messages?limit=50" || path.endsWith("/messages?limit=60")) {
      return Promise.resolve({ data: { messages: latestOnly ? [latest] : [oldPhoto, latest] } });
    }
    return normal(path, options);
  });
  if (role === "admin") {
    openDashboard();
    const customerA = await screen.findByText("Customer A");
    await act(async () => { fireEvent.click(customerA); });
  } else {
    render(<BrowserRouter><CustomerChatWidget /></BrowserRouter>);
    await act(async () => { fireEvent.click(screen.getByLabelText(/Chat with KhwabStitch Atelier/i)); });
  }
  expect(screen.getByRole("img", { name: /design reference/i })).toHaveAttribute("src", oldPhoto.attachment.url);
  latestOnly = true;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await act(async () => { fireEvent.error(screen.getByRole("img", { name: /design reference/i })); });
  expect(screen.getByRole("img", { name: /design reference/i })).toHaveAttribute("src", "https://private.example/renewed-old");
  expect(screen.getByText("Latest message")).toBeInTheDocument();
  const historyCalls = () => api.mock.calls.filter(([path]) => path.includes("limit=100&before="));
  expect(historyCalls()).toHaveLength(1);
  expect(new URL(`https://app.example${historyCalls()[0][0]}`).searchParams.get("before")).toBe("2026-11-24T00:00:00.001Z");
  await act(async () => { fireEvent.error(screen.getByRole("img", { name: /design reference/i })); });
  expect(historyCalls()).toHaveLength(1);
});

it("allows a bounded new renewal attempt after a minute", () => {
  const attempts = new Map();
  const photo = message("photo", "", { attachment: { url: "signed" } });
  expect(claimChatPhotoRefresh(attempts, photo, 1_000)).toBeTruthy();
  expect(claimChatPhotoRefresh(attempts, photo, 2_000)).toBeNull();
  expect(claimChatPhotoRefresh(attempts, photo, 61_000)).toBeTruthy();
});


it("keeps a lightbox usable when focus refresh has already replaced the old URL", async () => {
  const normal = api.getMockImplementation();
  let signedUrl = "https://private.example/old-overlay";
  api.mockImplementation((path, options) => path.endsWith("/messages?limit=60")
    ? Promise.resolve({ data: { messages: [message("photo", "", { messageType: "image", attachment: { url: signedUrl } })] } })
    : normal(path, options));
  openDashboard();
  const customerA = await screen.findByText("Customer A");
  await act(async () => { fireEvent.click(customerA); });
  fireEvent.click(screen.getByRole("button", { name: "View photo" }));
  signedUrl = "https://private.example/new-overlay";
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await act(async () => { fireEvent.error(screen.getByAltText("Enlarged design reference")); });
  expect(screen.getByAltText("Enlarged design reference")).toHaveAttribute("src", signedUrl);
});

it("marks newly polled customer messages read without repeating acknowledgements", async () => {
  vi.useFakeTimers();
  await act(async () => { openDashboard(); });
  await act(async () => { fireEvent.click(screen.getByText("Customer A")); });
  const normal = api.getMockImplementation();
  api.mockImplementation((path, options) => path.endsWith("/messages?limit=60")
    ? Promise.resolve({ data: { messages: [message("fresh", "New incoming", { deliveryStatus: "delivered" })] } })
    : normal(path, options));
  const before = api.mock.calls.filter(([path]) => path.endsWith("/read")).length;
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(screen.getByText("New incoming")).toBeInTheDocument();
  const after = api.mock.calls.filter(([path]) => path.endsWith("/read")).length;
  expect(after).toBe(before + 1);
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(api.mock.calls.filter(([path]) => path.endsWith("/read"))).toHaveLength(after);
});


it("keeps a fresh photo URL during routine polls and renews it near expiry or on explicit recovery", () => {
  const photo = (url) => message("photo", "", { attachment: { fileId: "private-file", url, width: 100 }, deliveryStatus: "delivered" });
  const first = mergeChatMessages([], [photo("initial")], { now: 1_000 });
  const poll = mergeChatMessages(first, [{ ...photo("unnecessary-new-signature"), attachment: { ...photo("unnecessary-new-signature").attachment, width: 200 }, deliveryStatus: "read" }], { now: 6_000 });
  expect(poll[0]).toMatchObject({ attachment: { fileId: "private-file", url: "initial", width: 200 }, deliveryStatus: "read" });
  const expired = mergeChatMessages(poll, [photo("timely-renewal")], { now: 241_000 });
  expect(expired[0].attachment.url).toBe("timely-renewal");
  const forced = mergeChatMessages(poll, [photo("error-recovery")], { now: 7_000, forcePhotoRefresh: true });
  expect(forced[0].attachment.url).toBe("error-recovery");
  expect(forced[0].deliveryStatus).toBe("read");
});

it("does not reload a visible photo on each disconnected history poll", async () => {
  vi.useFakeTimers();
  const normal = api.getMockImplementation();
  let signedUrl = "https://private.example/poll-initial";
  api.mockImplementation((path, options) => path.endsWith("/messages?limit=60")
    ? Promise.resolve({ data: { messages: [message("photo", "", { messageType: "image", attachment: { fileId: "private-file", url: signedUrl } })] } })
    : normal(path, options));
  await act(async () => { openDashboard(); });
  await act(async () => { fireEvent.click(screen.getByText("Customer A")); });
  signedUrl = "https://private.example/poll-new-signature";
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(screen.getByRole("img", { name: "Design reference" })).toHaveAttribute("src", "https://private.example/poll-initial");
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(screen.getByRole("img", { name: "Design reference" })).toHaveAttribute("src", signedUrl);
});
