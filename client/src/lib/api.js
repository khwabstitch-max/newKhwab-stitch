import { t, getLocale } from "../i18n/core";
let tokenProvider = () => null;
let unauthorizedHandler = () => {};
const retryablePublicPaths = new Set(["/settings", "/designs", "/reviews", "/services"]);
export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler;
};
export const setTokenProvider = (provider) => {
  tokenProvider = provider;
};
export class ApiError extends Error {
  constructor(message, status = 0, code = "NETWORK_ERROR", details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export async function api(
  path,
  {
    method = "GET",
    body,
    headers = {},
    signal,
    timeout = 75000,
    auth = true,
    publicRead = false,
  } = {},
) {
  const token = auth ? tokenProvider() : null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeout);
  // Anonymous public reads may make one extra attempt within the same deadline.
  const retryAllowed =
    publicRead && auth === false && method === "GET" &&
    retryablePublicPaths.has(path.split("?")[0]);
  const canRetry = () =>
    retryAllowed && !controller.signal.aborted &&
    globalThis.navigator?.onLine !== false;
  try {
    const url = `${(import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "")}${path}`;
    const request = {
      method,
      credentials: "omit",
      signal: controller.signal,
      headers: {
        ...(body && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
    };
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(url, request);
      } catch (error) {
        if (attempt === 0 && error instanceof TypeError && canRetry()) continue;
        throw error;
      }
      if (attempt === 0 && [502, 503, 504].includes(response.status) && canRetry()) {
        response.body?.cancel().catch(() => {});
        continue;
      }
      break;
    }
    const contentType = response.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch {
        if (response.ok)
          throw new ApiError(
            "The server returned an unexpected response. Please try again.",
            response.status,
            "INVALID_RESPONSE",
          );
      }
    }
    // A password/Google credential rejection does not reject the existing JWT.
    // Invalidate only the token that produced an actual session rejection.
    const credentialRejection = ["INVALID_CREDENTIALS", "INVALID_GOOGLE_TOKEN"].includes(data?.error?.code);
    if (token && response.status === 401 && !credentialRejection)
      unauthorizedHandler(token);
    if (token && response.status === 403 && data?.error?.code === "ACCOUNT_DISABLED")
      unauthorizedHandler(token, data.error.message);
    if (!response.ok) {
      const details = data?.error?.details;
      throw new ApiError(
        data?.error?.message ||
          "The atelier service is temporarily unavailable. Please try again.",
        response.status,
        data?.error?.code || (response.status >= 500 ? "SERVICE_UNAVAILABLE" : "HTTP_ERROR"),
        details,
      );
    }
    if (!data)
      throw new ApiError(
        "The server returned an unexpected response. Please try again.",
        response.status,
      );
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        method === "GET"
          ? "The service is taking longer than usual to wake up. Please retry."
          : "The result is uncertain because the connection timed out. For requests, use the same Retry button to avoid duplicates.",
      );
    throw new ApiError(
      "Cannot reach the atelier. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export const money = (paise) =>
  new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format((paise || 0) / 100);
export const readable = (value = "") =>
  t(
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_.]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
  );
export const date = (value) =>
  value
    ? new Intl.DateTimeFormat(getLocale(), {
        dateStyle: "medium",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : t("To be discussed");
export const idOf = (v) => (typeof v === "string" ? v : v?._id);
export const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat(getLocale(), {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : t("To be discussed");
