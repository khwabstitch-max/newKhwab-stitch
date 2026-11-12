import { t, labelToken, translateError } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  LoaderCircle,
  Scissors,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cloneElement, isValidElement, useId } from "react";
export function Spinner({ label = t("Loading\u2026") }) {
  useLanguage();
  return (
    <div className="state" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{t(label)}</span>
    </div>
  );
}
export function ErrorMessage({ message, retry }) {
  useLanguage();
  return message ? (
    <div className="notice error" role="alert">
      <AlertCircle size={18} />
      <div>
        {translateError(message)}
        {retry && (
          <button type="button" className="text-button" onClick={retry}>
            {t("Try again")}
          </button>
        )}
      </div>
    </div>
  ) : null;
}
export function Notice({ children }) {
  useLanguage();
  return (
    <div className="notice" role="status">
      <ShieldCheck size={19} />
      <div>{t(children)}</div>
    </div>
  );
}
export function Empty({ title = t("Nothing here yet"), children, action }) {
  useLanguage();
  return (
    <div className="empty">
      <Scissors size={32} />
      <h3>{t(title)}</h3>
      {children && <p>{t(children)}</p>}
      {action}
    </div>
  );
}
export function PageHeading({ eyebrow, title, children, action }) {
  useLanguage();
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{t(eyebrow)}</p>}
        <h1>{t(title)}</h1>
        {children && <p className="muted">{t(children)}</p>}
      </div>
      {action}
    </div>
  );
}
export function Field({
  label,
  hint,
  error,
  className = "",
  children,
  ...props
}) {
  useLanguage();
  const generatedId = useId();
  const nativeChild = isValidElement(children) && ["input", "select", "textarea"].includes(children.type);
  const name = props.id || (nativeChild ? children.props.id : undefined) || props.name || `field-${generatedId}`;
  const describedBy = [...new Set([
    ...(nativeChild ? (children.props["aria-describedby"] || "").split(/\s+/) : []),
    hint ? `${name}-hint` : "",
    error ? `${name}-error` : "",
  ].filter(Boolean))].join(" ") || undefined;
  const control = nativeChild ? cloneElement(children, {
    id: name,
    required: children.props.required ?? props.required,
    lang: children.props.lang ?? props.lang,
    "aria-invalid": Boolean(error) || children.props["aria-invalid"] || false,
    "aria-describedby": describedBy,
    "aria-labelledby": children.props["aria-labelledby"] || (children.props["aria-label"] ? undefined : `${name}-label`),
  }) : children;
  return (
    <label className={`field ${className}`} htmlFor={name}>
      <span>
        <span id={`${name}-label`}>{t(label)}</span>
        {(props.required || (nativeChild && children.props.required)) && <span aria-hidden="true"> *</span>}
      </span>
      {control || (
        <input
          {...props}
          id={name}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          aria-labelledby={props["aria-labelledby"] || (props["aria-label"] ? undefined : `${name}-label`)}
        />
      )}
      {hint && <small id={`${name}-hint`}>{t(hint)}</small>}
      {error && <small id={`${name}-error`} className="field-error" aria-live="polite">{translateError(error)}</small>}
    </label>
  );
}
export function Badge({ children, tone = "" }) {
  useLanguage();
  return <span className={`badge ${tone}`}>{labelToken(children)}</span>;
}
export function Button({ busy, children, ...props }) {
  useLanguage();
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
    >
      {busy && <LoaderCircle className="spin" size={17} />}
      {t(children)}
    </button>
  );
}
export function Steps({ current, labels }) {
  useLanguage();
  return (
    <ol className="steps" aria-label={t("Request progress")}>
      {labels.map((label, i) => (
        <li
          key={label}
          className={`${i === current ? "active" : ""} ${i < current ? "done" : ""}`}
          aria-current={i === current ? "step" : undefined}
        >
          <span>
            {i < current ? <Check size={14} /> : String(i + 1).padStart(2, "0")}
          </span>
          <small>{t(label)}</small>
        </li>
      ))}
    </ol>
  );
}
export function GarmentArt({ garment = "kurti", variant = 0, large = false }) {
  useLanguage();
  const palette = [
    ["#e8c4b6", "#945a46"],
    ["#c3c4a4", "#6f704b"],
    ["#e0b4ba", "#a45e68"],
    ["#d7bea4", "#8f6b4a"],
  ][variant % 4];
  return (
    <svg
      className={`garment-art ${large ? "large" : ""}`}
      viewBox="0 0 360 420"
      role="img"
      aria-label={t("Illustration of {0} stitching", {
        0: labelToken(garment),
      })}
    >
      <defs>
        <pattern
          id={`motif-${variant}-${garment}`}
          width="30"
          height="30"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M15 7q8 8 0 16q-8-8 0-16"
            fill="none"
            stroke={palette[1]}
            strokeWidth=".7"
            opacity=".35"
          />
          <circle cx="0" cy="0" r="2" fill={palette[1]} opacity=".4" />
        </pattern>
      </defs>
      <ellipse cx="180" cy="381" rx="91" ry="13" fill="#563d30" opacity=".08" />
      <path
        d="M180 38v20m0-20c0-15 21-15 21-1m-21 21-73 32h146z"
        fill="none"
        stroke={palette[1]}
        strokeWidth="2"
      />
      {garment === "blouse" ? (
        <>
          <path
            d="m132 91-43 24-37 69 43 20 24-37 2 102h118l2-102 24 37 43-20-37-69-43-24q-48 50-96 0Z"
            fill={palette[0]}
          />
          <path
            d="m132 91-43 24-37 69 43 20 24-37 2 102h118l2-102 24 37 43-20-37-69-43-24q-48 50-96 0Z"
            fill={`url(#motif-${variant}-${garment})`}
          />
          <path
            d="M132 91q48 88 96 0M180 136v131m-58-15h116"
            fill="none"
            stroke={palette[1]}
            strokeWidth="2"
          />
        </>
      ) : (
        <>
          <path
            d="m141 88-36 21-42 103 37 15 23-57-16 184q73 26 146 0l-16-184 23 57 37-15-42-103-36-21q-39 35-78 0Z"
            fill={palette[0]}
          />
          <path
            d="m141 88-36 21-42 103 37 15 23-57-16 184q73 26 146 0l-16-184 23 57 37-15-42-103-36-21q-39 35-78 0Z"
            fill={`url(#motif-${variant}-${garment})`}
          />
          <path
            d="M141 88q39 62 78 0m-39 29v82m-69 140q69 23 138 0M128 188l-11 124m115-124 11 124"
            fill="none"
            stroke={palette[1]}
            strokeWidth="2"
          />
          {[143, 161, 179].map((y) => (
            <circle key={y} cx="180" cy={y} r="2.2" fill={palette[1]} />
          ))}
        </>
      )}
      <path
        d="M41 333q14-17 28 0-14 17-28 0zm264-260q10-14 20 0-10 14-20 0z"
        stroke={palette[1]}
        strokeWidth="1"
        fill="none"
      />
      <path d="M49 333h12m250-260h10" stroke={palette[1]} />
    </svg>
  );
}
export function BackLink({
  to = "/catalogue",
  children = t("Back to catalogue"),
}) {
  useLanguage();
  return (
    <Link className="back-link" to={to}>
      <ChevronLeft size={16} />
      {t(children)}
    </Link>
  );
}
export function ArrowLink({ to, children }) {
  useLanguage();
  return (
    <Link className="arrow-link" to={to}>
      {t(children)}
      <ArrowRight size={17} />
    </Link>
  );
}
export function UploadButton({
  onChange,
  disabled,
  label = t("Upload image"),
}) {
  useLanguage();
  return (
    <label className={`upload-button ${disabled ? "disabled" : ""}`}>
      <Upload size={17} />
      {t(label)}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onChange}
        disabled={disabled}
      />
    </label>
  );
}
