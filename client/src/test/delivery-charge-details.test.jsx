import { afterEach, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { DeliveryChargeDetails } from "../components/DeliveryChargeDetails";
import { setLanguage, t } from "../i18n/core";

afterEach(() => act(() => setLanguage("en", false)));
const distance = { code:"transport:inbound",method:"business",pricingMode:"distance",distanceBasis:"pin_area",distanceMeters:4201,billableKm:5,formula:"base_plus_distance",minimumChargePaise:4000,perKmPaise:800,amountPaise:8000,distanceSource:"GeoNames",distanceSourceVersion:"fixture" };
const courier = { code:"transport:outbound",method:"business",pricingMode:"courier",provider:"shiprocket",courierName:"Blue Dart",service:"Surface",carrierQuotePaise:7700,minimumAdjustmentPaise:2300,minimumChargePaise:10000,amountPaise:10000,parcel:{weightGrams:750},chargeableWeightGrams:1000 };
it("shows the approximate PIN-area distance, rounded billable km, plus formula and GeoNames source", () => {
  render(<DeliveryChargeDetails line={distance} />);
  const details=screen.getByRole("note",{name:t("delivery.details.label")});
  expect(within(details).getByText("Approx. 4.201 km between PIN areas · Billed for 5 km")).toBeInTheDocument();
  expect(within(details).getByText("Minimum ₹40 + 5 km × ₹8 per km")).toBeInTheDocument();
  expect(within(details).getByText(t("delivery.details.approximate"))).toBeInTheDocument();
  expect(within(details).getByRole("link",{name:"GeoNames"})).toHaveAttribute("href","https://www.geonames.org/");
  expect(within(details).getByRole("link",{name:"GeoNames"})).toHaveAttribute("rel","noopener noreferrer");
});
it("uses the declared minimum-fare formula and preserves explicit zero-km and zero-rate inputs", () => {
  render(<DeliveryChargeDetails line={{...distance,distanceMeters:0,billableKm:0,minimumChargePaise:0,perKmPaise:0,formula:"minimum_fare",amountPaise:0,distanceSource:"Owner verified coordinates"}} />);
  expect(screen.getByText("Approx. 0 km between PIN areas · Billed for 0 km")).toBeInTheDocument();
  expect(screen.getByText("Higher of minimum ₹0 or 0 km × ₹0 per km")).toBeInTheDocument();
  expect(screen.queryByRole("link",{name:"GeoNames"})).not.toBeInTheDocument();
});
it("separates the actual courier quote from an atelier minimum adjustment and explains chargeable weight", () => {
  render(<DeliveryChargeDetails line={courier} />);
  const details=screen.getByRole("note",{name:t("delivery.details.label")});
  expect(within(details).getByText("Shiprocket · Blue Dart · Surface")).toBeInTheDocument();
  expect(within(details).getByText("Courier quote")).toBeInTheDocument();
  expect(within(details).getByText("₹77")).toBeInTheDocument();
  expect(within(details).getByText("Minimum-charge adjustment")).toBeInTheDocument();
  expect(within(details).getByText("+₹23")).toBeInTheDocument();
  expect(within(details).getByText("Atelier minimum transport charge: ₹100")).toBeInTheDocument();
  expect(within(details).getByText("Parcel 0.75 kg · Courier chargeable weight 1 kg")).toBeInTheDocument();
});
it("omits an unused minimum adjustment and avoids duplicate provider/carrier names", () => {
  render(<DeliveryChargeDetails line={{...courier,provider:"delhivery",courierName:"Delhivery",minimumAdjustmentPaise:0,amountPaise:7700}} />);
  expect(screen.getByText("Delhivery · Surface")).toBeInTheDocument();
  expect(screen.queryByText("Minimum-charge adjustment")).not.toBeInTheDocument();
  expect(screen.queryByText(/Atelier minimum/)).not.toBeInTheDocument();
});
it("returns no detail panel for fixed or self-arranged transport, pending pricing or malformed metadata", () => {
  const view=render(<DeliveryChargeDetails />);
  const cases=[null,{}, {pricingMode:"service_areas"}, {pricingMode:"distance"}, {...distance,method:"customer_courier"}, {...distance,amountPaise:null}, {...distance,distanceMeters:NaN}, {...distance,distanceMeters:-1}, {...distance,billableKm:4}, {...distance,minimumChargePaise:null}, {...distance,formula:"custom-expression"}, {...distance,distanceBasis:"road"}, {pricingMode:"courier",provider:"shiprocket"}, {...courier,provider:"unknown"}, {...courier,carrierQuotePaise:-1}, {...courier,minimumAdjustmentPaise:null}];
  for(const line of cases){view.rerender(<DeliveryChargeDetails line={line} />);expect(screen.queryByRole("note")).not.toBeInTheDocument();}
});
it("updates formula, carrier and weight explanations when the language changes", () => {
  const view=render(<DeliveryChargeDetails line={distance} />);
  act(()=>setLanguage("hi",false));
  expect(screen.getByRole("note",{name:t("delivery.details.label")})).toBeInTheDocument();
  expect(screen.getByText(t("delivery.details.approximate"))).toBeInTheDocument();
  view.rerender(<DeliveryChargeDetails line={courier} />);
  expect(screen.getByText(t("delivery.details.carrierQuote"))).toBeInTheDocument();
  expect(screen.getByText(t("delivery.details.minimumAdjustment"))).toBeInTheDocument();
  expect(screen.getByText(t("delivery.details.weights",{0:"0.75",1:"1"}))).toBeInTheDocument();
});
