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
