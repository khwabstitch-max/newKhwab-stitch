import { useEffect, useId, useRef, useState } from "react";
import { Check, ImageOff, Search, X, Sparkles, BookOpen } from "lucide-react";
import { getLocale, labelToken, localize, t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { GuideModal } from "./GuideModal";
import {
  findNeckGuide,
  findBackGuide,
  findSleeveGuide,
} from "../data/tailoringDesignGuide";
import "./visual-options.css";

const idOf = (option) => String(option._id || option.id || "");
const money = (value) =>
  new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: value % 100 ? 2 : 0,
  }).format(value / 100);
const compatibleGarments = (option) =>
  option.garments?.length
    ? option.garments.map(labelToken).join(", ")
    : t("compatible garments");

export function optionPriceLabel(option) {
  if (option.kind === "sleeveLength") return t("No additional charge");
  if (option.priceMode === "included") return t("Included");
  const amount =
    option.priceMode === "replacement"
      ? option.replacementAdjustmentPaise
      : option.amountPaise;
  if (
    !["additional", "replacement"].includes(option.priceMode) ||
    !Number.isInteger(amount) ||
    amount < 0
  ) {
    return t("Price after review");
  }
  return amount === 0
    ? t("No additional charge")
    : t("Additional {0} per garment", { 0: money(amount) });
}

function OptionImage({ option, kind, enlarged = false }) {
  const [failed, setFailed] = useState(false);
  const effectiveKind = kind || option.kind;
  const isNeck = ["neck", "neckFront"].includes(effectiveKind);
  const isBack = ["back", "neckBack"].includes(effectiveKind);
  const isSleeve = effectiveKind === "sleeve";

  const matched = isNeck
    ? findNeckGuide(option.name || option.code)
    : isBack
      ? findBackGuide(option.name || option.code)
      : isSleeve
        ? findSleeveGuide(option.name || option.code)
        : null;

  const imageSrc = option.imageUrl || option.images?.[0]?.url || matched?.image;

  return imageSrc && !failed ? (
    <img
      className={enlarged ? "visual-preview-image" : "visual-option-image"}
      src={imageSrc}
      alt={
        localize(option, "imageAlt") ||
        t("{0} design option", { 0: localize(option, "name") })
      }
      loading="lazy"
      style={{
        maxWidth:
          option.imageWidth ||
          option.images?.find((image) => image.url === imageSrc)?.width ||
          "100%",
      }}
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={`visual-no-photo${enlarged ? " enlarged" : ""}`}
      role="img"
      aria-label={t("{0}: photo not available", {
        0: localize(option, "name"),
      })}
    >
      <ImageOff size={30} aria-hidden="true" />
      <span>{t("Photo coming soon")}</span>
    </div>
  );
}

export function OptionPreview({ option, kind, onClose, returnFocus }) {
  const { language } = useLanguage();
  const [view, setView] = useState(0);
  const effectiveKind = kind || option.kind;
  const isNeck = ["neck", "neckFront"].includes(effectiveKind);
  const isBack = ["back", "neckBack"].includes(effectiveKind);
  const isSleeve = effectiveKind === "sleeve";

  const matchedGuide = isNeck
    ? findNeckGuide(option.name || option.code)
    : isBack
      ? findBackGuide(option.name || option.code)
      : isSleeve
        ? findSleeveGuide(option.name || option.code)
        : null;

  const initialUrl = option.imageUrl || option.images?.[0]?.url || matchedGuide?.image;
  const images = option.images?.length
    ? option.images
    : [{ url: initialUrl }];
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    closeRef.current?.focus();
    return () => returnFocus?.focus();
  }, [returnFocus]);

  function keys(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...dialogRef.current.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]',
      ),
    ];
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <dialog
      className="visual-option-dialog"
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={keys}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="visual-preview-content">
        <button
          className="visual-preview-close"
          type="button"
          aria-label={t("Close design preview")}
          ref={closeRef}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
        <OptionImage
          key={`${idOf(option)}:${images[view]?.url || option.imageUrl}`}
          option={{
            ...option,
            imageUrl: images[view]?.url || option.imageUrl,
            imageWidth: images[view]?.width,
          }}
          enlarged
        />
        {images.length > 1 && (
          <div className="preview-views" aria-label={t("Design views")}>
            {images.map((image, index) => (
              <button
                type="button"
                key={image.id || image.url}
                aria-pressed={view === index}
                onClick={() => setView(index)}
              >
                {t("View")} {index + 1}
              </button>
            ))}
          </div>
        )}
        <div className="visual-preview-details">
          {option.code && <p className="eyebrow">{option.code}</p>}
          <h3 id={titleId}>{localize(option, "name")}</h3>
          <p>
            {localize(option, "description") ||
              t("Our tailor can confirm the design details during review.")}
          </p>
          <p className="visual-option-compatible">
            {t("For: {0}", { 0: compatibleGarments(option) })}
          </p>
          {!option.guide && <strong>{optionPriceLabel(option)}</strong>}
          {matchedGuide && (
            <div className="preview-guide-meta">
              <div className="preview-meta-row">
                <span className="preview-meta-label">
                  {language === "hi"
                    ? "✨ किसके साथ अच्छी लगती है:"
                    : "✨ Best Paired With:"}
                </span>
                <span className="preview-meta-val">
                  {language === "hi"
                    ? matchedGuide.bestPairedWithHi
                    : matchedGuide.bestPairedWith}
                </span>
              </div>
              <div className="preview-meta-row">
                <span className="preview-meta-label">
                  {language === "hi"
                    ? "🧵 बेस्ट फिनिशिंग कपड़ा:"
                    : "🧵 Recommended Fabric:"}
                </span>
                <span className="preview-meta-val">
                  {language === "hi"
                    ? matchedGuide.bestFabricHi
                    : matchedGuide.bestFabric}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

export function VisualOptions({
  kind,
  garment,
  options = [],
  selectedId,
  onSelect,
  onReset,
  originalId,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  loading = false,
  error = false,
}) {
  const { language } = useLanguage();
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(12);
  const [preview, setPreview] = useState(null);
  const [returnFocus, setReturnFocus] = useState(null);
  const [showStyleGuide, setShowStyleGuide] = useState(false);
  const radioName = useId();
  const searchId = useId();
  const externalPaging = typeof onLoadMore === "function";

  const eligible = options.filter(
    (option) =>
      option.active !== false &&
      option.published !== false &&
      !option.archived &&
      (option.status == null || option.status === "published") &&
      (!kind || option.kind === kind) &&
      (!garment ||
        !option.garments?.length ||
        option.garments.includes(garment)),
  );
  const filtered = eligible.filter((option) =>
    [
      option.name,
      option.nameHi,
      option.description,
      option.descriptionHi,
      localize(option, "name"),
      localize(option, "description"),
    ]
      .join(" ")
      .toLocaleLowerCase(getLocale())
      .includes(search.trim().toLocaleLowerCase(getLocale())),
  );
  const visible = externalPaging ? filtered : filtered.slice(0, limit);

  const isNeck = ["neck", "neckFront"].includes(kind);
  const isBack = ["back", "neckBack"].includes(kind);
  const isSleeve = kind === "sleeve";
  const [showBackGuide, setShowBackGuide] = useState(false);

  return (
    <section
      className="visual-options"
      aria-label={t("{0} options", {
        0: kind ? labelToken(kind) : t("Design"),
      })}
    >
      {isNeck && (
        <div className="guide-banner-card">
          <div className="guide-banner-info">
            <span className="guide-banner-tag">
              <Sparkles size={13} aria-hidden="true" />
              {t("Official Style Guide")}
            </span>
            <strong>{t("Neck Design Options — 8 Signature Styles")}</strong>
            <p>{t("Explore neck and sleeve design references")}</p>
          </div>
          <button
            type="button"
            className="guide-banner-btn"
            onClick={() => setShowStyleGuide(true)}
          >
            <BookOpen size={16} aria-hidden="true" />
            {t("View Neck Design Chart")}
          </button>
        </div>
      )}

      {isBack && (
        <div className="guide-banner-card">
          <div className="guide-banner-info">
            <span className="guide-banner-tag">
              <Sparkles size={13} aria-hidden="true" />
              {t("Official Style Guide")}
            </span>
            <strong>{t("Back Design Options — 8 Signature Styles")}</strong>
            <p>{t("Explore back neck design references")}</p>
          </div>
          <button
            type="button"
            className="guide-banner-btn"
            onClick={() => setShowBackGuide(true)}
          >
            <BookOpen size={16} aria-hidden="true" />
            {t("View Back Design Chart")}
          </button>
        </div>
      )}

      {isSleeve && (
        <div className="guide-banner-card">
          <div className="guide-banner-info">
            <span className="guide-banner-tag">
              <Sparkles size={13} aria-hidden="true" />
              {t("Official Style Guide")}
            </span>
            <strong>{t("Sleeve Design Options — 11 Bespoke Styles")}</strong>
            <p>{t("Explore neck and sleeve design references")}</p>
          </div>
          <button
            type="button"
            className="guide-banner-btn"
            onClick={() => setShowStyleGuide(true)}
          >
            <BookOpen size={16} aria-hidden="true" />
            {t("View Sleeve Design Chart")}
          </button>
        </div>
      )}

      <div className="visual-options-toolbar">
        <div className="visual-options-search">
          <label htmlFor={searchId}>
            {t(externalPaging ? "Search loaded designs" : "Find a design")}
          </label>
          <div>
            <Search size={18} aria-hidden="true" />
            <input
              id={searchId}
              value={search}
              type="search"
              placeholder={t("Search by name or detail")}
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(12);
              }}
            />
          </div>
        </div>
        {onReset && (
          <button
            type="button"
            className="visual-reset"
            onClick={onReset}
            disabled={Boolean(
              originalId && String(selectedId) === String(originalId),
            )}
          >
            {t("Reset to original")}
          </button>
        )}
      </div>

      <div
        className="visual-options-grid"
        role="radiogroup"
        aria-label={t("Choose {0}", {
          0: kind ? labelToken(kind) : t("design"),
        })}
      >
        {visible.map((option) => {
          const selected = idOf(option) === String(selectedId);
          const matched = isNeck
            ? findNeckGuide(option.name || option.code)
            : isBack
              ? findBackGuide(option.name || option.code)
              : isSleeve
                ? findSleeveGuide(option.name || option.code)
                : null;

          return (
            <article
              className={`visual-option-card${selected ? " is-selected" : ""}`}
              key={idOf(option)}
            >
              <label className="visual-option-selection">
                <input
                  type="radio"
                  name={radioName}
                  value={idOf(option)}
                  checked={selected}
                  onChange={() => onSelect(idOf(option))}
                />
                <OptionImage
                  key={`${idOf(option)}:${option.imageUrl || option.images?.[0]?.url || matched?.image}`}
                  option={option}
                  kind={kind}
                />
                <span className="visual-option-info">
                  <span className="visual-option-title">
                    {localize(option, "name")}
                  </span>
                  {option.code && <small>{option.code}</small>}
                  <span className="visual-option-description">
                    {localize(option, "description") ||
                      (matched && (language === "hi" ? matched.descriptionHi : matched.description)) ||
                      t("Details confirmed during tailor review.")}
                  </span>
                  {matched && (
                    <div className="visual-option-craft-meta">
                      <span className="craft-pill">
                        <strong>{language === "hi" ? "कपड़ा:" : "Fabric:"}</strong>{" "}
                        {language === "hi" ? matched.bestFabricHi : matched.bestFabric}
                      </span>
                      <span className="craft-pill">
                        <strong>{language === "hi" ? "बेस्ट:" : "Best:"}</strong>{" "}
                        {language === "hi" ? matched.bestPairedWithHi : matched.bestPairedWith}
                      </span>
                    </div>
                  )}
                  <span className="visual-option-compatible">
                    {t("For: {0}", { 0: compatibleGarments(option) })}
                  </span>
                  <strong className="visual-option-price">
                    {optionPriceLabel(option)}
                  </strong>
                  <span className="visual-selection-state">
                    {selected ? (
                      <>
                        <Check size={17} aria-hidden="true" /> {t("Selected")}
                      </>
                    ) : (
                      t("Select design")
                    )}
                  </span>
                </span>
              </label>
              <button
                className="visual-option-preview"
                type="button"
                onClick={(event) => {
                  setReturnFocus(event.currentTarget);
                  setPreview(option);
                }}
                aria-label={t("Preview {0}", { 0: localize(option, "name") })}
              >
                {t("View larger & details")}
              </button>
            </article>
          );
        })}
      </div>

      {!filtered.length && !loading && !error && (
        <p className="visual-options-empty" role="status">
          {t(
            search
              ? externalPaging && hasMore
                ? "No matching loaded designs. Try another name or load more designs."
                : "No matching designs. Try another name."
              : externalPaging && (hasMore || loadingMore)
                ? "No loaded designs yet. Load more designs to see available options."
                : "No compatible options are currently available. Please ask our tailor for help.",
          )}
        </p>
      )}

      {externalPaging && (hasMore || loadingMore) && (
        <button
          className="visual-load-more"
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          aria-busy={loadingMore}
        >
          {t(loadingMore ? "Loading more designs…" : "Load more designs")}
        </button>
      )}

      {!externalPaging && filtered.length > limit && (
        <button
          className="visual-load-more"
          type="button"
          onClick={() => setLimit((previous) => previous + 12)}
        >
          {t("Show more designs ({0} remaining)", {
            0: filtered.length - limit,
          })}
        </button>
      )}

      <p className="visual-options-count" aria-live="polite">
        {t(
          externalPaging
            ? "Showing {0} of {1} loaded designs"
            : "Showing {0} of {1} designs",
          {
            0: visible.length,
            1: externalPaging ? eligible.length : filtered.length,
          },
        )}
      </p>

      {preview && (
        <OptionPreview
          option={preview}
          kind={kind}
          onClose={() => setPreview(null)}
          returnFocus={returnFocus}
        />
      )}

      {showStyleGuide && isNeck && (
        <GuideModal
          title={t("Neck Design Options — 8 Signature Styles")}
          subtitle={t("Choose your perfect style • Khwab Stitch Atelier")}
          imageUrl="/guides/neck-designs-guide.jpg"
          onClose={() => setShowStyleGuide(false)}
          footerNote={t(
            "Our master tailor can adjust neckline width and depth as per your personal preference.",
          )}
        />
      )}

      {showStyleGuide && isSleeve && (
        <GuideModal
          title={t("Sleeve Design Options — 11 Bespoke Styles")}
          subtitle={t("Choose your perfect style • Khwab Stitch Atelier")}
          imageUrl="/guides/sleeve-designs-guide.jpg"
          onClose={() => setShowStyleGuide(false)}
          footerNote={t(
            "Choose an administrator-confirmed sleeve and length combination, or ask our master tailor for guidance.",
          )}
        />
      )}

      {showBackGuide && (
        <GuideModal
          title={t("Back Design Options — 8 Signature Styles")}
          subtitle={t("Choose your perfect style • Khwab Stitch Atelier")}
          imageUrl="/guides/back-designs-guide.jpg"
          onClose={() => setShowBackGuide(false)}
          footerNote={t(
            "Back neckline cuts are tailored to match your posture and outfit choice.",
          )}
        />
      )}
    </section>
  );
}
