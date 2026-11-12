import { useRef, useState } from "react";
import { api, money } from "../lib/api";
import { useResource } from "../lib/hooks";
import { usePagedCollection } from "../lib/usePagedCollection";
import { t, localize } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { amountInput, parseAmount, parsePercentage, businessDateInput, businessDateIso, garmentChoices } from "../lib/admin-values";
import { AdminSection, ChoiceGroup } from "./AdminFields";
import { Badge, Button, Empty, ErrorMessage, Field, Notice, PageHeading, Spinner } from "./ui";

const defaults = { enabled: false, offersEnabled: false, creditsEnabled: false, referralsEnabled: false, loyaltyEnabled: false, maxCreditBps: 0, referralRewardPaise: 0, referredRewardPaise: 0, qualifyingStitchingPaise: 0, milestones: [], terms: "", termsHi: "", revision: 0 };
const offerDefaults = { code: "", name: "", nameHi: "", description: "", descriptionHi: "", status: "draft", type: "fixed", value: null, maxDiscountPaise: null, minimumStitchingPaise: 0, garments: ["kurti"], startsAt: null, endsAt: null, totalUseLimit: null, perCustomerLimit: 1, displayOrder: 0 };
const toOffer = offer => ({ ...structuredClone(offerDefaults), ...structuredClone(offer), valueInput: amountInput(offer?.value), minimumInput: amountInput(offer?.minimumStitchingPaise ?? 0), maximumInput: amountInput(offer?.maxDiscountPaise), startsInput: businessDateInput(offer?.startsAt), endsInput: businessDateInput(offer?.endsAt) });

export function CommerceManagement() {
  useLanguage();
  const resource = useResource("/admin/commerce/settings"), offers = usePagedCollection("/admin/commerce/offers?limit=20");
  const [settings, setSettings] = useState(null), [editing, setEditing] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [customerQuery, setCustomerQuery] = useState(""), [customer, setCustomer] = useState(null), [direction, setDirection] = useState("add"), [amount, setAmount] = useState(""), [reason, setReason] = useState(""), [uncertain, setUncertain] = useState(false);
  const customers = useResource(customerQuery.trim().length >= 2 ? `/admin/customers?limit=10&search=${encodeURIComponent(customerQuery.trim())}` : null);
  const creditAttempt = useRef(null);
  const patch = (key, value) => setSettings(previous => ({ ...previous, [key]: value }));
  const offerPatch = (key, value) => setEditing(previous => ({ ...previous, [key]: value }));
  async function perform(action) { if (busy) return; setBusy(true); setError(""); setNotice(""); try { await action(); } catch (failure) { setError(failure); } finally { setBusy(false); } }
  function editProgramme() {
    const value = { ...structuredClone(defaults), ...structuredClone(resource.data) };
    setSettings({ ...value, percentageInput: amountInput(value.maxCreditBps), moneyFields: Object.fromEntries(["referralRewardPaise", "referredRewardPaise", "qualifyingStitchingPaise"].map(key => [key, amountInput(value[key])])), milestones: value.milestones.map(item => ({ ...item, rewardInput: amountInput(item.rewardPaise) })) });
  }
  return <>
    <PageHeading title={t("Offers, loyalty and stitching credits")} />
    <Notice>{t("All programmes start disabled. Configure real eligibility, redemption limits and terms before enabling them. Credits and discounts never pay transport.")}</Notice>
    <ErrorMessage message={error} />{notice && <Notice>{notice}</Notice>}
    <ErrorMessage message={resource.error} retry={resource.reload} />
    {resource.loading && <Spinner />}
    {!settings && resource.data && <button data-admin-discard className="button secondary" disabled={busy} onClick={editProgramme}>{t("Edit programme settings")}</button>}
    {settings && <form className="panel" data-admin-editor onSubmit={event => {
      event.preventDefault(); perform(async () => {
        const body = Object.fromEntries(Object.keys(defaults).map(key => [key, settings[key]]));
        body.maxCreditBps = parsePercentage(settings.percentageInput);
        for (const key of ["referralRewardPaise", "referredRewardPaise", "qualifyingStitchingPaise"]) body[key] = parseAmount(settings.moneyFields[key]);
        body.milestones = settings.milestones.map(({ rewardInput, ...item }) => ({ ...item, rewardPaise: parseAmount(rewardInput) }));
        await api("/admin/commerce/settings", { method: "PATCH", body }); setSettings(null); resource.reload(); setNotice(t("Programme settings saved."));
      });
    }}><fieldset className="admin-form-fields" data-admin-lock disabled={busy}>
      <AdminSection title="Programme settings">
        {[["enabled", "Enable benefits programme"], ["offersEnabled", "Enable offers"], ["creditsEnabled", "Enable credit redemption"], ["referralsEnabled", "Enable referrals"], ["loyaltyEnabled", "Enable loyalty milestones"]].map(([key, label]) => <label className="checkbox" key={key}><input type="checkbox" checked={settings[key]} onChange={event => patch(key, event.target.checked)} />{t(label)}</label>)}
        <Field label={t("Maximum stitching percentage payable with credits")} name="credit-percent" inputMode="decimal" value={settings.percentageInput} onChange={event => patch("percentageInput", event.target.value)} />
        <div className="form-grid">{[["referralRewardPaise", "Referrer reward (₹)"], ["referredRewardPaise", "New customer reward (₹)"], ["qualifyingStitchingPaise", "Minimum qualifying stitching subtotal (₹)"]].map(([key, label]) => <Field key={key} label={t(label)} name={key} inputMode="decimal" value={settings.moneyFields[key]} onChange={event => patch("moneyFields", { ...settings.moneyFields, [key]: event.target.value })} />)}</div>
        <Field label={t("Programme terms")} name="commerce-terms"><textarea id="commerce-terms" maxLength={2500} value={settings.terms} onChange={event => patch("terms", event.target.value)} /></Field>
        <Field label={t("Hindi programme terms")} name="commerce-terms-hi"><textarea id="commerce-terms-hi" maxLength={2500} value={settings.termsHi} onChange={event => patch("termsHi", event.target.value)} /></Field>
        <h3>{t("Loyalty milestones")}</h3>{settings.milestones.map((item, index) => <fieldset className="admin-slide-card" key={index}><div className="form-grid"><Field label={t("Qualifying delivered orders")} name={`milestone-orders-${index}`} type="number" min={1} max={10000} value={item.orders} onChange={event => patch("milestones", settings.milestones.map((row, position) => position === index ? { ...row, orders: Number(event.target.value) } : row))} /><Field label={t("admin.commerce.reward")} name={`milestone-reward-${index}`} inputMode="decimal" value={item.rewardInput} onChange={event => patch("milestones", settings.milestones.map((row, position) => position === index ? { ...row, rewardInput: event.target.value } : row))} /></div><details className="admin-advanced"><summary>{t("admin.nav.advanced")}</summary><Field label={t("Stable milestone code")} name={`milestone-code-${index}`} value={item.code} onChange={event => patch("milestones", settings.milestones.map((row, position) => position === index ? { ...row, code: event.target.value.toUpperCase() } : row))} /></details><button type="button" className="text-button danger" onClick={() => patch("milestones", settings.milestones.filter((_, position) => position !== index))} data-admin-mutates>{t("Remove milestone")}</button></fieldset>)}
        <button type="button" className="button secondary" disabled={settings.milestones.length >= 20} onClick={() => patch("milestones", [...settings.milestones, { code: "MILESTONE-" + crypto.randomUUID().slice(0, 8).toUpperCase(), orders: 1, rewardPaise: 0, rewardInput: "" }])} data-admin-mutates>{t("Add milestone")}</button>
      </AdminSection><div className="form-actions"><Button className="button" busy={busy}>{t("Save programme settings")}</Button><button data-admin-discard type="button" className="button secondary" onClick={() => setSettings(null)}>{t("Cancel")}</button></div>
    </fieldset></form>}
    <section className="panel"><div className="section-heading"><h2>{t("Manage offers")}</h2><button data-admin-discard className="button secondary" disabled={busy} onClick={() => setEditing(toOffer({}))}>{t("Create offer")}</button></div>
      <ErrorMessage message={offers.error} retry={offers.reload} />{offers.loading && <Spinner />}
      {!offers.loading && !offers.error && !offers.data.length && <Empty title={t("admin.commerce.noOffers")} />}
      {offers.data.map(offer => <article className="admin-slide-card" key={offer._id}><h3>{localize(offer, "name")} · {offer.code}</h3><Badge>{t(offer.status === "published" ? "Published" : offer.status === "archived" ? "Archived" : "Draft")}</Badge><p>{offer.type === "fixed" ? money(offer.value) : amountInput(offer.value) + "%"} · {t("Used")}: {offer.usedCount}</p><div className="stack-actions"><button data-admin-discard className="button secondary small" disabled={busy} onClick={() => setEditing(toOffer(offer))}>{t("Edit offer")}</button><button className="text-button danger" disabled={busy || offer.status === "archived"} onClick={() => { if (window.confirm(t("admin.commerce.archiveConfirm"))) perform(async () => { await api(`/admin/commerce/offers/${offer._id}`, { method: "DELETE", body: { revision: offer.revision } }); offers.refresh(); setNotice(t("admin.form.saved")); }); }}>{t("Archive offer")}</button></div></article>)}
      {offers.hasMore && <button type="button" className="text-button" disabled={offers.loading} onClick={offers.loadMore}>{t("Load more offers")}</button>}
    </section>
    {editing && <form className="panel" data-admin-editor onSubmit={event => {
      event.preventDefault(); perform(async () => {
        const body = Object.fromEntries(Object.keys(offerDefaults).map(key => [key, editing[key]]));
        body.value = editing.type === "percentage" ? parsePercentage(editing.valueInput) : parseAmount(editing.valueInput);
        body.minimumStitchingPaise = parseAmount(editing.minimumInput);
        body.maxDiscountPaise = parseAmount(editing.maximumInput, { optional: true });
        body.startsAt = businessDateIso(editing.startsInput); body.endsAt = businessDateIso(editing.endsInput);
        if (editing._id) body.revision = editing.revision;
        await api(`/admin/commerce/offers${editing._id ? "/" + editing._id : ""}`, { method: editing._id ? "PATCH" : "POST", body }); setEditing(null); offers.refresh(); setNotice(t("Offer saved."));
      });
    }}><fieldset className="admin-form-fields" data-admin-lock disabled={busy}>
      <AdminSection title="Offer editor"><div className="admin-language-pair">{[["", "admin.home.english"], ["Hi", "admin.home.hindi"]].map(([suffix, label]) => <fieldset key={label}><legend>{t(label)}</legend><Field label={t(suffix ? "Hindi offer name" : "Offer name")} name={`offer-name${suffix}`} required={!suffix} maxLength={120} value={editing["name" + suffix]} onChange={event => offerPatch("name" + suffix, event.target.value)} /><Field label={t(suffix ? "Hindi offer description" : "Offer description")} name={`offer-description${suffix}`}><textarea id={`offer-description${suffix}`} maxLength={1000} value={editing["description" + suffix]} onChange={event => offerPatch("description" + suffix, event.target.value)} /></Field></fieldset>)}</div>
      <div className="form-grid"><Field label={t("Offer code")} name="offer-code" required minLength={3} maxLength={40} pattern="[A-Z0-9][A-Z0-9_-]{2,39}" value={editing.code} onChange={event => offerPatch("code", event.target.value.toUpperCase())} /><Field label={t("Status")} name="offer-status"><select id="offer-status" value={editing.status} onChange={event => offerPatch("status", event.target.value)}>{["draft", "published", "archived"].map(value => <option key={value} value={value}>{t(`admin.visibility.${value}`)}</option>)}</select></Field>
        <Field label={t("Discount type")} name="offer-type"><select id="offer-type" value={editing.type} onChange={event => offerPatch("type", event.target.value)}><option value="fixed">{t("admin.commerce.rupees")}</option><option value="percentage">{t("admin.commerce.percentage")}</option></select></Field><Field label={t(editing.type === "fixed" ? "admin.commerce.rupees" : "admin.commerce.percentage")} name="offer-value" required inputMode="decimal" value={editing.valueInput} onChange={event => offerPatch("valueInput", event.target.value)} />
        <Field label={t("admin.commerce.minimum")} name="offer-minimum" required inputMode="decimal" value={editing.minimumInput} onChange={event => offerPatch("minimumInput", event.target.value)} /><Field label={t("admin.commerce.maximum")} name="offer-maximum" inputMode="decimal" value={editing.maximumInput} onChange={event => offerPatch("maximumInput", event.target.value)} />
        {[["totalUseLimit", "Total uses (optional)"], ["perCustomerLimit", "Uses per customer"], ["displayOrder", "Display order"]].map(([key, label]) => <Field key={key} label={t(label)} name={`offer-${key}`} type="number" min={key === "displayOrder" ? -10000 : 1} value={editing[key] ?? ""} onChange={event => offerPatch(key, event.target.value === "" && key === "totalUseLimit" ? null : Number(event.target.value))} />)}
        <Field label={t("admin.commerce.starts")} name="offer-startsAt" type="datetime-local" value={editing.startsInput} onChange={event => offerPatch("startsInput", event.target.value)} /><Field label={t("admin.commerce.ends")} name="offer-endsAt" type="datetime-local" value={editing.endsInput} onChange={event => offerPatch("endsInput", event.target.value)} />
      </div><ChoiceGroup legend="Applicable garments" name="offer-garments" options={garmentChoices} value={editing.garments} onChange={value => offerPatch("garments", value)} />
      </AdminSection><div className="form-actions"><Button className="button" busy={busy}>{t("Save offer")}</Button><button data-admin-discard type="button" className="button secondary" onClick={() => setEditing(null)}>{t("Cancel")}</button></div>
    </fieldset></form>}
    <form className="panel" data-admin-editor onSubmit={async event => {
      event.preventDefault(); if (busy) return; const form = event.currentTarget; setError("");
      try {
        if (!creditAttempt.current) {
          if (!customer) throw Error(t("admin.commerce.selectCustomer"));
          const deltaPaise = parseAmount(amount) * (direction === "remove" ? -1 : 1);
          if (!deltaPaise) throw Error(t("admin.validation.money"));
          if (!window.confirm(t("admin.commerce.creditConfirm", { 0: `${deltaPaise > 0 ? "+" : ""}${money(deltaPaise)}`, 1: customer.name || customer.email }))) return;
          creditAttempt.current = { owner: customer._id, clientId: crypto.randomUUID(), deltaPaise, reason };
        }
        setBusy(true);
        const response = await api("/admin/commerce/credits", { method: "POST", body: creditAttempt.current });
        form.dataset.adminDirty = "false";
        creditAttempt.current = null; setUncertain(false); setCustomer(null); setAmount(""); setReason(""); setCustomerQuery(""); setNotice(`${t("Credit adjustment saved. Current balance")}: ${money(response.data.balancePaise)}`);
      } catch (failure) {
        setError(failure);
        if (creditAttempt.current && (!failure.status || failure.status >= 500)) setUncertain(true);
        else { creditAttempt.current = null; setUncertain(false); }
      } finally { setBusy(false); }
    }}><fieldset className="admin-form-fields" data-admin-lock disabled={busy}><AdminSection title="Audited credit adjustment" description="admin.commerce.creditHelp">
      <fieldset className="admin-form-fields" disabled={uncertain}>
        <Field label={t("admin.commerce.findCustomer")} name="credit-customer-search" type="search" value={customerQuery} onChange={event => setCustomerQuery(event.target.value)} />
        <ErrorMessage message={customers.error} retry={customers.reload} />{customers.loading && <Spinner />}
        <div className="admin-choice-grid">{customers.data?.map(person => <label className={`admin-customer-result ${customer?._id === person._id ? "selected" : ""}`} key={person._id}><input type="radio" name="credit-recipient" checked={customer?._id === person._id} onChange={() => setCustomer(person)} /><span>{person.name}<small>{person.email}</small></span></label>)}</div>
        {customer && <Notice>{customer.name} · {customer.email}</Notice>}
        <div className="form-grid"><Field label={t("admin.commerce.creditAction")} name="credit-direction"><select id="credit-direction" value={direction} onChange={event => setDirection(event.target.value)}><option value="add">{t("admin.commerce.addCredit")}</option><option value="remove">{t("admin.commerce.removeCredit")}</option></select></Field><Field label={t("admin.commerce.creditAmount")} name="credit-adjustment" inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} /></div>
        <Field label={t("Reason for adjustment")} name="credit-reason" required minLength={5} maxLength={300} value={reason} onChange={event => setReason(event.target.value)} />
      </fieldset>
      {uncertain && <Notice>{t("The result is uncertain. Check the saved balance and retry the same change before creating another adjustment.")}</Notice>}
      <Button className="button" busy={busy}>{t(uncertain ? "Retry same request" : "Save credit adjustment")}</Button>
    </AdminSection></fieldset></form>
  </>;
}
