import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SleeveLengthOptions } from "../components/SleeveLengthOptions";
import { setLanguage } from "../i18n/core";

beforeEach(() => setLanguage("en", false));
afterEach(() => act(() => setLanguage("en", false)));
const option = (id, lengthStyle, rest = {}) => ({
  _id: id,
  kind: "sleeveLength",
  lengthStyle,
  name: `Length ${id}`,
  garments: ["kurti"],
  priceMode: "included",
  ...rest,
});

it("renders only compatible available admin records, with a distinct illustration for all six styles", () => {
  const styles = [
    "sleeveless",
    "short",
    "elbow",
    "three_quarter",
    "full",
    "custom",
  ];
  render(
    <SleeveLengthOptions
      garment="kurti"
      onSelect={vi.fn()}
      options={[
        ...styles.map((style, index) => option(String(index), style)),
        option("inactive", "short", { active: false }),
        option("unpublished", "short", { published: false }),
        option("draft", "short", { status: "draft" }),
        option("other garment", "short", { garments: ["blouse"] }),
        option("other kind", "short", { kind: "sleeve" }),
        option("invalid style", "imagined"),
      ]}
    />,
  );
  expect(screen.getAllByRole("radio")).toHaveLength(6);
  expect(screen.getAllByRole("img")).toHaveLength(6);
  expect(
    screen.getByRole("img", { name: "Sleeveless sleeve length illustration" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("img", {
      name: "Custom length sleeve length illustration",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/style preference.*exact sleeve length.*measurements/),
  ).toBeInTheDocument();
  expect(screen.queryByText(/inches?\s*[:=]?\s*\d/i)).not.toBeInTheDocument();
});

it("replaces one controlled length choice and exposes original reset without adding amounts", async () => {
  const onSelect = vi.fn(),
    onReset = vi.fn();
  const options = [
    option("original", "short"),
    option("full", "full", { priceMode: "additional", amountPaise: 12550 }),
  ];
  const props = { options, onSelect, onReset, originalId: "original" };
  const { rerender } = render(
    <SleeveLengthOptions {...props} selectedId="original" />,
  );
  expect(
    screen.getByRole("button", {
      name: "Keep original catalogue sleeve length",
    }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole("radio", { name: /Length full/ }));
  expect(onSelect).toHaveBeenCalledWith("full");
  rerender(<SleeveLengthOptions {...props} selectedId="full" />);
  expect(
    screen.getByRole("radio", { name: /Length original/ }),
  ).not.toBeChecked();
  expect(screen.getByRole("radio", { name: /Length full/ })).toBeChecked();
  expect(screen.getAllByText("No additional charge").length).toBeGreaterThan(0);
  await userEvent.click(
    screen.getByRole("button", {
      name: "Keep original catalogue sleeve length",
    }),
  );
  expect(onReset).toHaveBeenCalledOnce();
});

it("uses the admin image, falls back to an illustration on image failure, and keeps selection through Hindi switching", () => {
  render(
    <SleeveLengthOptions
      selectedId="full"
      onSelect={vi.fn()}
      options={[
        option("full", "full", {
          name: "Full choice",
          nameHi: "पूरी आस्तीन",
          descriptionHi: "कलाई तक की शैली।",
          imageUrl: "/length.png",
          imageAlt: "Full-length detail",
          imageAltHi: "पूरी लंबाई का चित्र",
        }),
      ]}
    />,
  );
  const radio = screen.getByRole("radio", { name: /Full choice/ });
  const image = screen.getByRole("img", { name: "Full-length detail" });
  act(() => setLanguage("hi", false));
  expect(screen.getByRole("radio", { name: /पूरी आस्तीन/ })).toBe(radio);
  expect(radio).toBeChecked();
  expect(screen.getByRole("img", { name: "पूरी लंबाई का चित्र" })).toBe(image);
  fireEvent.error(image);
  expect(
    screen.queryByRole("img", { name: "पूरी लंबाई का चित्र" }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole("img")).toHaveLength(1);
  expect(radio).toBeChecked();
});

it("shows an honest empty state without fabricating length records and supports bounded loading", async () => {
  const onLoadMore = vi.fn();
  const { rerender } = render(
    <SleeveLengthOptions
      onSelect={vi.fn()}
      options={[]}
      hasMore
      onLoadMore={onLoadMore}
    />,
  );
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.getByRole("status")).toHaveTextContent(
    /No compatible sleeve lengths/,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Load more sleeve lengths" }),
  );
  expect(onLoadMore).toHaveBeenCalledOnce();
  rerender(
    <SleeveLengthOptions
      onSelect={vi.fn()}
      options={[]}
      hasMore
      onLoadMore={onLoadMore}
      loadingMore
    />,
  );
  expect(
    screen.getByRole("button", { name: "Loading sleeve lengths…" }),
  ).toBeDisabled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("ignores legacy price-label callbacks and always shows zero additional charge", () => {
  render(
    <SleeveLengthOptions
      options={[option("full", "full", { priceMode: "additional", amountPaise: 12500 })]}
      onSelect={vi.fn()}
      priceLabel={() => "Included in combined sleeve adjustment"}
    />,
  );
  expect(screen.getByText("No additional charge")).toBeInTheDocument();
  expect(screen.queryByText("Additional ₹125")).not.toBeInTheDocument();
});
