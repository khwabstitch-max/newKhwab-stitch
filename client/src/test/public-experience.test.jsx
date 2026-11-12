import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {}, site: {} }));
vi.mock("../lib/api", async (original) => ({ ...(await original()), api: boundary.api }));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
vi.mock("../lib/hooks", async (original) => ({ ...(await original()), useSite: () => boundary.site }));
import { HomeCarousel } from "../components/HomeCarousel";
import { Layout } from "../components/Layout";
import { Catalogue, DesignDetails, Home, HowItWorks } from "../pages/Public";
import { DEFAULT_HOMEPAGE } from "../data/homepage";
import { eligibleHomepageSlides, homepageBlock, publicHref } from "../lib/public-homepage";
import { setLanguage, t } from "../i18n/core";

const now = Date.parse("2026-11-12T06:00:00Z");
const slide = (id, changes = {}) => ({
  id, kind: "featured", active: true, title: `Design ${id}`, titleHi: `डिज़ाइन ${id}`,
  description: "Choose a stitching reference.", descriptionHi: "सिलाई के लिए डिज़ाइन चुनें।",
  actionLabel: "View designs", actionLabelHi: "डिज़ाइन देखें", href: "/catalogue", ...changes,
});
const design = { _id: "a".repeat(24), slug: "petal-kurti", code: "KS-PETAL", title: "Petal kurti", garment: "kurti", startingPricePaise: 65025, description: "Customer-fabric stitching", images: [] };
const list = (data, pages = 1) => ({ data, pagination: { page: 1, pages, total: data.length } });
function Probe() { const location = useLocation(); return <output data-testid="route">{location.pathname + location.search}</output>; }
const mount = (element) => render(<MemoryRouter>{element}</MemoryRouter>);
beforeEach(() => {
  setLanguage("en", false);
  boundary.auth = { user: null, profile: null, logout: vi.fn() };
  boundary.site = { homepage: structuredClone(DEFAULT_HOMEPAGE), faqs: [] };
  boundary.api.mockReset().mockImplementation(async (path) => path.startsWith("/designs") ? list([design], 2) : path.startsWith("/services") ? list([{ itemTypes: ["kurti"] }]) : list([]));
});
afterEach(() => { act(() => setLanguage("en", false)); vi.useRealTimers(); vi.restoreAllMocks(); });

it("filters unpublished schedules, unavailable offers and unsafe actions without inventing promotions", () => {
  const records = [slide("available"), slide("inactive", { active: false }), slide("future", { startsAt: "2026-11-13T00:00:00Z" }),
    slide("expired", { endsAt: "2026-11-12T06:00:00Z" }), slide("invalid", { endsAt: "not-a-date" }),
    slide("unsafe", { href: "//elsewhere.example" }), slide("offer", { kind: "offer", terms: "A current quote is required.", termsHi: "वर्तमान कोटेशन ज़रूरी है।", offer: { available: false } })];
  expect(eligibleHomepageSlides(records, "en", now).map(record => record.id)).toEqual(["available"]);
  expect(publicHref("/catalogue?garment=blouse")).toBe("/catalogue?garment=blouse");
  expect(publicHref("/\\elsewhere.example")).toBe("");
  expect(eligibleHomepageSlides([], "en", now)).toEqual([]);
});

it("uses a complete Hindi block and hides promotions with missing Hindi terms", () => {
  expect(homepageBlock({ headline: "English owner text", headlineHi: "अधूरा अनुवाद" }, DEFAULT_HOMEPAGE.hero, ["eyebrow", "headline", "description"], "hi")).toEqual({
    eyebrow: DEFAULT_HOMEPAGE.hero.eyebrowHi, headline: DEFAULT_HOMEPAGE.hero.headlineHi, description: DEFAULT_HOMEPAGE.hero.descriptionHi,
  });
  expect(eligibleHomepageSlides([slide("partial", { descriptionHi: "" }), slide("offer", { kind: "offer", terms: "Approved terms", termsHi: "", offer: { available: true } })], "hi", now)).toEqual([]);
});

it("shows an offer only with backend availability and complete language-specific terms", () => {
  const offer = slide("offer", { kind: "offer", terms: "A current quote is required.", termsHi: "वर्तमान कोटेशन ज़रूरी है।", offer: { available: true, code: "STITCH15", type: "percentage", value: 1500, programmeTerms: "Quote approval is required.", programmeTermsHi: "कोटेशन की स्वीकृति ज़रूरी है।" } });
  expect(eligibleHomepageSlides([offer], "hi", now)).toEqual([offer]);
  expect(eligibleHomepageSlides([{ ...offer, offer: {} }], "en", now)).toEqual([]);
  expect(eligibleHomepageSlides([{ ...offer, offer: { ...offer.offer, value: undefined } }], "en", now)).toEqual([]);
});

it("shows real offer values, limits and programme terms without claiming personal eligibility", () => {
  mount(<HomeCarousel slides={[slide("offer", { kind: "offer", terms: "Approved offer terms.", termsHi: "ऑफ़र की शर्तें।", offer: {
    available: true, code: "STITCH15", type: "percentage", value: 1500, minimumStitchingPaise: 100000,
    maxDiscountPaise: 20000, garments: ["kurti"], perCustomerLimit: 1, programmeTerms: "Only the current accepted quote qualifies.", programmeTermsHi: "केवल वर्तमान स्वीकृत कोटेशन पर लागू।",
  } })]} />);
  expect(screen.getByText("15%")).toBeInTheDocument();
  expect(screen.getByText("₹1,000")).toBeInTheDocument();
  expect(screen.getByText("₹200")).toBeInTheDocument();
  expect(screen.getByText("STITCH15")).toBeInTheDocument();
  expect(screen.getByText("Only the current accepted quote qualifies.")).toBeInTheDocument();
  expect(screen.getByText(t("public.promo.offerNote"))).toBeInTheDocument();
});

it("renders a single highlight without misleading carousel controls", () => {
  mount(<HomeCarousel slides={[slide("one")]} />);
  expect(screen.getByRole("heading", { name: "Design one" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: t("public.promo.next") })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View designs" })).toHaveAttribute("href", "/catalogue");
});

it("supports manual keyboard, touch and button navigation while preserving the selected highlight across languages", async () => {
  mount(<HomeCarousel slides={[slide("one"), slide("two")]} />);
  const carousel = screen.getByRole("region", { name: t("public.promo.label") });
  fireEvent.keyDown(carousel, { key: "ArrowRight" });
  expect(screen.getByRole("heading", { name: "Design two" })).toBeInTheDocument();
  act(() => setLanguage("hi", false));
  expect(screen.getByRole("heading", { name: "डिज़ाइन two" })).toBeInTheDocument();
  fireEvent.touchStart(carousel, { touches: [{ clientX: 30 }] });
  fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 130 }] });
  expect(screen.getByRole("heading", { name: "डिज़ाइन one" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: t("public.promo.next") }));
  expect(screen.getByRole("heading", { name: "डिज़ाइन two" })).toBeInTheDocument();
});

it("does not autoplay and removes an expired promotion at its configured deadline", async () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  mount(<HomeCarousel slides={[slide("one", { endsAt: new Date(now + 1000).toISOString() }), slide("two")]} />);
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(screen.getByRole("heading", { name: "Design one" })).toBeInTheDocument();
  await act(async () => vi.advanceTimersByTimeAsync(501));
  expect(screen.queryByRole("heading", { name: "Design one" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Design two" })).toBeInTheDocument();
});

it("rejects already expired slides arriving after a slow settings response", () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const view = mount(<HomeCarousel slides={[]} />);
  vi.setSystemTime(now + 2000);
  view.rerender(<MemoryRouter><HomeCarousel slides={[slide("late", { endsAt: new Date(now + 1000).toISOString() })]} /></MemoryRouter>);
  expect(screen.queryByRole("heading", { name: "Design late" })).not.toBeInTheDocument();
});

it("keeps the fabric proposition visible with functional guest actions and actual configured garment links", async () => {
  mount(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: DEFAULT_HOMEPAGE.hero.headline })).toBeInTheDocument();
  expect(screen.getByText(DEFAULT_HOMEPAGE.hero.eyebrow)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: t("public.action.explore") })).toHaveAttribute("href", "/catalogue");
  expect(screen.getByRole("link", { name: t("public.action.reference") })).toHaveAttribute("href", "/request?source=reference");
  for (const link of screen.getAllByRole("link", { name: t("public.action.guidance") })) expect(link).toHaveAttribute("href", "/contact");
  expect(await screen.findByRole("link", { name: "Kurtis" })).toHaveAttribute("href", "/catalogue?garment=kurti");
  expect(screen.queryByRole("link", { name: "Blouses" })).not.toBeInTheDocument();
  expect(await screen.findByText("KS-PETAL")).toBeInTheDocument();
  expect(screen.getByText("₹650.25")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: t("public.promo.label") })).not.toBeInTheDocument();
});

it("falls back as a whole to approved Hindi hero copy instead of mixing incomplete owner fields", () => {
  boundary.site.homepage.hero = { ...DEFAULT_HOMEPAGE.hero, headline: "English-only update", descriptionHi: "" };
  setLanguage("hi", false); mount(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: DEFAULT_HOMEPAGE.hero.headlineHi })).toBeInTheDocument();
  expect(screen.getByText(DEFAULT_HOMEPAGE.hero.descriptionHi)).toBeInTheDocument();
  expect(screen.queryByText("English-only update")).not.toBeInTheDocument();
});

it("provides working header search and closes mobile navigation with Escape, returning focus", async () => {
  render(<MemoryRouter><Routes><Route element={<Layout />}><Route path="*" element={<Probe />} /></Route></Routes></MemoryRouter>);
  const toggle = screen.getByRole("button", { name: t("public.nav.open") });
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveFocus();
  const search = screen.getByRole("searchbox", { name: t("public.nav.search") });
  await userEvent.type(search, "blue kurti");
  fireEvent.submit(search.form);
  expect(await screen.findByTestId("route")).toHaveTextContent("/catalogue?q=blue%20kurti");
});

it("keeps catalogue filters and search when returning from a design", async () => {
  boundary.api.mockImplementation(async path => path.startsWith("/designs/") ? { data: design } : list([design], 2));
  render(<MemoryRouter initialEntries={["/catalogue?garment=kurti&q=petal&page=2"]}><Routes><Route path="/catalogue" element={<Catalogue />} /><Route path="/designs/:slug" element={<DesignDetails />} /></Routes></MemoryRouter>);
  await userEvent.click(await screen.findByRole("link", { name: /Petal kurti/ }));
  const back = await screen.findByRole("link", { name: "Back to catalogue" });
  expect(back).toHaveAttribute("href", "/catalogue?garment=kurti&q=petal&page=2");
  await userEvent.click(back);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Search designs" })).toHaveValue("petal"));
  expect(screen.getByRole("button", { name: "Kurtis" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
});

it("displays informative service cards with configured starting prices, custom-stitching design labels, commitments, and footer support hours", async () => {
  boundary.site.garmentBasePrices = { kurti: 55000 };
  boundary.site.support = { timezone: "Asia/Kolkata", responseHours: 6, startHour: 10, endHour: 18, weekdays: [1, 2, 3, 4, 5, 6] };
  render(<MemoryRouter><Routes><Route element={<Layout />}><Route path="/" element={<Home />} /></Route></Routes></MemoryRouter>);
  expect(await screen.findByText(t("public.garmentDesc.kurti"))).toBeInTheDocument();
  expect(screen.getByText("₹550")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: t("public.garmentCta.kurti") })).toHaveAttribute("href", "/catalogue?garment=kurti");
  expect(screen.getByText(t("public.card.customBadge"))).toBeInTheDocument();
  expect(screen.getByText(t("public.card.choose"))).toBeInTheDocument();
  expect(screen.getByText(t("public.commitments.1"))).toBeInTheDocument();
  expect(screen.getByText("Support hours (Mon–Sat): 10:00 AM–6:00 PM IST")).toBeInTheDocument();
  act(() => setLanguage("hi", false));
  expect(screen.getByText("सहायता समय (सोम–शनि): 10:00 AM–6:00 PM IST")).toBeInTheDocument();
});

it("uses admin-configured hero photo and custom CTA labels when both languages are complete", () => {
  boundary.site.homepage.hero = {
    ...DEFAULT_HOMEPAGE.hero,
    imageUrl: "https://ik.imagekit.io/khwab/hero.webp",
    primaryCtaLabel: "Browse Tailor Designs",
    primaryCtaLabelHi: "दर्ज़ी डिज़ाइन देखें",
    secondaryCtaLabel: "Upload Inspiration",
    secondaryCtaLabelHi: "अपनी तस्वीर भेजें",
  };
  mount(<Home />);
  expect(screen.getByRole("link", { name: "Browse Tailor Designs" })).toHaveAttribute("href", "/catalogue");
  expect(screen.getByRole("link", { name: "Upload Inspiration" })).toHaveAttribute("href", "/request?source=reference");
  const heroImg = document.querySelector(".home-hero-image img");
  expect(heroImg).toHaveAttribute("src", "https://ik.imagekit.io/khwab/hero.webp");
  expect(heroImg).not.toHaveAttribute("loading", "lazy");
  expect(document.querySelector(".home-hero-image.has-photo")).toBeInTheDocument();
  expect(document.querySelector(".home-hero-showcase")).toBeInTheDocument();
  expect(screen.getByText(t("public.hero.cardTag"))).toBeInTheDocument();
  expect(screen.getByText(t("public.hero.chip3"))).toBeInTheDocument();
  act(() => setLanguage("hi", false));
  expect(screen.getByRole("link", { name: "दर्ज़ी डिज़ाइन देखें" })).toBeInTheDocument();
  expect(screen.getByText(t("public.hero.chip3"))).toBeInTheDocument();
});

it("explains the real customization, fabric guidance, and doorstep pickup workflow in English and Hindi", () => {
  mount(<HowItWorks />);
  expect(screen.getByRole("heading", { level: 1, name: "Simple, transparent stitching from your home." })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Choose our design or share your own" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Pick neck & sleeve styles step-by-step—or upload yours" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "Guidance from fabric buying to final fit" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "Doorstep fabric pickup & outfit delivery" })).toBeInTheDocument();
  act(() => setLanguage("hi", false));
  expect(screen.getByRole("heading", { level: 1, name: "आपके घर से आसान और पारदर्शी कस्टम सिलाई।" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "कपड़ा खरीदने से लेकर अंतिम फिटिंग तक पूरी मदद" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "घर से कपड़ा पिकअप और तैयार पोशाक की डिलीवरी" })).toBeInTheDocument();
});
