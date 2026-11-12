import { Link } from "react-router-dom";
import { t, localize } from "../i18n/core";
import { usePagedCollection } from "../lib/usePagedCollection";
import { useResource } from "../lib/hooks";
import { businessDateInput, businessDateIso } from "../lib/admin-values";
import { DEFAULT_HOMEPAGE } from "../data/homepage";
import { CatalogueImages } from "./CatalogueImages";
import { AdminSection } from "./AdminFields";
import { Badge, ErrorMessage, Field, Notice } from "./ui";

export function homepageDraft(value) {
  const base = structuredClone(DEFAULT_HOMEPAGE);
  const existing = value || {};
  const existingHero = existing.hero || {};
  const hero = Object.fromEntries(
    Object.keys(base.hero).map((key) => [key, existingHero[key] !== undefined ? existingHero[key] : base.hero[key]])
  );
  return {
    hero,
    help: { ...base.help, ...existing.help },
    footer: { ...base.footer, ...existing.footer },
    slides: structuredClone(existing.slides || base.slides || []),
    featuredDesignIds: [...(existing.featuredDesignIds || base.featuredDesignIds || [])],
    process: base.process.map((item, index) => ({ ...item, ...existing.process?.[index] })),
  };
}

const sections = [
  ["hero", "admin.home.hero"], ["slides", "admin.home.slides"], ["featured", "admin.home.featured"],
  ["process", "admin.home.process"], ["help", "admin.home.help"], ["footer", "admin.home.footer"],
  ["contact", "admin.home.contact"], ["business", "admin.home.business"], ["legacy", "admin.home.legacy"],
];

export function AdminSettingsTabs({ section }) {
  return <nav className="admin-settings-tabs" aria-label={t("admin.nav.homepage")}>
    {sections.map(([key, label]) => <Link key={key} to={`/admin/settings?section=${key}`} aria-current={section === key ? "page" : undefined}>{t(label)}</Link>)}
  </nav>;
}

export function BilingualFields({ value, onChange, prefix, fields, required = false }) {
  return <div className="admin-language-pair">{[["", "admin.home.english", "en"], ["Hi", "admin.home.hindi", "hi"]].map(([suffix, label, language]) => <fieldset key={language} lang={language}>
    <legend>{t(label)}</legend>{fields.map(([key, title, multiline = false, maxLength = 1000]) => <Field key={key} label={t(title)} name={`${prefix}-${key}${suffix}`} required={required && (key !== "terms" || value.kind === "offer")}>
      {multiline ? <textarea id={`${prefix}-${key}${suffix}`} rows={3} maxLength={maxLength} required={required && (key !== "terms" || value.kind === "offer")} value={value[key + suffix] || ""} onChange={event => onChange({ ...value, [key + suffix]: event.target.value })} /> : <input id={`${prefix}-${key}${suffix}`} maxLength={maxLength} required={required} value={value[key + suffix] || ""} onChange={event => onChange({ ...value, [key + suffix]: event.target.value })} />}
    </Field>)}</fieldset>)}</div>;
}

function SlidePhoto({ mediaId }) {
  const resource = useResource(mediaId ? `/media/${mediaId}/access` : null);
  return resource.data?.url ? <img src={resource.data.url} alt={t("admin.home.photo")} loading="lazy" /> : null;
}

export function AdminHomepageEditor({ homepage, onChange, section, busy, onBusyChange }) {
  const designs = usePagedCollection(section === "featured" ? "/admin/designs?limit=30" : null);
  const offers = usePagedCollection(section === "slides" ? "/admin/commerce/offers?limit=30" : null);
  const patch = (key, value) => onChange({ ...homepage, [key]: value });
  const slidePatch = (index, value) => patch("slides", homepage.slides.map((slide, position) => position === index ? value : slide));
  if (section === "hero") return <AdminSection title="admin.home.hero" description="admin.home.savedHelp">
    <BilingualFields value={homepage.hero} onChange={value => patch("hero", value)} prefix="homepage-hero" fields={[["eyebrow", "admin.home.eyebrow", false, 120], ["headline", "admin.home.headline", false, 200], ["description", "admin.home.description", true, 1200], ["primaryCtaLabel", "admin.home.primaryCta", false, 60], ["secondaryCtaLabel", "admin.home.secondaryCta", false, 60]]} />
    <fieldset><legend>{t("admin.home.heroPhoto")}</legend><CatalogueImages scope="homepage-hero" ids={homepage.hero?.imageMediaId ? [homepage.hero.imageMediaId] : []} max={1} onBusyChange={onBusyChange} onChange={ids => patch("hero", { ...homepage.hero, imageMediaId: ids.at(-1) || null })} /></fieldset>
  </AdminSection>;
  if (section === "help" || section === "footer") return <AdminSection title={`admin.home.${section}`} description="admin.home.savedHelp">
    <BilingualFields value={homepage[section]} onChange={value => patch(section, value)} prefix={`homepage-${section}`} fields={section === "help" ? [["title", "admin.home.title", false, 180], ["description", "admin.home.description", true, 1200]] : [["description", "admin.home.description", true, 1200]]} />
  </AdminSection>;
  if (section === "process") return <AdminSection title="admin.home.process" description="admin.home.savedHelp">
    {homepage.process.map((item, index) => <fieldset className="admin-slide-card" key={index}><legend>{t("admin.home.step", { 0: index + 1 })}</legend><BilingualFields value={item} onChange={value => patch("process", homepage.process.map((row, position) => position === index ? value : row))} prefix={`homepage-process-${index}`} fields={[["title", "admin.home.title", false, 180], ["description", "admin.home.description", true, 1000]]} /></fieldset>)}
  </AdminSection>;
  if (section === "featured") return <AdminSection title="admin.home.featured" description="admin.home.featuredHelp">
    <ErrorMessage message={designs.error} retry={designs.reload} />
    {designs.loading && <p role="status">{t("Loading designs…")}</p>}
    <div className="admin-choice-grid">{designs.data.map(design => <label className={`admin-choice ${homepage.featuredDesignIds.includes(design._id) ? "selected" : ""}`} key={design._id}>
      <input type="checkbox" checked={homepage.featuredDesignIds.includes(design._id)} disabled={busy || (!homepage.featuredDesignIds.includes(design._id) && (design.status !== "published" || homepage.featuredDesignIds.length >= 12))} onChange={event => patch("featuredDesignIds", event.target.checked ? [...homepage.featuredDesignIds, design._id] : homepage.featuredDesignIds.filter(id => id !== design._id))} />
      <span>{localize(design, "title")}<small>{t(design.status === "published" ? "Published" : "Draft")}</small></span>
    </label>)}</div>
    {homepage.featuredDesignIds.filter(id => !designs.data.some(design => design._id === id)).map(id => <label className="checkbox" key={id}><input type="checkbox" checked onChange={() => patch("featuredDesignIds", homepage.featuredDesignIds.filter(value => value !== id))} />{t("Saved design not yet loaded")}</label>)}
    {designs.hasMore && <button type="button" className="button secondary" disabled={designs.loading} onClick={designs.loadMore}>{t("Load more designs")}</button>}
  </AdminSection>;
  if (section !== "slides") return null;
  return <AdminSection title="admin.home.slides" description="admin.home.savedHelp">
    <Notice>{t("admin.home.slideHelp")}</Notice>
    {!homepage.slides.length && <p className="admin-list-state">{t("admin.home.noSlides")}</p>}
    {homepage.slides.map((slide, index) => <section className="admin-slide-card" key={slide.id}>
      <div className="admin-slide-summary"><h3>{slide.title || t("admin.home.newSlide")}</h3><Badge>{t(slide.active ? "admin.home.enabledSlide" : "Draft")}</Badge><button type="button" className="text-button danger" disabled={busy} onClick={() => { if (window.confirm(t("admin.home.removeConfirm"))) patch("slides", homepage.slides.filter((_, position) => position !== index)); }}>{t("admin.home.removeSlide")}</button></div>
      <div className="form-grid"><Field label={t("admin.home.slideType")} name={`slide-kind-${index}`}><select id={`slide-kind-${index}`} value={slide.kind} onChange={event => slidePatch(index, { ...slide, kind: event.target.value, ...(event.target.value !== "offer" ? { offerId: undefined } : {}) })}>
        {[["featured", "admin.home.slideFeatured"], ["seasonal", "admin.home.slideSeasonal"], ["offer", "admin.home.slideOffer"], ["bulk", "admin.home.slideBulk"]].map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
      </select></Field><Field name={`slide-order-${index}`} label={t("Display order")} type="number" min={0} max={10000} value={slide.displayOrder || 0} onChange={event => slidePatch(index, { ...slide, displayOrder: Number(event.target.value) })} /></div>
      <BilingualFields value={slide} onChange={value => slidePatch(index, value)} prefix={`homepage-slide-${index}`} required={slide.active} fields={[["title", "admin.home.title", false, 180], ["description", "admin.home.description", true, 1200], ["actionLabel", "admin.home.button", false, 80], ["terms", "admin.home.terms", true, 1200]]} />
      <div className="form-grid"><Field label={t("admin.home.destination")} name={`slide-href-${index}`}><select id={`slide-href-${index}`} value={slide.href || "/catalogue"} onChange={event => slidePatch(index, { ...slide, href: event.target.value })}>
        {[["/catalogue", "The collection"], ["/request", "Start your stitch"], ["/contact", "Contact"], ["/account/benefits", "Offers and stitching credits"], ["/contact#bulk-orders", "Bulk stitching enquiry"]].map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
        {slide.href && !["/catalogue", "/request", "/contact", "/account/benefits", "/contact#bulk-orders"].includes(slide.href) && <option value={slide.href}>{slide.href}</option>}
      </select></Field>
      {[["startsAt", "admin.commerce.starts"], ["endsAt", "admin.commerce.ends"]].map(([key, label]) => <Field key={key} label={t(label)} name={`slide-${key}-${index}`} type="datetime-local" value={businessDateInput(slide[key])} onChange={event => slidePatch(index, { ...slide, [key]: businessDateIso(event.target.value) })} />)}
      </div>
      {slide.kind === "offer" && <><ErrorMessage message={offers.error} retry={offers.reload} /><Field label={t("admin.home.offer")} name={`slide-offer-${index}`}><select id={`slide-offer-${index}`} required={slide.active} value={slide.offerId || ""} onChange={event => slidePatch(index, { ...slide, offerId: event.target.value || undefined })}><option value="">{t("admin.home.chooseOffer")}</option>{offers.data.filter(offer => offer.status === "published" || offer._id === slide.offerId).map(offer => <option key={offer._id} value={offer._id}>{localize(offer, "name")} · {offer.code}</option>)}{slide.offerId && !offers.data.some(offer => offer._id === slide.offerId) && <option value={slide.offerId}>{t("Saved offer not yet loaded")}</option>}</select></Field>{offers.hasMore && <button type="button" className="text-button" disabled={offers.loading} onClick={offers.loadMore}>{t("Load more offers")}</button>}</>}
      <fieldset><legend>{t("admin.home.photo")}</legend><CatalogueImages scope={slide.id} ids={slide.imageMediaId ? [slide.imageMediaId] : []} max={1} onBusyChange={onBusyChange} onChange={ids => slidePatch(index, { ...slide, imageMediaId: ids.at(-1) || null })} /></fieldset>
      <label className="checkbox"><input type="checkbox" checked={Boolean(slide.active)} onChange={event => slidePatch(index, { ...slide, active: event.target.checked })} />{t("admin.home.active")}</label>
      <details><summary>{t("admin.home.preview")}</summary><div className="admin-slide-preview"><SlidePhoto mediaId={slide.imageMediaId} /><div><h3>{localize(slide, "title")}</h3><p>{localize(slide, "description")}</p><span className="button secondary">{localize(slide, "actionLabel")}</span><p className="small-print">{localize(slide, "terms")}</p></div></div></details>
    </section>)}
    <button type="button" className="button secondary" disabled={busy || homepage.slides.length >= 12} onClick={() => patch("slides", [...homepage.slides, { id: crypto.randomUUID(), kind: "featured", title: "", titleHi: "", description: "", descriptionHi: "", imageMediaId: null, actionLabel: "", actionLabelHi: "", href: "/catalogue", terms: "", termsHi: "", active: false, startsAt: null, endsAt: null, displayOrder: homepage.slides.length }])}>{t("admin.home.addSlide")}</button>
  </AdminSection>;
}
