import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualOptions, optionPriceLabel } from "../components/VisualOptions";
import { setLanguage } from "../i18n/core";

beforeEach(() => setLanguage("en", false));
afterEach(() => act(() => setLanguage("en", false)));

const option = (id, rest = {}) => ({
  _id: id,
  kind: "sleeve",
  name: `Sleeve ${id}`,
  garments: ["kurti"],
  priceMode: "additional",
  amountPaise: 12500,
  ...rest,
});

describe("visual design options", () => {
  it("accepts public options without active, filters unavailable choices and exposes a single selection", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <VisualOptions
        kind="sleeve"
        garment="kurti"
        selectedId="1"
        onSelect={onSelect}
        options={[
          option("1"),
          option("2"),
          option("3", { active: false }),
          option("4", { garments: ["blouse"] }),
          option("5", { kind: "neck" }),
          option("6", { archived: true }),
          option("7", { status: "draft" }),
          option("8", { status: "unpublished" }),
          option("9", { status: "unknown" }),
        ]}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /Sleeve 1/ })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: /Sleeve 2/ }));
    expect(onSelect).toHaveBeenCalledWith("2");
    rerender(
      <VisualOptions
        kind="sleeve"
        garment="kurti"
        selectedId="2"
        onSelect={onSelect}
        options={[option("1"), option("2")]}
      />,
    );
    expect(screen.getByRole("radio", { name: /Sleeve 1/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Sleeve 2/ })).toBeChecked();
  });

  it("opens a keyboard-accessible preview and restores focus on Escape", async () => {
    render(
      <VisualOptions
        kind="sleeve"
        garment="kurti"
        options={[option("1", { description: "Soft gathered sleeve." })]}
        onSelect={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Preview Sleeve 1" });
    await userEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Sleeve 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close design preview" }),
    ).toHaveFocus();
    await userEvent.tab();
    expect(
      screen.getByRole("button", { name: "Close design preview" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("loads progressively and search finds items beyond the first page", async () => {
    render(
      <VisualOptions
        kind="sleeve"
        garment="kurti"
        options={Array.from({ length: 25 }, (_, index) =>
          option(String(index + 1)),
        )}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(12);
    await userEvent.click(
      screen.getByRole("button", { name: /Show more designs/ }),
    );
    expect(screen.getAllByRole("radio")).toHaveLength(24);
    await userEvent.type(screen.getByRole("searchbox"), "Sleeve 25");
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(
      screen.getByRole("radio", { name: /Sleeve 25/ }),
    ).toBeInTheDocument();
  });

  it("keeps the selected ID, search and open preview when switching languages", async () => {
    const onSelect = vi.fn();
    render(
      <VisualOptions
        kind="sleeve"
        garment="kurti"
        selectedId="1"
        onSelect={onSelect}
        options={[
          option("1", {
            nameHi: "घेरदार आस्तीन",
            description: "Soft gathered sleeve.",
            descriptionHi: "मुलायम घेरदार आस्तीन।",
            imageUrl: "/sleeve.jpg",
            imageAlt: "Gathered sleeve detail",
            imageAltHi: "घेरदार आस्तीन का विवरण",
            amountPaise: 12550,
          }),
        ]}
      />,
    );
    const search = screen.getByRole("searchbox", { name: "Find a design" });
    await userEvent.type(search, "Sleeve 1");
    const trigger = screen.getByRole("button", { name: "Preview Sleeve 1" });
    await userEvent.click(trigger);
    const preview = screen.getByRole("dialog", { name: "Sleeve 1" });

    act(() => setLanguage("hi", false));

    expect(screen.getByRole("dialog", { name: "घेरदार आस्तीन" })).toBe(preview);
    expect(
      within(preview).getByText("मुलायम घेरदार आस्तीन।"),
    ).toBeInTheDocument();
    expect(within(preview).getByText("इनके लिए: कुर्ती")).toBeInTheDocument();
    expect(within(preview).getByText("अतिरिक्त ₹125.50 प्रति परिधान")).toBeInTheDocument();
    expect(
      within(preview).getByRole("img", { name: "घेरदार आस्तीन का विवरण" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "डिज़ाइन पूर्वावलोकन बंद करें" }),
    ).toHaveFocus();
    expect(search).toHaveValue("Sleeve 1");
    expect(screen.getByRole("radio", { name: /घेरदार आस्तीन/ })).toBeChecked();
    expect(onSelect).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await userEvent.clear(search);
    await userEvent.type(search, "मुलायम");
    expect(screen.getByRole("radio", { name: /घेरदार आस्तीन/ })).toBeChecked();
    act(() => setLanguage("en", false));
    expect(search).toHaveValue("मुलायम");
    expect(screen.getByRole("radio", { name: /Sleeve 1/ })).toBeChecked();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("loads external batches without hiding loaded choices or clearing search and selection", async () => {
    const onLoadMore = vi.fn();
    const onSelect = vi.fn();
    const props = {
      kind: "sleeve",
      garment: "kurti",
      selectedId: "15",
      onSelect,
      onLoadMore,
      hasMore: true,
    };
    const initial = Array.from({ length: 15 }, (_, index) =>
      option(String(index + 1)),
    );
    const { rerender } = render(<VisualOptions {...props} options={initial} />);
    expect(screen.getAllByRole("radio")).toHaveLength(15);
    const search = screen.getByRole("searchbox", {
      name: "Search loaded designs",
    });
    await userEvent.type(search, "Sleeve 1");
    await userEvent.click(
      screen.getByRole("button", { name: "Load more designs" }),
    );
    expect(onLoadMore).toHaveBeenCalledOnce();
    rerender(<VisualOptions {...props} options={initial} loadingMore />);
    expect(
      screen.getByRole("button", { name: "Loading more designs…" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Loading more designs…" }),
    ).toHaveAttribute("aria-busy", "true");

    rerender(
      <VisualOptions
        {...props}
        hasMore={false}
        options={[...initial, option("16"), option("17")]}
      />,
    );
    expect(search).toHaveValue("Sleeve 1");
    expect(screen.getAllByRole("radio")).toHaveLength(9);
    expect(screen.getByRole("radio", { name: /Sleeve 15/ })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Sleeve 17/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Showing 9 of 17 loaded designs"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more designs" }),
    ).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders photo descriptions and recovers from broken images with an honest fallback", () => {
    render(
      <VisualOptions
        kind="sleeve"
        options={[
          option("1", {
            imageUrl: "/missing.jpg",
            imageAlt: "Elbow sleeve with small gathers",
          }),
        ]}
        onSelect={vi.fn()}
      />,
    );
    const image = screen.getByRole("img", {
      name: "Elbow sleeve with small gathers",
    });
    expect(image).toHaveAttribute("loading", "lazy");
    fireEvent.error(image);
    expect(
      screen.getByRole("img", { name: "Sleeve 1: photo not available" }),
    ).toBeInTheDocument();
  });

  it("offers a reset action without permitting removal from a required single choice", async () => {
    const reset = vi.fn();
    render(
      <VisualOptions
        kind="sleeve"
        options={[option("1")]}
        selectedId="1"
        originalId="original"
        onSelect={vi.fn()}
        onReset={reset}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset to original" }),
    );
    expect(reset).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: /Remove/ }),
    ).not.toBeInTheDocument();
  });
});

describe("option pricing labels", () => {
  it("never substitutes an example guide price for a pending backend price", () => {
    expect(optionPriceLabel({ name: "Round Neck", priceMode: "pending" }, { pricePaise: 0, priceDisplay: "₹0 (Included)" })).toBe("Price after review");
    expect(optionPriceLabel({ name: "Boat Neck", priceMode: "pending" }, { pricePaise: 5000, priceDisplay: "₹50 (Additional)" })).toBe("Price after review");
  });
  it("distinguishes included, configured additions, replacement adjustments and unresolved amounts", () => {
    expect(optionPriceLabel({ priceMode: "included" })).toBe("Included");
    expect(
      optionPriceLabel({ priceMode: "additional", amountPaise: 12500 }),
    ).toBe("Additional ₹125 per garment");
    expect(
      optionPriceLabel({
        priceMode: "replacement",
        replacementAdjustmentPaise: 25000,
      }),
    ).toBe("Additional ₹250 per garment");
    expect(optionPriceLabel({ priceMode: "replacement" })).toBe(
      "Price after review",
    );
    expect(optionPriceLabel({ priceMode: "pending", amountPaise: 0 })).toBe(
      "Price after review",
    );
    expect(optionPriceLabel({ priceMode: "additional", amountPaise: 0 })).toBe(
      "No additional charge",
    );
  });

  it("translates pricing labels while retaining paise precision and pending review", () => {
    setLanguage("hi", false);
    expect(optionPriceLabel({ priceMode: "included" })).toBe("शामिल है");
    expect(
      optionPriceLabel({ priceMode: "additional", amountPaise: 12550 }),
    ).toBe("अतिरिक्त ₹125.50 प्रति परिधान");
    expect(
      optionPriceLabel({
        priceMode: "replacement",
        replacementAdjustmentPaise: 25000,
      }),
    ).toBe("अतिरिक्त ₹250 प्रति परिधान");
    expect(optionPriceLabel({ priceMode: "replacement" })).toBe(
      "समीक्षा के बाद कीमत",
    );
    expect(optionPriceLabel({ priceMode: "additional", amountPaise: -1 })).toBe(
      "समीक्षा के बाद कीमत",
    );
  });
});

it("uses refreshed catalogue images and both views ahead of matching static style references", async () => {
  const record = option("puff", { name: "Puff Sleeve", imageUrl: "/catalogue/puff-front.webp", images: [{ id: "front", url: "/catalogue/puff-front.webp" }, { id: "side", url: "/catalogue/puff-side.webp" }] });
  const { rerender } = render(<VisualOptions kind="sleeve" options={[record]} onSelect={vi.fn()} />);
  expect(screen.getByRole("img", { name: "Puff Sleeve design option" })).toHaveAttribute("src", "/catalogue/puff-front.webp");
  await userEvent.click(screen.getByRole("button", { name: "Preview Puff Sleeve" }));
  const dialog = screen.getByRole("dialog", { name: "Puff Sleeve" });
  await userEvent.click(within(dialog).getByRole("button", { name: "View 2" }));
  expect(within(dialog).getByRole("img")).toHaveAttribute("src", "/catalogue/puff-side.webp");
  await userEvent.keyboard("{Escape}");
  rerender(<VisualOptions kind="sleeve" options={[{ ...record, imageUrl: "/catalogue/new-front.webp", images: [{ id: "new", url: "/catalogue/new-front.webp" }] }]} onSelect={vi.fn()} />);
  expect(screen.getByRole("img", { name: "Puff Sleeve design option" })).toHaveAttribute("src", "/catalogue/new-front.webp");
});

it("keeps loading, failed and genuinely empty option results distinct", () => {
  const { rerender } = render(<VisualOptions kind="sleeve" options={[]} loading onSelect={vi.fn()} />);
  expect(screen.queryByText(/No compatible options/)).not.toBeInTheDocument();
  rerender(<VisualOptions kind="sleeve" options={[]} error={new Error("Connection lost")} onSelect={vi.fn()} />);
  expect(screen.queryByText(/No compatible options/)).not.toBeInTheDocument();
  rerender(<VisualOptions kind="sleeve" options={[]} onSelect={vi.fn()} />);
  expect(screen.getByText(/No compatible options/)).toBeInTheDocument();
});
