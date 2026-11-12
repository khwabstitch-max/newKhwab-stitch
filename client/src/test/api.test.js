import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  money,
  setTokenProvider,
  setUnauthorizedHandler,
} from "../lib/api";
const json = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => "application/json" },
  json: async () => data,
});
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  setTokenProvider(() => null);
  setUnauthorizedHandler(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("API authentication and mutation safety", () => {
  it("obtains the current application JWT for every request and sends it only as a bearer header", async () => {
    const tokens = vi
      .fn()
      .mockReturnValueOnce("first-token")
      .mockReturnValueOnce("replacement-token");
    setTokenProvider(tokens);
    fetch.mockResolvedValue(json({ data: { name: "A" } }));
    await api("/me");
    await api("/me");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer first-token",
    );
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer replacement-token",
    );
    expect(fetch.mock.calls[0][1].credentials).toBe("omit");
  });
  it("omits a previous token when submitting email/password credentials", async () => {
    setTokenProvider(() => "existing-token");
    fetch.mockResolvedValue(json({ data: { token: "new-token" } }));
    await api("/auth/login", {
      method: "POST",
      body: { email: "meera@example.test", password: "MyStrongPass123!" },
      auth: false,
    });
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });
  it("invalidates only the token actually used by an unauthorized request", async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    setTokenProvider(() => "expired-token");
    fetch.mockResolvedValue(
      json(
        { error: { code: "INVALID_TOKEN", message: "Please sign in again." } },
        401,
      ),
    );
    await expect(api("/orders")).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledWith("expired-token");
  });
  it("preserves the idempotency key and JSON body for an explicit order mutation", async () => {
    fetch.mockResolvedValue(json({ data: { _id: "order-id" } }, 201));
    await api("/orders", {
      method: "POST",
      body: { garment: "kurti" },
      headers: { "Idempotency-Key": "stable-key" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: {
        "Idempotency-Key": "stable-key",
        "Content-Type": "application/json",
      },
      body: '{"garment":"kurti"}',
    });
  });
  it("lets the browser set the multipart boundary and does not add a JSON content type", async () => {
    fetch.mockResolvedValue(json({ data: { _id: "media" } }));
    const body = new FormData();
    body.append("purpose", "reference");
    await api("/media", { method: "POST", body });
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Content-Type");
    expect(fetch.mock.calls[0][1].body).toBe(body);
  });
  it("never retries a failed mutation automatically", async () => {
    fetch.mockRejectedValue(new TypeError("offline"));
    await expect(
      api("/orders", { method: "POST", body: { garment: "kurti" } }),
    ).rejects.toThrow("Cannot reach");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves server conflict codes for stale quotes", async () => {
    fetch.mockResolvedValue(
      json(
        {
          error: {
            code: "REVISION_CONFLICT",
            message: "Request changed",
            details: { revision: 4 },
          },
        },
        409,
      ),
    );
    await expect(
      api("/orders/id/quote-response", {
        method: "POST",
        body: { revision: 1 },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVISION_CONFLICT",
      message: "Request changed",
      details: { revision: 4 },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("describes an uncertain timed-out mutation without replaying it", async () => {
    vi.useFakeTimers();
    fetch.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    );
    const request = api("/orders", {
      method: "POST",
      body: { garment: "kurti" },
      timeout: 10,
    });
    const assertion = expect(request).rejects.toThrow("result is uncertain");
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a non-JSON provider gateway failure with a safe message", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => "text/html" },
    });
    await expect(api("/designs")).rejects.toBeInstanceOf(ApiError);
  });
  it("preserves HTTP503 and the session when a gateway sends malformed JSON", async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    setTokenProvider(() => "current-token");
    fetch.mockResolvedValue({ ok: false, status: 503, headers: { get: () => "application/json" }, json: async () => { throw new SyntaxError("Gateway truncated JSON"); } });
    await expect(api("/me")).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
    expect(unauthorized).not.toHaveBeenCalled();
  });
  it("retains exact paise in accepted-price displays", () => {
    expect(money(12345)).toContain("123.45");
    expect(money(10000)).toContain("100");
  });
});

describe("explicit anonymous public-read recovery", () => {
  const publicRead = { publicRead: true, auth: false };
  it("recovers the public configured-service list without sending account credentials", async () => {
    const tokens = vi.fn(() => "saved-token");
    setTokenProvider(tokens);
    fetch.mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValue(json({ data: [{ itemTypes: ["kurti"] }] }));
    await expect(api("/services?limit=50", publicRead)).resolves.toMatchObject({ data: [{ itemTypes: ["kurti"] }] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(tokens).not.toHaveBeenCalled();
  });
  it("does not consult a private token provider for an opted-in public read", async () => {
    const tokens = vi.fn(() => { throw new Error("Private storage unavailable"); });
    setTokenProvider(tokens);
    fetch.mockResolvedValue(json({ data: [] }));
    await expect(api("/designs?limit=3", publicRead)).resolves.toEqual({ data: [] });
    expect(tokens).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });
  it("recovers from one fetch transport failure without sending a saved JWT", async () => {
    setTokenProvider(() => "saved-private-token");
    fetch.mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValue(json({ data: [{ _id: "published-design" }] }));
    await expect(api("/designs?limit=3", publicRead)).resolves.toMatchObject({ data: [{ _id: "published-design" }] });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, options] of fetch.mock.calls) {
      expect(options.headers).not.toHaveProperty("Authorization");
      expect(options.credentials).toBe("omit");
    }
  });
  it.each([502, 503, 504])("recovers once from public HTTP%s", async (status) => {
    fetch.mockResolvedValueOnce(json({ error: { message: "Temporary gateway failure" } }, status))
      .mockResolvedValue(json({ data: [] }));
    await expect(api("/reviews?limit=3", publicRead)).resolves.toEqual({ data: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("stops after two transport failures and preserves the honest error state", async () => {
    fetch.mockRejectedValue(new TypeError("connection reset"));
    await expect(api("/designs", publicRead)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("stops after two public gateway failures with the final HTTP status", async () => {
    fetch.mockResolvedValue(json({ error: { code: "DATABASE_UNAVAILABLE", message: "Temporarily unavailable" } }, 503));
    await expect(api("/settings", publicRead)).rejects.toMatchObject({ status: 503, code: "DATABASE_UNAVAILABLE" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([400, 401, 403, 404, 409, 429])("does not replay public HTTP%s", async (status) => {
    fetch.mockResolvedValue(json({ error: { message: "Request rejected" } }, status));
    await expect(api("/designs", publicRead)).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["/me", "/orders", "/auth/capabilities"])("does not apply public recovery to %s", async (path) => {
    fetch.mockRejectedValue(new TypeError("connection reset"));
    await expect(api(path, publicRead)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("requires explicit anonymous opt-in for a public endpoint", async () => {
    fetch.mockRejectedValue(new TypeError("connection reset"));
    await expect(api("/designs")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("never replays a mutation even if public recovery was mistakenly requested", async () => {
    fetch.mockRejectedValue(new TypeError("connection reset"));
    await expect(api("/designs", { ...publicRead, method: "POST", body: { title: "Test" } })).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not retry while the browser reports offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fetch.mockRejectedValue(new TypeError("offline"));
    await expect(api("/settings", publicRead)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not retry a cancelled request even if fetch rejects with TypeError", async () => {
    const controller = new AbortController();
    fetch.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new TypeError("cancelled transport"));
    });
    await expect(api("/designs", { ...publicRead, signal: controller.signal })).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("shares one total timeout across both attempts", async () => {
    vi.useFakeTimers();
    let rejectFirst;
    fetch.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }));
    const request = api("/settings", { ...publicRead, timeout: 100 });
    const rejection = expect(request).rejects.toThrow("taking longer");
    await vi.advanceTimersByTimeAsync(90);
    rejectFirst(new TypeError("connection reset"));
    await vi.advanceTimersByTimeAsync(9);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].signal).toBe(fetch.mock.calls[0][1].signal);
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
  });
  it("does not retry an invalid successful JSON response", async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => { throw new SyntaxError("Malformed response"); } });
    await expect(api("/settings", publicRead)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
