import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
export function useResource(path) {
  const [state, setState] = useState({
    data: null,
    pagination: null,
    loading: true,
    error: "",
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: "" }));
    if (!path) {
      setState({ data: null, loading: false, error: "" });
      return;
    }
    api(path, { signal: controller.signal })
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
        if (!controller.signal.aborted)
          setState((s) => ({ ...s, loading: false, error: e }));
      });
    return () => controller.abort();
  }, [path, revision]);
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
  const { data } = useResource("/settings");
  return (
    <SiteContext.Provider value={{ ...defaults, ...data }}>
      {children}
    </SiteContext.Provider>
  );
}
export const useSite = () => useContext(SiteContext);
