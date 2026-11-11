import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { money } from "../lib/api";
import { useResource } from "../lib/hooks";
import { t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { Button, ErrorMessage } from "./ui";

export function QuoteBenefitBreakdown({ preview }) {
  useLanguage();
  if (!preview) return null;
  return <dl className="review-list" aria-label={t("Quote benefits")}>
    <div><dt>{t("Original quote")}</dt><dd>{money(preview.grossAmountPaise)}</dd></div>
    <div><dt>{t("Offer discount")}{preview.offerCode ? ` · ${preview.offerCode}` : ""}</dt><dd>−{money(preview.discountPaise)}</dd></div>
    <div><dt>{t("Stitching credits")}</dt><dd>−{money(preview.creditPaise)}</dd></div>
    <div><dt>{t("Payable after benefits")}</dt><dd>{money(preview.amountPaise)}</dd></div>
  </dl>;
}

export function QuoteAcceptance({ order, quote, busy, action, reloadOrder }) {
  useLanguage();
  const benefits = useResource(`/commerce/quote-benefits/${order._id}`);
  const current = benefits.data;
  const ready = !benefits.loading && !benefits.error && current?.valid !== false && current?.revision === order.revision && current?.quoteVersion === quote.version;
  const amount = current?.preview?.amountPaise ?? quote.amountPaise;
  return <div className="quote-acceptance">
    {benefits.loading && <p role="status">{t("Checking current quote benefits…")}</p>}
    <ErrorMessage message={benefits.error} retry={benefits.reload} />
    {!benefits.loading && !benefits.error && !ready && <ErrorMessage message={current?.validationMessage || t("Your quote or benefits changed. Refresh the quote before accepting.")} retry={reloadOrder} />}
    {ready && <QuoteBenefitBreakdown preview={current.preview} />}
    <div className="stack-actions">
      <Link className="text-link" to="/account/benefits">{t("Choose or remove offers and stitching credits")}</Link>
      <Button className="button" busy={busy} disabled={!ready} onClick={() => {
        if (!ready || !window.confirm(t("Accept quote version {0} for {1}?", { 0: quote.version, 1: money(amount) }))) return;
        action(`/orders/${order._id}/quote-response`, { revision: order.revision, quoteVersion: quote.version, decision: "accept" });
      }}><Check size={16} />{t("Accept current quote")}</Button>
    </div>
  </div>;
}
