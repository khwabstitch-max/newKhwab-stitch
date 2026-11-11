import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { t } from "../i18n/core";
import "./guide-modal.css";

export function GuideModal({
  title,
  subtitle,
  imageUrl,
  onClose,
  footerNote,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    closeRef.current?.focus();

    const handleKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    dialog.addEventListener("keydown", handleKey);
    return () => dialog.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <dialog
      className="guide-dialog"
      ref={dialogRef}
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="guide-dialog-content">
        <header className="guide-dialog-header">
          <div>
            <span className="guide-dialog-badge">{t("Khwab Stitch Guide")}</span>
            <h3 className="guide-dialog-title">{title}</h3>
            {subtitle && <p className="guide-dialog-subtitle">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="guide-dialog-close"
            onClick={onClose}
            aria-label={t("Close guide")}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="guide-dialog-body">
          <div className="guide-image-container">
            <img
              src={imageUrl}
              alt={title}
              className="guide-dialog-img"
              loading="lazy"
            />
          </div>
        </div>

        {footerNote && (
          <footer className="guide-dialog-footer">
            <p>{footerNote}</p>
          </footer>
        )}
      </div>
    </dialog>
  );
}
