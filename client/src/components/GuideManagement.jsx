import { useState } from "react";
import { useResource } from "../lib/hooks";
import { api } from "../lib/api";
import { t, localize } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { garmentChoices, measurementChoices } from "../lib/admin-values";
import { CatalogueImages } from "./CatalogueImages";
import { ChoiceGroup, AdminSection } from "./AdminFields";
import { OptionPreview } from "./VisualOptions";
import { ListPager } from "./ListPager";
import { Badge, Button, ErrorMessage, Field, Notice, PageHeading } from "./ui";

const blank = { code: "", name: "", nameHi: "", garment: "kurti", method: "garment", language: "und", instructions: "", instructionsHi: "", measurementFields: [], imageMediaIds: [], status: "draft", displayOrder: 0 };
export function GuideManagement() {
  useLanguage();
  const [page, setPage] = useState(1), resource = useResource(`/admin/measurement-guides?page=${page}&limit=20`);
  const [editing, setEditing] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [preview, setPreview] = useState(null), [saved, setSaved] = useState(false), [search, setSearch] = useState("");
  const patch = (key, value) => setEditing(previous => ({ ...previous, [key]: value }));
  return <><PageHeading title={t("Measurement guides")} action={<button data-admin-discard className="button" disabled={busy} onClick={() => { setEditing({ ...structuredClone(blank), code: "GUIDE-" + crypto.randomUUID().slice(0, 8).toUpperCase() }); setSaved(false); }}>{t("New measurement guide")}</button>} />
    <p>{t("Publish each guide only for the garment, method and language it actually explains. A garment illustration is not a body guide.")}</p>
    <ErrorMessage message={error || resource.error} retry={resource.reload} />{saved && <Notice>{t("admin.form.saved")}</Notice>}
    {editing && <form className="panel" data-admin-editor onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setError("");
      try { const body = Object.fromEntries(Object.keys(blank).map(key => [key, editing[key] ?? blank[key]])); body.displayOrder = Number(body.displayOrder); if (editing._id) body.revision = editing.revision; await api(`/admin/measurement-guides${editing._id ? "/" + editing._id : ""}`, { method: editing._id ? "PATCH" : "POST", body }); setEditing(null); resource.reload(); setSaved(true); }
      catch (failure) { setError(failure); } finally { setBusy(false); }
    }}><fieldset className="admin-form-fields" data-admin-lock disabled={busy}>
      <AdminSection title="Measurement guides"><div className="form-grid">
        <Field label={t("Guide name")} name="guide-name" required value={editing.name} onChange={event => patch("name", event.target.value)} />
        <Field label={t("Hindi guide name")} name="guide-nameHi" value={editing.nameHi || ""} onChange={event => patch("nameHi", event.target.value)} />
        <Field label={t("Guide garment")} name="guide-garment"><select id="guide-garment" value={editing.garment} onChange={event => patch("garment", event.target.value)}>{garmentChoices.map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></Field>
        <Field label={t("admin.guides.method")} name="guide-method"><select id="guide-method" value={editing.method} onChange={event => patch("method", event.target.value)}><option value="body">{t("admin.guides.body")}</option><option value="garment">{t("admin.guides.garment")}</option></select></Field>
        <Field label={t("admin.guides.language")} name="guide-language"><select id="guide-language" value={editing.language} onChange={event => patch("language", event.target.value)}><option value="en">{t("admin.home.english")}</option><option value="hi">{t("admin.home.hindi")}</option><option value="und">{t("admin.guides.neutral")}</option></select></Field>
        <Field label={t("Guide status")} name="guide-status"><select id="guide-status" value={editing.status} onChange={event => patch("status", event.target.value)}>{["draft", "published", "archived"].map(value => <option value={value} key={value}>{t(`admin.visibility.${value}`)}</option>)}</select></Field>
      </div>
      <Field label={t("Guide instructions")} name="guide-instructions"><textarea id="guide-instructions" rows={4} maxLength={2500} value={editing.instructions} onChange={event => patch("instructions", event.target.value)} /></Field>
      <Field label={t("Hindi instructions")} name="guide-instructionsHi"><textarea id="guide-instructionsHi" rows={4} maxLength={2500} value={editing.instructionsHi || ""} onChange={event => patch("instructionsHi", event.target.value)} /></Field>
      <ChoiceGroup legend="admin.guides.measurements" name="guide-fields" options={measurementChoices} value={editing.measurementFields} onChange={value => patch("measurementFields", value)} />
      <CatalogueImages scope={editing._id || "new-guide"} ids={editing.imageMediaIds} onBusyChange={setBusy} onChange={ids => patch("imageMediaIds", ids)} />
      </AdminSection><details className="admin-advanced"><summary>{t("admin.nav.advanced")}</summary><Field label={t("Stable guide code")} name="guide-code" required value={editing.code} onChange={event => patch("code", event.target.value.toUpperCase())} /><Field label={t("Display order")} name="guide-order" type="number" value={editing.displayOrder} onChange={event => patch("displayOrder", event.target.value)} /></details>
      <div className="form-actions"><Button className="button" busy={busy}>{t("Save guide")}</Button><button data-admin-discard type="button" className="button secondary" onClick={() => setEditing(null)}>{t("Cancel")}</button></div>
    </fieldset></form>}
    <Field name="guide-search" label={t("admin.form.searchPage")} type="search" value={search} onChange={event => setSearch(event.target.value)} />
    {resource.loading && <p role="status">{t("Loading guides…")}</p>}
    {resource.data?.filter(guide => `${guide.name} ${guide.nameHi || ""} ${guide.code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(guide => <article className="panel" key={guide._id}>
      <Badge>{t(`admin.visibility.${guide.status}`)}</Badge><h2>{localize(guide, "name")}</h2><p>{t(garmentChoices.find(([key]) => key === guide.garment)?.[1] || guide.garment)} · {t(guide.method === "body" ? "admin.guides.body" : "admin.guides.garment")}</p><p>{localize(guide, "instructions")}</p>
      <div className="stack-actions"><button data-admin-discard className="button secondary small" disabled={busy} onClick={() => { setEditing({ ...structuredClone(blank), ...structuredClone(guide) }); setSaved(false); }}>{t("Edit guide")}</button>
        {guide.images?.length > 0 && <button className="text-button" onClick={event => setPreview({ ...guide, imageUrl: guide.images[0].url, description: guide.instructions, descriptionHi: guide.instructionsHi, returnFocus: event.currentTarget, guide: true })}>{t("Preview")}</button>}
        {[false, true].map(permanent => <button type="button" className="text-button danger" disabled={busy} key={String(permanent)} onClick={async () => {
          if (!window.confirm(t(permanent ? "Permanently delete this unused guide?" : "Archive this guide?"))) return;
          setBusy(true); try { await api(`/admin/measurement-guides/${guide._id}`, { method: "DELETE", body: { revision: guide.revision, permanent } }); resource.reload(); setSaved(true); } catch (failure) { setError(failure); } finally { setBusy(false); }
        }}>{t(permanent ? "Delete unused guide permanently" : "Archive guide")}</button>)}
      </div>
    </article>)}
    {!resource.loading && !resource.error && !resource.data?.length && <p>{t("No measurement guides yet")}</p>}
    <ListPager label="Guide pagination" resource={resource} page={page} onChange={setPage} />
    {preview && <OptionPreview option={preview} returnFocus={preview.returnFocus} onClose={() => setPreview(null)} />}
  </>;
}
