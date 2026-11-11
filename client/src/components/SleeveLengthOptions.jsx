import { useId, useState } from "react";
import { Check, Sparkles, BookOpen } from "lucide-react";
import { localize, t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { OptionPreview } from "./VisualOptions";
import { GuideModal } from "./GuideModal";
import { findLengthGuide } from "../data/tailoringDesignGuide";
import "./sleeve-length-options.css";

const lengthStyles = {
  sleeveless: "Sleeveless",
  short: "Short",
  elbow: "Elbow length",
  three_quarter: "Three-quarter",
  full: "Full length",
  custom: "Custom length",
};
const idOf = (option) => String(option._id || option.id || "");

function LengthIllustration({ style, name }) {
  const end = {
    short: { x: 46, y: 61 },
    elbow: { x: 40, y: 81 },
    three_quarter: { x: 34, y: 100 },
    full: { x: 28, y: 118 },
    custom: { x: 34, y: 100 },
  }[style];
  return (
    <svg
      className="sleeve-length-illustration"
      viewBox="0 0 168 144"
      role="img"
      aria-label={t("{0} sleeve length illustration", { 0: name })}
      focusable="false"
    >
      <path
        className="sleeve-length-body"
        d="M64 30Q84 43 104 30L110 47L104 61V124H64V61L58 47Z"
      />
      <path className="sleeve-length-arm" d="M60 41L31 122M108 41L137 122" />
      {end ? (
        <g
          className={`sleeve-length-fabric${style === "custom" ? " custom" : ""}`}
        >
          <path
            d={`M64 30L54 35L${end.x} ${end.y}L${end.x + 14} ${end.y + 5}L66 53Z`}
          />
          <path
            d={`M104 30L114 35L${168 - end.x} ${end.y}L${154 - end.x} ${end.y + 5}L102 53Z`}
          />
          <path
            className="sleeve-length-cuff"
            d={`M${end.x} ${end.y}L${end.x + 14} ${end.y + 5}M${168 - end.x} ${end.y}L${154 - end.x} ${end.y + 5}`}
          />
        </g>
      ) : (
        <path
          className="sleeve-length-seam"
          d="M64 30Q57 42 64 61M104 30Q111 42 104 61"
        />
      )}
      {style === "custom" && (
        <g className="sleeve-length-custom-mark" aria-hidden="true">
          <path d="M17 47V111M13 51L17 47L21 51M13 107L17 111L21 107" />
          <circle cx="17" cy="78" r="11" />
          <path d="M14 75C14 71 21 71 21 75C21 78 17 78 17 81M17 85V86" />
        </g>
      )}
    </svg>
  );
}

function LengthImage({ option }) {
  const [failed, setFailed] = useState(false);
  const matched = findLengthGuide(option.lengthStyle || option.name || option.code);
  const imageSrc = option.imageUrl || option.images?.[0]?.url || matched?.image;
  const name = t(lengthStyles[option.lengthStyle]);
  return imageSrc && !failed ? (
    <img
      className="sleeve-length-image"
      src={imageSrc}
      alt={
        localize(option, "imageAlt") ||
        t("{0} sleeve length illustration", { 0: name })
      }
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <LengthIllustration style={option.lengthStyle} name={name} />
  );
}

export function SleeveLengthOptions({
  options = [],
  garment,
  selectedId,
  originalId,
  onSelect,
  onReset,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  loading = false,
  error = false,
}) {
  const { language } = useLanguage();
  const [preview, setPreview] = useState(null);
  const [returnFocus, setReturnFocus] = useState(null);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const radioName = useId();
  const descriptionId = useId();

  const eligible = options
    .filter(
      (option) =>
        option.kind === "sleeveLength" &&
        Object.hasOwn(lengthStyles, option.lengthStyle) &&
        option.active !== false &&
        option.published !== false &&
        !option.archived &&
        (option.status == null || option.status === "published") &&
        (!garment ||
          !option.garments?.length ||
          option.garments.includes(garment)),
    )
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  return (
    <section
      className="sleeve-length-options"
      aria-label={t("Sleeve length options")}
    >
      <h3>{t("Choose sleeve length — no additional charge")}</h3>
      <p id={descriptionId} className="sleeve-length-guidance">
        {t(
          "Choose a style preference. Enter the exact sleeve length in inches or centimetres during measurements.",
        )}
      </p>

      <div className="guide-banner-card">
        <div className="guide-banner-info">
          <span className="guide-banner-tag">
            <Sparkles size={13} aria-hidden="true" />
            {t("Official Sleeve Guide")}
          </span>
          <strong>{t("Sleeve Length Options — बाजू की लंबाई के विकल्प")}</strong>
          <p>
            {t("Choose sleeve length as per your style")} •{" "}
            {t(
              "Front & side view references with recommended length ranges.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="guide-banner-btn"
          onClick={() => setShowGuideModal(true)}
        >
          <BookOpen size={16} aria-hidden="true" />
          {t("View Sleeve Length Visual Chart")}
        </button>
      </div>

      {onReset && (
        <button
          type="button"
          className="sleeve-length-reset"
          onClick={onReset}
          disabled={Boolean(
            originalId && String(selectedId) === String(originalId),
          )}
        >
          {t("Keep original catalogue sleeve length")}
        </button>
      )}

      <div
        className="sleeve-length-grid"
        role="radiogroup"
        aria-label={t("Choose sleeve length")}
        aria-describedby={descriptionId}
      >
        {eligible.map((option) => {
          const selected = idOf(option) === String(selectedId);
          const matched = findLengthGuide(option.lengthStyle || option.name || option.code);

          return (
            <article
              key={idOf(option)}
              className={`sleeve-length-card${selected ? " is-selected" : ""}`}
            >
              <label>
                <input
                  type="radio"
                  name={radioName}
                  value={idOf(option)}
                  checked={selected}
                  onChange={() => onSelect(idOf(option))}
                />
                <LengthImage
                  key={`${idOf(option)}:${option.imageUrl || option.images?.[0]?.url || matched?.image}`}
                  option={option}
                />
                <span className="sleeve-length-details">
                  <div className="sleeve-length-header-row">
                    <strong className="sleeve-length-name">
                      {localize(option, "name")}
                    </strong>
                  </div>

                  <span className="sleeve-length-desc">
                    {localize(option, "description") ||
                      (matched && (language === "hi" ? matched.descriptionHi : matched.description)) ||
                      t("Style preference only, with no additional charge.")}
                  </span>

                  {matched && (
                    <div className="sleeve-card-advice">
                      <span className="sleeve-advice-pill">
                        <strong>{language === "hi" ? "बेस्ट:" : "Best for:"}</strong>{" "}
                        {language === "hi" ? matched.bestPairedWithHi : matched.bestPairedWith}
                      </span>
                      <span className="sleeve-advice-pill">
                        <strong>{language === "hi" ? "कपड़ा:" : "Fabric:"}</strong>{" "}
                        {language === "hi" ? matched.bestFabricHi : matched.bestFabric}
                      </span>
                    </div>
                  )}

                  <strong className="sleeve-length-price">
                    {t("No additional charge")}
                  </strong>

                  <span className="sleeve-length-selection-state">
                    {selected ? (
                      <>
                        <Check size={16} aria-hidden="true" />
                        {t("Selected")}
                      </>
                    ) : (
                      t("Select length")
                    )}
                  </span>
                  {option.code && <small>{option.code}</small>}
                </span>
              </label>

              <button
                type="button"
                className="text-button sleeve-card-view-btn"
                onClick={(event) => {
                  setReturnFocus(event.currentTarget);
                  setPreview({
                    ...option,
                    imageUrl: option.imageUrl || option.images?.[0]?.url || matched?.image,
                  });
                }}
              >
                {t("View larger & details")}
              </button>
            </article>
          );
        })}
      </div>

      {!eligible.length && !loadingMore && !loading && !error && (
        <p className="sleeve-length-empty" role="status">
          {t(
            "No compatible sleeve lengths are currently available. Please ask our tailor for help.",
          )}
        </p>
      )}

      {onLoadMore && (hasMore || loadingMore) && (
        <button
          className="sleeve-length-load-more"
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          aria-busy={loadingMore}
        >
          {t(
            loadingMore
              ? "Loading sleeve lengths…"
              : "Load more sleeve lengths",
          )}
        </button>
      )}

      {preview && (
        <OptionPreview
          option={preview}
          kind="sleeveLength"
          returnFocus={returnFocus}
          onClose={() => setPreview(null)}
        />
      )}

      {showGuideModal && (
        <GuideModal
          title={t("Sleeve Length Options — बाजू की लंबाई के विकल्प")}
          subtitle={t("Choose sleeve length as per your style")}
          imageUrl="/guides/sleeve-length-guide.jpg"
          onClose={() => setShowGuideModal(false)}
          footerNote={t(
            "You can choose any sleeve length with your preferred sleeve design. आप अपनी पसंद के किसी भी बाजू डिज़ाइन के साथ ऊपर दी गई लंबाई चुन सकते हैं।",
          )}
        />
      )}
    </section>
  );
}
