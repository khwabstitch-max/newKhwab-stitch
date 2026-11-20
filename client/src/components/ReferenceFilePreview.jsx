import { useEffect, useState } from "react";
import { ExternalLink, FileText, RefreshCw, X } from "lucide-react";
import { api } from "../lib/api";
import { t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { DesignImage } from "./DesignGallery";
import { Button, ErrorMessage } from "./ui";
import "./reference-files.css";

function isPdfFile(file, url) {
  if ((file?.mimeType || file?.mime || "").split(";")[0].toLowerCase() === "application/pdf") return true;
  return /\.pdf(?:$|[?#])/i.test(file?.filename || file?.name || "") || /\.pdf(?:$|[?#])/i.test(url || "");
}

export function ReferenceFilePreview({
  mediaId, accessPath, autoLoad = true, file, label, onRemove, disabled = false,
  loadLabel, openLabel, imageView,
}) {
  useLanguage();
  const [requested, setRequested] = useState(autoLoad);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ file: null, error: "", loading: autoLoad });
  useEffect(() => {
    if (!requested && !autoLoad) return;
    const controller = new AbortController();
    setState({ file: null, error: "", loading: true });
    api(accessPath || `/media/${mediaId}/access`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setState({ file: data, error: "", loading: false }); })
      .catch(error => { if (!controller.signal.aborted) setState({ file: null, error, loading: false }); });
    return () => controller.abort();
  }, [mediaId, accessPath, autoLoad, requested, version]);
  const current = { ...file, ...state.file };
  const url = state.file?.url || "";
  const pdf = isPdfFile(current, url);
  const title = label || current.filename || t(pdf ? "reference.file.pdf" : "reference.file.image");
  const refresh = () => { setRequested(true); setVersion(value => value + 1); };
  return <figure className={`reference-file-preview${pdf ? " is-pdf" : ""}`} aria-label={title}>
    {url ? <>
      <a className="reference-file-open" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        {pdf ? <div className="reference-file-document"><FileText size={38} aria-hidden="true" /><strong>PDF</strong>{current.filename && <span>{current.filename}</span>}</div> : <div className="reference-file-visual">{imageView?.crop ? <DesignImage image={{ ...current, ...imageView, url }} alt={title} onError={() => setState({ file: null, error: t("reference.file.unavailable"), loading: false })} /> : <img src={url} alt={title} loading="lazy" referrerPolicy="no-referrer" onError={() => setState({ file: null, error: t("reference.file.unavailable"), loading: false })} />}</div>}
        <span className="reference-file-open-label">{pdf ? t("reference.file.openPdf") : openLabel || t("reference.file.openImage")} <ExternalLink size={13} aria-hidden="true" /></span>
      </a>
      <figcaption><strong>{title}</strong>{current.filename && current.filename !== title && !pdf && <span>{current.filename}</span>}<span>{current.pageCount ? t(current.pageCount === 1 ? "reference.file.page" : "reference.file.pages", { 0: current.pageCount }) : ""}{current.pageCount && current.bytes ? " · " : ""}{current.bytes ? t("reference.file.bytes", { 0: Math.max(1, Math.round(current.bytes / 1024)) }) : ""}</span></figcaption>
      <Button type="button" className="text-button reference-file-refresh" disabled={disabled} busy={state.loading} onClick={refresh}><RefreshCw size={13} aria-hidden="true" />{t("Refresh access link")}</Button>
    </> : <div className="reference-file-load"><Button type="button" className="button secondary small" disabled={disabled} busy={state.loading} onClick={refresh}>{state.loading ? t("reference.file.loading") : loadLabel || t("reference.file.view")}</Button></div>}
    <ErrorMessage message={state.error} retry={refresh} />
    {onRemove && <button type="button" className="text-button reference-file-remove" disabled={disabled} onClick={onRemove} aria-label={t("reference.file.remove", { 0: title })}><X size={14} aria-hidden="true" />{t("Remove")}</button>}
  </figure>;
}
