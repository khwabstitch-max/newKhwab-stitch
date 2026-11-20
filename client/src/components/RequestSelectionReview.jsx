import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { localize, t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { withDesignPhotography } from "../lib/design-photography";
import { DesignImage } from "./DesignGallery";
import { OptionImage } from "./VisualOptions";
import { findLengthGuide } from "../data/tailoringDesignGuide";

const partLabels = { sleeve: "Sleeve design", sleeveLength: "Sleeve length", neck: "Front neck design", back: "Back neck design", fit: "Fit", extra: "Extra add-ons" };

function ChoiceImage({ option, kind, originalImage }) {
  const [resolved, setResolved] = useState("");
  const mediaId = option?.imageMediaIds?.[0] || option?.imageMediaId;
  const hasImage = Boolean(option?.imageUrl || option?.images?.[0]?.url);
  useEffect(() => {
    setResolved("");
    if (!mediaId || hasImage || originalImage) return;
    const controller = new AbortController();
    api("/media/" + mediaId + "/access", { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResolved(data.url); })
      .catch(() => {});
    return () => controller.abort();
  }, [mediaId, hasImage, originalImage]);
  if (originalImage) return <DesignImage image={originalImage} alt={localize(option, "name")} />;
  const lengthImage = kind === "sleeveLength" ? findLengthGuide(option?.lengthStyle || option?.name || option?.code)?.image : null;
  return <OptionImage kind={kind} option={{ ...option, ...(resolved ? { imageUrl: resolved } : lengthImage && !hasImage ? { imageUrl: lengthImage } : {}) }} />;
}

export function SelectedDesignSummary({ design, draft }) {
  useLanguage();
  const shown = design ? withDesignPhotography(design) : null;
  return <section className="request-selection-summary">
    <p className="eyebrow">{t("request.selectionTitle")}</p>
    {shown && <div className="request-selection-photo"><DesignImage image={shown.coverView || shown.images?.[0] || { url: shown.coverImageUrl }} alt={localize(shown, "title")} /></div>}
    <h3>{shown ? localize(shown, "title") : t(draft.configuration.source === "reference" ? "Your uploaded reference" : "Choose a design")}</h3>
    {shown?.code && <p className="request-reference-code">{shown.code}</p>}
    <p>{draft.garment === "alteration" ? t("request.alterationNotice") : t("request.reviewOnlyPrice")}</p>
  </section>;
}

export function RequestSelectionReview({ design, estimate, options = [] }) {
  useLanguage();
  const shown = design ? withDesignPhotography(design) : null;
  const originalDetail = kind => shown?.views?.find(view => {
    const label = view.label || "";
    return kind === "neck" ? /neck|neckline/i.test(label) && !/back/i.test(label)
      : kind === "back" ? /back.*design|back.*detail|back.*neck/i.test(label)
      : kind === "sleeve" ? /sleeve.*design|sleeve.*detail/i.test(label) : false;
  });
  const components = Object.entries(estimate?.components || {}).filter(([, option]) => !option.suppressed && (option.name || option.optionId));
  const addons = estimate?.addons || [];
  if (!shown && !components.length && !addons.length) return null;
  return <section className="request-review-media" aria-label={t("request.reviewImages")}>
    <h4>{t("request.reviewImages")}</h4>
    <div className="request-reference-grid">
      {shown && <figure className="request-reference-item request-reference-main">
        <div className="request-reference-image"><DesignImage image={shown.coverView || shown.images?.[0] || { url: shown.coverImageUrl }} alt={localize(shown, "title")} /></div>
        <figcaption><strong>{localize(shown, "title")}</strong><span>{shown.code}</span><small>{t("request.selectedReference")}</small></figcaption>
      </figure>}
      {components.map(([kind, snapshot]) => {
        const option = { ...snapshot, ...options.find(record => record._id === snapshot.optionId) };
        const original = snapshot.source === "original";
        const image = original && !option.imageUrl && !option.images?.length ? originalDetail(kind) : null;
        return <figure key={kind} className="request-reference-item">
          <div className="request-reference-image"><ChoiceImage option={option} kind={kind} originalImage={image} /></div>
          <figcaption><small>{t(partLabels[kind] || kind)}</small><strong>{localize(option, "name")}</strong>{option.code && <span>{option.code}</span>}<small>{t(original ? "request.originalDetail" : "request.changedDetail")}</small></figcaption>
        </figure>;
      })}
      {addons.map(snapshot => {
        const option = { ...snapshot, ...options.find(record => record._id === snapshot.optionId) };
        return <figure key={snapshot.optionId || snapshot._id} className="request-reference-item">
          <div className="request-reference-image"><ChoiceImage option={option} kind="extra" /></div>
          <figcaption><small>{t("Extra add-ons")}</small><strong>{localize(option, "name")}</strong>{option.code && <span>{option.code}</span>}</figcaption>
        </figure>;
      })}
    </div>
  </section>;
}
