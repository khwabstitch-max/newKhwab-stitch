import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original()),
  api: boundary.api,
}));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({ profile: { role: "admin" } }),
}));
vi.mock("../components/SupportProposals", () => ({
  SupportProposals: () => null,
}));
import { AdminSupport, AdminWork } from "../pages/AdminOperations";
import { setLanguage } from "../i18n/core";
const paged = (data, page = 1) => ({
  data,
  pagination: { page, pages: 2, limit: 30, total: 31 },
});
const empty = () => ({ data: [], pagination: { page: 1, pages: 0, total: 0 } });
beforeEach(() => {
  boundary.api.mockReset();
  setLanguage("en", false);
});
const mount = (element, path = "/admin/work") =>
  render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);

it("pages independent staff lists and retains assessment notes and assignment choices", async () => {
  boundary.api.mockImplementation(async (path) => {
    const url = new URL(path, "https://test.invalid"),
      page = Number(url.searchParams.get("page") || 1);
    if (url.pathname === "/admin/applications")
      return paged(
        [
          {
            _id: `application-${page}`,
            name: `Applicant ${page}`,
            city: "Pune",
            skills: [],
            garments: [],
            status: "submitted",
          },
        ],
        page,
      );
    if (url.pathname === "/admin/workers")
      return paged(
        [
          {
            _id: `worker-${page}`,
            owner: `Owner ${page}`,
            skills: ["stitching"],
            active: true,
            assistancePermission: true,
          },
        ],
        page,
      );
    if (url.pathname === "/admin/assignments")
      return paged(
        [
          {
            _id: `assignment-${page}`,
            orderId: `order-${page}`,
            requirements: `Job ${page}`,
            active: true,
          },
        ],
        page,
      );
    if (url.pathname === "/admin/orders")
      return paged(
        [
          {
            _id: `order-${page}`,
            orderNumber: `ORDER-${page}`,
            status: "submitted",
          },
        ],
        page,
      );
    return empty();
  });
  mount(<AdminWork />);
  const user = userEvent.setup();
  const reason = await screen.findByLabelText(
    "Reason / requested information shared with applicant",
  );
  await user.type(reason, "Please send a sample");
  await user.type(
    screen.getByLabelText("Requirements"),
    "Keep these job instructions",
  );
  await user.selectOptions(
    screen.getByLabelText("Order", { exact: true }),
    "order-1",
  );
  await user.selectOptions(
    screen.getByLabelText("Worker", { exact: true }),
    "Owner 1",
  );
  await user.click(screen.getByRole("button", { name: "Load more orders" }));
  await screen.findByRole("option", { name: "ORDER-2" });
  await user.click(screen.getByRole("button", { name: "Load more workers" }));
  await screen.findByRole("option", { name: /Owner 2/ });
  expect(screen.getByLabelText("Order", { exact: true })).toHaveValue(
    "order-1",
  );
  expect(screen.getByLabelText("Worker", { exact: true })).toHaveValue(
    "Owner 1",
  );
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Application pagination" }),
    ).getByRole("button", { name: "Next" }),
  );
  await screen.findByRole("heading", { name: /Applicant 2/ });
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Worker pagination" }),
    ).getByRole("button", { name: "Next" }),
  );
  await waitFor(() =>
    expect(
      within(
        screen.getByRole("region", { name: "Approved workers" }),
      ).getByText("Owner 2"),
    ).toBeInTheDocument(),
  );
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Assignment pagination" }),
    ).getByRole("button", { name: "Next" }),
  );
  await screen.findByText("Job 2");
  expect(screen.getByLabelText("Requirements")).toHaveValue(
    "Keep these job instructions",
  );
  expect(screen.getByLabelText("Worker", { exact: true })).toHaveValue(
    "Owner 1",
  );
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Application pagination" }),
    ).getByRole("button", { name: "Previous" }),
  );
  expect(
    await screen.findByLabelText(
      "Reason / requested information shared with applicant",
    ),
  ).toHaveValue("Please send a sample");
});

it("returns support filters to page one and safely navigates a ticket back to its list", async () => {
  boundary.api.mockImplementation(async (path) => {
    const url = new URL(path, "https://test.invalid"),
      page = Number(url.searchParams.get("page") || 1);
    if (url.pathname === "/admin/support")
      return paged(
        [
          {
            _id: `ticket-${page}`,
            subject: `Question ${page}`,
            ticketNumber: `T-${page}`,
            status: "open",
          },
        ],
        page,
      );
    if (url.pathname === "/admin/support/alerts") return { data: {} };
    if (url.pathname === "/support/ticket-2")
      return {
        data: {
          _id: "ticket-2",
          subject: "Question 2",
          ticketNumber: "T-2",
          status: "open",
          description: "Need guidance",
          assignedTo: "Owner 2",
          revision: 0,
        },
      };
    if (url.pathname === "/admin/workers")
      return paged(
        [
          {
            _id: `worker-${page}`,
            owner: `Owner ${page}`,
            skills: [],
            active: true,
            assistancePermission: true,
          },
        ],
        page,
      );
    return empty();
  });
  mount(<AdminSupport />, "/admin/support");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Next" }));
  await user.click(await screen.findByRole("link", { name: /Question 2/ }));
  await screen.findByRole("heading", { name: "Question 2" });
  expect(
    screen.getByLabelText("Assigned authorized master tailor"),
  ).toHaveValue("Owner 2");
  await user.click(
    await screen.findByRole("button", { name: "Load more workers" }),
  );
  await waitFor(() =>
    expect(
      screen.getByLabelText("Assigned authorized master tailor"),
    ).toHaveValue("Owner 2"),
  );
  await user.click(
    screen.getByRole("button", { name: "All support requests" }),
  );
  await screen.findByRole("link", { name: /Question 2/ });
  await user.selectOptions(screen.getByLabelText("Filter status"), "resolved");
  await screen.findByRole("link", { name: /Question 1/ });
  expect(
    boundary.api.mock.calls.some(
      ([path]) => path === "/admin/support?limit=30&page=1&status=resolved",
    ),
  ).toBe(true);
});
