import { useState } from "react";
import { api, readable } from "../lib/api";
import { useResource } from "../lib/hooks";
import { t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { amountInput, parseAmount, garmentChoices, measurementChoices, componentChoices } from "../lib/admin-values";
import { ChoiceGroup, AdminSection } from "./AdminFields";
import { Badge, Button, ErrorMessage, Field, Notice, PageHeading } from "./ui";
import { ResourceState } from "../pages/Account";
import { ListPager } from "./ListPager";

const base = { code: "", name: "", serviceType: "stitching", active: false, audiences: ["women"], itemTypes: ["kurti"], componentKinds: [], measurementFields: [], workflowStages: [], workerSkills: [], materials: "customer", materialInstructions: "", revision: 0 };
const snake = value => value.replace(/[A-Z]/g, letter => "_" + letter.toLowerCase());

export function ServiceManagement() {
  useLanguage();
  const [page, setPage] = useState(1), resource = useResource(`/admin/services?limit=30&page=${page}`);
  const [editing, setEditing] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [search, setSearch] = useState("");
  const patch = (key, value) => setEditing(previous => ({ ...previous, [key]: value }));
  const supported = editing && ["stitching", "alteration"].includes(editing.serviceType) && editing.materials === "customer" && editing.itemTypes.every(item => garmentChoices.some(([key]) => key === item));
  return <>
    <PageHeading title={t("admin.nav.services")} action={<button data-admin-discard type="button" className="button" disabled={busy} onClick={() => { setEditing({ ...structuredClone(base), code: "service_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12) }); setSaved(false); }}>{t("Configure a service")}</button>} />
    <Notice>{t("Current ordering supports customer-fabric stitching and alterations. Embroidery, painting, knitting and additional crafts can be planned here; they remain unavailable until an appropriate order flow has been implemented and tested.")}</Notice>
    <ErrorMessage message={error} />{saved && <Notice>{t("admin.form.saved")}</Notice>}
    {editing && <form className="panel" data-admin-editor onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setError("");
      try {
        const body = Object.fromEntries(Object.keys(base).map(key => [key, editing[key] ?? base[key]]));
        if (editing.basePriceInput !== "" && editing.basePriceInput !== undefined) body.basePricePaise = parseAmount(editing.basePriceInput);
        await api(`/admin/services/${body.code}`, { method: "PATCH", body });
        setEditing(null); setSaved(true); resource.reload();
      } catch (failure) { setError(failure); } finally { setBusy(false); }
    }}><fieldset className="admin-form-fields" data-admin-lock disabled={busy}>
      <AdminSection title="admin.nav.services"><div className="form-grid">
        <Field label={t("Display name")} name="service-name" required maxLength={120} value={editing.name} onChange={event => patch("name", event.target.value)} />
        <Field label={t("Service type")} name="service-type"><select id="service-type" value={editing.serviceType} onChange={event => setEditing(previous => ({ ...previous, serviceType: event.target.value, ...(!["stitching", "alteration"].includes(event.target.value) ? { active: false } : {}) }))}>{["stitching", "alteration", "embroidery", "painting", "knitting", "other"].map(value => <option key={value} value={value}>{readable(value)}</option>)}</select></Field>
        <Field label={t("Materials arrangement")} name="service-materials"><select id="service-materials" value={editing.materials} onChange={event => setEditing(previous => ({ ...previous, materials: event.target.value, ...(event.target.value !== "customer" ? { active: false } : {}) }))}><option value="customer">{t("Customer supplies material")}</option><option value="business">{t("Business supplies material")}</option><option value="review">{t("Discuss material arrangement")}</option></select></Field>
        <Field label={t("Stitching starting price (INR)")} name="service-price" inputMode="decimal" value={editing.basePriceInput || ""} onChange={event => patch("basePriceInput", event.target.value)} />
      </div>
      <ChoiceGroup legend="admin.services.audiences" name="service-audiences" options={[["women", "Women"], ["men", "Men"], ["children", "Children"], ["unisex", "Everyone"]]} value={editing.audiences} onChange={value => patch("audiences", value)} custom />
      <ChoiceGroup legend="admin.services.garments" name="service-items" options={garmentChoices} value={editing.itemTypes} onChange={value => patch("itemTypes", value)} custom />
      <ChoiceGroup legend="admin.services.parts" name="service-parts" options={componentChoices.map(([key, label]) => [snake(key), label])} value={editing.componentKinds} onChange={value => patch("componentKinds", value)} custom />
      <ChoiceGroup legend="admin.services.skills" name="service-skills" options={[["stitching", "Stitching"], ["alteration", "Alteration"], ["measurements", "Measurements"], ["finishing", "Finishing"], ["pattern_cutting", "Pattern cutting"]]} value={editing.workerSkills} onChange={value => patch("workerSkills", value)} custom />
      <Field label={t("Material instructions")} name="material-instructions"><textarea id="material-instructions" maxLength={1000} value={editing.materialInstructions} onChange={event => patch("materialInstructions", event.target.value)} /></Field>
      <label className="checkbox"><input type="checkbox" disabled={!supported} checked={Boolean(editing.active)} onChange={event => patch("active", event.target.checked)} />{t("Activate this supported service")}</label>
      {!supported && <p className="small-print">{t("admin.services.planned")}</p>}
      </AdminSection>
      <details className="admin-advanced"><summary>{t("admin.nav.advanced")}</summary>
        <Field label={t("Service code")} name="service-code" required pattern="[a-z][a-z0-9_]{0,49}" disabled={Boolean(editing._id)} value={editing.code} onChange={event => patch("code", event.target.value)} />
        <ChoiceGroup legend="admin.guides.measurements" name="service-measurements" options={measurementChoices.map(([key, label]) => [snake(key), label])} value={editing.measurementFields.map(item => item.key)} onChange={keys => patch("measurementFields", keys.map(key => editing.measurementFields.find(item => item.key === key) || { key, label: t(measurementChoices.find(([value]) => snake(value) === key)?.[1] || key, {}, "en"), required: false, instructions: "" }))} />
        {editing.measurementFields.map((item, index) => <fieldset key={item.key}><legend>{item.label}</legend><Field label={t("Guide instructions")} name={`service-measurement-${index}`} value={item.instructions || ""} onChange={event => patch("measurementFields", editing.measurementFields.map((field, position) => position === index ? { ...field, instructions: event.target.value } : field))} /><label className="checkbox"><input type="checkbox" checked={item.required} onChange={event => patch("measurementFields", editing.measurementFields.map((field, position) => position === index ? { ...field, required: event.target.checked } : field))} />{t("Required")}</label></fieldset>)}
        <ChoiceGroup legend="Workflow stages" name="service-stages" options={["request_received", "under_review", "quote_sent", "customer_accepted", "fabric_received", "stitching", "ready", "dispatched", "delivered"].map(key => [key, readable(key)])} value={editing.workflowStages.map(item => item.key)} onChange={keys => patch("workflowStages", keys.map(key => editing.workflowStages.find(item => item.key === key) || { key, label: readable(key) }))} />
      </details>
      <div className="form-actions"><button data-admin-discard type="button" className="button secondary" onClick={() => setEditing(null)}>{t("Cancel")}</button><Button className="button" busy={busy}>{t("Save service definition")}</Button></div>
    </fieldset></form>}
    <Field label={t("admin.form.searchPage")} name="service-search" type="search" value={search} onChange={event => setSearch(event.target.value)} />
    <ResourceState resource={resource} empty="No service overrides yet. Current stitching and alterations use the existing defaults.">{resource.data?.filter(service => `${service.name} ${service.code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(service => <article className="panel" key={service._id}>
      <h3>{service.name}</h3><Badge>{service.active ? t("Active") : !["stitching", "alteration"].includes(service.serviceType) ? t("admin.services.planned") : t("Unavailable")}</Badge>
      <p>{service.audiences.map(value => t(readable(value))).join(", ")} · {service.itemTypes.map(value => t(readable(value))).join(", ")}</p><p>{service.materialInstructions}</p>
      <button data-admin-discard className="button secondary small" disabled={busy} onClick={() => { setEditing({ ...structuredClone(base), ...structuredClone(service), basePriceInput: amountInput(service.basePricePaise) }); setSaved(false); }}>{t("Edit service")}</button>
    </article>)}</ResourceState>
    <ListPager label="Service pagination" resource={resource} page={page} onChange={setPage} />
  </>;
}
