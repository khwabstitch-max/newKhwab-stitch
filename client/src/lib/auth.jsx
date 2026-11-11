import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, ApiError, setTokenProvider, setUnauthorizedHandler } from "./api";
import { sessionStore } from "./session";
import { clearPrivateDrafts } from "./drafts";
setTokenProvider(() => sessionStore.get()?.token || null);
setUnauthorizedHandler((token, reason) =>
  sessionStore.clear(
    token,
    reason || "Your session is invalid or expired. Please sign in again.",
  ),
);
const AuthContext = createContext(null);
function checkedProfile(profile) {
  if (!profile || typeof profile._id !== "string" || !profile._id || !["customer", "admin"].includes(profile.role))
    throw new ApiError("The server returned an incomplete account. Please try again.", 502, "INVALID_ACCOUNT_RESPONSE");
  return profile;
}
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => sessionStore.get());
  const [profile, setProfile] = useState(null),
    [loading, setLoading] = useState(() => Boolean(sessionStore.get())),
    [error, setError] = useState("");
  const generation = useRef(0),
    profileRequest = useRef(0),
    verifiedToken = useRef(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = sessionStore.subscribe((next, reason) => {
      generation.current++;
      profileRequest.current++;
      setSession(next);
      const verified = Boolean(next && verifiedToken.current === next.token);
      if (!verified) {
        setProfile(null);
        verifiedToken.current = null;
      }
      setError(reason);
      setLoading(Boolean(next) && !verified);
    });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, []);
  const reloadProfile = useCallback(async ({ signal } = {}) => {
    const current = sessionStore.get();
    if (!current)
      throw new ApiError("Please sign in to continue.", 401, "UNAUTHENTICATED");
    const stamp = generation.current;
    const request = ++profileRequest.current;
    setError("");
    setLoading(verifiedToken.current !== current.token);
    try {
      const { data } = await api("/me", { signal });
      if (
        !mounted.current ||
        signal?.aborted ||
        stamp !== generation.current ||
        request !== profileRequest.current ||
        sessionStore.get()?.token !== current.token
      )
        throw new ApiError(
          "The session changed. Please try again.",
          409,
          "SESSION_CHANGED",
        );
      const verifiedProfile = checkedProfile(data);
      verifiedToken.current = current.token;
      setProfile(verifiedProfile);
      setLoading(false);
      return data;
    } catch (e) {
      if (
        mounted.current &&
        !signal?.aborted &&
        stamp === generation.current &&
        request === profileRequest.current &&
        sessionStore.get()?.token === current.token
      ) {
        if (e.code === "ACCOUNT_DISABLED")
          sessionStore.clear(current.token, e.message);
        else {
          setError(e.message);
          setLoading(false);
        }
      }
      throw e;
    }
  }, []);
  useEffect(() => {
    if (!session || verifiedToken.current === session.token) return;
    const controller = new AbortController();
    reloadProfile({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [session, reloadProfile]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () =>
        sessionStore.clear(
          session.token,
          "Your session expired. Please sign in again.",
        ),
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  async function authenticate(path, credentials) {
    const stamp = ++generation.current;
    setError("");
    setLoading(true);
    try {
      const { data } = await api(path, {
        method: "POST",
        body: credentials,
        auth: false,
      });
      if (!mounted.current || stamp !== generation.current)
        throw new ApiError(
          "The sign-in attempt was cancelled. Please try again.",
          409,
          "SESSION_CHANGED",
        );
      const user = checkedProfile(data?.user);
      sessionStore.set({ token: data.token, expiresAt: data.expiresAt });
      verifiedToken.current = data.token;
      setProfile(user);
      setLoading(false);
      setError("");
      return user;
    } catch (e) {
      if (mounted.current && stamp === generation.current) {
        setError(e.message);
        setLoading(false);
      }
      throw e;
    }
  }
  async function logout() {
    window.google?.accounts?.id?.disableAutoSelect?.();
    const token = sessionStore.get()?.token;
    generation.current++;
    // Local logout is immediate. A slow revocation must not keep private UI open
    // or later clear a different account's newly created draft/session.
    clearPrivateDrafts();
    sessionStore.clear(token);
    const stamp = generation.current;
    let message = "";
    try {
      if (token)
        await api("/auth/logout", { method: "POST", body: {}, timeout: 10000, auth: false, headers: { Authorization: `Bearer ${token}` } });
    } catch {
      message =
        "Signed out on this browser. Server session revocation could not be confirmed; the old token will expire automatically.";
    } finally {
      if (mounted.current && stamp === generation.current && !sessionStore.get())
        setError(message);
    }
  }
  return (
    <AuthContext.Provider
      value={{
        user: profile,
        profile,
        loading,
        error,
        hasSession: Boolean(session),
        login: (credentials) => authenticate("/auth/login", credentials),
        google: (credentials) => authenticate("/auth/google", credentials),
        register: (credentials) => authenticate("/auth/register", credentials),
        logout,
        reloadProfile,
        dismissError: () => setError(""),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
