import { useEffect, useId, useRef } from "react";
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
  const openerRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    openerRef.current = document.activeElement;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    closeRef.current?.focus();

    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      openerRef.current?.focus();
    };
  }, []);

  function handleKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
    )];
    const first = controls[0], last = controls.at(-1);
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
      className="guide-dialog"
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKey}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="guide-dialog-content">
        <header className="guide-dialog-header">
          <div>
            <span className="guide-dialog-badge">{t("Khwab Stitch Guide")}</span>
            <h3 className="guide-dialog-title" id={titleId}>{title}</h3>
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
