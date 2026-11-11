import { useState } from "react";
import { Sparkles, BookOpen } from "lucide-react";
import { useLanguage } from "../i18n/Language";
import { localize, t } from "../i18n/core";
import { usePagedCollection } from "../lib/usePagedCollection";
import { ErrorMessage } from "./ui";
import { OptionPreview } from "./VisualOptions";
import { GuideModal } from "./GuideModal";
import "./guide-modal.css";

const garmentGuidePoints = {
  kurti: [
    { num: 1, en: "Shoulder", hi: "कंधे की चौड़ाई" },
    { num: 2, en: "Neck Depth", hi: "गले की गहराई" },
    { num: 3, en: "Bust", hi: "सीना" },
    { num: 4, en: "Waist", hi: "कमर" },
    { num: 5, en: "Hip", hi: "कूल्हे" },
    { num: 6, en: "Kurti Length", hi: "कुर्ती की लंबाई" },
  ],
  blouse: [
    { num: 1, en: "Shoulder", hi: "कंधे की चौड़ाई" },
    { num: 2, en: "Neck Depth", hi: "गले की गहराई" },
    { num: 3, en: "Bust", hi: "सीना" },
    { num: 4, en: "Waist", hi: "कमर" },
    { num: 5, en: "Blouse Length", hi: "ब्लाउज की लंबाई" },
    { num: 6, en: "Sleeve Length", hi: "बाजू की लंबाई" },
  ],
  suit: [
    { num: 1, en: "Shoulder", hi: "कंधे की चौड़ाई" },
    { num: 2, en: "Neck Depth", hi: "गले की गहराई" },
    { num: 3, en: "Bust", hi: "सीना" },
    { num: 4, en: "Waist", hi: "कमर" },
    { num: 5, en: "Suit Length", hi: "सूट की लंबाई" },
    { num: 6, en: "Sleeve Length", hi: "बाजू की लंबाई" },
    { num: 7, en: "Sleeve Arm", hi: "बाजू छोर" },
  ],
};

export function MeasurementGuides({
  garment,
  method,
  selectedIds = [],
  onSelect,
}) {
  const { language } = useLanguage();
  const isMethodGuided = ["body", "garment"].includes(method);
  const resource = usePagedCollection(
    isMethodGuided
      ? `/measurement-guides?garment=${garment}&method=${method}&language=${language}&limit=20`
      : null,
  );
  const [preview, setPreview] = useState(null);
  const [returnFocus, setReturnFocus] = useState(null);
  const [showMasterGuide, setShowMasterGuide] = useState(false);

  const guides = (resource.data || []).filter(
    (guide) =>
      guide.garment === garment &&
      guide.method === method &&
      [language, "und"].includes(guide.language) &&
      guide.status !== "draft" &&
      guide.status !== "archived",
  );

  const points = garmentGuidePoints[garment] || garmentGuidePoints.kurti;

  return (
    <section className="measurement-guides" aria-label={t("Measurement guides")}>
      <h3>{t("Measurement guides")}</h3>

      {isMethodGuided && (
        <div className="measurement-master-banner">
          <div className="measurement-master-info">
            <span className="measurement-master-badge">
              <Sparkles size={13} aria-hidden="true" />
              {t("Official Fit Guide")}
            </span>
            <strong>{t("Measurement Guide – सही नाप, परफेक्ट फिट!")}</strong>
            <p>
              {t(
                "Your Style, Our Stitch • Visual guidance for Kurti, Blouse & Suit",
              )}
            </p>
            {points && (
              <div className="measurement-guide-steps">
                {points.map((p) => (
                  <span key={p.num} className="guide-point-pill">
                    <span className="point-number">{p.num}</span>
                    {language === "hi" ? p.hi : p.en}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="measurement-master-open-btn"
            onClick={() => setShowMasterGuide(true)}
          >
            <BookOpen size={16} aria-hidden="true" />
            {t("View Full Measurement Chart")}
          </button>
        </div>
      )}

      <ErrorMessage message={resource.error} retry={resource.reload} />
      {resource.loading && <p role="status">{t("Loading guides…")}</p>}

      {!resource.loading && !guides.length && (
        <p>
          {t(
            "No matching guide is available for this garment and measurement method. Please ask our master tailor for guidance.",
          )}
        </p>
      )}

      {guides.map((guide) => (
        <article className="guide-card" key={guide._id}>
          <h4>{localize(guide, "name")}</h4>
          <p>{localize(guide, "instructions")}</p>
          {guide.images?.[0]?.url && (
            <button
              className="guide-image"
              type="button"
              onClick={(event) => {
                setReturnFocus(event.currentTarget);
                setPreview({
                  ...guide,
                  imageUrl: guide.images[0].url,
                  description: guide.instructions,
                  descriptionHi: guide.instructionsHi,
                  priceMode: "included",
                });
              }}
              aria-label={`${t("Enlarge measurement guide")} ${localize(guide, "name")}`}
            >
              <img
                src={guide.images[0].url}
                alt={localize(guide, "name")}
                loading="lazy"
              />
            </button>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={selectedIds.includes(guide._id)}
              onChange={(event) =>
                onSelect(
                  event.target.checked
                    ? [...selectedIds, guide._id]
                    : selectedIds.filter((id) => id !== guide._id),
                )
              }
            />
            {t("I used this guide")}
          </label>
          <small>
            {t(
              "Illustrations explain the method; enter your own measurements. No illustrated size is prefilled.",
            )}
          </small>
        </article>
      ))}

      {resource.hasMore && (
        <button
          type="button"
          className="button secondary"
          disabled={resource.loading}
          onClick={resource.loadMore}
        >
          {t("Load more guides")}
        </button>
      )}

      {preview && (
        <OptionPreview
          key={preview._id}
          option={{
            ...preview,
            guide: true,
            garments: [preview.garment],
          }}
          returnFocus={returnFocus}
          onClose={() => setPreview(null)}
        />
      )}

      {showMasterGuide && (
        <GuideModal
          title={t("Measurement Guide – सही नाप, परफेक्ट फिट!")}
          subtitle={t(
            "Your Style, Our Stitch • Visual guidance for Kurti, Blouse & Suit",
          )}
          imageUrl="/guides/measurement-guide.jpg"
          onClose={() => setShowMasterGuide(false)}
          footerNote={t(
            "Illustrations explain the method; enter your own measurements. No illustrated size is prefilled.",
          )}
        />
      )}
    </section>
  );
}
