import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";

const FRESH_MS = 20_000;
const STALE_MS = 120_000;
const MAX_CACHE = 80;
const publicCache = new Map();
const inflightPrefetch = new Map();
let testCacheOverride = null;

function isPublicCacheEnabled() {
  if (testCacheOverride !== null) return testCacheOverride;
  return import.meta.env?.MODE !== "test";
}
export function clearPublicResourceCache() {
  publicCache.clear();
  inflightPrefetch.clear();
}
export function __setPublicCacheEnabledForTest(enabled) {
  testCacheOverride = enabled;
}
function readPublicCache(path) {
  if (!path || !isPublicCacheEnabled()) return null;
  const entry = publicCache.get(path);
  if (!entry) return null;
  const age = Date.now() - entry.at;
  if (age > STALE_MS) {
    publicCache.delete(path);
    return null;
  }
  return { ...entry, fresh: age <= FRESH_MS };
}
function writePublicCache(path, response) {
  if (!path || !isPublicCacheEnabled() || !response) return;
  if (publicCache.size >= MAX_CACHE) {
    const oldest = publicCache.keys().next().value;
    if (oldest) publicCache.delete(oldest);
  }
  publicCache.set(path, {
    data: response.data,
    pagination: response.pagination,
    at: Date.now(),
  });
}
export function prefetchPublicResource(path) {
  if (!path || !isPublicCacheEnabled()) return;
  if (readPublicCache(path)?.fresh || inflightPrefetch.has(path)) return;
  const pending = api(path, { publicRead: true, auth: false })
    .then((r) => writePublicCache(path, r))
    .catch(() => {})
    .finally(() => inflightPrefetch.delete(path));
  inflightPrefetch.set(path, pending);
}

export function useResource(path, { publicRead = false } = {}) {
  const [state, setState] = useState(() => {
    const cached = publicRead ? readPublicCache(path) : null;
    if (cached)
      return {
        data: cached.data,
        pagination: cached.pagination,
        loading: false,
        error: "",
      };
    return {
      data: null,
      pagination: null,
      loading: Boolean(path),
      error: "",
    };
  });
  const [revision, setRevision] = useState(0);
  const lastFetchedRevision = useRef(0);
  const failed = useRef(false);
  useEffect(() => {
    const forceReload = revision !== lastFetchedRevision.current;
    lastFetchedRevision.current = revision;
    const controller = new AbortController();
    failed.current = false;
    if (!path) {
      setState({ data: null, loading: false, error: "" });
      return;
    }
    const cached = publicRead && !forceReload ? readPublicCache(path) : null;
    if (cached) {
      setState({
        data: cached.data,
        pagination: cached.pagination,
        loading: false,
        error: "",
      });
      if (cached.fresh) return;
    } else {
      setState((s) => ({
        ...s,
        loading: true,
        error: "",
      }));
    }
    api(path, {
      signal: controller.signal,
      ...(publicRead ? { publicRead: true, auth: false } : {}),
    })
      .then((r) => {
        if (publicRead) writePublicCache(path, r);
        if (!controller.signal.aborted)
          setState({
            data: r.data,
            pagination: r.pagination,
            loading: false,
            error: "",
          });
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          failed.current = e.status === 0 || [502, 503, 504].includes(e.status);
          if (cached) return;
          setState((s) => ({ ...s, loading: false, error: e }));
        }
      });
    return () => controller.abort();
  }, [path, revision, publicRead]);
  useEffect(() => {
    if (!path || !publicRead) return;
    let wasOffline = navigator.onLine === false;
    const offline = () => { wasOffline = true; };
    const online = () => {
      if (!wasOffline || navigator.onLine === false) return;
      wasOffline = false;
      if (failed.current) {
        failed.current = false;
        setRevision((value) => value + 1);
      }
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [path, publicRead]);
  return { ...state, reload: () => setRevision((r) => r + 1) };
}
const defaults = {
  businessName: "Khwab Stitch",
  tagline: "Where fabric becomes art",
  whatsapp: "",
  instagram: "",
  contactEmail: "",
  announcement: "Made thoughtfully. Made for you.",
  about:
    "A home-based atelier for custom stitching and thoughtful alterations.",
  faqs: [],
};
const SiteContext = createContext(defaults);
export function SiteProvider({ children }) {
  const { data } = useResource("/settings", { publicRead: true });
  return (
    <SiteContext.Provider value={{ ...defaults, ...data }}>
      {children}
    </SiteContext.Provider>
  );
}
export const useSite = () => useContext(SiteContext);
