import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
const boundary = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: boundary.api }));
import { usePagedCollection } from "../lib/usePagedCollection";
const response = (page, data, pages = 2) => ({
  data,
  pagination: { page, pages },
});
beforeEach(() => boundary.api.mockReset());

it("refreshes changed records from page one and cancels an in-flight append", async () => {
  let finishAppend;
  boundary.api
    .mockResolvedValueOnce(response(1, [{ _id: "a", active: true }]))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishAppend = resolve;
        }),
    )
    .mockResolvedValueOnce(response(1, [{ _id: "a", active: false }], 1));
  const { result } = renderHook(() =>
    usePagedCollection("/admin/workers?limit=30"),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.loadMore());
  await waitFor(() => expect(boundary.api).toHaveBeenCalledTimes(2));
  const appendSignal = boundary.api.mock.calls[1][1].signal;
  act(() => result.current.refresh());
  await waitFor(() =>
    expect(result.current.data).toEqual([{ _id: "a", active: false }]),
  );
  expect(appendSignal.aborted).toBe(true);
  await act(async () => finishAppend(response(2, [{ _id: "stale" }])));
  expect(result.current.data).toEqual([{ _id: "a", active: false }]);
  expect(boundary.api.mock.calls.at(-1)[0]).toBe(
    "/admin/workers?limit=30&page=1",
  );
});

it("fetches only requested bounded pages, appends without duplicates and stops at the last page", async () => {
  boundary.api
    .mockResolvedValueOnce(response(1, [{ _id: "a" }, { _id: "b" }]))
    .mockResolvedValueOnce(
      response(2, [{ _id: "b", name: "Updated" }, { _id: "c" }]),
    );
  const { result } = renderHook(() =>
    usePagedCollection("/options?limit=12&kind=sleeve"),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(boundary.api).toHaveBeenCalledTimes(1);
  expect(boundary.api.mock.calls[0][0]).toBe(
    "/options?limit=12&kind=sleeve&page=1",
  );
  act(() => {
    result.current.loadMore();
    result.current.loadMore();
  });
  await waitFor(() => expect(result.current.data).toHaveLength(3));
  expect(boundary.api).toHaveBeenCalledTimes(2);
  expect(result.current.data[1].name).toBe("Updated");
  expect(result.current.hasMore).toBe(false);
  act(() => result.current.loadMore());
  expect(boundary.api).toHaveBeenCalledTimes(2);
});

it("preserves loaded cards after a later-page failure and retries that page", async () => {
  boundary.api
    .mockResolvedValueOnce(response(1, [{ _id: "a" }]))
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValueOnce(response(2, [{ _id: "b" }]));
  const { result } = renderHook(() => usePagedCollection("/designs?limit=12"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.loadMore());
  await waitFor(() =>
    expect(result.current.error.message).toBe("Connection lost"),
  );
  expect(result.current.data).toEqual([{ _id: "a" }]);
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.data).toHaveLength(2));
  expect(boundary.api.mock.calls.slice(1).map(([path]) => path)).toEqual([
    "/designs?limit=12&page=2",
    "/designs?limit=12&page=2",
  ]);
});

it("cancels stale filter results and resets to page one while retaining known option metadata", async () => {
  let finishOld;
  boundary.api
    .mockResolvedValueOnce(response(1, [{ _id: "a" }]))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockResolvedValueOnce(response(1, [{ _id: "c" }], 1));
  const { result, rerender } = renderHook(
    ({ path }) => usePagedCollection(path),
    {
      initialProps: { path: "/options?kind=sleeve&limit=12" },
    },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.loadMore());
  await waitFor(() => expect(boundary.api).toHaveBeenCalledTimes(2));
  const oldSignal = boundary.api.mock.calls[1][1].signal;
  rerender({ path: "/options?kind=neck&limit=12" });
  await waitFor(() => expect(result.current.data).toEqual([{ _id: "c" }]));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finishOld(response(2, [{ _id: "stale" }])));
  expect(result.current.data).toEqual([{ _id: "c" }]);
  expect(result.current.knownData.map((record) => record._id)).toEqual([
    "a",
    "c",
  ]);
  expect(boundary.api.mock.calls[2][0]).toBe(
    "/options?kind=neck&limit=12&page=1",
  );
});

it("starts at page one on returning to an earlier filter after loading several pages", async () => {
  boundary.api.mockImplementation(async (path) => {
    const query = new URL(path, "https://test.invalid").searchParams;
    const page = Number(query.get("page"));
    return response(page, [{ _id: `${query.get("kind")}-${page}` }]);
  });
  const { result, rerender } = renderHook(
    ({ path }) => usePagedCollection(path),
    {
      initialProps: { path: "/options?kind=sleeve&limit=12" },
    },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.data).toHaveLength(2));
  rerender({ path: "/options?kind=neck&limit=12" });
  await waitFor(() => expect(result.current.data).toEqual([{ _id: "neck-1" }]));
  rerender({ path: "/options?kind=sleeve&limit=12" });
  await waitFor(() =>
    expect(result.current.data).toEqual([{ _id: "sleeve-1" }]),
  );
  expect(boundary.api.mock.calls.at(-1)[0]).toBe(
    "/options?kind=sleeve&limit=12&page=1",
  );
  expect(result.current.knownData).toContainEqual({ _id: "sleeve-2" });
});
