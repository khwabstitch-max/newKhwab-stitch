import { useEffect, useState } from "react";
import { api, dateTime, money } from "../lib/api";
import { useResource } from "../lib/hooks";
import { t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { Button, ErrorMessage, Field, Notice, Spinner } from "./ui";

const providers = [{ provider: "shiprocket", name: "Shiprocket" }, { provider: "delhivery", name: "Delhivery" }];

function CourierAccount({ provider, name, status, storageReady, originPin, reload }) {
  useLanguage();
  const [credentials, setCredentials] = useState({ apiToken: "", mode: "S" });
  const [parcel, setParcel] = useState({});
  const [customerPin, setCustomerPin] = useState("");
  const [atelierPin, setAtelierPin] = useState(null);
  const [direction, setDirection] = useState("outbound");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quote, setQuote] = useState(null);
  const connected = Boolean(status?.configured);
  useEffect(() => { setQuote(null); }, [originPin]);
  async function act(operation) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await operation(); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  const effectiveAtelierPin = atelierPin ?? originPin ?? "";
  return <section className="panel" aria-labelledby={`courier-${provider}-heading`}>
    <h3 id={`courier-${provider}-heading`}>{name}</h3>
    <p role="status">{t(connected ? status.verified ? "delivery.connection.verified" : "delivery.connection.configured" : "delivery.connection.missing")}</p>
    {status?.lastVerifiedAt && <small>{t("delivery.connection.verifiedAt", { 0: dateTime(status.lastVerifiedAt) })}</small>}
    {(status?.lastErrorCode || status?.requiresReconnect) && <Notice>{t("delivery.connection.attention")}</Notice>}
    <ErrorMessage message={error} />{notice && <Notice>{notice}</Notice>}
    <form autoComplete="off" aria-label={t("delivery.connection.form", { 0: name })} onSubmit={event => {
      event.preventDefault();
      if (!storageReady) return;
      void act(async () => {
        await api(`/admin/courier-connections/${provider}`, { method: "PUT", body: { credentials: { apiToken: credentials.apiToken.trim(), ...(provider === "delhivery" ? { mode: credentials.mode } : {}) } } });
        setCredentials({ apiToken: "", mode: "S" }); setQuote(null);
        setNotice(t("delivery.connection.saved")); reload();
      });
    }}>
      <fieldset disabled={busy || !storageReady}>
        <Field label={t("delivery.connection.token")} name={`courier-${provider}-apiToken`} type="password" autoComplete="new-password" spellCheck={false} required maxLength={8192} value={credentials.apiToken} onChange={event => setCredentials(previous => ({ ...previous, apiToken: event.target.value }))} hint={t("delivery.connection.tokenHint")} />
        {provider === "delhivery" && <Field label={t("delivery.connection.mode")} name="courier-delhivery-mode"><select id="courier-delhivery-mode" value={credentials.mode} onChange={event => setCredentials(previous => ({ ...previous, mode: event.target.value }))}><option value="S">{t("delivery.connection.surface")}</option><option value="E">{t("delivery.connection.express")}</option></select></Field>}
        <Button type="submit" className="button secondary" busy={busy}>{t("delivery.connection.save")}</Button>
      </fieldset>
    </form>
    <Button type="button" className="text-button danger" disabled={busy || !connected} onClick={() => void act(async () => {
      await api(`/admin/courier-connections/${provider}`, { method: "DELETE" });
      setCredentials({ apiToken: "", mode: "S" }); setQuote(null); setNotice(t("delivery.connection.disconnected")); reload();
    })}>{t("delivery.connection.disconnect")}</Button>
    {connected && <details className="admin-advanced">
      <summary>{t("delivery.connection.testTitle")}</summary>
      <p className="small-print">{t("delivery.connection.testHint")}</p>
      <form aria-label={t("delivery.connection.testForm", { 0: name })} onSubmit={event => {
        event.preventDefault();
        void act(async () => {
          setQuote(null);
          const input = { weightGrams: Number(parcel.weightGrams), lengthCm: Number(parcel.lengthCm), widthCm: Number(parcel.widthCm), heightCm: Number(parcel.heightCm), ...(parcel.declaredValue ? { declaredValuePaise: Math.round(Number(parcel.declaredValue) * 100) } : {}) };
          const { data } = await api(`/admin/courier-connections/${provider}/test`, { method: "POST", body: { direction, originPin: direction === "inbound" ? customerPin : effectiveAtelierPin, destinationPin: direction === "inbound" ? effectiveAtelierPin : customerPin, parcel: input } });
          setQuote(data.quote); reload();
        });
      }}>
        <fieldset disabled={busy || !storageReady}>
          <div className="form-grid">
            <Field label={t("delivery.connection.direction")} name={`courier-${provider}-direction`}><select id={`courier-${provider}-direction`} value={direction} onChange={event => { setDirection(event.target.value); setQuote(null); }}><option value="outbound">{t("delivery.admin.delivery")}</option><option value="inbound">{t("delivery.admin.pickup")}</option></select></Field>
            <Field label={t("delivery.admin.originPin")} name={`courier-${provider}-atelierPin`} required inputMode="numeric" pattern="[1-9][0-9]{5}" minLength={6} maxLength={6} value={effectiveAtelierPin} onChange={event => { setAtelierPin(event.target.value); setQuote(null); }} />
            <Field label={t("delivery.connection.customerPin")} name={`courier-${provider}-customerPin`} required inputMode="numeric" pattern="[1-9][0-9]{5}" minLength={6} maxLength={6} value={customerPin} onChange={event => { setCustomerPin(event.target.value); setQuote(null); }} />
            {[["weightGrams", "delivery.connection.weight", 1, 30000, 1], ["lengthCm", "delivery.connection.length", 0.1, 200, 0.1], ["widthCm", "delivery.connection.width", 0.1, 200, 0.1], ["heightCm", "delivery.connection.height", 0.1, 200, 0.1]].map(([key, label, min, max, step]) => <Field key={key} label={t(label)} name={`courier-${provider}-${key}`} type="number" required min={min} max={max} step={step} value={parcel[key] || ""} onChange={event => { setParcel(previous => ({ ...previous, [key]: event.target.value })); setQuote(null); }} />)}
            <Field label={t("delivery.connection.value")} hint={t("delivery.connection.valueHint")} name={`courier-${provider}-declaredValue`} type="number" required={provider === "shiprocket" && direction === "inbound"} min={0.01} max={1000000} step="0.01" value={parcel.declaredValue || ""} onChange={event => { setParcel(previous => ({ ...previous, declaredValue: event.target.value })); setQuote(null); }} />
          </div>
          <Button type="submit" className="button secondary" busy={busy}>{t("delivery.connection.test")}</Button>
        </fieldset>
      </form>
      {quote && <Notice><strong>{t("delivery.connection.quote", { 0: Number.isInteger(quote.totalPaise) ? money(quote.totalPaise) : t("Pending tailor review") })}</strong>{quote.courierName && <p>{quote.courierName}{quote.service ? " · " + quote.service : ""}</p>}{quote.validUntil && <small>{t("delivery.connection.validUntil", { 0: dateTime(quote.validUntil) })}</small>}</Notice>}
    </details>}
  </section>;
}

export function AdminCourierConnections({ originPin = "" }) {
  useLanguage();
  const { data, loading, error, reload } = useResource("/admin/courier-connections");
  return <section aria-labelledby="courier-connections-heading">
    <h2 id="courier-connections-heading">{t("delivery.connection.title")}</h2>
    <p className="small-print">{t("delivery.connection.privateHint")}</p>
    <ErrorMessage message={error} retry={reload} />
    {loading && !data ? <Spinner /> : data && <>
      {!data.storageReady && <Notice>{t("delivery.connection.storageMissing")}</Notice>}
      {providers.map(provider => <CourierAccount key={provider.provider} {...provider} status={data.providers?.find(item => item.provider === provider.provider)} storageReady={Boolean(data.storageReady)} originPin={originPin} reload={reload} />)}
      <section className="panel" aria-labelledby="courier-bluedart-heading"><h3 id="courier-bluedart-heading">Blue Dart</h3><Notice>{t("delivery.connection.blueDart")}</Notice></section>
    </>}
  </section>;
}
