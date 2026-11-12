import { useState } from "react";
import { Link } from "react-router-dom";
import { api, dateTime, money } from "../lib/api";
import { useResource } from "../lib/hooks";
import { usePagedCollection } from "../lib/usePagedCollection";
import { useLanguage } from "../i18n/Language";
import { localize, t } from "../i18n/core";
import { Button, Empty, ErrorMessage, Field, Notice, PageHeading, Spinner } from "../components/ui";
import { ListPager } from "../components/ListPager";

const rupees = value => String((value || 0) / 100);
function paise(value, signed = false) {
  const text = String(value).trim();
  if (!(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(text)) throw Error(t("Enter a rupee amount with at most two decimal places."));
  const negative = text.startsWith("-"), parts = text.replace("-", "").split(".");
  const result = Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 100000000) throw Error(t("The amount is outside the supported range."));
  return negative ? -result : result;
}

export function AccountCommerce() {
  useLanguage();
  const account = useResource("/commerce/account"), offers = usePagedCollection("/commerce/offers?limit=20");
  const orders = usePagedCollection("/orders?status=quote_sent&limit=20");
  const [page, setPage] = useState(1), ledger = useResource(`/commerce/ledger?page=${page}&limit=20`);
  const [orderId, setOrderId] = useState(""), [offerCode, setOfferCode] = useState(""), [credit, setCredit] = useState("0");
  const [selected, setSelected] = useState(null), [referral, setReferral] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const details = account.data;
  async function perform(action) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (error) { setError(error); } finally { setBusy(false); }
  }
  return <>
    <PageHeading eyebrow={t("YOUR ATELIER ACCOUNT")} title={t("Offers and stitching credits")} />
    <ErrorMessage message={error || account.error} retry={account.reload} />
    {account.loading && <Spinner />}
    {details && <>
      <section className="panel"><h2>{t("Stitching credit balance")}</h2><p className="price">{money(details.balancePaise)}</p>
        <p>{t("Stitching credits are not cash and cannot pay pickup or delivery charges.")}</p>
        {!details.enabled && <Notice>{t("Benefits are currently unavailable. Your existing balance is preserved; contact the atelier for help.")}</Notice>}
        {details.terms && <p>{localize(details, "terms")}</p>}
      </section>
      {details.enabled && details.offersEnabled && <section className="panel"><h2>{t("Available offers")}</h2>
        <ErrorMessage message={offers.error} retry={offers.reload} />
        {offers.data.map(offer => <article key={offer._id}><h3>{localize(offer, "name")}</h3><p>{localize(offer, "description")}</p><p><strong>{offer.code}</strong> · {offer.type === "fixed" ? money(offer.value) : `${offer.value / 100}%`} {t("off eligible stitching")}</p><p>{t("Minimum stitching subtotal")}: {money(offer.minimumStitchingPaise)}</p></article>)}
        {!offers.loading && !offers.error && !offers.data.length && <p>{t("No published offers are available right now.")}</p>}
        {offers.hasMore && <button className="button secondary" disabled={offers.loading} onClick={offers.loadMore}>{t("Load more offers")}</button>}
      </section>}
      {(orders.data.length > 0 || (details.enabled && (details.offersEnabled || details.creditsEnabled))) && <section className="panel"><h2>{t("Apply benefits to a current quote")}</h2>
        <p>{t("Benefits apply only to itemized final quotes. Saving here reserves nothing and does not accept the quote; open your order and explicitly accept the current quote afterwards.")}</p>
        <ErrorMessage message={orders.error} retry={orders.reload} />
        <Field label={t("Choose a quote awaiting your decision")} name="commerce-order"><select id="commerce-order" value={orderId} disabled={busy} onChange={event => {
          const next = event.target.value; setOrderId(next); setSelected(null); setOfferCode(""); setCredit("0");
          if (next) perform(async () => { const response = await api(`/commerce/quote-benefits/${next}`); setSelected(response.data); setOfferCode(response.data.selection.offerCode); setCredit(rupees(response.data.selection.creditPaise)); });
        }}><option value="">{t("Choose an order")}</option>{orders.data.map(order => <option key={order._id} value={order._id}>{order.orderNumber}</option>)}</select></Field>
        {orders.hasMore && <button className="text-button" disabled={orders.loading} onClick={orders.loadMore}>{t("Load more orders")}</button>}
        {selected && <form onSubmit={event => { event.preventDefault(); perform(async () => {
          const response = await api("/commerce/quote-benefits", { method: "POST", body: { orderId, revision: selected.revision, quoteVersion: selected.quoteVersion, offerCode: offerCode.trim().toUpperCase(), creditPaise: paise(credit) } });
          setSelected({ ...selected, ...response.data, valid: true, validationMessage: "" }); orders.refresh(); setNotice(t("Benefits saved. Review the current quote in your order before accepting it."));
        }); }}>
          <ErrorMessage message={selected.validationMessage} />
          {details.offersEnabled && <Field label={t("Offer code (optional)")} name="commerce-code" value={offerCode} maxLength={40} onChange={event => setOfferCode(event.target.value)} />}
          {details.creditsEnabled && <Field label={t("Stitching credits to use (₹)")} name="commerce-credit" inputMode="decimal" value={credit} onChange={event => setCredit(event.target.value)} hint={t("The server checks your balance and the configured stitching-only limit when you accept.")} />}
          <Button className="button" busy={busy}>{t("Save quote benefits")}</Button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => perform(async () => {
            const response = await api("/commerce/quote-benefits", { method: "POST", body: { orderId, revision: selected.revision, quoteVersion: selected.quoteVersion, offerCode: "", creditPaise: 0 } });
            setSelected({ ...selected, ...response.data, valid: true, validationMessage: "" }); setOfferCode(""); setCredit("0"); orders.refresh(); setNotice(t("Saved benefits removed. Review your original quote before accepting."));
          })}>{t("Remove saved benefits")}</button>
          {selected.preview && <dl className="review-list"><div><dt>{t("Original quote")}</dt><dd>{money(selected.preview.grossAmountPaise)}</dd></div><div><dt>{t("Offer discount")}</dt><dd>{money(selected.preview.discountPaise)}</dd></div><div><dt>{t("Stitching credits")}</dt><dd>{money(selected.preview.creditPaise)}</dd></div><div><dt>{t("Payable after benefits")}</dt><dd>{money(selected.preview.amountPaise)}</dd></div></dl>}
          <Link className="button secondary" to={`/orders/${orderId}`}>{t("Open order and quote")}</Link>
        </form>}
      </section>}
      {details.enabled && details.referralsEnabled && <section className="panel"><h2>{t("Referrals")}</h2>
        <p>{t("A referral must be recorded before your first active request. Rewards are issued only after a qualifying order is genuinely delivered, under the published programme terms.")}</p>
        {details.referralCode ? <p>{t("Your referral code")}: <strong>{details.referralCode}</strong></p> : <button className="button secondary" disabled={busy} onClick={() => perform(async () => { await api("/commerce/referral-code", { method: "POST", body: {} }); account.reload(); })}>{t("Create my referral code")}</button>}
        {details.referral ? <p>{t("Referral recorded")}: {details.referral.code} · {t(details.referral.state === "qualified" ? "Qualified" : "Awaiting a qualifying delivery")}</p> : <form onSubmit={event => { event.preventDefault(); perform(async () => { await api("/commerce/referrals", { method: "POST", body: { code: referral.trim().toUpperCase() } }); account.reload(); }); }}><Field label={t("Referral code from a friend")} name="commerce-referral" required value={referral} onChange={event => setReferral(event.target.value)} /><Button className="button secondary" busy={busy}>{t("Record referral")}</Button></form>}
      </section>}
      {details.enabled && details.loyaltyEnabled && <section className="panel"><h2>{t("Loyalty milestones")}</h2><p>{t("Qualifying delivered orders")}: {details.deliveredOrders}</p>{details.milestones.map(item => <p key={item.code}>{item.code}: {item.orders} {t("delivered orders")} · {money(item.rewardPaise)}</p>)}</section>}
      <section className="panel"><h2>{t("Credit history")}</h2><ErrorMessage message={ledger.error} retry={ledger.reload} />
        {ledger.data?.map(item => <article key={item._id}><p><strong>{item.deltaPaise < 0 ? "−" : "+"}{money(Math.abs(item.deltaPaise))}</strong> · {dateTime(item.createdAt)}</p><p>{item.kind === "admin" ? item.reason : t(item.reason)}</p><small>{t("Balance after this event")}: {money(item.balancePaise)}</small></article>)}
        {!ledger.loading && !ledger.error && !ledger.data?.length && <Empty title={t("No credit events yet")} />}
        <ListPager resource={ledger} page={page} onChange={setPage} label="Credit history pagination" />
      </section>
    </>}
    {notice && <Notice>{notice}</Notice>}
  </>;
}




export { CommerceManagement as AdminCommerce } from "../components/CommerceManagement";
