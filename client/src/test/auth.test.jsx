import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AuthProvider, useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { createSessionStore, SESSION_KEY, sessionStore } from "../lib/session";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Protected } from "../components/Layout";
const credentials = {
  email: "meera@example.test",
  password: "MyStrongPass123!",
};
const account = {
  _id: "customer-one",
  name: "Meera",
  email: "meera@example.test",
  phone: "",
  role: "customer",
  emailVerified: false,
};
const expiry = () => new Date(Date.now() + 30 * 60 * 1000).toISOString();
const json = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => "application/json" },
  json: async () => data,
});
const sessionResponse = (token = "issued-token", user = account) =>
  json({ data: { token, expiresAt: expiry(), user } });
function Probe() {
  const auth = useAuth();
  return (
    <>
      <output data-testid="profile">
        {auth.profile?.email || "anonymous"}
      </output>
      <output data-testid="role">{auth.profile?.role || "none"}</output>
      <output data-testid="profile-name">{auth.profile?.name || "none"}</output>
      <output data-testid="loading">{String(auth.loading)}</output>
      <output data-testid="has-session">{String(auth.hasSession)}</output>
      <div data-testid="auth-message">{auth.error}</div>
      <button onClick={() => auth.login(credentials).catch(() => {})}>
        Log in
      </button>
      <button
        onClick={() =>
          auth.register({ name: "Meera", ...credentials }).catch(() => {})
        }
      >
        Register
      </button>
      <button onClick={() => auth.logout()}>Log out</button>
      <button onClick={() => auth.reloadProfile().catch(() => {})}>
        Reload profile
      </button>
      <button onClick={() => api("/orders").catch(() => {})}>
        Protected request
      </button>
      <button onClick={() => api("/auth/password", { method: "POST", body: { currentPassword: "incorrect", password: "Another secure password" } }).catch(() => {})}>
        Change password
      </button>
    </>
  );
}
const mount = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
const path = (url) => new URL(url, "https://test.local").pathname;
beforeEach(() => {
  sessionStore.clear();
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  sessionStore.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("application JWT session lifecycle", () => {
  it("registers through the API and stores only the token/expiry, never password or role", async () => {
    fetch.mockResolvedValue(sessionResponse());
    mount();
    fireEvent.click(screen.getByText("Register", { exact: true }));
    await waitFor(() =>
      expect(screen.getByTestId("profile")).toHaveTextContent(account.email),
    );
    expect(path(fetch.mock.calls[0][0])).toBe("/api/auth/register");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      name: "Meera",
      ...credentials,
    });
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY))).toEqual({
      token: "issued-token",
      expiresAt: expect.any(String),
    });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.getByTestId("role")).toHaveTextContent("customer");
  });
  it("restores a saved token by verifying /me before using an identity or role", async () => {
    sessionStore.set({ token: "saved-token", expiresAt: expiry() });
    let resolve;
    fetch.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(screen.getByTestId("profile")).toHaveTextContent("anonymous");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer saved-token",
    );
    await act(async () => resolve(json({ data: account })));
    expect(screen.getByTestId("profile")).toHaveTextContent(account.email);
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });
  it("clears an invalid restored token and profile after a server401", async () => {
    sessionStore.set({ token: "invalid-token", expiresAt: expiry() });
    fetch.mockResolvedValue(
      json(
        { error: { code: "INVALID_TOKEN", message: "Invalid session." } },
        401,
      ),
    );
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("has-session")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("profile")).toHaveTextContent("anonymous");
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.getByTestId("auth-message")).toHaveTextContent(
      "invalid or expired",
    );
  });
  it("keeps transient restoration failures recoverable without trusting a client identity", async () => {
    sessionStore.set({ token: "saved-token", expiresAt: expiry() });
    fetch
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue(json({ data: account }));
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("auth-message")).toHaveTextContent(
        "Cannot reach",
      ),
    );
    expect(screen.getByTestId("profile")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("has-session")).toHaveTextContent("true");
    fireEvent.click(screen.getByText("Reload profile"));
    await waitFor(() =>
      expect(screen.getByTestId("profile")).toHaveTextContent(account.email),
    );
  });
  it("does not create a session after a rejected login", async () => {
    fetch.mockResolvedValue(
      json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email or password is incorrect.",
          },
        },
        401,
      ),
    );
    mount();
    fireEvent.click(screen.getByText("Log in"));
    await waitFor(() =>
      expect(screen.getByTestId("auth-message")).toHaveTextContent(
        "Email or password is incorrect.",
      ),
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(sessionStore.get()).toBeNull();
  });
  it("clears local state when a protected API request rejects the current token", async () => {
    sessionStore.set({ token: "current-token", expiresAt: expiry() });
    fetch
      .mockResolvedValueOnce(json({ data: account }))
      .mockResolvedValue(
        json({ error: { code: "INVALID_TOKEN", message: "Revoked." } }, 401),
      );
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("profile")).toHaveTextContent(account.email),
    );
    fireEvent.click(screen.getByText("Protected request"));
    await waitFor(() =>
      expect(screen.getByTestId("profile")).toHaveTextContent("anonymous"),
    );
    expect(sessionStore.get()).toBeNull();
    expect(screen.getByTestId("role")).toHaveTextContent("none");
  });
  it("preserves a new account when an old in-flight request later returns401", async () => {
    sessionStore.set({ token: "old-token", expiresAt: expiry() });
    let rejectOld;
    const second = {
      ...account,
      _id: "customer-two",
      email: "second@example.test",
    };
    fetch.mockImplementation((url) =>
      path(url) === "/api/me"
        ? Promise.resolve(json({ data: account }))
        : path(url) === "/api/auth/login"
          ? Promise.resolve(sessionResponse("new-token", second))
          : new Promise((resolve) => {
              rejectOld = resolve;
            }),
    );
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("profile")).toHaveTextContent(account.email),
    );
    fireEvent.click(screen.getByText("Protected request"));
    fireEvent.click(screen.getByText("Log in"));
    await waitFor(() =>
      expect(screen.getByTestId("profile")).toHaveTextContent(second.email),
    );
    await act(async () =>
      rejectOld(
        json(
          { error: { code: "INVALID_TOKEN", message: "Old token revoked." } },
          401,
        ),
      ),
    );
    expect(sessionStore.get()?.token).toBe("new-token");
    expect(screen.getByTestId("profile")).toHaveTextContent(second.email);
  });
  it("ignores a stale profile response from the previous account", async () => {
    sessionStore.set({ token: "old-token", expiresAt: expiry() });
    let oldProfile;
    const second = {
      ...account,
      _id: "customer-two",
      email: "second@example.test",
    };
    fetch.mockImplementation((url) =>
      path(url) === "/api/me"
        ? new Promise((resolve) => {
            oldProfile = resolve;
          })
        : Promise.resolve(sessionResponse("new-token", second)),
    );
    mount();
    fireEvent.click(screen.getByText("Log in"));
    await waitFor(() =>
      expect(screen.getByTestId("profile")).toHaveTextContent(second.email),
    );
    await act(async () =>
      oldProfile(json({ data: { ...account, role: "admin" } })),
    );
    expect(screen.getByTestId("profile")).toHaveTextContent(second.email);
    expect(screen.getByTestId("role")).toHaveTextContent("customer");
  });
  it("removes token, identity and role at the server-provided session expiry", async () => {
    vi.useFakeTimers();
    sessionStore.set({
      token: "short-session",
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    fetch.mockResolvedValue(json({ data: account }));
    await act(async () => {
      mount();
    });
    expect(screen.getByTestId("profile")).toHaveTextContent(account.email);
    await act(async () => vi.advanceTimersByTimeAsync(1001));
    expect(sessionStore.get()).toBeNull();
    expect(screen.getByTestId("profile")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("auth-message")).toHaveTextContent("expired");
  });
  it("asks the server to revoke the authenticated session before clearing local state", async () => {
    sessionStore.set({ token: "logout-token", expiresAt: expiry() });
    fetch
      .mockResolvedValueOnce(json({ data: account }))
      .mockResolvedValue(json({ data: { loggedOut: true } }));
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("profile")).toHaveTextContent(account.email),
    );
    fireEvent.click(screen.getByText("Log out"));
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEY)).toBeNull());
    const call = fetch.mock.calls.find(
      ([url]) => path(url) === "/api/auth/logout",
    );
    expect(call[1]).toMatchObject({
      method: "POST",
      body: "{}",
      headers: { Authorization: "Bearer logout-token" },
    });
    expect(screen.getByTestId("profile")).toHaveTextContent("anonymous");
  });
  it("always signs out locally when server logout is unreachable", async () => {
    sessionStore.set({ token: "logout-token", expiresAt: expiry() });
    fetch
      .mockResolvedValueOnce(json({ data: account }))
      .mockRejectedValue(new TypeError("offline"));
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("profile")).toHaveTextContent(account.email),
    );
    fireEvent.click(screen.getByText("Log out"));
    await waitFor(() => expect(sessionStore.get()).toBeNull());
    expect(screen.getByTestId("profile")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("auth-message")).toHaveTextContent(
      "revocation could not be confirmed",
    );
  });
  it("does not sign out a valid session when a current-password check returns401", async () => {
    sessionStore.set({ token: "valid-token", expiresAt: expiry() });
    fetch.mockImplementation((url) => Promise.resolve(path(url) === "/api/me"
      ? json({ data: account })
      : json({ error: { code: "INVALID_CREDENTIALS", message: "Your current password is incorrect." } }, 401)));
    mount();
    await screen.findByText(account.email);
    fireEvent.click(screen.getByText("Change password"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(sessionStore.get()?.token).toBe("valid-token");
    expect(screen.getByTestId("profile")).toHaveTextContent(account.email);
    expect(screen.getByTestId("has-session")).toHaveTextContent("true");
  });
  it("keeps the protected route during a retry after503 instead of redirecting to login", async () => {
    sessionStore.set({ token: "recoverable-token", expiresAt: expiry() });
    let resolveRetry;
    fetch.mockResolvedValueOnce(json({ error: { code: "DATABASE_UNAVAILABLE", message: "Temporarily unavailable." } }, 503))
      .mockImplementation(() => new Promise(resolve => { resolveRetry = resolve; }));
    render(<AuthProvider><MemoryRouter initialEntries={["/private"]}><Routes>
      <Route element={<Protected />}><Route path="/private" element={<p>Recovered private page</p>} /></Route>
      <Route path="/login" element={<p>Unexpected login redirect</p>} />
    </Routes></MemoryRouter></AuthProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Temporarily unavailable.");
    expect(sessionStore.get()?.token).toBe("recoverable-token");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Unexpected login redirect")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Checking your session");
    await act(async () => resolveRetry(json({ data: account })));
    expect(screen.getByText("Recovered private page")).toBeInTheDocument();
  });
  it("lets the latest profile refresh win when earlier responses arrive out of order", async () => {
    sessionStore.set({ token: "same-token", expiresAt: expiry() });
    const pending = [];
    fetch.mockResolvedValueOnce(json({ data: account })).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    mount();
    await screen.findByText(account.email);
    fireEvent.click(screen.getByText("Reload profile"));
    fireEvent.click(screen.getByText("Reload profile"));
    await act(async () => pending[1](json({ data: { ...account, name: "Freshly saved name" } })));
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Freshly saved name");
    await act(async () => pending[0](json({ data: { ...account, name: "Outdated cached name" } })));
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Freshly saved name");
  });
  it("clears local sign-in immediately and preserves a new account/draft when old logout finishes", async () => {
    sessionStore.set({ token: "old-token", expiresAt: expiry() });
    const oldDraft = "khwab:request:v2:old-private-draft", newDraft = "khwab:request:v2:new-private-draft";
    sessionStorage.setItem(oldDraft, JSON.stringify({ notes: "Private old-account note" }));
    let finishLogout;
    const second = { ...account, _id: "new-account", email: "new@example.test" };
    fetch.mockImplementation(url => path(url) === "/api/me" ? Promise.resolve(json({ data: account }))
      : path(url) === "/api/auth/login" ? Promise.resolve(sessionResponse("new-token", second))
      : new Promise(resolve => { finishLogout = resolve; }));
    mount();
    await screen.findByText(account.email);
    fireEvent.click(screen.getByText("Log out"));
    expect(sessionStore.get()).toBeNull();
    expect(screen.getByTestId("profile")).toHaveTextContent("anonymous");
    expect(sessionStorage.getItem(oldDraft)).toBeNull();
    const logoutCall = fetch.mock.calls.find(([url]) => path(url) === "/api/auth/logout");
    expect(logoutCall[1].headers.Authorization).toBe("Bearer old-token");
    fireEvent.click(screen.getByText("Log in"));
    await screen.findByText(second.email);
    sessionStorage.setItem(newDraft, JSON.stringify({ notes: "New account must retain this" }));
    await act(async () => finishLogout(json({ error: { code: "DATABASE_UNAVAILABLE", message: "Offline" } }, 503)));
    expect(sessionStore.get()?.token).toBe("new-token");
    expect(sessionStorage.getItem(newDraft)).toContain("must retain this");
    expect(screen.getByTestId("auth-message")).toBeEmptyDOMElement();
  });
  it("does not treat a malformed successful profile response as a verified account", async () => {
    sessionStore.set({ token: "valid-token", expiresAt: expiry() });
    fetch.mockResolvedValue(json({ data: {} }));
    mount();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("auth-message")).toHaveTextContent("incomplete account");
    expect(sessionStore.get()?.token).toBe("valid-token");
    expect(screen.getByTestId("profile")).toHaveTextContent("anonymous");
  });
  it("retains unsaved private form input when a verified account refresh temporarily fails", async () => {
    sessionStore.set({ token: "verified-token", expiresAt: expiry() });
    fetch.mockResolvedValueOnce(json({ data: account }))
      .mockResolvedValueOnce(json({ error: { code: "DATABASE_UNAVAILABLE", message: "Please retry account refresh." } }, 503))
      .mockResolvedValue(json({ data: account }));
    render(<AuthProvider><MemoryRouter initialEntries={["/private"]}><Probe /><Routes>
      <Route element={<Protected />}><Route path="/private" element={<label>Private draft note<input aria-label="Private draft note" defaultValue="" /></label>} /></Route>
      <Route path="/login" element={<p>Unexpected login redirect</p>} />
    </Routes></MemoryRouter></AuthProvider>);
    const field = await screen.findByLabelText("Private draft note");
    fireEvent.change(field, { target: { value: "Keep these entered measurements and notes" } });
    fireEvent.click(screen.getByText("Reload profile"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry account refresh.");
    expect(screen.getByLabelText("Private draft note")).toBe(field);
    expect(field).toHaveValue("Keep these entered measurements and notes");
    expect(sessionStore.get()?.token).toBe("verified-token");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Private draft note")).toHaveValue("Keep these entered measurements and notes");
  });
  it("clears a disabled account without treating ordinary permission403 as logout", async () => {
    sessionStore.set({ token: "disabled-token", expiresAt: expiry() });
    fetch.mockResolvedValueOnce(json({ data: account }))
      .mockResolvedValueOnce(json({ error: { code: "FORBIDDEN", message: "Admin only." } }, 403))
      .mockResolvedValue(json({ error: { code: "ACCOUNT_DISABLED", message: "This account is unavailable." } }, 403));
    mount();
    await screen.findByText(account.email);
    fireEvent.click(screen.getByText("Protected request"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(sessionStore.get()?.token).toBe("disabled-token");
    fireEvent.click(screen.getByText("Protected request"));
    await waitFor(() => expect(sessionStore.get()).toBeNull());
    expect(screen.getByTestId("auth-message")).toHaveTextContent("This account is unavailable.");
  });
});
describe("session persistence boundaries", () => {
  it("restores only token/expiry and discards client-supplied identity and role", () => {
    const memory = {
      getItem: () =>
        JSON.stringify({
          token: "saved-token",
          expiresAt: expiry(),
          user: { role: "admin" },
          password: "never-restore",
        }),
      removeItem: vi.fn(),
    };
    const store = createSessionStore(memory);
    expect(store.get()).toEqual({
      token: "saved-token",
      expiresAt: expect.any(String),
    });
    expect(store.get()).not.toHaveProperty("user");
    expect(store.get()).not.toHaveProperty("password");
  });
  it("rejects expired or malformed persisted sessions", () => {
    for (const saved of [
      "broken-json",
      JSON.stringify({ token: "expired", expiresAt: "2000-01-01T00:00:00Z" }),
      JSON.stringify({ token: {}, expiresAt: expiry() }),
    ]) {
      const memory = { getItem: () => saved, removeItem: vi.fn() };
      expect(createSessionStore(memory).get()).toBeNull();
    }
  });
  it("supports an in-memory session when browser storage is blocked", () => {
    const blocked = {
      getItem() {
        throw new DOMException("Blocked", "SecurityError");
      },
      setItem() {
        throw new DOMException("Blocked", "SecurityError");
      },
      removeItem() {
        throw new DOMException("Blocked", "SecurityError");
      },
    };
    const store = createSessionStore(blocked);
    store.set({ token: "memory-token", expiresAt: expiry() });
    expect(store.get()?.token).toBe("memory-token");
    store.clear();
    expect(store.get()).toBeNull();
  });
  it("does not access an unsafe default storage getter when no storage is passed", () => {
    const getter = vi
      .spyOn(globalThis, "sessionStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });
    const store = createSessionStore();
    store.set({ token: "memory-token", expiresAt: expiry() });
    expect(store.get()?.token).toBe("memory-token");
    expect(getter).not.toHaveBeenCalled();
  });
});
