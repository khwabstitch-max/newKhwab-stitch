import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Share2,
  Check,
  ChevronLeft,
  Sparkles,
  Scissors,
  Ruler,
  Clock,
} from "lucide-react";
import { t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import "./direct-chat.css";

export function DirectCustomerChat() {
  useLanguage();
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    // Automatically open the moveable customer chat popup widget on mount
    const timer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("open-atelier-chat"));
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const handleOpenChat = () => {
    window.dispatchEvent(new CustomEvent("open-atelier-chat"));
  };

  const handleCopyLink = async () => {
    try {
      const chatUrl = window.location.origin + "/chat";
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(chatUrl);
      } else {
        const input = document.createElement("input");
        input.value = chatUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="container page direct-chat-concierge">
      <div className="direct-chat-hero">
        <Link to="/" className="direct-chat-back-link" title={t("Back to atelier")}>
          <ChevronLeft size={18} />
          <span>{t("Back to atelier")}</span>
        </Link>

        <div className="direct-chat-badge-pill">
          <Sparkles size={14} />
          <span>{t("KhwabStitch Atelier")}</span>
        </div>

        <h1 className="direct-chat-title">{t("KhwabStitch Live Atelier Chat")}</h1>
        <p className="direct-chat-subtitle">
          {t("Direct conversation with our master craftsmen")}
        </p>
        <p className="direct-chat-hint">
          {t("Share this link to chat directly with KhwabStitch Atelier without installing any app.")}
        </p>

        <div className="direct-chat-cta-group">
          <button
            type="button"
            className="button direct-chat-open-btn"
            onClick={handleOpenChat}
          >
            <MessageSquare size={18} />
            <span>{t("Open Live Chat")}</span>
          </button>

          <button
            type="button"
            className="button secondary direct-chat-share-btn"
            onClick={handleCopyLink}
          >
            {copiedLink ? <Check size={18} /> : <Share2 size={18} />}
            <span>{copiedLink ? t("Link copied!") : t("Copy chat link")}</span>
          </button>
        </div>
      </div>

      <div className="direct-chat-features-grid">
        <div className="direct-chat-feature-card">
          <div className="direct-chat-feature-icon">
            <Scissors size={24} />
          </div>
          <h3>{t("Custom Stitching Enquiry")}</h3>
          <p>{t("Questions about fabric, fit, or an idea you cannot quite put into words? Say hello.")}</p>
        </div>

        <div className="direct-chat-feature-card">
          <div className="direct-chat-feature-icon">
            <Ruler size={24} />
          </div>
          <h3>{t("How to provide measurements?")}</h3>
          <p>{t("Master tailor guidance from choosing the right fabric to getting measurements right")}</p>
        </div>

        <div className="direct-chat-feature-card">
          <div className="direct-chat-feature-icon">
            <Clock size={24} />
          </div>
          <h3>{t("Turnaround and delivery time")}</h3>
          <p>{t("Price and timing are confirmed with you after our tailors review your design and fabric.")}</p>
        </div>
      </div>
    </div>
  );
}
