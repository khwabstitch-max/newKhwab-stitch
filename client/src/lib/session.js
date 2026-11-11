// Only the short-lived token and its server-provided expiry are persisted.
// Roles and identity are always obtained from an authenticated API response.
export const SESSION_KEY = "khwab.session.v1";
export function createSessionStore(storage, now = () => Date.now()) {
  let current = null;
  const listeners = new Set();
  const valid = (value) =>
    value &&
    typeof value.token === "string" &&
    value.token.length > 0 &&
    value.token.length <= 8192 &&
    typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    Date.parse(value.expiresAt) > now();
  try {
    const saved = JSON.parse(storage?.getItem(SESSION_KEY) || "null");
    if (valid(saved))
      current = { token: saved.token, expiresAt: saved.expiresAt };
    else storage?.removeItem(SESSION_KEY);
  } catch {
    /* Storage may be blocked; an in-memory session still works. */
  }
  function publish(reason = "") {
    for (const listener of listeners) listener(current, reason);
  }
  return {
    get() {
      if (current && Date.parse(current.expiresAt) <= now())
        this.clear(
          current.token,
          "Your session expired. Please sign in again.",
        );
      return current;
    },
    set(value) {
      if (!valid(value))
        throw new Error(
          "The server returned an invalid session. Please sign in again.",
        );
      current = { token: value.token, expiresAt: value.expiresAt };
      try {
        storage?.setItem(SESSION_KEY, JSON.stringify(current));
      } catch {
        /* Fall back to this tab's memory. */
      }
      publish();
      return current;
    },
    clear(expectedToken, reason = "") {
      if (expectedToken && current?.token !== expectedToken) return false;
      current = null;
      try {
        storage?.removeItem(SESSION_KEY);
      } catch {
        /* Local memory is cleared even if storage is unavailable. */
      }
      publish(reason);
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
let browserStorage;
try {
  browserStorage = globalThis.sessionStorage;
} catch {
  browserStorage = undefined;
}
export const sessionStore = createSessionStore(browserStorage);
