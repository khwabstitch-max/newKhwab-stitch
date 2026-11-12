import { useState } from "react";
import { t } from "../i18n/core";
import { Field } from "./ui";

export function TokenListEditor({ label, name, value = [], onChange, max = 20, disabled = false, hint }) {
  const [entry, setEntry] = useState("");
  const add = () => {
    const next = entry.trim();
    if (!next || value.includes(next) || value.length >= max) return;
    onChange([...value, next]);
    setEntry("");
  };
  return <fieldset className="admin-token-editor" disabled={disabled}>
    <legend>{t(label)}</legend>
    {hint && <p className="small-print">{t(hint)}</p>}
    <div className="admin-chip-list">{value.map((item, index) => <span className="admin-chip" key={`${item}-${index}`}>
      <span>{item}</span><button type="button" aria-label={t("admin.form.removeValue", { 0: item })} onClick={() => onChange(value.filter((_, position) => position !== index))}>×</button>
    </span>)}</div>
    <div className="admin-inline-entry"><Field name={name} label={t("admin.form.addValue")} value={entry} disabled={value.length >= max} maxLength={60} onChange={event => setEntry(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      <button type="button" className="button secondary small" disabled={!entry.trim() || value.length >= max} onClick={add}>{t("admin.form.add")}</button></div>
  </fieldset>;
}

export function ChoiceGroup({ legend, name, options, value = [], onChange, disabled = false, hint, custom = false }) {
  const known = new Set(options.map(([key]) => key));
  const extras = value.filter(item => !known.has(item));
  return <fieldset className="admin-choice-group" disabled={disabled}>
    <legend>{t(legend)}</legend>{hint && <p className="small-print">{t(hint)}</p>}
    <div className="admin-choice-grid">{options.map(([key, label]) => <label className={`admin-choice ${value.includes(key) ? "selected" : ""}`} key={key}>
      <input type="checkbox" checked={value.includes(key)} onChange={event => onChange(event.target.checked ? [...value, key] : value.filter(item => item !== key))} />{t(label)}
    </label>)}</div>
    {(custom || extras.length > 0) && <details className="admin-advanced"><summary>{t("admin.form.otherSavedChoices")}</summary>
      <TokenListEditor label="admin.form.additionalChoices" name={`${name}-extra`} value={extras} onChange={items => onChange([...value.filter(item => known.has(item)), ...items])} disabled={disabled} hint="admin.form.keepSavedChoices" />
    </details>}
  </fieldset>;
}

export function AdminSection({ title, description, children, className = "" }) {
  return <section className={`admin-editor-section ${className}`}><div className="admin-section-heading"><h2>{t(title)}</h2>{description && <p>{t(description)}</p>}</div>{children}</section>;
}
