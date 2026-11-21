import { money } from "../lib/api";
import { getLocale, t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import "./delivery-charge-details.css";

const moneyValue = value => Number.isSafeInteger(value) && value >= 0;
const positiveWeight = value => Number.isFinite(value) && value > 0;
const formatted = value => new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 3 }).format(value);
const providerNames = { shiprocket: "Shiprocket", delhivery: "Delhivery", bluedart: "Blue Dart" };

export function DeliveryChargeDetails({ line }) {
  useLanguage();
  if (!line || (line.method && line.method !== "business") || line.amountPaise === null || line.pending) return null;
  const hasPins = /^[1-9][0-9]{5}$/.test(line.originPin || "") && /^[1-9][0-9]{5}$/.test(line.destinationPin || "");
  if (line.pricingMode === "distance") {
    const complete = Number.isFinite(line.distanceMeters) && line.distanceMeters >= 0 &&
      Number.isSafeInteger(line.billableKm) && line.billableKm >= 0 &&
      line.billableKm === Math.ceil(line.distanceMeters / 1000) &&
      moneyValue(line.minimumChargePaise) && moneyValue(line.perKmPaise) &&
      ["base_plus_distance", "minimum_fare"].includes(line.formula) &&
      (!line.distanceBasis || line.distanceBasis === "pin_area");
    if (!complete) return null;
    return <div className="delivery-charge-details" role="note" aria-label={t("delivery.details.label")}>
      {hasPins && <p>{t("delivery.details.pinAreas", { 0: line.originPin, 1: line.destinationPin })}</p>}
      <p>{t("delivery.details.distance", { 0: formatted(line.distanceMeters / 1000), 1: formatted(line.billableKm) })}</p>
      <p>{t(line.formula === "minimum_fare" ? "delivery.details.minimumFormula" : "delivery.details.plusFormula", { 0: money(line.minimumChargePaise), 1: formatted(line.billableKm), 2: money(line.perKmPaise) })}</p>
      <p className="delivery-charge-basis">{t("delivery.details.approximate")}</p>
      {/geonames/i.test(line.distanceSource || "") && <p className="delivery-charge-source">{t("delivery.details.source")} <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a></p>}
    </div>;
  }
  if (line.pricingMode === "courier") {
    const provider = Object.hasOwn(providerNames, line.provider) ? providerNames[line.provider] : null;
    if (!provider || !moneyValue(line.carrierQuotePaise) || (line.minimumAdjustmentPaise !== undefined && !moneyValue(line.minimumAdjustmentPaise))) return null;
    const carrier = [provider, line.courierName, line.service].filter(value => typeof value === "string" && value.trim()).filter((value, index, values) => values.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index).join(" · ");
    const actualWeight = positiveWeight(line.parcel?.weightGrams) ? line.parcel.weightGrams : null;
    const chargeableWeight = positiveWeight(line.chargeableWeightGrams) ? line.chargeableWeightGrams : null;
    return <div className="delivery-charge-details" role="note" aria-label={t("delivery.details.label")}>
      <p className="delivery-charge-carrier">{carrier}</p>
      {hasPins && <p>{t("delivery.details.route", { 0: line.originPin, 1: line.destinationPin })}</p>}
      <dl className="delivery-charge-breakdown">
        <div><dt>{t("delivery.details.carrierQuote")}</dt><dd>{money(line.carrierQuotePaise)}</dd></div>
        {line.minimumAdjustmentPaise > 0 && <div><dt>{t("delivery.details.minimumAdjustment")}</dt><dd>+{money(line.minimumAdjustmentPaise)}</dd></div>}
      </dl>
      {line.minimumAdjustmentPaise > 0 && moneyValue(line.minimumChargePaise) && <p>{t("delivery.details.minimum", { 0: money(line.minimumChargePaise) })}</p>}
      {actualWeight && chargeableWeight ? <p>{t("delivery.details.weights", { 0: formatted(actualWeight / 1000), 1: formatted(chargeableWeight / 1000) })}</p>
        : actualWeight ? <p>{t("delivery.details.weight", { 0: formatted(actualWeight / 1000) })}</p>
          : chargeableWeight ? <p>{t("delivery.details.chargedWeight", { 0: formatted(chargeableWeight / 1000) })}</p> : null}
    </div>;
  }
  return null;
}
