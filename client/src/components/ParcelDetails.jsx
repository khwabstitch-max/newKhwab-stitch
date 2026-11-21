import { money } from "../lib/api";
import { requestParcel } from "../lib/shipping";
import { t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { Field } from "./ui";

export function ParcelInputs({ value, onChange, direction, provider }) {
  useLanguage();
  const selected = Boolean(value);
  const patch = (key, next) => onChange({ ...value, [key]: next });
  return <fieldset className="request-parcel-details">
    <legend>{t(direction === "inbound" ? "shipping.parcel.inbound" : "shipping.parcel.outbound")}</legend>
    <p className="small-print">{t("shipping.parcel.hint")}</p>
    <label className="checkbox"><input type="checkbox" checked={selected} onChange={event => onChange(event.target.checked ? {} : undefined)} />{t("shipping.parcel.known")}</label>
    {selected && <div className="form-grid">
      {["weightGrams","lengthCm","widthCm","heightCm"].map(key => <Field key={key} label={t("shipping.parcel." + key)} name={direction + "-parcel-" + key} type="number" min={key === "weightGrams" ? 1 : 0.1} max={key === "weightGrams" ? 30000 : 200} step={key === "weightGrams" ? 1 : 0.1} value={value[key] ?? ""} onChange={event => patch(key, event.target.value)} />)}
      <Field label={t("shipping.parcel.value")} name={direction + "-parcel-value"} type="number" min={0.01} max={1000000} step="0.01" value={value.declaredValuePaise === undefined || value.declaredValuePaise === "" ? "" : value.declaredValuePaise / 100} onChange={event => patch("declaredValuePaise", event.target.value === "" ? undefined : Math.round(Number(event.target.value) * 100))} hint={t(provider === "shiprocket" && direction === "inbound" ? "shipping.parcel.valueRequired" : "shipping.parcel.valueHint")} />
    </div>}
    <p className="small-print">{t("shipping.parcel.privacy")}</p>
  </fieldset>;
}
export function ParcelSummary({ parcel }) {
  useLanguage();
  const data = requestParcel(parcel);
  if (!data) return null;
  return <span className="parcel-summary">{t("shipping.parcel.summary", { 0: data.weightGrams, 1: data.lengthCm, 2: data.widthCm, 3: data.heightCm })}{data.declaredValuePaise && <span> · {t("shipping.parcel.declared", { 0: money(data.declaredValuePaise) })}</span>}</span>;
}
