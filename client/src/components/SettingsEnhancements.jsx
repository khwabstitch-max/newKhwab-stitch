import { t } from "../i18n/core";
import { readable } from "../lib/api";
import { Field, Notice } from "./ui";

export function SettingsEnhancements({ draft, patch }) {
  return (
    <>
      <h2>{t("Welcome and service policies")}</h2>
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
      {draft.policies ? (
        <fieldset>
          <legend>{t("Versioned assurance policy")}</legend>
          {[
            "version",
            "assurance",
            "alterationMargin",
            "correctionTransport",
          ].map((k) => (
            <Field
              key={k}
              label={readable(k)}
              name={`policy-${k}`}
              required={k === "version"}
            >
              {k === "version" ? (
                <input
                  id={`policy-${k}`}
                  required
                  maxLength={50}
                  value={draft.policies[k] || ""}
                  onChange={(e) =>
                    patch("policies", {
                      ...draft.policies,
                      [k]: e.target.value,
                    })
                  }
                />
              ) : (
                <textarea
                  id={`policy-${k}`}
                  maxLength={k === "assurance" ? 2500 : 1500}
                  rows={3}
                  value={draft.policies[k] || ""}
                  onChange={(e) =>
                    patch("policies", {
                      ...draft.policies,
                      [k]: e.target.value,
                    })
                  }
                />
              )}
            </Field>
          ))}
        </fieldset>
      ) : (
        <button
          className="button secondary small"
          type="button"
          onClick={() =>
            patch("policies", {
              version: "service-v1",
              assurance:
                "We stitch your fabric with care according to the measurements and design details you approve. If we make an error against those confirmed details, we take responsibility and will work with you to correct it without an additional correction stitching charge.",
              alterationMargin:
                "Where the fabric and design allow, we aim to leave approximately 1.5 inches of alteration margin on each side. We will confirm the available margin when reviewing your garment.",
              correctionTransport:
                "Measurement changes, new design requests, fabric limitations and any correction transport charges are reviewed separately. We confirm the plan and any charge before proceeding.",
            })
          }
        >
          {t("Configure assurance policy")}
        </button>
      )}
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
            <Field
              label={t("PIN prefixes (comma separated)")}
              name={`area-pin-${i}`}
              required
              value={area.pinPrefixes.join(",")}
              onChange={(e) =>
                patch(
                  "serviceAreas",
                  draft.serviceAreas.map((a, j) =>
                    j === i
                      ? {
                          ...a,
                          pinPrefixes: e.target.value
                            .split(",")
                            .map((v) => v.trim()),
                        }
                      : a,
                  ),
                )
              }
            />
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
