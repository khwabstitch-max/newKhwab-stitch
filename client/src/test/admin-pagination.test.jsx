import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
import { AdminReviews } from "../pages/AdminOperations";
import { AdminServices } from "../pages/AdminServices";
import { setLanguage } from "../i18n/core";
const paged = (data, page) => ({
  data,
  pagination: { page, pages: 2, total: 31, limit: 30 },
});
beforeEach(() => {
  boundary.api.mockReset();
  setLanguage("en", false);
});

it("preserves unsent moderation reasons while paging reviews", async () => {
  boundary.api.mockImplementation(async (path) => {
    const page = Number(
      new URL(path, "https://test.invalid").searchParams.get("page"),
    );
    return paged(
      [
        {
          _id: `review-${page}`,
          rating: 4,
          text: `Review page ${page}`,
          status: "pending",
          consent: true,
        },
      ],
      page,
    );
  });
  render(
    <MemoryRouter>
      <AdminReviews />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText("Internal moderation reason"),
    "Preserve customer wording",
  );
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Review pagination" }),
    ).getByRole("button", { name: "Next" }),
  );
  await screen.findByText("Review page 2");
  await user.click(screen.getByRole("button", { name: "Previous" }));
  expect(
    await screen.findByLabelText("Internal moderation reason"),
  ).toHaveValue("Preserve customer wording");
  expect(boundary.api.mock.calls.map(([path]) => path)).toContain(
    "/admin/reviews?limit=30&page=2",
  );
});

it("keeps an unsaved service editor open while navigating service pages", async () => {
  boundary.api.mockImplementation(async (path) => {
    const page = Number(
      new URL(path, "https://test.invalid").searchParams.get("page"),
    );
    return paged(
      [
        {
          _id: `service-${page}`,
          code: `service_${page}`,
          name: `Service page ${page}`,
          serviceType: "stitching",
          itemTypes: ["kurti"],
          audiences: ["women"],
          componentKinds: [],
          measurementFields: [],
          workflowStages: [],
          workerSkills: [],
          materials: "customer",
          revision: 0,
        },
      ],
      page,
    );
  });
  render(
    <MemoryRouter>
      <AdminServices />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await screen.findByText("Service page 1");
  await user.click(screen.getByRole("button", { name: "Configure a service" }));
  await user.type(
    screen.getByLabelText(/^Display name/),
    "Unsent service draft",
  );
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Service pagination" }),
    ).getByRole("button", { name: "Next" }),
  );
  await screen.findByText("Service page 2");
  expect(screen.getByLabelText(/^Display name/)).toHaveValue(
    "Unsent service draft",
  );
  expect(boundary.api.mock.calls.map(([path]) => path)).toContain(
    "/admin/services?limit=30&page=2",
  );
});
