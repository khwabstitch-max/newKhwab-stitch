import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { t } from "../i18n/core";
import { usePagedCollection } from "../lib/usePagedCollection";
import { AdminHomepageEditor, AdminSettingsTabs, homepageDraft } from "./AdminHomepageEditor";
import { SettingsEnhancements } from "./SettingsEnhancements";
import { AdminSection } from "./AdminFields";
import { Button, ErrorMessage, Field, Notice, PageHeading } from "./ui";

const settingsKeys = ["businessName", "tagline", "taglineHi", "whatsapp", "instagram", "facebook", "contactEmail", "announcement", "announcementHi", "about", "aboutHi", "faqs", "bannerMediaId", "revision", "serviceAreas", "garmentBasePrices", "welcome", "policies", "support", "homepage"];
const initialDraft = settings => ({ businessName: "Khwab Stitch", tagline: "", whatsapp: "", instagram: "", contactEmail: "", announcement: "", about: "", faqs: [], bannerMediaId: null, ...structuredClone(settings), homepage: homepageDraft(settings.homepage) });

export function AdminWebsiteSettings({ settings, onSave }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get("section") || "hero";
  const section = ["hero", "slides", "featured", "process", "help", "footer", "contact", "business", "legacy"].includes(selected) ? selected : "hero";
  const [draft, setDraft] = useState(() => initialDraft(settings)), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const banners = usePagedCollection(section === "legacy" ? "/media?limit=30&purpose=banner" : null);
  const patch = (key, value) => {
    const form = document.getElementById("owner-website-settings");
    if (form) form.dataset.adminDirty = "true";
    setDraft(previous => ({ ...previous, [key]: value }));
    setSaved(false);
  };
  const faq = (index, key, value) => patch("faqs", draft.faqs.map((item, position) => position === index ? { ...item, [key]: value } : item));
  return <>
    <PageHeading title={t("admin.nav.homepage")}>{t("admin.home.savedHelp")}</PageHeading>
    <AdminSettingsTabs section={section} />
    <ErrorMessage message={error} />{saved && <Notice>{t("Website content saved. Refresh public pages to see the changes.")}</Notice>}
    <form id="owner-website-settings" className="panel admin-settings-form" data-admin-editor onSubmit={async event => {
      event.preventDefault(); if (busy) return; const form = event.currentTarget; setBusy(true); setError("");
      try {
        const body = Object.fromEntries(settingsKeys.filter(key => draft[key] !== undefined).map(key => [key, draft[key]]));
        await api("/admin/settings", { method: "PATCH", body });
        form.dataset.adminDirty = "false";
        setSaved(true); onSave();
      } catch (failure) {
        setError(failure);
        const path = failure.details?.[0]?.path || "";
        if (path.startsWith("homepage.slides")) setParams({ section: "slides" });
      } finally { setBusy(false); }
    }}><fieldset className="admin-form-fields" data-admin-lock disabled={busy}>
      <AdminHomepageEditor homepage={draft.homepage} onChange={value => patch("homepage", value)} section={section} busy={busy} onBusyChange={setBusy} />
      {section === "contact" && <>
        <AdminSection title="admin.home.contact"><div className="form-grid">{[
          ["businessName", "Business name", "text"], ["contactEmail", "Contact email", "email"], ["whatsapp", "WhatsApp number", "tel"], ["instagram", "Instagram URL", "url"], ["facebook", "Facebook URL", "url"],
          ["tagline", "Tagline", "text"], ["taglineHi", "Hindi tagline (optional)", "text"], ["announcement", "Announcement bar", "text"], ["announcementHi", "Hindi announcement (optional)", "text"],
        ].map(([key, label, type]) => <Field key={key} label={t(label)} name={`setting-${key}`} type={type} required={key === "businessName"} maxLength={key.startsWith("announcement") ? 300 : 200} value={draft[key] || ""} onChange={event => patch(key, event.target.value)} />)}</div>
          {["about", "aboutHi"].map(key => <Field key={key} label={t(key === "about" ? "About the atelier" : "Hindi about text (optional)")} name={key}><textarea id={key} rows={4} maxLength={5000} value={draft[key] || ""} onChange={event => patch(key, event.target.value)} /></Field>)}
        </AdminSection>
        <AdminSection title="Helpful answers">{draft.faqs.map((item, index) => <fieldset className="admin-slide-card" key={index}><legend>{t("Question {0}", { 0: index + 1 })}</legend>
          <div className="admin-language-pair">{[["", "admin.home.english"], ["Hi", "admin.home.hindi"]].map(([suffix, label]) => <fieldset key={label}><legend>{t(label)}</legend><Field label={t(suffix ? "Hindi question (optional)" : "Question {0}", { 0: index + 1 })} name={`faq-q${suffix}-${index}`} required={!suffix} value={item["question" + suffix] || ""} onChange={event => faq(index, "question" + suffix, event.target.value)} /><Field label={t(suffix ? "Hindi answer (optional)" : "Answer {0}", { 0: index + 1 })} name={`faq-a${suffix}-${index}`}><textarea id={`faq-a${suffix}-${index}`} required={!suffix} maxLength={2000} value={item["answer" + suffix] || ""} onChange={event => faq(index, "answer" + suffix, event.target.value)} /></Field></fieldset>)}</div>
          <div className="stack-actions"><button type="button" className="text-button" disabled={index === 0} onClick={() => { const items = [...draft.faqs]; [items[index], items[index - 1]] = [items[index - 1], items[index]]; patch("faqs", items); }}>{t("Move up")}</button><button type="button" className="text-button" disabled={index === draft.faqs.length - 1} onClick={() => { const items = [...draft.faqs]; [items[index], items[index + 1]] = [items[index + 1], items[index]]; patch("faqs", items); }}>{t("Move down")}</button><button type="button" className="text-button danger" onClick={() => patch("faqs", draft.faqs.filter((_, position) => position !== index))}>{t("Remove question")}</button></div>
        </fieldset>)}<button type="button" className="button secondary" disabled={draft.faqs.length >= 30} onClick={() => patch("faqs", [...draft.faqs, { question: "", answer: "", questionHi: "", answerHi: "" }])}>{t("Add a question")}</button></AdminSection>
      </>}
      {section === "business" && <SettingsEnhancements draft={draft} patch={patch} />}
      {section === "legacy" && <AdminSection title="admin.home.legacy"><p className="small-print">{t("admin.home.savedHelp")}</p>
        {["title", "tagline", "description"].map(key => <Field key={key} label={t(`Welcome ${key}`)} name={`legacy-welcome-${key}`} value={draft.welcome?.[key] || ""} onChange={event => patch("welcome", { ...draft.welcome, [key]: event.target.value })} />)}
        <ErrorMessage message={banners.error} retry={banners.reload} /><Field label={t("Website banner")} name="bannerMediaId"><select id="bannerMediaId" value={draft.bannerMediaId || ""} onChange={event => patch("bannerMediaId", event.target.value || null)}><option value="">{t("No banner")}</option>{banners.data.filter(image => !image.private).map((image, index) => <option key={image._id} value={image._id}>{t("Banner image {0}", { 0: index + 1 })}</option>)}{draft.bannerMediaId && !banners.data.some(image => image._id === draft.bannerMediaId) && <option value={draft.bannerMediaId}>{t("Saved image not yet loaded")}</option>}</select></Field>{banners.hasMore && <button type="button" className="text-button" disabled={banners.loading} onClick={banners.loadMore}>{t("Load more images")}</button>}
      </AdminSection>}
      <div className="admin-save-bar"><Button className="button" busy={busy}>{t("Save website content")}</Button><button data-admin-discard type="button" className="button secondary" onClick={() => { setDraft(initialDraft(settings)); setError(""); setSaved(false); const form = document.getElementById("owner-website-settings"); if (form) form.dataset.adminDirty = "false"; }}>{t("Cancel changes")}</button></div>
    </fieldset></form>
  </>;
}
