import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { quoteCourier, normalizeCourierCredentials } from "./courier-providers.js";
import { parcelInput } from "./workflow-input.js";
const providers = ["shiprocket", "delhivery", "bluedart"];
const cache = new Map(), inflight = new Map(), initialization = new WeakMap();
export function courierStorageKey(config = {}) {
  const text = config.COURIER_CREDENTIALS_KEY || "";
  if (text) {
    const bytes = Buffer.from(text, "base64url");
    return bytes.length === 32 && bytes.toString("base64url") === text ? bytes : null;
  }
  if (config.NODE_ENV === "production" || !config.JWT_SECRET) return null;
  return Buffer.from(hkdfSync("sha256", Buffer.from(config.JWT_SECRET, "utf8"), "khwab-courier", "credentials-v1", 32));
}
export function encryptCourierCredentials(config, provider, credentials) {
  const key = courierStorageKey(config);
  if (!key) throw Object.assign(new Error("Courier credential storage is not configured on the server."), { code: "COURIER_STORAGE_UNAVAILABLE" });
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("khwab-courier:v1:" + provider));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64url"), iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), keyVersion: 1 };
}
export function decryptCourierCredentials(config, provider, encrypted) {
  const key = courierStorageKey(config);
  if (!key || encrypted?.keyVersion !== 1) throw Error("Courier credentials require reconnection.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64url"));
  decipher.setAAD(Buffer.from("khwab-courier:v1:" + provider));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));
  return normalizeCourierCredentials(provider, JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64url")), decipher.final()]).toString("utf8")));
}
export async function prepareCourierConnections(Model) {
  if (!initialization.has(Model)) initialization.set(Model, (async () => { await Model.createCollection(); await Model.createIndexes(); })().catch(error => { initialization.delete(Model); throw error; }));
  await initialization.get(Model);
}
function statusFor(record, config, provider) {
  let requiresReconnect = false;
  if (record) try { decryptCourierCredentials(config, provider, record.encryptedCredentials); } catch { requiresReconnect = true; }
  return { provider, supported: provider !== "bluedart", configured: Boolean(record), verified: Boolean(record?.lastVerifiedAt && !record?.lastErrorCode && !requiresReconnect), lastCheckedAt: record?.lastCheckedAt || null, lastVerifiedAt: record?.lastVerifiedAt || null, lastErrorCode: record?.lastErrorCode || null, requiresReconnect, ...(provider === "bluedart" ? { reasonCode: "provider_contract_required" } : {}) };
}
export async function courierConnectionStatus(ctx) {
  const records = ctx.models.CourierConnection ? await ctx.models.CourierConnection.find({}).select("+encryptedCredentials").lean() : [];
  return { storageReady: Boolean(courierStorageKey(ctx.config)), providers: providers.map(provider => statusFor(records.find(record => record.provider === provider), ctx.config, provider)) };
}
export async function courierAccountQuote(ctx, request, session = null, providedRecord) {
  if (request.provider === "bluedart") return { available: false, provider: request.provider, reasonCode: "provider_contract_required" };
  const Model = ctx.models.CourierConnection;
  if (!Model) return { available: false, provider: request.provider, reasonCode: "account_not_configured" };
  const record = providedRecord !== undefined ? providedRecord : await Model.findOne({ provider: request.provider }).select("+encryptedCredentials").session(session).lean();
  if (!record) return { available: false, provider: request.provider, reasonCode: "account_not_configured" };
  let credentials;
  try { credentials = decryptCourierCredentials(ctx.config, request.provider, record.encryptedCredentials); }
  catch { return { available: false, provider: request.provider, reasonCode: "credentials_unavailable" }; }
  const key = createHash("sha256").update(JSON.stringify([String(record._id),record.encryptedCredentials,request])).digest("hex");
  const now = Date.now(), saved = cache.get(key);
  if (saved && saved.expiresAt > now) return saved.value;
  if (inflight.has(key)) return inflight.get(key);
  const promise = (async () => {
    let result;
    try { result = await (ctx.courierQuote || quoteCourier)({ ...request, credentials }); }
    catch { result = { available: false, provider: request.provider, reasonCode: "provider_unavailable" }; }
    const available = result?.available === true;
    if (!result || typeof result !== "object") result = { available: false, provider: request.provider, reasonCode: "invalid_response" };
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    cache.set(key, { value: result, expiresAt: available ? Math.min(Date.parse(result.validUntil) || now, now + 300000) : now + 10000 });
    // Store account health only; no PIN, parcel, quote or credential is logged.
    const code = !available && /^[a-z_]{1,60}$/.test(result.reasonCode || "") ? result.reasonCode : available ? null : "provider_unavailable";
    try { await Model.updateOne({ _id: record._id, "encryptedCredentials.ciphertext": record.encryptedCredentials.ciphertext }, { $set: { lastCheckedAt: new Date(), lastErrorCode: code, ...(available ? { lastVerifiedAt: new Date() } : {}) } }); } catch { /* A health update does not change the quote. */ }
    return result;
  })().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
export async function resolveTransportQuotes(ctx, input, settings, session = null) {
  const config = settings?.deliveryPricing;
  if (config?.mode !== "courier" || !providers.includes(config.courierProvider) || !/^[1-9]\d{5}$/.test(config.originPin || "")) return {};
  const result = {};
  const record = ctx.models.CourierConnection ? await ctx.models.CourierConnection.findOne({ provider: config.courierProvider }).select("+encryptedCredentials").session(session).lean() : null;
  await Promise.all(["inbound", "outbound"].map(async direction => {
    const leg = input.logistics?.[direction], customerPin = leg?.address?.pin, parsed = parcelInput.safeParse(leg?.parcel);
    if (leg?.method !== "business" || !/^[1-9]\d{5}$/.test(customerPin || "") || !parsed.success) return;
    if (config.courierProvider === "shiprocket" && direction === "inbound" && !parsed.data.declaredValuePaise) return;
    const originPin = direction === "inbound" ? customerPin : config.originPin, destinationPin = direction === "inbound" ? config.originPin : customerPin;
    result[direction] = await courierAccountQuote(ctx, { provider: config.courierProvider, originPin, destinationPin, parcel: parsed.data, direction }, session, record);
  }));
  return result;
}
