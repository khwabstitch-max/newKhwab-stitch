import { useState } from "react";
import { api, dateTime, money, readable } from "../lib/api";
import { t } from "../i18n/core";
import { Button, ErrorMessage, Field, Notice } from "./ui";

export function QuoteLineEditor({ value = [], onChange, quantity }) {
  return (
    <fieldset>
      <legend>{t("Final quote breakdown")}</legend>
      <p className="small-print">
        {t(
          "Optional for legacy quotes. Enter each line total in INR. Garment lines cover the full garment quantity; each transport direction is one shipment. The quote total is the sum of these lines.",
        )}
      </p>
      {value.map((line, i) => (
        <div className="quote-line-editor" key={i}>
          <Field
            label={t("Charge description")}
            name={`quote-line-label-${i}`}
            required
            minLength={2}
            maxLength={180}
            value={line.label}
            onChange={(e) =>
              onChange(
                value.map((v, j) =>
                  i === j ? { ...v, label: e.target.value } : v,
                ),
              )
            }
          />
          <div className="form-grid">
            <Field
              label={t("Line total (INR)")}
              name={`quote-line-amount-${i}`}
              type="number"
              required
              min={0}
              max={1000000}
              step="0.01"
              value={line.amountPaise / 100}
              onChange={(e) =>
                onChange(
                  value.map((v, j) =>
                    i === j
                      ? {
                          ...v,
                          amountPaise: Math.round(Number(e.target.value) * 100),
                        }
                      : v,
                  ),
                )
              }
            />
            <Field
              label={t("Charge applies to")}
              name={`quote-line-scope-${i}`}
            >
              <select
                id={`quote-line-scope-${i}`}
                value={line.scope}
                onChange={(e) =>
                  onChange(
                    value.map((v, j) =>
                      i === j
                        ? {
                            ...v,
                            scope: e.target.value,
                            quantity:
                              e.target.value === "garment" ? quantity : 1,
                          }
                        : v,
                    ),
                  )
                }
              >
                <option value="garment">
                  {t("All garments in this request")}
                </option>
                <option value="shipment">{t("One shipment")}</option>
                <option value="order">{t("Order")}</option>
              </select>
            </Field>
          </div>
          <button
            className="text-button danger"
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            {t("Remove charge")}
          </button>
        </div>
      ))}
      <button
        className="button secondary small"
        type="button"
        onClick={() =>
          onChange([
            ...value,
            { label: "", amountPaise: 0, quantity, scope: "garment" },
          ])
        }
      >
        {t("Add quote line")}
      </button>
      {value.length > 0 && (
        <p>
          {t("Final quote total")}{" "}
          <strong>
            {money(value.reduce((sum, v) => sum + v.amountPaise, 0))}
          </strong>
        </p>
      )}
    </fieldset>
  );
}
const transportStatuses = [
  "not_arranged",
  "quote_pending",
  "awaiting_confirmation",
  "confirmed",
  "in_transit",
  "received",
  "collected",
  "delivered",
  "cancelled",
];
export function OrderFulfilment({ order, admin, reload }) {
  const initial = order.fulfilment || {};
  const [draft, setDraft] = useState({
      inboundStatus: initial.inboundStatus || "not_arranged",
      outboundStatus: initial.outboundStatus || "not_arranged",
      trackingUrl: initial.trackingUrl || "",
      estimatedCompletionDate: initial.estimatedCompletionDate || "",
      delayNote: initial.delayNote || "",
      alterationMargin: {
        confirmed: false,
        description: "",
        exceptions: "",
        ...initial.alterationMargin,
      },
      outboundReconfirmedAt: initial.outboundReconfirmedAt || null,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!admin && !order.fulfilment) return null;
  return (
    <section className="panel">
      <h2>{t("Handover and garment review")}</h2>
      {admin ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(`/admin/orders/${order._id}/fulfilment`, {
                method: "PATCH",
                body: { revision: order.revision, ...draft },
              });
              reload();
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ErrorMessage message={error} />
          <Notice>
            {t(
              "Record confirmed arrangements only. These updates do not book a courier or change an accepted price. Agree any new charge with the customer before proceeding.",
            )}
          </Notice>
          <div className="form-grid">
            {[
              ["inboundStatus", "Fabric transport status"],
              ["outboundStatus", "Outfit transport status"],
            ].map(([k, l]) => (
              <Field key={k} label={t(l)} name={`fulfilment-${k}`}>
                <select
                  id={`fulfilment-${k}`}
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                >
                  {transportStatuses.map((v) => (
                    <option key={v} value={v}>
                      {readable(v)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <Field
              label={t("Courier tracking link (optional)")}
              name="fulfilment-tracking"
              type="url"
              maxLength={500}
              value={draft.trackingUrl}
              onChange={(e) =>
                setDraft({ ...draft, trackingUrl: e.target.value })
              }
            />
            <Field
              label={t("Estimated completion date (when agreed)")}
              name="fulfilment-completion"
              type="date"
              value={draft.estimatedCompletionDate}
              onChange={(e) =>
                setDraft({ ...draft, estimatedCompletionDate: e.target.value })
              }
            />
          </div>
          <Field
            label={t("Delay explanation / current arrangement notes")}
            name="fulfilment-delay"
          >
            <textarea
              id="fulfilment-delay"
              maxLength={1000}
              value={draft.delayNote}
              onChange={(e) =>
                setDraft({ ...draft, delayNote: e.target.value })
              }
            />
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={Boolean(draft.outboundReconfirmedAt)}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  outboundReconfirmedAt: e.target.checked
                    ? new Date().toISOString()
                    : null,
                })
              }
            />
            {t(
              "I have reconfirmed the outbound address and arrangement with the customer.",
            )}
          </label>
          <fieldset>
            <legend>{t("Actual alteration margin")}</legend>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.alterationMargin.confirmed}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    alterationMargin: {
                      ...draft.alterationMargin,
                      confirmed: e.target.checked,
                    },
                  })
                }
              />
              {t("Margin reviewed and confirmed for this garment")}
            </label>
            <Field
              label={t("Confirmed margin details")}
              name="margin-description"
              maxLength={500}
              value={draft.alterationMargin.description}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  alterationMargin: {
                    ...draft.alterationMargin,
                    description: e.target.value,
                  },
                })
              }
            />
            <Field
              label={t("Fabric / design exceptions")}
              name="margin-exceptions"
              maxLength={1000}
              value={draft.alterationMargin.exceptions}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  alterationMargin: {
                    ...draft.alterationMargin,
                    exceptions: e.target.value,
                  },
                })
              }
            />
          </fieldset>
          <Button className="button" busy={busy}>
            {t("Save confirmed handover details")}
          </Button>
        </form>
      ) : (
        <>
          <dl className="review-list">
            {[
              ["inboundStatus", "Fabric transport"],
              ["outboundStatus", "Outfit transport"],
              ["estimatedCompletionDate", "Estimated completion"],
            ].map(
              ([k, l]) =>
                initial[k] && (
                  <div key={k}>
                    <dt>{t(l)}</dt>
                    <dd>
                      {k === "estimatedCompletionDate"
                        ? dateTime(initial[k])
                        : readable(initial[k])}
                    </dd>
                  </div>
                ),
            )}
          </dl>
          {initial.trackingUrl && (
            <a
              className="text-link"
              href={initial.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Track courier shipment")}
            </a>
          )}
          {initial.delayNote && <Notice>{initial.delayNote}</Notice>}
          {initial.alterationMargin?.confirmed && (
            <p>
              {t("Confirmed alteration margin")} ·{" "}
              {initial.alterationMargin.description}{" "}
              {initial.alterationMargin.exceptions}
            </p>
          )}
          {initial.outboundReconfirmedAt && (
            <small>
              {t("Outbound arrangement reconfirmed")}{" "}
              {dateTime(initial.outboundReconfirmedAt)}
            </small>
          )}
        </>
      )}
    </section>
  );
}
