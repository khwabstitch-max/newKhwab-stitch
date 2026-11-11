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

const defaultSettings = { enabled: false, offersEnabled: false, creditsEnabled: false, referralsEnabled: false, loyaltyEnabled: false, maxCreditBps: 0, referralRewardPaise: 0, referredRewardPaise: 0, qualifyingStitchingPaise: 0, milestones: [], terms: "", termsHi: "", revision: 0 };
const emptyOffer = { code: "", name: "", nameHi: "", description: "", descriptionHi: "", status: "draft", type: "fixed", value: null, maxDiscountPaise: null, minimumStitchingPaise: 0, garments: [], startsAt: null, endsAt: null, totalUseLimit: null, perCustomerLimit: 1, displayOrder: 0 };

export function AdminCommerce() {
  useLanguage();
  const resource = useResource("/admin/commerce/settings"), offers = usePagedCollection("/admin/commerce/offers?limit=20");
  const [settings, setSettings] = useState(null), [editing, setEditing] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [adjustment, setAdjustment] = useState({ owner: "", amount: "", reason: "", clientId: crypto.randomUUID() });
  const patch = (key, value) => setSettings(current => ({ ...current, [key]: value }));
  const offerPatch = (key, value) => setEditing(current => ({ ...current, [key]: value }));
  async function perform(action) { setBusy(true); setError(""); setNotice(""); try { await action(); } catch (error) { setError(error); } finally { setBusy(false); } }
  return <>
    <PageHeading title={t("Offers, loyalty and stitching credits")} />
    <Notice>{t("All programmes start disabled. Configure real eligibility, redemption limits and terms before enabling them. Credits and discounts never pay transport.")}</Notice>
    <ErrorMessage message={error || resource.error || offers.error} retry={resource.reload} />
    {!settings && resource.data && <button className="button secondary" onClick={() => setSettings({ ...defaultSettings, ...resource.data, moneyFields: Object.fromEntries(["referralRewardPaise", "referredRewardPaise", "qualifyingStitchingPaise"].map(key => [key, rupees(resource.data[key])])) })}>{t("Edit programme settings")}</button>}
    {settings && <form className="panel" onSubmit={event => { event.preventDefault(); perform(async () => {
      const body = Object.fromEntries(Object.keys(defaultSettings).map(key => [key, settings[key]]));
      for (const key of ["referralRewardPaise", "referredRewardPaise", "qualifyingStitchingPaise"]) body[key] = paise(settings.moneyFields[key]);
      await api("/admin/commerce/settings", { method: "PATCH", body }); setSettings(null); resource.reload(); setNotice(t("Programme settings saved."));
    }); }}>
      <h2>{t("Programme settings")}</h2>
      {[ ["enabled", "Enable benefits programme"], ["offersEnabled", "Enable offers"], ["creditsEnabled", "Enable credit redemption"], ["referralsEnabled", "Enable referrals"], ["loyaltyEnabled", "Enable loyalty milestones"] ].map(([key, label]) => <label className="checkbox" key={key}><input type="checkbox" checked={settings[key]} onChange={event => patch(key, event.target.checked)} />{t(label)}</label>)}
      <Field label={t("Maximum stitching percentage payable with credits")} name="credit-percent" type="number" min="0" max="100" step="0.01" value={settings.maxCreditBps / 100} onChange={event => patch("maxCreditBps", Math.round(Number(event.target.value) * 100))} />
      {[ ["referralRewardPaise", "Referrer reward (₹)"], ["referredRewardPaise", "New customer reward (₹)"], ["qualifyingStitchingPaise", "Minimum qualifying stitching subtotal (₹)"] ].map(([key, label]) => <Field key={key} label={t(label)} name={key} inputMode="decimal" value={settings.moneyFields[key]} onChange={event => patch("moneyFields", { ...settings.moneyFields, [key]: event.target.value })} />)}
      <Field label={t("Programme terms")} name="commerce-terms"><textarea id="commerce-terms" maxLength={2500} value={settings.terms} onChange={event => patch("terms", event.target.value)} /></Field>
      <Field label={t("Hindi programme terms")} name="commerce-terms-hi"><textarea id="commerce-terms-hi" maxLength={2500} value={settings.termsHi} onChange={event => patch("termsHi", event.target.value)} /></Field>
      <h3>{t("Loyalty milestones")}</h3>
      {settings.milestones.map((item, index) => <fieldset key={index} className="form-grid"><Field label={t("Stable milestone code")} name={`milestone-code-${index}`} value={item.code} onChange={event => patch("milestones", settings.milestones.map((value, position) => position === index ? { ...value, code: event.target.value.toUpperCase() } : value))} /><Field label={t("Qualifying delivered orders")} name={`milestone-orders-${index}`} type="number" min="1" value={item.orders} onChange={event => patch("milestones", settings.milestones.map((value, position) => position === index ? { ...value, orders: Number(event.target.value) } : value))} /><Field label={t("Reward (paise)")} name={`milestone-reward-${index}`} type="number" min="1" value={item.rewardPaise} onChange={event => patch("milestones", settings.milestones.map((value, position) => position === index ? { ...value, rewardPaise: Number(event.target.value) } : value))} /><button type="button" className="text-button danger" onClick={() => patch("milestones", settings.milestones.filter((_, position) => position !== index))}>{t("Remove milestone")}</button></fieldset>)}
      <button type="button" className="button secondary" disabled={settings.milestones.length >= 20} onClick={() => patch("milestones", [...settings.milestones, { code: "", orders: 1, rewardPaise: 0 }])}>{t("Add milestone")}</button>
      <div className="stack-actions"><Button busy={busy} className="button">{t("Save programme settings")}</Button><button type="button" className="button secondary" onClick={() => setSettings(null)}>{t("Cancel")}</button></div>
    </form>}
    <section className="panel"><h2>{t("Manage offers")}</h2><button className="button secondary" onClick={() => setEditing({ ...emptyOffer })}>{t("Create offer")}</button>
      {offers.data.map(offer => <article key={offer._id}><h3>{localize(offer, "name")} · {offer.code}</h3><p>{t(offer.status === "published" ? "Published" : offer.status === "archived" ? "Archived" : "Draft")} · {t("Used")}: {offer.usedCount}</p><div className="stack-actions"><button className="text-button" onClick={() => setEditing({ ...emptyOffer, ...offer })}>{t("Edit offer")}</button><button className="text-button danger" onClick={() => perform(async () => { await api(`/admin/commerce/offers/${offer._id}`, { method: "DELETE", body: { revision: offer.revision } }); offers.refresh(); })}>{t("Archive offer")}</button></div></article>)}
      {offers.hasMore && <button className="text-button" disabled={offers.loading} onClick={offers.loadMore}>{t("Load more offers")}</button>}
    </section>
    {editing && <form className="panel" onSubmit={event => { event.preventDefault(); perform(async () => {
      const body = Object.fromEntries(Object.keys(emptyOffer).map(key => [key, editing[key]]));
      if (editing._id) body.revision = editing.revision;
      await api(`/admin/commerce/offers${editing._id ? "/" + editing._id : ""}`, { method: editing._id ? "PATCH" : "POST", body }); setEditing(null); offers.refresh(); setNotice(t("Offer saved."));
    }); }}>
      <h2>{t("Offer editor")}</h2>
      {[ ["code", "Offer code"], ["name", "Offer name"], ["nameHi", "Hindi offer name"], ["description", "Offer description"], ["descriptionHi", "Hindi offer description"] ].map(([key, label]) => <Field key={key} name={`offer-${key}`} label={t(label)} required={key === "code" || key === "name"} value={editing[key]} onChange={event => offerPatch(key, key === "code" ? event.target.value.toUpperCase() : event.target.value)} />)}
      <Field name="offer-status" label={t("Status")}><select id="offer-status" value={editing.status} onChange={event => offerPatch("status", event.target.value)}>{["draft", "published", "archived"].map(value => <option key={value} value={value}>{t(value === "draft" ? "Draft" : value === "published" ? "Published" : "Archived")}</option>)}</select></Field>
      <Field name="offer-type" label={t("Discount type")}><select id="offer-type" value={editing.type} onChange={event => offerPatch("type", event.target.value)}><option value="fixed">{t("Fixed paise")}</option><option value="percentage">{t("Percentage in basis points")}</option></select></Field>
      {[ ["value", "Discount value"], ["minimumStitchingPaise", "Minimum stitching (paise)"], ["maxDiscountPaise", "Maximum discount (paise, optional)"], ["totalUseLimit", "Total uses (optional)"], ["perCustomerLimit", "Uses per customer"], ["displayOrder", "Display order"] ].map(([key, label]) => <Field key={key} name={`offer-${key}`} label={t(label)} type="number" value={editing[key] ?? ""} onChange={event => offerPatch(key, event.target.value === "" && ["maxDiscountPaise", "totalUseLimit"].includes(key) ? null : Number(event.target.value))} />)}
      <p>{t("Percentage discounts use 100 basis points for 1%. Prices use integer paise. These rates are not enabled until the programme and offer are published.")}</p>
      <fieldset><legend>{t("Applicable garments")}</legend>{["kurti", "suit", "blouse", "alteration"].map(garment => <label className="checkbox" key={garment}><input type="checkbox" checked={editing.garments.includes(garment)} onChange={event => offerPatch("garments", event.target.checked ? [...editing.garments, garment] : editing.garments.filter(value => value !== garment))} />{t(garment === "kurti" ? "Kurti" : garment === "suit" ? "Suit" : garment === "blouse" ? "Blouse" : "Alteration")}</label>)}</fieldset>
      {[ ["startsAt", "Starts at (UTC, optional)"], ["endsAt", "Ends at (UTC, optional)"] ].map(([key, label]) => <Field key={key} name={`offer-${key}`} label={t(label)} type="datetime-local" value={editing[key] ? editing[key].slice(0, 16) : ""} onChange={event => offerPatch(key, event.target.value ? event.target.value + ":00.000Z" : null)} />)}
      <div className="stack-actions"><Button busy={busy} className="button">{t("Save offer")}</Button><button type="button" className="button secondary" onClick={() => setEditing(null)}>{t("Cancel")}</button></div>
    </form>}
    <form className="panel" onSubmit={event => { event.preventDefault(); perform(async () => {
      const response = await api("/admin/commerce/credits", { method: "POST", body: { owner: adjustment.owner, clientId: adjustment.clientId, deltaPaise: paise(adjustment.amount, true), reason: adjustment.reason } });
      setNotice(`${t("Credit adjustment saved. Current balance")}: ${money(response.data.balancePaise)}`); setAdjustment({ owner: "", amount: "", reason: "", clientId: crypto.randomUUID() });
    }); }}><h2>{t("Audited credit adjustment")}</h2><p>{t("Use the customer's account ID. A signed amount adds or removes credit; a debit cannot make the wallet negative. Retrying the same request cannot apply it twice.")}</p>
      <Field label={t("Customer account ID")} name="credit-owner" required value={adjustment.owner} onChange={event => setAdjustment({ ...adjustment, owner: event.target.value })} />
      <Field label={t("Signed credit amount (₹)")} name="credit-adjustment" required inputMode="decimal" value={adjustment.amount} onChange={event => setAdjustment({ ...adjustment, amount: event.target.value })} />
      <Field label={t("Reason for adjustment")} name="credit-reason" required minLength={5} maxLength={300} value={adjustment.reason} onChange={event => setAdjustment({ ...adjustment, reason: event.target.value })} />
      <Button className="button" busy={busy}>{t("Save credit adjustment")}</Button>
    </form>
    {notice && <Notice>{notice}</Notice>}
  </>;
}
