import { t, localize, labelToken } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ExternalLink,
  Printer,
  RefreshCw,
} from "lucide-react";
import { api, date, dateTime, idOf, money, readable } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useResource, useSite } from "../lib/hooks";
import { estimateLineLabel } from "../lib/order-labels";
import {
  OrderFulfilment,
  QuoteLineEditor,
} from "../components/OrderEnhancements";
import { QuoteAcceptance, QuoteBenefitBreakdown } from "../components/QuoteBenefits";
import {
  BackLink,
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Field,
  Notice,
  PageHeading,
  Spinner,
} from "../components/ui";
const orderStatuses = [
  "request_received", "under_review", "quote_sent", "customer_accepted",
  "fabric_received", "stitching", "ready", "dispatched", "delivered",
  "cancelled", "rejected",
];
export function OrderList({ admin = false }) {
  useLanguage();
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get("page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const status = orderStatuses.includes(params.get("status")) ? params.get("status") : "";
  function changeFilters(nextStatus, nextPage) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (nextStatus) next.set("status", nextStatus);
      else next.delete("status");
      if (nextPage > 1) next.set("page", String(nextPage));
      else next.delete("page");
      return next;
    });
  }
  const { data, loading, error, reload, pagination } = useResource(
    `${admin ? "/admin" : ""}/orders?page=${page}&limit=15${status ? `&status=${status}` : ""}`,
  );
  return (
    <>
      <PageHeading
        eyebrow={admin ? t("ATELIER WORKSPACE") : t("YOUR STITCHING JOURNEY")}
        title={
          admin
            ? t("Stitching requests")
            : t("Your little collection of ideas.")
        }
        action={
          !admin && (
            <Link className="button" to="/request">
              {t("New request ")}
              <ArrowRight size={16} />
            </Link>
          )
        }
      >
        {admin
          ? t("Review, quote and care for each request.")
          : t(
              "Follow each request, review a quote, and see what happens next.",
            )}
      </PageHeading>
      {
        <Field label={t("Filter status")} name="orderStatus">
          <select
            id="orderStatus"
            value={status}
            onChange={(e) => {
              changeFilters(e.target.value, 1);
            }}
          >
            <option value="">{t("All statuses")}</option>
            {orderStatuses.map((s) => (
              <option key={s} value={s}>
                {readable(s)}
              </option>
            ))}
          </select>
        </Field>
      }
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorMessage message={error} retry={reload} />
      ) : !data?.length ? (
        <Empty title={t("No stitching requests yet")}>
          {t("Your next favourite outfit could start here.")}
        </Empty>
      ) : (
        <>
          <div className="order-list">
            {data.map((o) => (
              <Link
                className="order-row"
                key={o._id}
                to={`${admin ? "/admin" : ""}/orders/${o._id}`}
              >
                <div>
                  <small>{o.orderNumber}</small>
                  <h3>
                    {localize(o.designSnapshot, "title") || readable(o.garment)}
                  </h3>
                  <p>
                    {readable(o.garment)} · {t("order.pieces", { count: o.quantity })} ·{" "}
                    {date(o.createdAt)}
                  </p>
                </div>
                <Badge>{readable(o.status)}</Badge>
                <ArrowRight size={19} />
              </Link>
            ))}
          </div>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => changeFilters(status, page - 1)}>
              {t("Previous")}
            </button>
            <span>
              {t("Page {0} of {1}", {
                0: page,
                1: pagination?.pages || 1,
              })}
            </span>
            <button
              disabled={page >= (pagination?.pages || 1)}
              onClick={() => changeFilters(status, page + 1)}
            >
              {t("Next")}
            </button>
          </div>
        </>
      )}
    </>
  );
}
export function Orders() {
  useLanguage();
  return (
    <div className="container page">
      <OrderList />
    </div>
  );
}
export function PrivateImage({ mediaId, publicImage = false, accessPath }) {
  useLanguage();
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function access() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api(accessPath || `/media/${mediaId}/access`);
      setUrl(data.url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="private-image">
      {url ? (
        <>
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              referrerPolicy="no-referrer"
              alt={
                publicImage
                  ? t("Catalogue image")
                  : t("Private stitching reference")
              }
              onError={() => {
                setUrl("");
                setError(
                  "This link expired or the image could not load. Request a fresh link.",
                );
              }}
            />
            <small>
              {publicImage ? t("Open image ") : t("Open private image ")}
              <ExternalLink size={12} />
            </small>
          </a>
          <Button className="text-button" busy={busy} onClick={access}>
            <RefreshCw size={13} />
            {t("Refresh access link")}
          </Button>
        </>
      ) : (
        <Button className="button secondary small" busy={busy} onClick={access}>
          {publicImage ? t("View image") : t("View private reference")}
        </Button>
      )}
      <ErrorMessage message={error} />
    </div>
  );
}
const transitions = {
  request_received: ["under_review", "rejected", "cancelled"],
  under_review: ["rejected", "cancelled"],
  quote_sent: ["under_review", "rejected", "cancelled"],
  customer_accepted: ["fabric_received", "cancelled"],
  fabric_received: ["stitching"],
  stitching: ["ready"],
  ready: ["dispatched"],
  dispatched: ["delivered"],
};
export function OrderDetails({ admin = false }) {
  useLanguage();
  const { id } = useParams();
  const {
    data: order,
    loading,
    error,
    reload,
  } = useResource(`${admin ? "/admin" : ""}/orders/${id}`);
  const [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  const location = useLocation();
  const site = useSite();
  const [quote, setQuote] = useState({
    amount: "",
    deliveryDate: "",
    notes: "",
    notesHi: "",
    lineItems: [],
  });
  const [status, setStatus] = useState(""),
    [note, setNote] = useState(""),
    [noteHi, setNoteHi] = useState("");
  async function action(path, body, method = "POST") {
    setBusy(true);
    setActionError("");
    setSuccess("");
    try {
      await api(path, {
        method,
        body,
      });
      setSuccess("Saved. The request has been updated.");
      reload();
    } catch (e) {
      setActionError(e);
      if (e.status === 409) reload();
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Spinner />;
  if (error)
    return (
      <div className={admin ? "" : "container page"}>
        <ErrorMessage message={error} retry={reload} />
      </div>
    );
  if (!order) return <Empty title={t("Request not found")} />;
  const latest = order.quotes?.at(-1);
  return (
    <div className={admin ? "order-detail" : "container page order-detail"}>
      <BackLink to={admin ? "/admin/orders" : "/orders"}>
        {t("Back to requests")}
      </BackLink>
      {location.state?.submitted && (
        <Notice>
          <strong>{t("Request received.")}</strong>
          {t(
            " This is your request receipt. Your price and delivery date need an atelier review and your quote acceptance.",
          )}
        </Notice>
      )}
      <PageHeading
        eyebrow={order.orderNumber}
        title={
          localize(order.designSnapshot, "title") ||
          t("{0} stitching", { 0: readable(order.garment) })
        }
        action={
          <button
            className="button secondary no-print"
            onClick={() => window.print()}
          >
            <Printer size={16} />
            {t("Print receipt")}
          </button>
        }
      >
        <Badge>{readable(order.status)}</Badge>
        {t(" \xB7 Submitted")} {date(order.createdAt)}
      </PageHeading>
      <ErrorMessage message={actionError} />
      {success && <Notice>{success}</Notice>}
      <div className="order-detail-grid">
        <div>
          <OrderFulfilment
            key={order.revision}
            order={order}
            admin={admin}
            reload={reload}
          />
          <section className="panel">
            <h2>{t("Your stitching details")}</h2>
            <dl className="review-list">
              <div>
                <dt>{t("Garment & quantity")}</dt>
                <dd>
                  {readable(order.garment)} × {order.quantity}
                </dd>
              </div>
              <div>
                <dt>{t("Measurement method")}</dt>
                <dd>
                  {readable(order.measurements?.method)} ·{" "}
                  {labelToken(order.measurements?.unit)}
                </dd>
              </div>
              {Object.entries(order.measurements?.values || {}).map(
                ([k, v]) => (
                  <div key={k}>
                    <dt>{readable(k)}</dt>
                    <dd>
                      {v} {labelToken(order.measurements.unit)}
                    </dd>
                  </div>
                ),
              )}
              {order.measurements?.notes && (
                <div>
                  <dt>{t("Measurement notes")}</dt>
                  <dd>{order.measurements.notes}</dd>
                </div>
              )}
              {Object.entries(order.preferences || {})
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{readable(k)}</dt>
                    <dd>
                      {["neck", "sleeve", "back", "fit"].includes(k)
                        ? localize(
                            { name: v, nameHi: order.preferenceLabelsHi?.[k] },
                            "name",
                          )
                        : v}
                    </dd>
                  </div>
                ))}
              <div>
                <dt>{t("Preferred date")}</dt>
                <dd>
                  {t("{0} (subject to review)", {
                    0: date(order.preferredDate),
                  })}
                </dd>
              </div>
              {order.notes && (
                <div>
                  <dt>{t("Instructions")}</dt>
                  <dd>{order.notes}</dd>
                </div>
              )}
            </dl>
            <p className="small-print">{t("Fabric provided by customer.")}</p>
          </section>
          <section className="panel">
            <h2>{t("Contact & delivery")}</h2>
            <p>
              {order.customer?.name}
              <br />
              {order.customer?.phone} <small>{t("(unverified)")}</small>
            </p>
            <p>
              {order.address?.line1}
              <br />
              {order.address?.line2}
              {order.address?.line2 && <br />}
              {order.address?.city}, {order.address?.state} —{" "}
              {order.address?.pin}
            </p>
          </section>
          {order.referenceMediaIds?.length > 0 && (
            <section className="panel no-print">
              <h2>{t("Private references")}</h2>
              <div className="media-grid">
                {order.referenceMediaIds.map((m) => (
                  <PrivateImage key={idOf(m)} mediaId={idOf(m)} />
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <h2>{t("A stitch at a time")}</h2>
            <ol className="timeline">
              {order.timeline?.map((event, i) => (
                <li key={i}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{readable(event.status || event.action)}</strong>
                    <small>{dateTime(event.at || event.createdAt)}</small>
                    {event.note && <p>{localize(event, "note")}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {order.configuration && (
            <section className="panel">
              <h2>{t("Confirmed design request")}</h2>
              <p>
                {readable(order.configuration.source)} ·{" "}
                {t(
                  order.configuration.mode === "exact"
                    ? "Same as shown"
                    : "Customized design",
                )}
              </p>
              <dl className="review-list">
                {Object.entries(order.estimate?.components || {}).map(
                  ([k, v]) => (
                    <div key={k}>
                      <dt>{readable(k)}</dt>
                      <dd>
                        {v.name ||
                          v.label ||
                          readable(v.source || "Pending tailor review")}
                        {v.notes && <p>{v.notes}</p>}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              <p className="small-print">
                {t(
                  "These details are the submitted snapshot. Profile changes do not alter this request.",
                )}
              </p>
            </section>
          )}
          {order.logistics && (
            <section className="panel">
              <h2>{t("Fabric and outfit transport")}</h2>
              {[
                ["inbound", "How your fabric reaches us"],
                ["outbound", "How you receive your outfit"],
              ].map(([k, label]) => (
                <div key={k}>
                  <h3>{t(label)}</h3>
                  <p>{readable(order.logistics[k]?.method)}</p>
                  {order.logistics[k]?.address && (
                    <p>
                      {order.logistics[k].address.line1},{" "}
                      {order.logistics[k].address.city},{" "}
                      {order.logistics[k].address.pin}
                    </p>
                  )}
                  <small>
                    {t(
                      order.logistics[k]?.method === "business"
                        ? "Arrangement pending atelier confirmation; this is not a courier booking."
                        : order.logistics[k]?.method === "customer_courier"
                          ? "You pay your chosen courier directly. No Khwab Stitch transport charge."
                          : "No Khwab Stitch transport charge.",
                    )}
                  </small>
                </div>
              ))}
            </section>
          )}
          {!admin && (
            <section className="panel no-print">
              <h2>{t("Here for the details.")}</h2>
              <div className="stack-actions">
                <Link
                  className="button secondary"
                  to={`/account/support?order=${id}`}
                >
                  {t("Messages, complaint or correction request")}
                </Link>
                <Link
                  className="text-link"
                  to={`/request?garment=${order.garment}${order.designId ? `&design=${order.designId}` : ""}`}
                >
                  {t("Request a similar order")}
                </Link>
                {order.status === "delivered" && (
                  <Link className="text-link" to="/account/reviews">
                    {t("Review this completed order")}
                  </Link>
                )}
              </div>
              <p className="small-print">
                {t(
                  "A similar request uses current availability and prices. Confirm measurements again before submitting.",
                )}
              </p>
            </section>
          )}
        </div>
        <aside>
          {order.estimate && (
            <section className="panel">
              <p className="eyebrow">{t("SUBMITTED ESTIMATE")}</p>
              <h2>{money(order.estimate.knownSubtotalPaise)}</h2>
              <p>{t("Known subtotal")}</p>
              {order.estimate.lineItems?.map((line, i) => (
                <div className="account-row" key={i}>
                  <span>{estimateLineLabel(line, order.estimate, order.designSnapshot)}</span>
                  <strong>{money(line.totalPaise ?? line.amountPaise)}</strong>
                </div>
              ))}
              {order.estimate.pendingItems?.length > 0 && (
                <Notice>
                  {t("Pending tailor review")} ·{" "}
                  {order.estimate.pendingItems
                    .map((p) => estimateLineLabel(p, order.estimate, order.designSnapshot) || t(p.reason) || p)
                    .join("; ")}
                </Notice>
              )}
              <small>
                {t("The final quote is separate and requires your acceptance.")}
              </small>
            </section>
          )}
          {latest && (
            <section className="panel quote-panel">
              <p className="eyebrow">
                {t("QUOTE \xB7 VERSION {0}", {
                  0: latest.version,
                })}
              </p>
              <h2>{money(order.acceptedQuote?.amountPaise ?? latest.amountPaise)}</h2>
              {latest.lineItems?.map((line, i) => (
                <div className="account-row" key={i}>
                  <span>{line.label}</span>
                  <strong>{money(line.amountPaise)}</strong>
                </div>
              ))}
              {latest.lineItems?.length > 0 && (
                <p className="small-print">{t("Quote descriptions are shown in their original language. Ask our team if you need help understanding a charge.")}</p>
              )}
              <p>
                {t("Proposed delivery: ")}
                <strong>{date(latest.deliveryDate)}</strong>
              </p>
              <p>{localize(latest, "notes")}</p>
              {order.acceptedQuote ? (
                <>
                <QuoteBenefitBreakdown preview={order.acceptedQuote.benefits} />
                <Notice>
                  {t("Accepted quote version {0}. Agreed amount {1}.", {
                    0: order.acceptedQuote.version,
                    1: money(order.acceptedQuote.amountPaise),
                  })}
                </Notice>
                </>
              ) : order.status === "quote_sent" && !admin ? (
                <>
                  <p className="small-print">
                    {t(
                      "Accepting agrees to this version's price and proposed delivery date. Fabric still needs to be received and inspected before stitching.",
                    )}
                  </p>
                  <div className="stack-actions no-print">
                    <QuoteAcceptance key={`${order._id}:${order.revision}`} order={order} quote={latest} busy={busy} action={action} reloadOrder={reload} />
                    <Button
                      className="button secondary"
                      busy={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              "Decline this quote and return the request for review?",
                            ),
                          )
                        )
                          action(`/orders/${id}/quote-response`, {
                            revision: order.revision,
                            quoteVersion: latest.version,
                            decision: "reject",
                          });
                      }}
                    >
                      {t("Request a review")}
                    </Button>
                  </div>
                </>
              ) : null}
            </section>
          )}
          {admin && (
            <>
              <section className="panel no-print">
                <h2>{t("Send a quote")}</h2>
                <p className="small-print">
                  {t(
                    "Available during review or to revise a pending quote. A new version replaces the offer awaiting acceptance.",
                  )}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const amountPaise = quote.lineItems.length
                      ? quote.lineItems.reduce(
                          (sum, line) => sum + line.amountPaise,
                          0,
                        )
                      : Math.round(Number(quote.amount) * 100);
                    action(`/admin/orders/${id}/quotes`, {
                      revision: order.revision,
                      amountPaise,
                      deliveryDate: quote.deliveryDate,
                      notes: quote.notes,
                      ...(quote.notesHi ? { notesHi: quote.notesHi } : {}),
                      ...(quote.lineItems.length
                        ? { lineItems: quote.lineItems }
                        : {}),
                    });
                  }}
                >
                  <Field
                    label={t("Total stitching price (INR)")}
                    name="quoteAmount"
                    type="number"
                    min="1"
                    max="1000000"
                    step="0.01"
                    required={!quote.lineItems.length}
                    disabled={Boolean(quote.lineItems.length)}
                    value={quote.amount}
                    onChange={(e) =>
                      setQuote({
                        ...quote,
                        amount: e.target.value,
                      })
                    }
                  />
                  <Field
                    label={t("Proposed delivery date")}
                    name="quoteDate"
                    type="date"
                    required
                    value={quote.deliveryDate}
                    onChange={(e) =>
                      setQuote({
                        ...quote,
                        deliveryDate: e.target.value,
                      })
                    }
                  />
                  <Field label={t("Quote notes")} name="quoteNotes">
                    <textarea
                      id="quoteNotes"
                      rows="3"
                      maxLength="2000"
                      value={quote.notes}
                      onChange={(e) =>
                        setQuote({
                          ...quote,
                          notes: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <QuoteLineEditor
                    value={quote.lineItems}
                    onChange={(lineItems) => setQuote({ ...quote, lineItems })}
                    quantity={order.quantity}
                  />
                  <Field
                    label={t("Hindi quote notes (optional)")}
                    name="quoteNotesHi"
                  >
                    <textarea
                      id="quoteNotesHi"
                      lang="hi"
                      rows="3"
                      maxLength="2000"
                      value={quote.notesHi}
                      onChange={(e) =>
                        setQuote({ ...quote, notesHi: e.target.value })
                      }
                    />
                  </Field>
                  <Button
                    className="button"
                    busy={busy}
                    disabled={
                      !["under_review", "quote_sent"].includes(order.status)
                    }
                  >
                    {t("Send quote")}
                  </Button>
                </form>
              </section>
              <section className="panel no-print">
                <h2>{t("Update progress")}</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (
                      ["cancelled", "rejected"].includes(status) &&
                      !window.confirm(
                        t("Mark request {0}?", {
                          0: readable(status),
                        }),
                      )
                    )
                      return;
                    action(
                      `/admin/orders/${id}/status`,
                      {
                        revision: order.revision,
                        status,
                        note,
                        ...(noteHi ? { noteHi } : {}),
                      },
                      "PATCH",
                    );
                    setStatus("");
                  }}
                >
                  <Field label={t("Next status")} name="nextStatus">
                    <select
                      id="nextStatus"
                      required
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">{t("Choose next step")}</option>
                      {(transitions[order.status] || []).map((s) => (
                        <option key={s} value={s}>
                          {readable(s)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("Progress note")} name="statusNote">
                    <textarea
                      id="statusNote"
                      rows="2"
                      maxLength="1000"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                  <Field
                    label={t("Hindi progress note (optional)")}
                    name="statusNoteHi"
                  >
                    <textarea
                      id="statusNoteHi"
                      lang="hi"
                      rows="2"
                      maxLength="1000"
                      value={noteHi}
                      onChange={(e) => setNoteHi(e.target.value)}
                    />
                  </Field>
                  <Button
                    className="button"
                    busy={busy}
                    disabled={!transitions[order.status]?.length}
                  >
                    {t("Update status")}
                  </Button>
                </form>
                <p className="small-print">
                  {t(
                    "Quote acceptance is a customer action. Steps cannot be skipped.",
                  )}
                </p>
              </section>
            </>
          )}
          {!admin &&
            ["request_received", "under_review", "quote_sent"].includes(
              order.status,
            ) && (
              <section className="panel no-print">
                <h3>{t("Change of plans?")}</h3>
                <p className="small-print">
                  {t("You may cancel before quote acceptance.")}
                </p>
                <Button
                  className="button secondary danger"
                  busy={busy}
                  onClick={() => {
                    if (window.confirm(t("Cancel this stitching request?")))
                      action(`/orders/${id}/cancel`, {
                        revision: order.revision,
                      });
                  }}
                >
                  {t("Cancel request")}
                </Button>
              </section>
            )}
          <section className="panel no-print">
            <h3>{t("Need a little help?")}</h3>
            <p>{t("Talk to the atelier about this request.")}</p>
            {site.whatsapp && (
              <a
                className="text-link"
                target="_blank"
                rel="noreferrer"
                href={`https://wa.me/${(site.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(
                  t(
                    "Hello Khwab Stitch, I have a question about request {0}.",
                    {
                      0: order.orderNumber,
                    },
                  ),
                )}`}
              >
                {t("Ask on WhatsApp ")}
                <ExternalLink size={15} />
              </a>
            )}
            <p className="small-print">
              {t("Only your request number is included in this link.")}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
export function Profile() {
  useLanguage();
  const { profile, reloadProfile, logout } = useAuth();
  const [name, setName] = useState(profile?.name || ""),
    [phone, setPhone] = useState(profile?.phone || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  return (
    <div className="container page narrow">
      <PageHeading
        eyebrow={t("YOUR SPACE")}
        title={t("A few personal details.")}
      />
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setSuccess("");
          try {
            await api("/me", {
              method: "PATCH",
              body: {
                name,
                ...(phone
                  ? {
                      phone,
                    }
                  : {}),
              },
            });
            await reloadProfile();
            setSuccess("Your profile has been updated.");
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorMessage message={error} />
        {success && <Notice>{success}</Notice>}
        <Field
          label={t("Name")}
          name="profileName"
          required
          minLength="2"
          maxLength="100"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label={t("Email")}
          name="email"
          value={profile?.email || ""}
          disabled
          hint={
            profile?.emailVerified
              ? t("Your registration email.")
              : t("Registration email. This address has not been verified.")
          }
        />
        <Field
          label={t("WhatsApp / phone")}
          name="profilePhone"
          type="tel"
          pattern="(?:\+?91[\s\-]?)?[6-9][0-9]{9}"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          hint={t("Manually entered, unverified.")}
        />
        <Button className="button" busy={busy}>
          {t("Save profile")}
        </Button>
      </form>
      <section className="panel">
        <h2>{t("Your account, your choice.")}</h2>
        <Link className="button secondary" to="/account/work">
          {t("Want to work as a tailor?")}
        </Link>
        <p>
          {t(
            "Request deletion of your profile, identity and eligible private images. Active orders and any justified retention will be reviewed by the atelier.",
          )}
        </p>
        {profile?.deletionRequestedAt ? (
          <Notice>
            {t(
              "Deletion requested on {0}. Please contact the atelier for follow-up.",
              {
                0: date(profile.deletionRequestedAt),
              },
            )}
          </Notice>
        ) : (
          <Button
            className="button secondary danger"
            busy={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  t(
                    "Request account deletion? The atelier will review active orders and any justified retention before processing.",
                  ),
                )
              )
                return;
              setBusy(true);
              setError("");
              try {
                await api("/me/deletion-request", {
                  method: "POST",
                  body: {},
                });
                await reloadProfile();
                setSuccess(
                  "Your deletion request has been recorded. Contact the atelier for follow-up.",
                );
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Request account deletion")}
          </Button>
        )}
        <button className="text-button" onClick={logout}>
          {t("Sign out of this browser session")}
        </button>
      </section>
    </div>
  );
}
