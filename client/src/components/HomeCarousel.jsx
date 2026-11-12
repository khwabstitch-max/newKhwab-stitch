import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLanguage } from "../i18n/Language";
import { getLocale, labelToken, t } from "../i18n/core";
import { dateTime, money } from "../lib/api";
import { eligibleHomepageSlides, homepageText, publicHref } from "../lib/public-homepage";
import "./public-experience.css";

function OfferDetails({ slide, language }) {
  const offer = slide.offer;
  const discount = offer.type === "percentage"
    ? new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(offer.value / 100) + "%"
    : money(offer.value);
  return <details className="home-offer-details"><summary>{t("public.promo.details")}</summary>
    <dl>
      <div><dt>{t("public.promo.code")}</dt><dd>{offer.code}</dd></div>
      <div><dt>{t("public.promo.discount")}</dt><dd>{discount}</dd></div>
      {Number.isSafeInteger(offer.minimumStitchingPaise) && <div><dt>{t("public.promo.minimum")}</dt><dd>{money(offer.minimumStitchingPaise)}</dd></div>}
      {Number.isSafeInteger(offer.maxDiscountPaise) && <div><dt>{t("public.promo.maximum")}</dt><dd>{money(offer.maxDiscountPaise)}</dd></div>}
      {offer.garments?.length > 0 && <div><dt>{t("public.promo.garments")}</dt><dd>{offer.garments.map(labelToken).join(", ")}</dd></div>}
    </dl>
    {Number.isInteger(offer.perCustomerLimit) && <p>{t(offer.perCustomerLimit === 1 ? "public.promo.oneUse" : "public.promo.useLimit", { 0: offer.perCustomerLimit })}</p>}
    {slide.endsAt && <p>{t("public.promo.ends", { 0: dateTime(slide.endsAt) })}</p>}
    <p>{homepageText(offer, "programmeTerms", language)}</p>
  </details>;
}

export function HomeCarousel({ slides = [] }) {
  const { language } = useLanguage();
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState(null);
  const touchStart = useRef(null);
  const available = eligibleHomepageSlides(slides, language, Math.max(now, Date.now()));
  const index = Math.max(0, available.findIndex((slide) => slide.id === selectedId));
  const active = available[index];
  useEffect(() => {
    const currentTime = Date.now();
    const boundary = (Array.isArray(slides) ? slides : []).flatMap((slide) => slide ? [slide.startsAt, slide.endsAt] : [])
      .filter(Boolean).map(Date.parse).filter((time) => Number.isFinite(time) && time > currentTime).sort((a, b) => a - b)[0];
    if (!boundary) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(boundary - currentTime, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [slides, now]);
  if (!active) return null;
  const move = (delta) => setSelectedId(available[(index + delta + available.length) % available.length].id);
  return (
    <section className="container home-promotion" aria-label={t("public.promo.label")} aria-roledescription={available.length > 1 ? t("public.promo.carousel") : undefined}
      tabIndex={available.length > 1 ? 0 : undefined}
      onKeyDown={(event) => {
        if (available.length < 2 || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1);
      }}
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX; }}
      onTouchEnd={(event) => {
        if (available.length < 2 || touchStart.current == null) return;
        const difference = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
        touchStart.current = null;
        if (Math.abs(difference) >= 50) move(difference < 0 ? 1 : -1);
      }}>
      <div className={`home-promo-card${active.imageUrl ? " has-image" : ""}`}>
        <div className="home-promo-copy">
          <h2>{homepageText(active, "title", language)}</h2>
          <p>{homepageText(active, "description", language)}</p>
          {active.kind === "offer" && <><p className="home-promo-terms">{homepageText(active, "terms", language)}</p><OfferDetails slide={active} language={language} /><p className="small-print">{t("public.promo.offerNote")}</p></>}
          <Link className="button secondary" to={publicHref(active.href)}>{homepageText(active, "actionLabel", language)}<ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        {active.imageUrl && <figure><img src={active.imageUrl} alt="" width={active.imageWidth || 1200} height={active.imageHeight || 800} loading="lazy" /></figure>}
      </div>
      {available.length > 1 && <div className="home-promo-controls">
        <button type="button" className="icon-button" onClick={() => move(-1)} aria-label={t("public.promo.previous")}><ArrowLeft size={18} aria-hidden="true" /></button>
        <div className="home-promo-dots">{available.map((slide, position) => <button key={slide.id} type="button" aria-label={t("public.promo.goto", { 0: position + 1 })} aria-pressed={position === index} onClick={() => setSelectedId(slide.id)}><span /></button>)}</div>
        <button type="button" className="icon-button" onClick={() => move(1)} aria-label={t("public.promo.next")}><ArrowRight size={18} aria-hidden="true" /></button>
        <p className="sr-only" aria-live="polite" aria-atomic="true">{t("public.promo.position", { 0: index + 1, 1: available.length })}</p>
      </div>}
    </section>
  );
}
