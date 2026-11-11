import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";
export function useResource(path, { publicRead = false } = {}) {
  const [state, setState] = useState({
    data: null,
    pagination: null,
    loading: true,
    error: "",
  });
  const [revision, setRevision] = useState(0);
  const failed = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    failed.current = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    if (!path) {
      setState({ data: null, loading: false, error: "" });
      return;
    }
    api(path, {
      signal: controller.signal,
      ...(publicRead ? { publicRead: true, auth: false } : {}),
    })
      .then((r) => {
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
