import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

const mergeRecords = (previous, incoming) => [
  ...new Map(
    [...previous, ...incoming].map((record) => [record._id, record]),
  ).values(),
];

// Fetch one bounded page at a time. Changing filters cancels the previous
// request; loading another page keeps the current cards and their selections.
export function usePagedCollection(path) {
  // A new filter visit gets its own identity, even when returning to a path
  // that previously loaded several pages.
  const scope = useMemo(() => ({ path }), [path]);
  const [request, setRequest] = useState({ scope, page: 1, attempt: 0 });
  const [state, setState] = useState({
    path: null,
    data: [],
    pagination: null,
    loading: true,
    error: "",
  });
  const [knownData, setKnownData] = useState([]);
  const inFlight = useRef(false);
  const page = request.scope === scope ? request.page : 1;
  const attempt = request.scope === scope ? request.attempt : 0;

  useEffect(() => {
    if (!path) {
      inFlight.current = false;
      return;
    }
    const controller = new AbortController();
    inFlight.current = true;
    setState((previous) => ({
      path,
      data: previous.path === path && page > 1 ? previous.data : [],
      pagination:
        previous.path === path && page > 1 ? previous.pagination : null,
      loading: true,
      error: "",
    }));
    api(`${path}${path.includes("?") ? "&" : "?"}page=${page}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        const incoming = Array.isArray(response.data) ? response.data : [];
        inFlight.current = false;
        setKnownData((previous) => mergeRecords(previous, incoming));
        setState((previous) => ({
          path,
          data: mergeRecords(
            previous.path === path && page > 1 ? previous.data : [],
            incoming,
          ),
          pagination: response.pagination || null,
          loading: false,
          error: "",
        }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        inFlight.current = false;
        setState((previous) => ({ ...previous, loading: false, error }));
      });
    return () => controller.abort();
  }, [path, page, attempt]);

  const current = state.path === path && path ? state : null;
  const hasMore = Boolean(
    current?.pagination?.page < current?.pagination?.pages,
  );
  const loadMore = useCallback(() => {
    if (inFlight.current || !hasMore || current?.error) return;
    inFlight.current = true;
    setRequest({ scope, page: current.pagination.page + 1, attempt: 0 });
  }, [scope, current, hasMore]);
  const reload = useCallback(() => {
    if (inFlight.current || !path) return;
    setRequest((previous) => ({ scope, page, attempt: previous.attempt + 1 }));
  }, [path, scope, page]);
  const refresh = useCallback(() => {
    if (!path) return;
    setRequest((previous) => ({
      scope,
      page: 1,
      attempt: previous.attempt + 1,
    }));
  }, [path, scope]);

  return {
    data: current?.data || [],
    knownData,
    pagination: current?.pagination || null,
    loading: Boolean(path) && (!current || current.loading),
    error: current?.error || "",
    hasMore,
    loadMore,
    reload,
    refresh,
  };
}
