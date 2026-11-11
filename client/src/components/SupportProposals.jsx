import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, readable } from "../lib/api";
import { useResource } from "../lib/hooks";
import { t } from "../i18n/core";
import { Badge, Button, ErrorMessage, Field, Notice, Spinner } from "./ui";

export function SupportProposals({ ticketId, staff = false, onChange }) {
  const [result, setResult] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState("");
  const [form, setForm] = useState({
      kind: "sleeve",
      optionId: "",
      summary: "",
      pricingImpact: "",
      measurementImpact: "",
      changes: {},
    }),
    retry = useRef(crypto.randomUUID());
  const options = useResource(staff ? "/options?limit=50" : null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api(`/support/${ticketId}/proposals?limit=20`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ticketId, version]);
  const context = result?.context;
  async function decision(proposal, choice) {
    setBusy(true);
    setError("");
    try {
      await api(`/support/${ticketId}/proposals/${proposal._id}/decision`, {
        method: "POST",
        body: {
          revision: proposal.revision,
          draftRevision: context?.draftRevision ?? proposal.baseDraftRevision,
          decision: choice,
        },
      });
      if (choice === "accept") setAccepted(proposal.draftId);
      setVersion((v) => v + 1);
      onChange?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="conversation">
      <h3>{t("Proposed design changes")}</h3>
      <p className="small-print">
        {t(
          "Guidance stays a proposal until you accept it. Accepting a design change updates the editable draft; measurements and the current estimate still need your review. It does not submit an order or accept a final quote.",
        )}
      </p>
      <ErrorMessage message={error} />
      {loading ? (
        <Spinner />
      ) : (
        <>
          {accepted && (
            <Notice>
              {t(
                "Your accepted changes are saved. Reconfirm affected measurements and review the updated estimate.",
              )}{" "}
              <Link to={`/request?draft=${accepted}&step=measurements`}>
                {t("Resume draft")}
              </Link>
            </Notice>
          )}
          {result?.data?.map((p) => (
            <article className="panel" key={p._id}>
              <Badge>{readable(p.status)}</Badge>
              <h3>{p.summary}</h3>
              <p>
                <strong>{t("Price impact")}</strong> · {p.pricingImpact}
              </p>
              <p>
                <strong>{t("Measurement impact")}</strong> ·{" "}
                {p.measurementImpact}
              </p>
              <p>
                {t("Known subtotal")}:{" "}
                {money(p.beforeEstimate?.knownSubtotalPaise)} →{" "}
                {money(p.afterEstimate?.knownSubtotalPaise)}
              </p>
              {p.afterEstimate?.hasPending && (
                <Notice>{t("Pending tailor review")}</Notice>
              )}
              <dl className="review-list">
                {Object.entries(p.changes).map(([kind, c]) => (
                  <div key={kind}>
                    <dt>{readable(kind)}</dt>
                    <dd>
                      {p.afterEstimate?.components?.[kind]?.name ||
                        readable(c.source)}
                    </dd>
                  </div>
                ))}
              </dl>
              {!staff && p.status === "pending" && (
                <div className="stack-actions">
                  <Button
                    className="button small"
                    busy={busy}
                    onClick={() => decision(p, "accept")}
                  >
                    {t("Accept proposed changes")}
                  </Button>
                  <Button
                    className="button secondary small"
                    busy={busy}
                    onClick={() => decision(p, "decline")}
                  >
                    {t("Keep my current design")}
                  </Button>
                </div>
              )}
            </article>
          ))}
          {!result?.data?.length && (
            <p className="muted">
              {t("No design changes have been proposed.")}
            </p>
          )}
          {staff && context && !context.estimateError && (
            <form
              className="panel"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api(`/support/${ticketId}/proposals`, {
                    method: "POST",
                    body: {
                      clientId: retry.current,
                      revision: context.ticketRevision,
                      draftRevision: context.draftRevision,
                      summary: form.summary,
                      pricingImpact: form.pricingImpact,
                      measurementImpact: form.measurementImpact,
                      changes: form.changes,
                    },
                  });
                  retry.current = crypto.randomUUID();
                  setForm({
                    ...form,
                    summary: "",
                    pricingImpact: "",
                    measurementImpact: "",
                    changes: {},
                  });
                  setVersion((v) => v + 1);
                  onChange?.();
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h3>{t("Suggest a component change")}</h3>
              <div className="form-grid">
                <Field
                  label={t("Part to change")}
                  name={`proposal-kind-${ticketId}`}
                >
                  <select
                    id={`proposal-kind-${ticketId}`}
                    value={form.kind}
                    onChange={(e) =>
                      setForm({ ...form, kind: e.target.value, optionId: "" })
                    }
                  >
                    {["sleeve", "neck", "back", "fit"].map((k) => (
                      <option key={k} value={k}>
                        {readable(k)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={t("Suggested design option")}
                  name={`proposal-option-${ticketId}`}
                >
                  <select
                    id={`proposal-option-${ticketId}`}
                    value={form.optionId}
                    onChange={(e) =>
                      setForm({ ...form, optionId: e.target.value })
                    }
                  >
                    <option value="">{t("Choose an option")}</option>
                    {options.data
                      ?.filter(
                        (o) =>
                          o.kind === form.kind &&
                          (!o.garments?.length ||
                            o.garments.includes(context.garment)),
                      )
                      .map((o) => (
                        <option key={o._id} value={o._id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <button
                type="button"
                className="button secondary small"
                disabled={!form.optionId}
                onClick={() =>
                  setForm({
                    ...form,
                    changes: {
                      ...form.changes,
                      [form.kind]: {
                        source: "option",
                        optionId: form.optionId,
                        notes: "",
                      },
                    },
                  })
                }
              >
                {t("Add to proposal")}
              </button>
              {Object.keys(form.changes).map((kind) => (
                <div className="account-row" key={kind}>
                  <span>
                    {readable(kind)} ·{" "}
                    {
                      options.data?.find(
                        (o) => o._id === form.changes[kind].optionId,
                      )?.name
                    }
                  </span>
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => {
                      const changes = { ...form.changes };
                      delete changes[kind];
                      setForm({ ...form, changes });
                    }}
                  >
                    {t("Remove")}
                  </button>
                </div>
              ))}
              {[
                ["summary", "Explain your suggestion"],
                ["pricingImpact", "Explain price impact and pending charges"],
                [
                  "measurementImpact",
                  "Explain measurements needing reconfirmation",
                ],
              ].map(([k, l]) => (
                <Field key={k} label={t(l)} name={`proposal-${k}-${ticketId}`}>
                  <textarea
                    id={`proposal-${k}-${ticketId}`}
                    required
                    minLength={k === "summary" ? 5 : 3}
                    maxLength={k === "summary" ? 2000 : 1000}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </Field>
              ))}
              <Button
                className="button"
                busy={busy}
                disabled={!Object.keys(form.changes).length}
              >
                {t("Send proposal for customer approval")}
              </Button>
            </form>
          )}
          {staff && !context && (
            <p className="small-print">
              {t(
                "A saved editable draft and the customer's permission to share design context are required. For submitted orders, discuss changes here and agree a reviewed quote before proceeding.",
              )}
            </p>
          )}
          {context?.estimateError && <Notice>{context.estimateError}</Notice>}
        </>
      )}
    </section>
  );
}
