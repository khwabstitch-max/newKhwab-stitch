import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {} }));
vi.mock("../lib/api", async (original) => ({
  ...(await original()),
  api: boundary.api,
}));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
import {
  AccountDrafts,
  AccountProfile,
  AccountReviews,
  AccountSupport,
  AccountWork,
  Conversation,
  WorkerWorkspace,
} from "../pages/Account";
import { AdminWork } from "../pages/AdminOperations";
import { setLanguage } from "../i18n/core";

const uid = "c".repeat(24),
  jobId = "a".repeat(24),
  conversationId = "b".repeat(24);
const list = (data = []) => ({
  data,
  pagination: {
    page: 1,
    pages: Math.ceil(data.length / 30),
    total: data.length,
    limit: 30,
  },
});
const paged = (data, page = 1) => ({
  data,
  pagination: { page, pages: 2, total: 31, limit: 30 },
});
const renderAt = (element, path = "/account") =>
  render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
const writes = (path) =>
  boundary.api.mock.calls.filter(
    ([p, o]) => p === path && o?.method === "POST",
  );
beforeEach(() => {
  setLanguage("en", false);
  boundary.api.mockReset();
  boundary.auth = {
    profile: {
      _id: uid,
      name: "Meera Test",
      phone: "919876543210",
      email: "meera@example.test",
      role: "customer",
      emailVerified: false,
    },
    reloadProfile: vi.fn(),
    logout: vi.fn(),
  };
  boundary.api.mockImplementation(async () => list());
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

it("submitted cloud drafts open their confirmed order instead of an editable request", async () => {
  boundary.api.mockResolvedValue(
    list([
      {
        _id: jobId,
        status: "submitted",
        orderId: conversationId,
        title: "Saved kurti",
        updatedAt: "2026-11-08T08:00:00Z",
      },
    ]),
  );
  renderAt(<AccountDrafts />);
  expect(
    await screen.findByRole("link", { name: "View my request" }),
  ).toHaveAttribute("href", `/orders/${conversationId}`);
  expect(
    screen.queryByRole("link", { name: "Resume draft" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete draft" }),
  ).not.toBeInTheDocument();
});
it("saved drafts load the next page and deleting its final draft returns to the previous page", async () => {
  boundary.api.mockImplementation(async (path, options = {}) => {
    if (options.method === "DELETE") return { data: {} };
    return paged(
      [
        {
          _id: path.includes("page=2") ? jobId : conversationId,
          title: path.includes("page=2")
            ? "Older saved blouse"
            : "Recent saved kurti",
          status: "draft",
          revision: 4,
        },
      ],
      path.includes("page=2") ? 2 : 1,
    );
  });
  const user = userEvent.setup();
  renderAt(<AccountDrafts />);
  await screen.findByText("Recent saved kurti");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Older saved blouse");
  expect(screen.getByRole("link", { name: "Resume draft" })).toHaveAttribute(
    "href",
    `/request?draft=${jobId}`,
  );
  await user.click(screen.getByRole("button", { name: "Delete draft" }));
  await screen.findByText("Recent saved kurti");
  expect(boundary.api).toHaveBeenCalledWith(`/drafts/${jobId}`, {
    method: "DELETE",
    body: { revision: 4 },
  });
});
it("review and completed-order pages move independently while preserving the selected order and review form", async () => {
  boundary.api.mockImplementation(async (path, options = {}) => {
    if (options.method === "POST") return { data: { _id: "review-new" } };
    const second = path.includes("page=2");
    if (path.startsWith("/orders?"))
      return paged(
        [
          {
            _id: second ? jobId : conversationId,
            orderNumber: second ? "KS-OLDER-ORDER" : "KS-SELECTED-ORDER",
          },
        ],
        second ? 2 : 1,
      );
    return paged(
      [
        {
          _id: second ? "review-old" : "review-recent",
          orderId: "d".repeat(24),
          rating: 5,
          status: "pending",
          text: second ? "An older review" : "My recent review",
        },
      ],
      second ? 2 : 1,
    );
  });
  const user = userEvent.setup();
  renderAt(<AccountReviews />);
  await screen.findByRole("option", { name: "KS-SELECTED-ORDER" });
  await user.selectOptions(
    screen.getByLabelText("Completed order"),
    conversationId,
  );
  await user.selectOptions(screen.getByLabelText("Rating"), "4");
  await user.type(
    screen.getByLabelText("Your review"),
    "A thoughtful fit and finish.",
  );
  await user.click(
    screen.getByRole("checkbox", { name: /I consent to public display/ }),
  );
  await user.click(
    within(screen.getByRole("region", { name: "Completed orders" })).getByRole(
      "button",
      { name: "Next" },
    ),
  );
  await screen.findByRole("option", { name: "KS-OLDER-ORDER" });
  expect(screen.getByLabelText("Completed order")).toHaveValue(conversationId);
  await user.click(
    within(screen.getByRole("region", { name: "My reviews" })).getByRole(
      "button",
      { name: "Next" },
    ),
  );
  await screen.findByText("An older review");
  expect(screen.getByLabelText("Your review")).toHaveValue(
    "A thoughtful fit and finish.",
  );
  expect(screen.getByLabelText("Rating")).toHaveValue("4");
  expect(
    screen.getByRole("option", { name: "KS-OLDER-ORDER" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Submit review" }));
  await waitFor(() => expect(writes("/account/reviews")).toHaveLength(1));
  expect(writes("/account/reviews")[0][1].body).toEqual({
    orderId: conversationId,
    rating: 4,
    text: "A thoughtful fit and finish.",
    consent: true,
  });
  expect(
    boundary.api.mock.calls.some(
      ([path]) => path === "/orders?status=delivered&limit=30&page=2",
    ),
  ).toBe(true);
});
it("application pagination keeps an open draft tied to its original application revision", async () => {
  const draft = {
    _id: jobId,
    status: "draft",
    revision: 3,
    name: "Original tailor",
    city: "Delhi",
    skills: ["stitching"],
    garments: ["kurti"],
    introduction: "Saved introduction",
    portfolioMediaIds: [conversationId],
  };
  boundary.api.mockImplementation(async (path, options = {}) => {
    if (path === `/applications/${jobId}`) return { data: draft };
    if (options.method === "PATCH") return { data: draft };
    return paged(
      [
        path.includes("page=2")
          ? {
              ...draft,
              _id: conversationId,
              name: "Older tailor",
              revision: 8,
            }
          : draft,
      ],
      path.includes("page=2") ? 2 : 1,
    );
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const user = userEvent.setup();
  renderAt(<AccountWork />);
  await user.click(
    await screen.findByRole("button", { name: "Resume application draft" }),
  );
  await user.clear(screen.getByLabelText(/City \/ service area/));
  await user.type(screen.getByLabelText(/City \/ service area/), "Jaipur");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText(/Older tailor/);
  expect(screen.getByLabelText(/City \/ service area/)).toHaveValue("Jaipur");
  await user.click(
    screen.getByRole("button", { name: "Save application draft" }),
  );
  await waitFor(() =>
    expect(boundary.api).toHaveBeenCalledWith(
      `/applications/${jobId}`,
      expect.objectContaining({
        method: "PATCH",
        body: expect.objectContaining({
          revision: 3,
          status: "draft",
          city: "Jaipur",
          portfolioMediaIds: [conversationId],
        }),
      }),
    ),
  );
  expect(
    boundary.api.mock.calls.some(
      ([path, options]) =>
        path === `/applications/${conversationId}` &&
        options?.method === "PATCH",
    ),
  ).toBe(false);
});
it("application conversation links open their own record and return to the original list page", async () => {
  const application = {
    _id: jobId,
    name: "Older application",
    city: "Jaipur",
    status: "approved",
    conversationId,
  };
  boundary.api.mockImplementation(async (path) => {
    if (path === `/applications/${jobId}`) return { data: application };
    if (path.startsWith("/conversations/")) return list();
    return paged([{ ...application, name: "Application list entry" }], 2);
  });
  const user = userEvent.setup();
  renderAt(<AccountWork />, "/account/work?page=2");
  const link = await screen.findByRole("link", {
    name: "Private application conversation",
  });
  expect(link).toHaveAttribute(
    "href",
    `/account/work?page=2&application=${jobId}`,
  );
  await user.click(link);
  await screen.findByText(/Older application/);
  expect(
    boundary.api.mock.calls.some(([path]) => path === `/applications/${jobId}`),
  ).toBe(true);
  await screen.findByLabelText("Your message");
  await user.click(screen.getByRole("button", { name: "All applications" }));
  await screen.findByText(/Application list entry/);
  expect(screen.getByText("Page 2 / 2")).toBeInTheDocument();
});
it("notification pages preserve the open support conversation and its unsent message", async () => {
  boundary.api.mockImplementation(async (path, options = {}) => {
    if (path === `/support/${jobId}`)
      return {
        data: {
          _id: jobId,
          subject: "My open support request",
          status: "open",
          conversationId,
        },
      };
    if (path.startsWith("/notifications?"))
      return paged(
        [
          {
            _id: "update",
            title: path.includes("page=2")
              ? "Older account update"
              : "Latest account update",
          },
        ],
        path.includes("page=2") ? 2 : 1,
      );
    if (options.method === "POST") return { data: {} };
    return list();
  });
  const user = userEvent.setup();
  renderAt(<AccountSupport />, `/account/support?ticket=${jobId}&page=2`);
  await user.type(
    await screen.findByLabelText("Your message"),
    "Keep this unsent reply",
  );
  await user.click(
    within(screen.getByRole("region", { name: "Private updates" })).getByRole(
      "button",
      { name: "Next" },
    ),
  );
  await screen.findByText("Older account update");
  expect(screen.getByText("My open support request")).toBeInTheDocument();
  expect(screen.getByLabelText("Your message")).toHaveValue(
    "Keep this unsent reply",
  );
  await user.click(
    within(screen.getByRole("region", { name: "Private updates" })).getByRole(
      "button",
      { name: "Mark read" },
    ),
  );
  await waitFor(() =>
    expect(writes("/notifications/update/read")).toHaveLength(1),
  );
  expect(screen.getByText("Older account update")).toBeInTheDocument();
});
it("an incomplete tailor application can be saved as a private draft without approving terms or requesting worker access", async () => {
  boundary.api.mockImplementation(async (path, options = {}) =>
    path === "/applications" && options.method === "POST"
      ? { data: { _id: jobId, status: "draft" } }
      : list(),
  );
  renderAt(<AccountWork />);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Want to work as a tailor?" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Save application draft" }),
  );
  await waitFor(() => expect(writes("/applications")).toHaveLength(1));
  expect(writes("/applications")[0][1].body).toMatchObject({
    status: "draft",
    city: "",
    introduction: "",
  });
  expect(writes("/applications")[0][1].body).not.toHaveProperty("role");
});
it("editing saved addresses sends an allowlisted revision update without changing an order", async () => {
  const current = {
    revision: 4,
    addresses: [
      {
        id: crypto.randomUUID(),
        label: "Home",
        line1: "Original address",
        line2: "",
        city: "Delhi",
        state: "Delhi",
        pin: "110001",
      },
    ],
    communications: { orderUpdates: true, marketing: false },
  };
  boundary.api.mockImplementation(async (path, options = {}) => {
    if (path === "/account/preferences" && options.method === "PATCH")
      return { data: { ...options.body, revision: 5 } };
    if (path === "/account/preferences") return { data: current };
    return list();
  });
  const user = userEvent.setup();
  renderAt(<AccountProfile />);
  const address = await screen.findByRole("textbox", {
    name: /Address line 1/,
  });
  await user.clear(address);
  await user.type(address, "A new saved address");
  await user.click(
    screen.getByRole("button", { name: "Save addresses and preferences" }),
  );
  await waitFor(() =>
    expect(boundary.api).toHaveBeenCalledWith(
      "/account/preferences",
      expect.objectContaining({
        method: "PATCH",
        body: expect.objectContaining({
          revision: 4,
          addresses: [
            expect.objectContaining({ line1: "A new saved address" }),
          ],
        }),
      }),
    ),
  );
  expect(
    boundary.api.mock.calls.some(
      ([path, options]) => path.startsWith("/orders") && options?.method,
    ),
  ).toBe(false);
  expect(current.addresses[0].line1).toBe("Original address");
});
it("assistance sends only consented step context and retries the exact failed payload", async () => {
  let attempts = 0;
  boundary.api.mockImplementation(async (path, options = {}) => {
    if (path === "/support" && options.method === "POST") {
      attempts++;
      if (attempts === 1) throw new Error("Connection interrupted");
      return { data: { _id: jobId } };
    }
    if (path === `/support/${jobId}`)
      return {
        data: {
          _id: jobId,
          subject: "Help with my shoulder",
          description: "Please explain shoulder measurement",
          ticketNumber: "KS-H-TEST",
          status: "open",
          timeline: [],
          conversationId,
        },
      };
    return list();
  });
  const user = userEvent.setup();
  renderAt(
    <AccountSupport />,
    `/account/support?draft=${crypto.randomUUID()}&step=measurements`,
  );
  await user.type(
    await screen.findByLabelText(/Subject/),
    "Help with my shoulder",
  );
  await user.type(
    screen.getByLabelText("Tell us how we can help"),
    "Please explain shoulder measurement",
  );
  await user.click(
    screen.getByRole("checkbox", { name: /Share my selected design/ }),
  );
  await user.click(screen.getByRole("button", { name: "Send help request" }));
  expect(
    await screen.findByRole("button", { name: "Retry same help request" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/Subject/)).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Retry same help request" }),
  );
  await waitFor(() => expect(writes("/support")).toHaveLength(2));
  const [first, retry] = writes("/support");
  expect(first[1].body).toEqual(retry[1].body);
  expect(first[1].body.context).toEqual({ step: "measurements" });
  expect(first[1].body).not.toHaveProperty("measurements");
  expect(first[1].body).not.toHaveProperty("address");
});
it("conversation uses authorized attachment context, marks history read and preserves message retry keys", async () => {
  let attempts = 0;
  const path = `/conversations/${conversationId}/messages`;
  boundary.api.mockImplementation(async (p, options = {}) => {
    if (p.startsWith(path) && !options.method)
      return list([
        {
          _id: "m1",
          sender: "d".repeat(24),
          senderName: "Atelier support",
          text: "How can we help?",
          attachmentIds: [jobId],
          createdAt: "2026-11-08T08:00:00Z",
        },
      ]);
    if (p === path && options.method === "POST") {
      attempts++;
      if (attempts === 1) throw new Error("Connection interrupted");
      return { data: { _id: "m2" } };
    }
    if (p.includes("/attachments/"))
      return { data: { url: "https://private.example.test/signed" } };
    return { data: {} };
  });
  const user = userEvent.setup();
  renderAt(<Conversation id={conversationId} />);
  expect(await screen.findByText("Atelier support")).toBeInTheDocument();
  await waitFor(() =>
    expect(writes(`/conversations/${conversationId}/read`)).toHaveLength(1),
  );
  await user.click(
    screen.getByRole("button", { name: "View private reference" }),
  );
  expect(boundary.api).toHaveBeenCalledWith(
    `/conversations/${conversationId}/attachments/${jobId}`,
  );
  await user.type(
    screen.getByLabelText("Your message"),
    "Please help with shoulder measurements.",
  );
  await user.click(screen.getByRole("button", { name: "Send message" }));
  expect(
    await screen.findByRole("button", { name: "Retry same message" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Your message")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Retry same message" }));
  await waitFor(() => expect(writes(path)).toHaveLength(2));
  expect(writes(path)[0][1].body).toEqual(writes(path)[1][1].body);
});
it("worker list pages stay independent and assistance paging preserves an open job progress report", async () => {
  boundary.api.mockImplementation(async (path) => {
    if (path === "/worker/profile")
      return { data: { assistancePermission: true } };
    if (path === `/worker/jobs/${jobId}`)
      return {
        data: {
          _id: jobId,
          revision: 7,
          requirements: "Use approved details",
          order: {
            orderNumber: "KS-OLDER-JOB",
            measurements: { values: {}, unit: "in" },
          },
        },
      };
    const second = path.includes("page=2");
    if (path.startsWith("/worker/assistance?"))
      return paged(
        [
          {
            _id: conversationId,
            subject: second
              ? "Older assigned assistance"
              : "Latest assigned assistance",
            status: "open",
          },
        ],
        second ? 2 : 1,
      );
    if (path.startsWith("/worker/jobs?"))
      return paged(
        [
          {
            _id: jobId,
            orderNumber: second ? "Older assigned job" : "Latest assigned job",
          },
        ],
        second ? 2 : 1,
      );
    return list();
  });
  const user = userEvent.setup();
  renderAt(<WorkerWorkspace />, "/worker?assistancePage=2");
  await screen.findByText("Older assigned assistance");
  await user.click(
    within(
      screen.getByRole("region", { name: "Assigned stitching jobs" }),
    ).getByRole("button", { name: "Next" }),
  );
  const jobLink = await screen.findByRole("link", {
    name: /Older assigned job/,
  });
  const linkParams = new URL(jobLink.getAttribute("href"), "https://khwab.test")
    .searchParams;
  expect(linkParams.get("job")).toBe(jobId);
  expect(linkParams.get("jobsPage")).toBe("2");
  expect(linkParams.get("assistancePage")).toBe("2");
  await user.click(jobLink);
  await screen.findByText("KS-OLDER-JOB");
  await user.type(
    screen.getByLabelText("Progress report for admin review"),
    "Awaiting confirmation",
  );
  await user.selectOptions(
    screen.getByLabelText("Reported stage for admin review"),
    "quality_check",
  );
  await user.click(
    within(
      screen.getByRole("region", { name: "Assigned master-tailor assistance" }),
    ).getByRole("button", { name: "Previous" }),
  );
  await screen.findByText("Latest assigned assistance");
  expect(screen.getByLabelText("Progress report for admin review")).toHaveValue(
    "Awaiting confirmation",
  );
  expect(screen.getByLabelText("Reported stage for admin review")).toHaveValue(
    "quality_check",
  );
  expect(writes(`/worker/jobs/${jobId}/progress`)).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "All assigned jobs" }));
  await screen.findByRole("link", { name: /Older assigned job/ });
  expect(
    within(
      screen.getByRole("region", { name: "Assigned stitching jobs" }),
    ).getByText("Page 2 / 2"),
  ).toBeInTheDocument();
  expect(screen.getByText("Latest assigned assistance")).toBeInTheDocument();
});
it("worker progress sends the selected stage, revision and stable retry key without changing order status", async () => {
  let attempts = 0;
  const path = `/worker/jobs/${jobId}/progress`;
  boundary.api.mockImplementation(async (p, options = {}) => {
    if (p === "/worker/profile")
      return { data: { assistancePermission: false } };
    if (p === `/worker/jobs/${jobId}`)
      return {
        data: {
          _id: jobId,
          revision: 7,
          requirements: "Use approved details",
          order: {
            orderNumber: "KS-JOB-TEST",
            measurements: { values: {}, unit: "in" },
            referenceMediaIds: [],
          },
        },
      };
    if (p === path && options.method === "POST") {
      attempts++;
      if (attempts === 1) throw new Error("Connection interrupted");
      return { data: { revision: 8 } };
    }
    return list();
  });
  const user = userEvent.setup();
  renderAt(<WorkerWorkspace />, `/worker?job=${jobId}`);
  await screen.findByText("KS-JOB-TEST");
  await user.selectOptions(
    screen.getByLabelText("Reported stage for admin review"),
    "quality_check",
  );
  await user.type(
    screen.getByLabelText("Progress report for admin review"),
    "Quality checks ready for confirmation",
  );
  await user.click(
    screen.getByRole("button", { name: "Send progress report" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Retry same progress report" }),
  );
  await waitFor(() => expect(writes(path)).toHaveLength(2));
  expect(writes(path)[0][1].body).toEqual(writes(path)[1][1].body);
  expect(writes(path)[0][1].body).toMatchObject({
    revision: 7,
    stage: "quality_check",
    note: "Quality checks ready for confirmation",
  });
  expect(
    boundary.api.mock.calls.some(
      ([p, o]) => p.includes("/orders/") && o?.method,
    ),
  ).toBe(false);
  expect(
    boundary.api.mock.calls.some(([p]) => p.startsWith("/worker/assistance")),
  ).toBe(false);
});
it("information-requested applications must resume review before approval controls appear", async () => {
  boundary.api.mockImplementation(async (path) =>
    path.startsWith("/admin/applications")
      ? list([
          {
            _id: jobId,
            status: "information_requested",
            revision: 3,
            name: "Test tailor",
            city: "Delhi",
            skills: ["stitching"],
            garments: ["kurti"],
            introduction: "Application",
            portfolioMediaIds: [],
          },
        ])
      : list(),
  );
  renderAt(<AdminWork />, "/admin/work");
  expect(
    await screen.findByRole("button", { name: "Resume review" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Approve worker application" }),
  ).not.toBeInTheDocument();
});
