import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
const boundary = vi.hoisted(() => ({ api: vi.fn(), auth: {}, site: {} }));
vi.mock("../lib/api", async (original) => ({ ...(await original()), api: boundary.api }));
vi.mock("../lib/auth", () => ({ useAuth: () => boundary.auth }));
vi.mock("../lib/hooks", async (original) => ({ ...(await original()), useSite: () => boundary.site }));
import { HomeCarousel } from "../components/HomeCarousel";
import { Layout } from "../components/Layout";
import { Catalogue, Contact, DesignCard, DesignDetails, Home, HowItWorks, Login } from "../pages/Public";
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

it("refreshes exact previous homepage templates in either language without changing saved records", () => {
  const hero = {
    eyebrow: "CUSTOM STITCHING · EMBROIDERY · MADE TO ORDER",
    eyebrowHi: "कस्टम सिलाई · कढ़ाई · आपकी पसंद पर",
    headline: "Stitching & embroidery, made for you.",
    headlineHi: "आपकी पसंद की सिलाई और कढ़ाई।",
    description: DEFAULT_HOMEPAGE.hero.description,
    descriptionHi: DEFAULT_HOMEPAGE.hero.descriptionHi,
    imageMediaId: "a".repeat(24), imageUrl: "https://images.example.test/owner.webp",
    primaryCtaLabel: "Owner catalogue", primaryCtaLabelHi: "हमारे डिज़ाइन",
    secondaryCtaLabel: "Owner reference", secondaryCtaLabelHi: "अपनी तस्वीर",
  };
  const footer = {
    description: "Made-to-order stitching & embroidery. Your fabric, your personal touch.",
    descriptionHi: "आपकी पसंद की सिलाई और कढ़ाई। आपका कपड़ा, आपके नाप की पोशाक।",
  };
  const before = structuredClone({ hero, footer });
  for (const language of ["en", "hi"]) {
    const suffix = language === "hi" ? "Hi" : "";
    expect(homepageBlock(hero, DEFAULT_HOMEPAGE.hero, ["eyebrow", "headline", "description"], language)).toEqual({
      eyebrow: DEFAULT_HOMEPAGE.hero["eyebrow" + suffix],
      headline: DEFAULT_HOMEPAGE.hero["headline" + suffix],
      description: DEFAULT_HOMEPAGE.hero["description" + suffix],
    });
    const olderFooter = {
      description: "Custom stitching on your fabric. Design, measurements, price and delivery are confirmed before work begins.",
      descriptionHi: "आपके कपड़े पर आपकी पसंद की सिलाई। काम शुरू होने से पहले डिज़ाइन, नाप, कीमत और डिलीवरी की पुष्टि की जाती है।",
    };
    expect(homepageBlock(olderFooter, DEFAULT_HOMEPAGE.footer, ["description"], language).description).toBe(DEFAULT_HOMEPAGE.footer["description" + suffix]);
    expect(homepageBlock(footer, DEFAULT_HOMEPAGE.footer, ["description"], language)).toEqual({
      description: DEFAULT_HOMEPAGE.footer["description" + suffix],
    });
    expect(homepageBlock(hero, DEFAULT_HOMEPAGE.hero, ["primaryCtaLabel", "secondaryCtaLabel"], language)).toEqual({
      primaryCtaLabel: hero["primaryCtaLabel" + suffix], secondaryCtaLabel: hero["secondaryCtaLabel" + suffix],
    });
  }
  expect({ hero, footer }).toEqual(before);
});

it("refreshes only documented older defaults and preserves custom embroidery copy", () => {
  const hero = {
    eyebrow: "WELCOME TO KHWAB STITCH • CUSTOM STITCHING ON YOUR FABRIC",
    eyebrowHi: "ख्वाब स्टिच में आपका स्वागत है • आपके कपड़े पर कस्टम सिलाई",
    headline: "Your fabric, your design — stitched to your exact fit.",
    headlineHi: "आपका कपड़ा, आपकी पसंद का डिज़ाइन — आपके सटीक नाप की सिलाई।",
    description: "Tailor-stitched on your fabric to your exact measurements, with doorstep pickup & delivery.",
    descriptionHi: "आपके अपने कपड़े पर सटीक नाप की दर्ज़ी सिलाई — घर से पिकअप और डिलीवरी।",
  };
  for (const language of ["en", "hi"]) {
    const suffix = language === "hi" ? "Hi" : "";
    expect(homepageBlock(hero, DEFAULT_HOMEPAGE.hero, ["eyebrow", "headline", "description"], language)).toEqual({
      eyebrow: DEFAULT_HOMEPAGE.hero["eyebrow" + suffix], headline: DEFAULT_HOMEPAGE.hero["headline" + suffix],
      description: DEFAULT_HOMEPAGE.hero["description" + suffix],
    });
  }
  const custom = { ...hero, headline: "Our embroidery ideas, tailored your way.", description: "A personally written owner description.",
    headlineHi: "आपकी कढ़ाई, हमारी सिलाई।", descriptionHi: "यह मालिक का अपना परिचय है।" };
  expect(homepageBlock(custom, DEFAULT_HOMEPAGE.hero, ["eyebrow", "headline", "description"], "en")).toEqual({
    eyebrow: DEFAULT_HOMEPAGE.hero.eyebrow, headline: custom.headline, description: custom.description,
  });
  expect(homepageBlock(custom, DEFAULT_HOMEPAGE.hero, ["eyebrow", "headline", "description"], "hi")).toEqual({
    eyebrow: DEFAULT_HOMEPAGE.hero.eyebrowHi, headline: custom.headlineHi, description: custom.descriptionHi,
  });
  const customFooter = { description: "Embroidery requests are discussed personally.", descriptionHi: "कढ़ाई के बारे में हमसे बात करें।" };
  expect(homepageBlock(customFooter, DEFAULT_HOMEPAGE.footer, ["description"], "en").description).toBe(customFooter.description);
  expect(homepageBlock(customFooter, DEFAULT_HOMEPAGE.footer, ["description"], "hi").description).toBe(customFooter.descriptionHi);
  expect(homepageBlock({ ...custom, descriptionHi: "" }, DEFAULT_HOMEPAGE.hero, ["eyebrow", "headline", "description"], "hi")).toEqual({
    eyebrow: DEFAULT_HOMEPAGE.hero.eyebrowHi, headline: DEFAULT_HOMEPAGE.hero.headlineHi, description: DEFAULT_HOMEPAGE.hero.descriptionHi,
  });
});

it("shows four static stitching frames while keeping genuine design and request actions", () => {
  const { container } = mount(<Home />);
  const hero = container.querySelector(".home-hero");
  const frames = hero.querySelectorAll("ol.stitch-journey > li[data-stage]");
  expect(Array.from(frames, (frame) => frame.dataset.stage)).toEqual(["fabric", "design", "stitch", "wear"]);
  for (const frame of frames) {
    expect(frame.querySelector(".stitch-frame-media > img")).toHaveAttribute("alt", expect.any(String));
    expect(frame.querySelector(".stitch-frame-media > img").alt).not.toBe("");
    expect(frame.querySelector("a, button, input, select, [role='button'], [tabindex]")).toBeNull();
  }
  expect(within(hero).getByRole("heading", { level: 1 })).toHaveTextContent(DEFAULT_HOMEPAGE.hero.headline);
  expect(within(hero).getByRole("heading", { level: 1 }).textContent).not.toMatch(/embroidery/i);
  expect(within(hero).getByRole("link", { name: DEFAULT_HOMEPAGE.hero.primaryCtaLabel })).toHaveAttribute("href", "/catalogue");
  expect(within(hero).getByRole("link", { name: DEFAULT_HOMEPAGE.hero.secondaryCtaLabel })).toHaveAttribute("href", "/request?source=reference");
  expect(within(hero).getByText(t("atelier.quote"))).toBeInTheDocument();
  act(() => setLanguage("hi", false));
  expect(within(hero).getByRole("heading", { level: 1 })).toHaveTextContent(DEFAULT_HOMEPAGE.hero.headlineHi);
  expect(within(hero).getByText(t("atelier.quote"))).toBeInTheDocument();
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
  const previousOverflow = document.body.style.overflow;
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(document.body.style.overflow).toBe("hidden");
  expect(document.querySelector("main")).toHaveAttribute("inert");
  expect(document.querySelector("footer")).toHaveAttribute("inert");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveFocus();
  expect(document.body.style.overflow).toBe(previousOverflow);
  expect(document.querySelector("main")).not.toHaveAttribute("inert");
  expect(document.querySelector("footer")).not.toHaveAttribute("inert");
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

it("shows request-based services, real catalogue prices and configured support hours without promising pickup", async () => {
  boundary.site.garmentBasePrices = { kurti: 55000 };
  boundary.site.support = { timezone: "Asia/Kolkata", responseHours: 6, startHour: 10, endHour: 18, weekdays: [1, 2, 3, 4, 5, 6] };
  render(<MemoryRouter><Routes><Route element={<Layout />}><Route path="/" element={<Home />} /></Route></Routes></MemoryRouter>);
  const collection = screen.getByRole("region", { name: t("public.collection.title") });
  const garments = await screen.findByRole("region", { name: t("public.garments.title") });
  const kurti = within(garments).getByRole("link", { name: t("public.garment.kurti") });
  expect(kurti).toHaveAttribute("href", "/catalogue?garment=kurti");
  expect(kurti).toHaveTextContent("₹550");
  expect(within(garments).queryByRole("link", { name: t("public.garment.blouse") })).not.toBeInTheDocument();
  expect(within(collection).getByText("₹650.25")).toBeInTheDocument();
  expect(within(collection).getByText(t("public.card.customBadge"))).toBeInTheDocument();
  expect(within(collection).getByText(t("public.card.choose"))).toBeInTheDocument();
  expect(within(document.querySelector(".home-hero")).getByRole("link", { name: t("public.action.reference") })).toHaveAttribute("href", "/request?source=reference");
  expect(screen.queryByRole("heading", { name: "Stitched your way." })).not.toBeInTheDocument();
  expect(document.querySelector(".atelier-garment-links")).not.toBeInTheDocument();
  expect(screen.getByText(t("atelier.quote"))).toBeInTheDocument();
  expect(screen.queryByText(t("public.hero.chip3"))).not.toBeInTheDocument();
  expect(screen.getByText("Support hours (Mon–Sat): 10:00 AM–6:00 PM IST")).toBeInTheDocument();
  act(() => setLanguage("hi", false));
  expect(screen.getByText("सहायता समय (सोम–शनि): 10:00 AM–6:00 PM IST")).toBeInTheDocument();
  expect(screen.getByText(t("atelier.quote"))).toBeInTheDocument();
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
  const journey = document.querySelector("ol.stitch-journey");
  expect(Array.from(journey.querySelectorAll("li[data-stage]"), (frame) => frame.dataset.stage)).toEqual(["fabric", "design", "stitch", "wear"]);
  expect(journey.querySelector("a, button, input, select, [role='button'], [tabindex]" )).toBeNull();
  expect(screen.queryByText(t("public.hero.chip3"))).not.toBeInTheDocument();
  act(() => setLanguage("hi", false));
  expect(screen.getByRole("link", { name: "दर्ज़ी डिज़ाइन देखें" })).toBeInTheDocument();
  expect(screen.queryByText(t("public.hero.chip3"))).not.toBeInTheDocument();
});

it("explains four bilingual steps with fabric, quote approval and conditional pickup", () => {
  mount(<HowItWorks />);
  expect(screen.getByRole("heading", { level: 1, name: "Simple, transparent stitching from your home." })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
  for (const step of DEFAULT_HOMEPAGE.process) {
    expect(screen.getByRole("heading", { level: 2, name: step.title })).toBeInTheDocument();
    expect(screen.getByText(step.description)).toBeInTheDocument();
  }
  expect(screen.getByText(t("atelier.how.intro"))).toBeInTheDocument();
  expect(screen.getByText(t("atelier.how.pickup"))).toBeInTheDocument();
  expect(screen.getByText(t("atelier.how.review"))).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Start your stitching request" })).toHaveAttribute("href", "/request");
  expect(screen.getByRole("link", { name: t("public.action.guidance") })).toHaveAttribute("href", "/contact");
  act(() => setLanguage("hi", false));
  expect(screen.getByRole("heading", { level: 1, name: "आपके घर से आसान और पारदर्शी कस्टम सिलाई।" })).toBeInTheDocument();
  for (const step of DEFAULT_HOMEPAGE.process) {
    expect(screen.getByRole("heading", { level: 2, name: step.titleHi })).toBeInTheDocument();
    expect(screen.getByText(step.descriptionHi)).toBeInTheDocument();
  }
  expect(screen.getByText(t("atelier.how.pickup"))).toBeInTheDocument();
  expect(screen.getByText(t("atelier.how.review"))).toBeInTheDocument();
});

it("offers real support when contact channels are missing and never shows empty social cards", () => {
  mount(<Contact />);
  expect(screen.getByRole("link", { name: t("public.action.guidance") })).toHaveAttribute("href", "/account/support");
  expect(screen.queryByRole("link", { name: "Visit Instagram" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Chat on WhatsApp" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "A little inspiration" })).not.toBeInTheDocument();
  expect(screen.getByText(t("atelier.contact.note"))).toBeInTheDocument();
});

it("uses only configured contact links and retains owner FAQs", () => {
  boundary.site = {
    ...boundary.site, whatsapp: "+91 98765 43210", contactEmail: "atelier@example.test", instagram: "https://www.instagram.com/khwab_stitch/",
    faqs: [{ question: "Can I bring my own fabric?", questionHi: "क्या मैं अपना कपड़ा ला सकती हूँ?", answer: "Yes, please arrange handover first.", answerHi: "हाँ, पहले कपड़ा देने का समय तय करें।" }],
  };
  mount(<Contact />);
  expect(screen.getByRole("link", { name: "Chat on WhatsApp" })).toHaveAttribute("href", "https://wa.me/919876543210");
  expect(screen.getByRole("link", { name: "atelier@example.test" })).toHaveAttribute("href", "mailto:atelier@example.test");
  expect(screen.getByRole("link", { name: "Visit Instagram" })).toHaveAttribute("href", "https://www.instagram.com/khwab_stitch/");
  expect(screen.queryByRole("link", { name: t("public.action.guidance") })).not.toBeInTheDocument();
  expect(screen.getByText("Can I bring my own fabric?")).toBeInTheDocument();
  act(() => setLanguage("hi", false));
  expect(screen.getByText("क्या मैं अपना कपड़ा ला सकती हूँ?")).toBeInTheDocument();
});
it("renders unified Fit & Design Guides without duplicate poster cards or Price after review overlays", async () => {
  const { container } = mount(<Home />);
  expect(container.querySelector(".home-guides-grid")).not.toBeInTheDocument();
  expect(container.querySelector(".tailoring-card-price-badge")).not.toBeInTheDocument();
  expect(screen.queryByText("Price after review")).not.toBeInTheDocument();
  await userEvent.click(screen.getByText(t("public.help.guides")));
  const measurementTab = screen.getByRole("tab", { name: "Measurement Guide" });
  expect(measurementTab).toBeInTheDocument();
  await userEvent.click(measurementTab);
  expect(screen.getByRole("heading", { level: 3, name: "Full Measurement Guide" })).toBeInTheDocument();
});

it("keeps homepage process steps to concise headings only and allows short existing login passwords", async () => {
  const { container } = mount(<Home />);
  const processCards = container.querySelectorAll(".home-process-grid li");
  expect(processCards).toHaveLength(4);
  for (const card of processCards) expect(card.querySelector("p")).toBeNull();

  const login = vi.fn().mockResolvedValue({});
  boundary.auth = { ...boundary.auth, login, register: vi.fn(), google: vi.fn(), loading: false, hasSession: false };
  mount(<Login />);
  await userEvent.type(screen.getByLabelText("Email address"), "customer@example.test");
  await userEvent.type(screen.getByLabelText("Password"), "shortpass");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(login).toHaveBeenCalledWith({ email: "customer@example.test", password: "shortpass" });
});

it("previews generated catalogue angles without navigating or changing the selected design link", async () => {
  const item = { ...design, code: "DEMO-K01", slug: "demo-cotton-kurti", title: "Everyday cotton kurti" };
  const { container } = mount(<DesignCard design={item} />);
  const user = userEvent.setup();
  const views = screen.getByRole("group", { name: "Preview views for Everyday cotton kurti" });
  expect(within(views).getByRole("button", { name: "Front view" })).toHaveAttribute("aria-pressed", "true");
  await user.click(within(views).getByRole("button", { name: "Back view" }));
  expect(within(views).getByRole("button", { name: "Back view" })).toHaveAttribute("aria-pressed", "true");
  expect(container.querySelector(".design-image svg")).toHaveAttribute("viewBox", "768 0 384 1024");
  expect(screen.getByRole("link", { name: /Everyday cotton kurti/ })).toHaveAttribute("href", "/designs/demo-cotton-kurti");
  expect(container.querySelector("a button")).toBeNull();
  act(() => setLanguage("hi", false));
  expect(screen.getByRole("button", { name: "पीछे से" })).toHaveAttribute("aria-pressed", "true");
});

it("uses one photographic image per available homepage garment instead of an SVG sketch", async () => {
  const { container } = mount(<Home />);
  const region = await screen.findByRole("region", { name: t("public.garments.title") });
  const card = within(region).getByRole("link", { name: t("public.garment.kurti") });
  expect(within(card).getByRole("img")).toHaveAttribute("src", "/atelier/catalogue/cotton-kurti/category.webp");
  expect(card.querySelectorAll("img")).toHaveLength(1);
  expect(card.querySelector("svg.garment-art")).toBeNull();
  expect(container.querySelector(".atelier-garment-art")).toBeNull();
});

it("keeps alteration previews focused on the work in a stable card frame", async () => {
  const item = { ...design, garment: "alteration", code: "DEMO-A01", slug: "demo-alteration", title: "A better fit" };
  const { container } = mount(<DesignCard design={item} />);
  const frame = container.querySelector(".design-image");
  const originalPhoto = container.querySelector(".design-photo").getAttribute("viewBox");
  expect(frame).not.toHaveClass("is-board");
  expect(screen.queryByRole("button", { name: "Front view" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Hem shortening" }));
  expect(screen.getByRole("button", { name: "Hem shortening" })).toHaveAttribute("aria-pressed", "true");
  expect(container.querySelector(".design-photo").getAttribute("viewBox")).not.toBe(originalPhoto);
  expect(frame).not.toHaveClass("is-board");
  expect(screen.getByRole("link", { name: /A better fit/ })).toHaveAttribute("href", "/designs/demo-alteration");
});
