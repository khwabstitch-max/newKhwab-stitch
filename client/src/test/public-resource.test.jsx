import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
const boundary = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: boundary.api }));
import { useResource } from "../lib/hooks";
import { ErrorMessage } from "../components/ui";

beforeEach(() => { boundary.api.mockReset(); });
afterEach(() => vi.restoreAllMocks());

it("opts public reads into anonymous recovery without refetching for a new options object", async () => {
  boundary.api.mockResolvedValue({ data: [{ _id: "published-design" }] });
  const { result, rerender } = renderHook(() => useResource("/designs?limit=3", { publicRead: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(boundary.api).toHaveBeenCalledWith("/designs?limit=3", expect.objectContaining({ publicRead: true, auth: false }));
  rerender();
  expect(boundary.api).toHaveBeenCalledTimes(1);
});

it("recovers a failed public resource once on a real offline-to-online transition and cleans up", async () => {
  let online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  boundary.api.mockRejectedValueOnce(Object.assign(new Error("Connection lost"), { status: 0 }))
    .mockResolvedValue({ data: [{ _id: "recovered" }] });
  const { result, unmount } = renderHook(() => useResource("/designs?limit=3", { publicRead: true }));
  await waitFor(() => expect(result.current.error.message).toBe("Connection lost"));
  act(() => window.dispatchEvent(new Event("online")));
  expect(boundary.api).toHaveBeenCalledTimes(1);
  act(() => {
    online = false;
    window.dispatchEvent(new Event("offline"));
    online = true;
    window.dispatchEvent(new Event("online"));
  });
  await waitFor(() => expect(result.current.data).toEqual([{ _id: "recovered" }]));
  expect(result.current.error).toBe("");
  expect(boundary.api).toHaveBeenCalledTimes(2);
  act(() => window.dispatchEvent(new Event("online")));
  expect(boundary.api).toHaveBeenCalledTimes(2);
  unmount();
  act(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  expect(boundary.api).toHaveBeenCalledTimes(2);
});

it("does not automatically replay a private read after reconnect", async () => {
  boundary.api.mockRejectedValue(new Error("Connection lost"));
  const { result } = renderHook(() => useResource("/orders"));
  await waitFor(() => expect(result.current.error.message).toBe("Connection lost"));
  act(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  expect(boundary.api).toHaveBeenCalledTimes(1);
  expect(boundary.api.mock.calls[0][1]).not.toHaveProperty("publicRead");
});

it.each([403, 429])("does not automatically replay a rejected public HTTP%s on reconnect", async (status) => {
  boundary.api.mockRejectedValue(Object.assign(new Error("Request rejected"), { status }));
  const { result } = renderHook(() => useResource("/designs", { publicRead: true }));
  await waitFor(() => expect(result.current.error.status).toBe(status));
  act(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  expect(boundary.api).toHaveBeenCalledTimes(1);
});

it("aborts a public read on unmount and ignores its late response", async () => {
  let resolve;
  boundary.api.mockImplementation(() => new Promise(done => { resolve = done; }));
  const { result, unmount } = renderHook(() => useResource("/settings", { publicRead: true }));
  const signal = boundary.api.mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ data: { businessName: "Late response" } }));
  expect(result.current.data).toBeNull();
  expect(boundary.api).toHaveBeenCalledTimes(1);
});

it("retries the resource without implicitly submitting its surrounding form", () => {
  const retry = vi.fn(), submit = vi.fn(event => event.preventDefault());
  render(<form onSubmit={submit}><ErrorMessage message="Connection lost" retry={retry} /></form>);
  const button = screen.getByRole("button", { name: "Try again" });
  expect(button).toHaveAttribute("type", "button");
  fireEvent.click(button);
  expect(retry).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
});
