import { useState } from "react";
import { Sparkles, Scissors, Shirt, Ruler, Eye, BookOpen } from "lucide-react";
import { useLanguage } from "../i18n/Language";
import { t } from "../i18n/core";
import {
  neckDesignCards,
  backDesignCards,
  sleeveDesignCards,
  sleeveLengthCards,
} from "../data/tailoringDesignGuide";
import { GuideModal } from "./GuideModal";
import "./design-guide-explorer.css";

export function DesignGuideExplorer() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState("neck");
  const [modalItem, setModalItem] = useState(null);
  const [showMasterChart, setShowMasterChart] = useState(false);

  const tabs = [
    {
      id: "neck",
      label: language === "hi" ? "गले के डिज़ाइन" : "Neck Designs",
      count: neckDesignCards.length,
      icon: Scissors,
      masterImg: "/guides/neck-designs-guide.jpg",
      masterTitle:
        language === "hi"
          ? "गले के डिज़ाइन ऑप्शन्स चार्ट"
          : "Neck Design Options Chart",
      intro: t("Explore visual style references. Availability, garment suitability and stitching prices are confirmed for the selected catalogue option."),
    },
    {
      id: "back",
      label: language === "hi" ? "बैक डिज़ाइन" : "Back Designs",
      count: backDesignCards.length,
      icon: Sparkles,
      masterImg: "/guides/back-designs-guide.jpg",
      masterTitle:
        language === "hi"
          ? "बैक डिज़ाइन ऑप्शन्स चार्ट"
          : "Back Design Options Chart",
      intro: t("Explore visual style references. Availability, garment suitability and stitching prices are confirmed for the selected catalogue option."),
    },
    {
      id: "sleeve",
      label: language === "hi" ? "बाजू के डिज़ाइन" : "Sleeve Designs",
      count: sleeveDesignCards.length,
      icon: Shirt,
      masterImg: "/guides/sleeve-designs-guide.jpg",
      masterTitle:
        language === "hi"
          ? "बाजू के डिज़ाइन ऑप्शन्स चार्ट"
          : "Sleeve Design Options Chart",
      intro: t("Explore visual style references. Availability, garment suitability and stitching prices are confirmed for the selected catalogue option."),
    },
    {
      id: "length",
      label: language === "hi" ? "बाजू की लंबाई" : "Sleeve Lengths",
      count: sleeveLengthCards.length,
      icon: Ruler,
      masterImg: "/guides/sleeve-length-guide.jpg",
      masterTitle:
        language === "hi"
          ? "बाजू की लंबाई विकल्प चार्ट"
          : "Sleeve Length Options Chart",
      intro:
        language === "hi"
          ? "5 लंबाई के विकल्प (बिना बाजू से पूरी बाजू तक) — फ्रंट और साइड व्यू संदर्भ। बाजू की लंबाई बदलने पर कोई अतिरिक्त शुल्क नहीं लगता (₹0)!"
          : "5 sleeve length preferences (Sleeveless to Full Sleeve) with front & side views. Choosing your preferred sleeve length has no additional charge (₹0)!",
    },
  ];

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];
  const items =
    activeTab === "neck"
      ? neckDesignCards
      : activeTab === "back"
        ? backDesignCards
        : activeTab === "sleeve"
          ? sleeveDesignCards
          : sleeveLengthCards;

  return (
    <div className="design-guide-explorer">
      <div className="guide-explorer-tabs" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={`guide-tab-btn${isActive ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
              <span className="guide-tab-count">{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div className="guide-explorer-header">
        <p className="guide-explorer-desc">{currentTab.intro}</p>
        <button
          type="button"
          className="guide-banner-btn"
          onClick={() => setShowMasterChart(true)}
        >
          <BookOpen size={16} aria-hidden="true" />
          {language === "hi" ? "मास्टर चार्ट देखें" : "View Full Master Sheet"}
        </button>
      </div>

      <div className="guide-explorer-grid">
        {items.map((item) => {
          const title = language === "hi" ? item.nameHi : item.name;
          const desc = language === "hi" ? item.descriptionHi : item.description;
          const paired =
            language === "hi" ? item.bestPairedWithHi : item.bestPairedWith;
          const fabric = language === "hi" ? item.bestFabricHi : item.bestFabric;
          const price = t(activeTab === "length" ? "No additional charge" : "Price after review");
          const isFree = activeTab === "length";

          return (
            <article key={item.id} className="tailoring-card">
              <div className="tailoring-card-img-wrap">
                <img src={item.image} alt={title} loading="lazy" />
                <span
                  className={`tailoring-card-price-badge${isFree ? " is-free" : ""}`}
                >
                  {price}
                </span>
              </div>

              <div className="tailoring-card-body">
                <div className="tailoring-card-heading">
                  <h3 className="tailoring-card-title">{title}</h3>
                  <span className="tailoring-card-subname">
                    {item.subname || (item.lengthCm ? `${item.lengthCm} (${item.lengthIn})` : "")}
                  </span>
                </div>

                <p className="tailoring-card-desc">{desc}</p>

                <div className="tailoring-card-meta-list">
                  <div className="tailoring-card-meta-item">
                    <span className="tailoring-card-meta-label">
                      <Sparkles size={13} aria-hidden="true" />
                      {language === "hi"
                        ? "किसके साथ अच्छी लगती है:"
                        : "Best Paired With:"}
                    </span>
                    <span className="tailoring-card-meta-value">{paired}</span>
                  </div>

                  <div className="tailoring-card-meta-item">
                    <span className="tailoring-card-meta-label">
                      <Shirt size={13} aria-hidden="true" />
                      {language === "hi"
                        ? "बेस्ट फिनिशिंग कपड़ा:"
                        : "Recommended Fabric:"}
                    </span>
                    <span className="tailoring-card-meta-value">{fabric}</span>
                  </div>
                </div>
              </div>

              <div className="tailoring-card-footer">
                <span className="tailoring-card-rate">
                  {language === "hi" ? "सिलाई दर: " : "Rate: "}
                  <strong>{price}</strong>
                </span>
                <button
                  type="button"
                  className="tailoring-card-view-btn"
                  onClick={() => setModalItem(item)}
                >
                  <Eye size={13} aria-hidden="true" />{" "}
                  {language === "hi" ? "बड़ा देखें" : "View Large"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {modalItem && (
        <GuideModal
          title={language === "hi" ? modalItem.nameHi : modalItem.name}
          subtitle={
            language === "hi" ? modalItem.descriptionHi : modalItem.description
          }
          imageUrl={modalItem.image}
          onClose={() => setModalItem(null)}
          footerNote={t(activeTab === "length" ? "No additional charge" : "Style reference; price after tailor review")}
        />
      )}

      {showMasterChart && (
        <GuideModal
          title={currentTab.masterTitle}
          subtitle={currentTab.intro}
          imageUrl={currentTab.masterImg}
          onClose={() => setShowMasterChart(false)}
          footerNote={t(
            "Khwab Stitch • Handcrafted bespoke tailoring made to your exact measurements.",
          )}
        />
      )}
    </div>
  );
}
