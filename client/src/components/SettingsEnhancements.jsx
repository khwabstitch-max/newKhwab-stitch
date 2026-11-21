import { t } from "../i18n/core";
import { money, readable } from "../lib/api";
import { useLanguage } from "../i18n/Language";
import { Field, Notice } from "./ui";
import { AdminPolicyEditor } from "./AdminPolicyEditor";
import { TokenListEditor } from "./AdminFields";

export function DeliveryPricingControls({ value, onChange }) {
  useLanguage();
  const pricing = { mode: "service_areas", distanceBasis: "pin_area", formula: "base_plus_distance", ...value };
  const distance = pricing.mode === "distance";
  const courier = pricing.mode === "courier";
  const patch = fields => onChange({ ...pricing, ...fields });
  const updateRate = (leg, key, entered) => patch({ [leg]: { ...pricing[leg], [key]: entered === "" ? null : Math.round(Number(entered) * 100) } });
  const knownRate = number => Number.isInteger(number) && number >= 0;
  return <section aria-label={t("delivery.admin.method")}>
    <Field label={t("delivery.admin.method")} name="delivery-mode">
      <select id="delivery-mode" value={pricing.mode} onChange={event => patch({ mode: event.target.value, ...(event.target.value === "distance" ? { distanceBasis: "pin_area" } : {}) })}>
        <option value="courier">{t("delivery.admin.courier")}</option>
        <option value="service_areas">{t("delivery.admin.serviceAreas")}</option>
        <option value="distance">{t("delivery.admin.distance")}</option>
      </select>
    </Field>
    {(distance || courier) && <div className="form-grid">
        <Field label={t("delivery.admin.originPin")} hint={t("delivery.admin.originHint")} name="delivery-originPin" required inputMode="numeric" autoComplete="postal-code" minLength={6} maxLength={6} pattern="[1-9][0-9]{5}" value={pricing.originPin || ""} onChange={event => patch({ originPin: event.target.value })} />
        {courier && <Field label={t("delivery.admin.provider")} name="delivery-courierProvider" required>
          <select id="delivery-courierProvider" required value={pricing.courierProvider || ""} onChange={event => patch({ courierProvider: event.target.value })}>
            <option value="">{t("delivery.admin.chooseProvider")}</option>
            <option value="shiprocket">Shiprocket</option>
            <option value="delhivery">Delhivery</option>
            <option value="bluedart" disabled>{t("delivery.admin.blueDartOption")}</option>
          </select>
        </Field>}
      </div>}
    {distance && <>
      <Notice>{t("delivery.admin.pinHint")}</Notice>
      <Field label={t("delivery.admin.formula")} hint={t(pricing.formula === "minimum_fare" ? "delivery.admin.minimumFareHint" : "delivery.admin.basePlusHint")} name="delivery-formula">
        <select id="delivery-formula" value={pricing.formula} onChange={event => patch({ formula: event.target.value })}>
          <option value="base_plus_distance">{t("delivery.admin.basePlus")}</option>
          <option value="minimum_fare">{t("delivery.admin.minimumFare")}</option>
        </select>
      </Field>
      <p className="small-print">{t("delivery.admin.rounding")}</p>
      <div className="form-grid">
        {["inbound", "outbound"].map(leg => {
          const rates = pricing[leg] || {};
          const complete = knownRate(rates.minimumChargePaise) && knownRate(rates.perKmPaise);
          const distanceFare = complete ? rates.perKmPaise * 5 : null;
          const example = complete ? pricing.formula === "minimum_fare" ? Math.max(rates.minimumChargePaise, distanceFare) : rates.minimumChargePaise + distanceFare : null;
          return <fieldset key={leg}>
            <legend>{t(leg === "inbound" ? "delivery.admin.pickup" : "delivery.admin.delivery")}</legend>
            {["minimumChargePaise", "perKmPaise"].map(key => <Field key={key} name={`delivery-${leg}-${key}`} label={t(leg === "inbound" ? key === "minimumChargePaise" ? "delivery.admin.inboundMinimum" : "delivery.admin.inboundPerKm" : key === "minimumChargePaise" ? "delivery.admin.outboundMinimum" : "delivery.admin.outboundPerKm")} type="number" required min={0} max={key === "minimumChargePaise" ? 100000 : 10000} step="0.01" hint={t("delivery.admin.rateHint")} value={rates[key] == null ? "" : rates[key] / 100} onChange={event => updateRate(leg, key, event.target.value)} />)}
            <p className="small-print" data-testid={`delivery-example-${leg}`}>{complete ? t(pricing.formula === "minimum_fare" ? "delivery.admin.exampleMinimum" : "delivery.admin.examplePlus", { 0: money(rates.minimumChargePaise), 1: money(rates.perKmPaise), 2: money(example) }) : t("delivery.admin.examplePending")}</p>
          </fieldset>;
        })}
      </div>
    </>}
    {courier && <>
      <Notice>{t("delivery.admin.courierHint")}</Notice>
      <p className="small-print">{t("delivery.admin.courierMinimumHint")}</p>
      <div className="form-grid">
        {["inbound", "outbound"].map(leg => <Field key={leg} name={`delivery-${leg}-minimumChargePaise`} label={t(leg === "inbound" ? "delivery.admin.inboundMinimumOptional" : "delivery.admin.outboundMinimumOptional")} type="number" min={0} max={100000} step="0.01" value={pricing[leg]?.minimumChargePaise == null ? "" : pricing[leg].minimumChargePaise / 100} onChange={event => updateRate(leg, "minimumChargePaise", event.target.value)} />)}
      </div>
    </>}
  </section>;
}

export function SettingsEnhancements({ draft, patch }) {
  useLanguage();
  return (
    <>
      <details className="admin-advanced"><summary>{t("admin.home.legacy")}</summary>
      {["title", "tagline", "description"].map((k) => (
        <Field
          key={k}
          label={t(`Welcome ${k}`)}
          name={`welcome-${k}`}
          maxLength={k === "description" ? 1200 : 180}
          value={draft.welcome?.[k] || ""}
          onChange={(e) =>
            patch("welcome", {
              title: "",
              tagline: "",
              description: "",
              ...draft.welcome,
              [k]: e.target.value,
            })
          }
        />
      ))}
      </details>
      <AdminPolicyEditor value={draft.policies} onChange={value => patch("policies", value)} />
      <h2>{t("Stitching starting prices")}</h2>
      <p className="small-print">
        {t(
          "Per garment, in INR. Leave blank when review is required. Catalogue bundles use their own stitching price.",
        )}
      </p>
      <div className="form-grid">
        {["kurti", "suit", "blouse", "alteration"].map((k) => (
          <Field
            key={k}
            label={readable(k)}
            name={`base-${k}`}
            type="number"
            min={0}
            max={1000000}
            step="0.01"
            value={
              draft.garmentBasePrices?.[k] === undefined
                ? ""
                : draft.garmentBasePrices[k] / 100
            }
            onChange={(e) => {
              const prices = { ...draft.garmentBasePrices };
              if (e.target.value === "") delete prices[k];
              else prices[k] = Math.round(Number(e.target.value) * 100);
              patch("garmentBasePrices", prices);
            }}
          />
        ))}
      </div>
      <h2>{t("Fabric pickup and outfit delivery")}</h2>
      <DeliveryPricingControls value={draft.deliveryPricing} onChange={value => patch("deliveryPricing", value)} />
      <details className="admin-advanced" open={!draft.deliveryPricing?.mode || draft.deliveryPricing.mode === "service_areas"}>
      <summary>{t("delivery.admin.legacyRates")}</summary>
      <p className="small-print">{t("delivery.admin.legacyHint")}</p>
      <Notice>
        {t(
          "Rates are per shipment and per direction. Blank rates mean a manual quote is pending. These settings never book a courier.",
        )}
      </Notice>
      {(draft.serviceAreas || []).map((area, i) => (
        <fieldset key={i}>
          <legend>{area.name || t("Service area")}</legend>
          <div className="form-grid">
            <Field
              label={t("Area name")}
              name={`area-name-${i}`}
              required
              value={area.name}
              onChange={(e) =>
                patch(
                  "serviceAreas",
                  draft.serviceAreas.map((a, j) =>
                    j === i ? { ...a, name: e.target.value } : a,
                  ),
                )
              }
            />
            <Field label={t("Hindi area name (optional)")} name={`area-name-hi-${i}`} lang="hi" maxLength={120} value={area.nameHi || ""} onChange={event => patch("serviceAreas", draft.serviceAreas.map((value, position) => position === i ? { ...value, nameHi: event.target.value } : value))} />
            <TokenListEditor label="admin.delivery.pinAreas" name={`area-pin-${i}`} value={area.pinPrefixes} max={30} hint="admin.delivery.pinHelp" onChange={values => patch("serviceAreas", draft.serviceAreas.map((value, position) => position === i ? { ...value, pinPrefixes: values } : value))} />
            {["inboundPaise", "outboundPaise"].map((k) => (
              <Field
                key={k}
                label={t(
                  k === "inboundPaise"
                    ? "Fabric pickup charge (INR)"
                    : "Outfit delivery charge (INR)",
                )}
                name={`area-${k}-${i}`}
                type="number"
                min={0}
                max={100000}
                step="0.01"
                value={area[k] === null ? "" : area[k] / 100}
                onChange={(e) =>
                  patch(
                    "serviceAreas",
                    draft.serviceAreas.map((a, j) =>
                      j === i
                        ? {
                            ...a,
                            [k]:
                              e.target.value === ""
                                ? null
                                : Math.round(Number(e.target.value) * 100),
                          }
                        : a,
                    ),
                  )
                }
              />
            ))}
          </div>
          <Field
            label={t("Scheduling / availability conditions")}
            name={`area-notes-${i}`}
            maxLength={500}
            value={area.notes || ""}
            onChange={(e) =>
              patch(
                "serviceAreas",
                draft.serviceAreas.map((a, j) =>
                  j === i ? { ...a, notes: e.target.value } : a,
                ),
              )
            }
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={area.enabled}
              onChange={(e) =>
                patch(
                  "serviceAreas",
                  draft.serviceAreas.map((a, j) =>
                    j === i ? { ...a, enabled: e.target.checked } : a,
                  ),
                )
              }
            />
            {t("Service area enabled")}
          </label>
          <button
            className="text-button danger"
            type="button"
            onClick={() =>
              patch(
                "serviceAreas",
                draft.serviceAreas.filter((_, j) => j !== i),
              )
            }
          >
            {t("Remove area")}
          </button>
        </fieldset>
      ))}
      <button
        className="button secondary small"
        type="button"
        onClick={() =>
          patch("serviceAreas", [
            ...(draft.serviceAreas || []),
            {
              name: "",
              pinPrefixes: [],
              enabled: true,
              inboundPaise: null,
              outboundPaise: null,
              notes: "",
            },
          ])
        }
      >
        {t("Add service area")}
      </button>
      </details>
      <h2>{t("Human support response target")}</h2>
      <p className="small-print">
        {t(
          "This target is an initial response during the hours below. It is not a resolution guarantee. Timezone: Asia/Kolkata. No deadline is promised until you configure and save these hours.",
        )}
      </p>
      {draft.support ? (
        <fieldset>
          <legend>{t("Support calendar")}</legend>
          <div className="form-grid">
            {[
              ["responseHours", "Response target in working hours", 1, 72],
              ["startHour", "Opens at (hour, 0–23)", 0, 23],
              ["endHour", "Closes at (hour, 1–24)", 1, 24],
            ].map(([k, label, min, max]) => (
              <Field
                key={k}
                label={t(label)}
                name={`support-${k}`}
                type="number"
                required
                min={min}
                max={max}
                value={draft.support[k]}
                onChange={(e) =>
                  patch("support", {
                    ...draft.support,
                    [k]: Number(e.target.value),
                  })
                }
              />
            ))}
          </div>
          {[
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ].map((day, i) => (
            <label className="checkbox" key={day}>
              <input
                type="checkbox"
                checked={draft.support.weekdays.includes(i)}
                onChange={(e) =>
                  patch("support", {
                    ...draft.support,
                    weekdays: e.target.checked
                      ? [...draft.support.weekdays, i]
                      : draft.support.weekdays.filter((v) => v !== i),
                  })
                }
              />
              {t(day)}
            </label>
          ))}
        </fieldset>
      ) : (
        <button
          className="button secondary small"
          type="button"
          onClick={() =>
            patch("support", {
              timezone: "Asia/Kolkata",
              responseHours: 6,
              startHour: 10,
              endHour: 18,
              weekdays: [1, 2, 3, 4, 5, 6],
            })
          }
        >
          {t("Configure support hours (review before saving)")}
        </button>
      )}
      <Field
        label={t("Facebook profile URL (optional)")}
        name="facebook-url"
        type="url"
        maxLength={250}
        value={draft.facebook || ""}
        onChange={(e) => patch("facebook", e.target.value)}
      />
    </>
  );
}
