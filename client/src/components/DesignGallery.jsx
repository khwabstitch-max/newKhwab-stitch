import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Expand,
  X,
  Scissors,
} from "lucide-react";
import { useLanguage } from "../i18n/Language";
import { withDesignPhotography } from "../lib/design-photography";
import { withProductionDesignDetails } from "../lib/design-presentation";
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
  design = withDesignPhotography(design);
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
  const imageAspect = image?.crop
    ? (image.crop.width * (image.width || 1536)) / (image.crop.height * (image.height || 1024))
    : image?.width && image?.height ? image.width / image.height : 1;
  const isWide = imageAspect > 1.15;
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
          design.garment === "alteration" ? "public.design.alterationReference" : "Images are design references. Your fabric, colour and final fit may vary.",
        )}
      </p>
      {views.length > 3 && (
        <section className="detail-lookbook">
          <h2>{t("A closer look")}</h2>
          <div>
            {views
              .filter((view) => view.kind === "detail" || (!view.kind && view.crop && view.crop.height < 70))
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
            <p>{t(design.garment === "alteration" ? "public.design.alterationBring" : "Fabric provided by customer.")}</p>
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
const alterationSpecifications = [
  ["scope", "public.design.alterationScope"],
  ["preparation", "public.design.alterationPreparation"],
  ["fitting", "public.design.alterationFitting"],
  ["limitations", "public.design.alterationLimits"],
  ["turnaround", "Delivery estimate"],
];
export function DesignSpecifications({ design }) {
  useLanguage();
  design = withProductionDesignDetails(design);
  const rows = (design.garment === "alteration" ? alterationSpecifications : specifications).filter(([key]) =>
    localize(design.designDetails, key),
  );
  return (
    <>
      {rows.length > 0 && (
        <section className="design-specifications" aria-label={t(design.garment === "alteration" ? "public.design.serviceDetails" : "Design details")}>
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
  design = withProductionDesignDetails(withDesignPhotography(design));
  const isAlteration = design.garment === "alteration";
  const hasPrice = !isAlteration && Number.isSafeInteger(design.startingPricePaise) && design.startingPricePaise >= 0;
  const Heading = preview ? "h2" : "h1";
  return (
    <div className="detail-grid design-presentation">
      <div className="detail-copy design-summary">
        <p className="eyebrow design-reference">
          <span className="design-reference-code" aria-label={t(isAlteration ? "public.design.serviceCode" : "public.design.designCode")}>{design.code}</span>
          <span>{readable(design.garment)}</span>
        </p>
        <Heading>{localize(design, "title")}</Heading>
        <p className="detail-price">
          {hasPrice && <span>{t(isAlteration ? "public.design.alterationPrice" : "Stitching starting from")}</span>}
          <strong>{hasPrice ? money(design.startingPricePaise) : t(isAlteration ? "public.design.alterationPrice" : "public.design.pricePending")}</strong>
        </p>
        {!preview && (
          <Link
            className="button design-select-button"
            to={"/request?design=" + design._id + "&garment=" + design.garment}
          >
            {t(isAlteration ? "public.design.alterationCta" : "public.design.makeYours")}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        )}
        <ul className="design-essential-notes">
          <li><Scissors size={16} aria-hidden="true" /><span>{t(isAlteration ? "public.design.alterationBring" : "Fabric provided by customer.")}</span></li>
          <li>{t(isAlteration ? "public.design.alterationExtra" : "public.design.extraWork")}</li>
          <li>{t("Final quote and delivery date after review")}</li>
        </ul>
      </div>
      <DesignGallery key={design._id || design.slug} design={design} />
      <details className="design-more-details" open={isAlteration || undefined}>
        <summary>{t(isAlteration ? "public.design.serviceDetails" : "Design details")}</summary>
        {localize(design, "description") && <p className="design-description">{localize(design, "description")}</p>}
        <DesignSpecifications design={design} />
      </details>
    </div>
  );
}
