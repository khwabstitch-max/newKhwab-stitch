import { io } from "socket.io-client";

const SESSION_KEY = "khwab_chat_session";

export function getStoredChatSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.customerId === "string" && typeof parsed.guestToken === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveChatSession(session) {
  try {
    if (session && session.customerId && session.guestToken) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Ignore storage quota/security errors
  }
}

export function clearChatSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore
  }
}

export function resolveSocketUrl() {
  const envBase = import.meta.env.VITE_API_BASE_URL;
  if (envBase && /^https?:\/\//i.test(envBase)) {
    try {
      const parsed = new URL(envBase);
      if (
        import.meta.env.DEV &&
        /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):3000\/?/i.test(envBase)
      ) {
        return window.location.origin;
      }
      return parsed.origin;
    } catch {
      // fallback
    }
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function createCustomerSocket(session) {
  if (!session?.guestToken || !session?.customerId) return null;

  const serverUrl = resolveSocketUrl();
  const socket = io(serverUrl, {
    auth: {
      guestToken: session.guestToken,
      customerId: session.customerId,
    },
    transports: ["websocket", "polling"],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 10000,
    autoConnect: true,
  });

  return socket;
}

export function createAdminSocket(token) {
  if (!token) return null;

  const serverUrl = resolveSocketUrl();
  const socket = io(serverUrl, {
    auth: {
      token,
    },
    transports: ["websocket", "polling"],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 10000,
    autoConnect: true,
  });

  return socket;
}
