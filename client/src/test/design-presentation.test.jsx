import { afterEach, beforeEach, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DesignPresentation } from "../components/DesignGallery";
import { LanguageProvider } from "../i18n/Language";
import { setLanguage, t } from "../i18n/core";
import { withProductionDesignDetails } from "../lib/design-presentation";

const alteration = () => ({
  _id: "6aec91f75fea93612231bd83",
  code: "A-0",
  slug: "demo-alteration",
  garment: "alteration",
  title: "Garment Fit & Alterations",
  titleHi: "कपड़ों की फिटिंग और अल्टरेशन",
  description: "Adjust the fit and finish of the garment you already own.",
  descriptionHi: "अपने मौजूदा कपड़े की फिटिंग और फिनिश ठीक कराएँ।",
  startingPricePaise: 15000,
  designDetails: {
    scope: "Waist fit, sleeves, hems and shoulder adjustments after garment review.",
    scopeHi: "कपड़े की जाँच के बाद कमर, आस्तीन, घेरे और कंधे की फिटिंग में बदलाव।",
  },
});
function mount(design) {
  return render(<LanguageProvider><MemoryRouter><DesignPresentation design={design} /></MemoryRouter></LanguageProvider>);
}
beforeEach(() => setLanguage("en", false));
afterEach(() => act(() => setLanguage("en", false)));

it("presents alterations as a service with visible scope and a matching request action", () => {
  const design = alteration();
  const { container } = mount(design);
  expect(screen.getByRole("heading", { level: 1, name: design.title })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Request alterations" })).toHaveAttribute("href", "/request?design="+design._id+"&garment=alteration");
  expect(screen.queryByRole("link", { name: "Make this design yours" })).toBeNull();
  expect(screen.queryByText("Fabric provided by customer.")).toBeNull();
  expect(screen.queryByText("Embroidery and extra work are quoted separately.")).toBeNull();
  const details = container.querySelector(".design-more-details");
  expect(details).toHaveAttribute("open");
  expect(within(details).getByText(design.designDetails.scope)).toBeVisible();
  expect(screen.queryByText("₹150")).not.toBeInTheDocument();
  expect(screen.getByText(t("public.design.alterationPrice"))).toBeInTheDocument();
  expect(screen.getByLabelText(t("public.design.serviceCode"))).toHaveTextContent("A-0");
});
it("renders the service, guidance and request action in Hindi", () => {
  setLanguage("hi", false);
  const design=alteration();
  const {container}=mount(design);
  expect(screen.getByRole("heading", { level: 1, name: design.titleHi })).toBeInTheDocument();
  const link=screen.getByRole("link", {name:t("public.design.alterationCta")});
  expect(link).not.toHaveTextContent("public.design.");
  expect(link).toHaveAttribute("href", "/request?design="+design._id+"&garment=alteration");
  const details=container.querySelector(".design-more-details");
  expect(within(details).getByText(design.designDetails.scopeHi)).toBeVisible();
  expect(within(details).getByText("कपड़े की हालत, अंदर बचा कपड़ा, अस्तर और बनावट से तय होगा कि कौन-से बदलाव संभव हैं।")).toBeVisible();
  expect(within(details).getByText(design.descriptionHi)).toBeVisible();
});
it("does not display a missing starting price as a free service", () => {
  mount({...alteration(), startingPricePaise:undefined});
  expect(screen.getByText(t("public.design.alterationPrice"))).toBeInTheDocument();
  expect(screen.queryByText("₹0")).toBeNull();
});
it("supplies only missing review guidance while preserving supplied service data and price", () => {
  const source=Object.freeze(alteration());
  const details=source.designDetails;
  const enriched=withProductionDesignDetails(source);
  expect(enriched.designDetails.scope).toBe(details.scope);
  expect(enriched.designDetails.scopeHi).toBe(details.scopeHi);
  expect(enriched.designDetails.preparation).toContain("Bring the garment");
  expect(enriched.designDetails.preparationHi).toContain("जिस कपड़े");
  expect(enriched.startingPricePaise).toBe(source.startingPricePaise);
  expect(enriched._id).toBe(source._id);
  expect(source.designDetails).toBe(details);
  expect(source.designDetails.preparation).toBeUndefined();
  expect(withProductionDesignDetails(enriched)).toBe(enriched);
});
