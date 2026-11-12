import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Expand,
  X,
  Scissors,
} from "lucide-react";
import { useLanguage } from "../i18n/Language";
import { localize, t } from "../i18n/core";
import { money, readable } from "../lib/api";
import { GarmentArt } from "./ui";
export function DesignImage({
  image,
  alt = "",
  className = "",
  fit = "contain",
  onError,
}) {
  useLanguage();
  const clip = useId();
  if (!image?.url)
    return (
      <div className={`design-photo placeholder ${className}`}>
        <Scissors aria-hidden="true" />
        <span>{t("Image preview unavailable")}</span>
      </div>
    );
  if (!image.crop)
    return (
      <img
        className={`design-photo ${className}`}
        src={image.url}
        alt={alt}
        loading="lazy"
        style={{ objectFit: fit }}
        onError={onError}
      />
    );
  const width = image.width || 1536,
    height = image.height || 1024;
  const { x, y, width: w, height: h } = image.crop;
  const rect = {
    x: (x / 100) * width,
    y: (y / 100) * height,
    width: (w / 100) * width,
    height: (h / 100) * height,
  };
  return (
    <svg
      className={`design-photo ${className}`}
      viewBox={`${rect.x} ${rect.y} ${rect.width} ${rect.height}`}
      preserveAspectRatio={`xMidYMid ${fit === "cover" ? "slice" : "meet"}`}
      role="img"
      aria-label={alt}
      aria-hidden={!alt || undefined}
    >
      <title>{alt}</title>
      <defs>
        <clipPath id={clip}>
          <rect {...rect} />
        </clipPath>
      </defs>
      <image
        href={image.url}
        width={width}
        height={height}
        clipPath={`url(#${clip})`}
        onError={onError}
      />
    </svg>
  );
}
export function DesignGallery({ design }) {
  useLanguage();
  const [selected, setSelected] = useState(0);
  const zoom = useRef(null);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    if (zoomed) zoom.current?.showModal();
  }, [zoomed]);
  const views = design.views?.length
    ? design.views
    : (design.images || []).map((image, index) => ({
        ...image,
        label: t("Image {0}", { 0: index + 1 }),
      }));
  const active = Math.min(selected, Math.max(views.length - 1, 0));
  const image =
    views[active] ||
    (design.coverImageUrl ? { url: design.coverImageUrl } : null);
  const label = localize(image, "label");
  const alt = localize(design, "title") + (label ? " — " + label : "");
  const isWide = Boolean(
    image &&
    (!image.crop ||
      (image.crop.width || 0) > (image.crop.height || 0) * 1.15),
  );
  function enlarge(index = active) {
    setSelected(index);
    setZoomed(true);
  }
  return (
    <section className="design-gallery" aria-label={t("Design previews")}>
      <div className={`design-main-photo ${isWide ? "is-wide" : ""}`}>
        {image ? (
          <DesignImage image={image} alt={alt} />
        ) : (
          <GarmentArt garment={design.garment} large />
        )}
        {image && (
          <button
            type="button"
            className="gallery-expand"
            onClick={() => enlarge()}
          >
            <Expand size={16} />
            {t("Enlarge image")}
          </button>
        )}
      </div>
      {views.length > 0 && (
        <div className="gallery-caption">
          <span>{label}</span>
          {views.length > 1 && (
            <div>
              <button
                type="button"
                className="icon-button"
                aria-label={t("Previous preview")}
                onClick={() =>
                  setSelected((active - 1 + views.length) % views.length)
                }
              >
                <ChevronLeft size={18} />
              </button>
              <small>
                {t("{0} of {1}", { 0: active + 1, 1: views.length })}
              </small>
              <button
                type="button"
                className="icon-button"
                aria-label={t("Next preview")}
                onClick={() => setSelected((active + 1) % views.length)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}
      {views.length > 1 && (
        <div
          className="design-preview-strip"
          aria-label={t("Choose a preview")}
        >
          {views.map((view, index) => (
            <button
              type="button"
              key={`${view.id || view.mediaId}-${index}`}
              aria-pressed={active === index}
              onClick={() => setSelected(index)}
              aria-label={localize(view, "label")}
            >
              <DesignImage image={view} alt="" />
              <span>{localize(view, "label")}</span>
            </button>
          ))}
        </div>
      )}
      <p className="small-print gallery-reference">
        {t(
          "Images are design references. Your fabric, colour and final fit may vary.",
        )}
      </p>
      {views.length > 3 && (
        <section className="detail-lookbook">
          <h2>{t("A closer look")}</h2>
          <div>
            {views
              .filter((view) => view.crop && view.crop.height < 70)
              .map((view) => {
                const index = views.indexOf(view);
                return (
                  <button
                    type="button"
                    key={index}
                    onClick={() => enlarge(index)}
                  >
                    <DesignImage image={view} alt={localize(view, "label")} />
                    <span>
                      {localize(view, "label")}
                      <Expand size={13} />
                    </span>
                  </button>
                );
              })}
          </div>
        </section>
      )}
      <dialog
        ref={zoom}
        onClose={() => setZoomed(false)}
        className="design-zoom"
        aria-label={t("Enlarged design preview")}
        onClick={(event) => {
          if (event.target === event.currentTarget) zoom.current.close();
        }}
      >
        {zoomed && (
          <div>
            <div className="zoom-toolbar">
              <strong>{label || localize(design, "title")}</strong>
              <button
                type="button"
                className="icon-button"
                onClick={() => zoom.current.close()}
                aria-label={t("Close image preview")}
              >
                <X />
              </button>
            </div>
            <DesignImage image={image} alt={alt} />
            <p>{t("Fabric provided by customer.")}</p>
          </div>
        )}
      </dialog>
    </section>
  );
}
const specifications = [
  ["neck", "Neck"],
  ["sleeve", "Sleeve"],
  ["back", "Back"],
  ["style", "Style"],
  ["fabric", "Fabric shown"],
  ["fabricRequirement", "Fabric required"],
  ["turnaround", "Delivery estimate"],
];
export function DesignSpecifications({ design }) {
  useLanguage();
  const rows = specifications.filter(([key]) =>
    localize(design.designDetails, key),
  );
  return (
    <>
      {rows.length > 0 && (
        <section className="design-specifications">
          <h2>{t("Design details")}</h2>
          <dl>
            {rows.map(([key, label]) => (
              <div key={key}>
                <dt>{t(label)}</dt>
                <dd>{localize(design.designDetails, key)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {localize(design, "serviceNotes") && (
        <div className="service-note">
          <strong>{t("Before you book")}</strong>
          <p>{localize(design, "serviceNotes")}</p>
        </div>
      )}
    </>
  );
}
export function DesignPresentation({ design, preview = false }) {
  useLanguage();
  const Heading = preview ? "h2" : "h1";
  return (
    <div className="detail-grid design-presentation">
      <DesignGallery key={design._id || design.slug} design={design} />
      <div className="detail-copy">
        <p className="eyebrow">
          {design.code} · {readable(design.garment)}
        </p>
        <Heading>{localize(design, "title")}</Heading>
        <p className="detail-price">
          {t("Stitching starting from")}{" "}
          <strong>{money(design.startingPricePaise)}</strong>
        </p>
        <p className="muted">{localize(design, "description")}</p>
        <div className="fabric-promise">
          <Scissors size={22} />
          <div>
            <strong>{t("Fabric provided by customer.")}</strong>
            <span>
              {t(
                "For customers who want their own fabric stitched to their measurements.",
              )}
            </span>
          </div>
        </div>
        <DesignSpecifications design={design} />
        <ul className="check-list">
          <li>
            <Check size={17} />
            {t("Made to your measurements and preferences")}
          </li>
          <li>
            <Check size={17} />
            {t("Final quote and delivery date after review")}
          </li>
        </ul>
        {!preview && (
          <Link
            className="button"
            to={`/request?design=${design._id}&garment=${design.garment}`}
          >
            {t("Customize & stitch this design")}
            <ArrowRight size={18} />
          </Link>
        )}
      </div>
    </div>
  );
}
