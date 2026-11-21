import { z } from "zod";

// Provider-owned contracts: https://apidocs.shiprocket.in/
// https://one.delhivery.com/developer-portal/document/b2c/detail/faq
// https://delhivery-express-api-doc.readme.io/reference/invoice-shipping-charge-api
// https://help.delhivery.com/docs/calculating-volumetric-weight
// Blue Dart's public Price Finder is an approximation, not an account rate API:
// https://api.bluedart.com/price-finder
// No direct Blue Dart rate request is made without a documented pricing contract.
const ENDPOINTS = Object.freeze({
  shiprocket: "https://apiv2.shiprocket.in/v1/external/courier/serviceability/",
  delhivery: "https://track.delhivery.com/api/kinko/v1/invoice/charges/.json",
});
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const QUOTE_LIFETIME_MS = 5 * 60 * 1000;
const MAX_AMOUNT_PAISE = 100_000_000;
const token = z
  .string()
  .trim()
  .min(1)
  .max(8192)
  .regex(/^[A-Za-z0-9._~+/=-]+$/);

export const providerCredentialSchemas = Object.freeze({
  shiprocket: z.strictObject({ apiToken: token }),
  delhivery: z.strictObject({
    apiToken: token,
    mode: z.enum(["S", "E"]).default("S"),
  }),
});

export class CourierProviderError extends Error {
  constructor(code) {
    super(code);
    this.name = "CourierProviderError";
    this.code = code;
  }
}

export function normalizeCourierCredentials(provider, input) {
  if (provider === "bluedart")
    throw new CourierProviderError("provider_contract_required");
  const schema = Object.hasOwn(providerCredentialSchemas, provider)
    ? providerCredentialSchemas[provider]
    : null;
  if (!schema) throw new CourierProviderError("unsupported_provider");
  const result = schema.safeParse(input);
  if (!result.success) throw new CourierProviderError("invalid_credentials");
  return result.data;
}

const pinInput = z.string().regex(/^[1-9]\d{5}$/);
const dimensionInput = z.number().finite().positive().max(1000);
export const courierParcelInput = z.strictObject({
  weightGrams: z.number().int().positive().max(1_000_000),
  lengthCm: dimensionInput,
  widthCm: dimensionInput,
  heightCm: dimensionInput,
  declaredValuePaise: z
    .number()
    .int()
    .nonnegative()
    .max(100_000_000_000)
    .optional(),
});
const quoteInput = z.object({
  provider: z.string(),
  originPin: pinInput,
  destinationPin: pinInput,
  direction: z.enum(["inbound", "outbound"]),
  parcel: courierParcelInput,
  declaredValuePaise: z
    .number()
    .int()
    .nonnegative()
    .max(100_000_000_000)
    .optional(),
});

function unavailable(provider, reasonCode) {
  return { available: false, provider, reasonCode };
}

function currencyPaise(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const decimal = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(decimal)) return null;
  const [whole, fraction = ""] = decimal.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) &&
    amount >= 0 &&
    amount <= MAX_AMOUNT_PAISE
    ? amount
    : null;
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanLabel(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 160 ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return null;
  return value.trim();
}

function identifier(value) {
  if (typeof value === "number")
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value)
    ? value
    : null;
}

function assertedResponse(status) {
  if (status === 401 || status === 403)
    throw new CourierProviderError("authentication_failed");
  if (status === 429) throw new CourierProviderError("rate_limited");
  if (status >= 300 && status < 400)
    throw new CourierProviderError("provider_redirect");
  if (status < 200 || status >= 300)
    throw new CourierProviderError("provider_unavailable");
}

async function readBoundedJson(response) {
  const length = response.headers?.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
    throw new CourierProviderError("invalid_provider_response");
  const contentType = response.headers?.get("content-type") || "";
  if (
    !/(?:application\/json|[a-z0-9.+-]+\/[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(
      contentType,
    )
  )
    throw new CourierProviderError("invalid_provider_response");
  if (!response.body || typeof response.body.getReader !== "function")
    throw new CourierProviderError("invalid_provider_response");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array))
        throw new CourierProviderError("invalid_provider_response");
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES)
        throw new CourierProviderError("invalid_provider_response");
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new CourierProviderError("invalid_provider_response");
  }
}

async function requestJson(url, apiToken, provider, fetcher, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new CourierProviderError("provider_timeout"));
    }, timeoutMs);
  });
  const operation = (async () => {
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization:
          (provider === "shiprocket" ? "Bearer " : "Token ") + apiToken,
      },
      redirect: "error",
      signal: controller.signal,
    });
    assertedResponse(response.status);
    return readBoundedJson(response);
  })();
  try {
    return await Promise.race([operation, timeout]);
  } catch (error) {
    if (error instanceof CourierProviderError) throw error;
    throw new CourierProviderError(
      controller.signal.aborted ? "provider_timeout" : "provider_unavailable",
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function normalizedQuote(input, amount, metadata, timestamp) {
  return {
    available: true,
    provider: input.provider,
    totalPaise: amount,
    currency: "INR",
    originPin: input.originPin,
    destinationPin: input.destinationPin,
    direction: input.direction,
    parcel: input.parcel,
    ...metadata,
    quoteType: "live_account_estimate",
    quotedAt: new Date(timestamp).toISOString(),
    // Application reuse window; providers can still revise the final invoiced rate.
    validUntil: new Date(timestamp + QUOTE_LIFETIME_MS).toISOString(),
  };
}

async function quoteShiprocket(input, credentials, context) {
  const url = new URL(ENDPOINTS.shiprocket);
  const { parcel } = input;
  url.searchParams.set("pickup_postcode", input.originPin);
  url.searchParams.set("delivery_postcode", input.destinationPin);
  url.searchParams.set("cod", "0");
  url.searchParams.set("weight", String(parcel.weightGrams / 1000));
  url.searchParams.set("length", String(parcel.lengthCm));
  url.searchParams.set("breadth", String(parcel.widthCm));
  url.searchParams.set("height", String(parcel.heightCm));
  const declaredValue = input.declaredValuePaise ?? parcel.declaredValuePaise;
  if (input.direction === "inbound") {
    if (declaredValue === undefined)
      throw new CourierProviderError("declared_value_required");
    url.searchParams.set("is_return", "1");
  }
  if (declaredValue !== undefined)
    url.searchParams.set("declared_value", String(declaredValue / 100));
  const data = await requestJson(
    url,
    credentials.apiToken,
    input.provider,
    context.fetch,
    context.timeoutMs,
  );
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.currency !== "INR"
  )
    throw new CourierProviderError("invalid_provider_response");
  const couriers = data.data?.available_courier_companies;
  if (!Array.isArray(couriers) || couriers.length > 1000)
    throw new CourierProviderError("invalid_provider_response");
  if (!couriers.length) throw new CourierProviderError("not_serviceable");
  const valid = couriers.flatMap((courier) => {
    if (!courier || typeof courier !== "object") return [];
    // Account-disabled and explicitly blocked services cannot be offered.
    if (
      courier.blocked === true ||
      courier.blocked === 1 ||
      courier.blocked === "1" ||
      courier.odablock === true
    )
      return [];
    const amount = currencyPaise(courier.rate);
    const courierId = identifier(courier.courier_company_id);
    const courierName = cleanLabel(courier.courier_name);
    const chargeWeightKg = numberValue(courier.charge_weight);
    const grams =
      chargeWeightKg === null ? null : Math.round(chargeWeightKg * 1000);
    if (
      amount === null ||
      !courierId ||
      !courierName ||
      !Number.isSafeInteger(grams) ||
      grams < parcel.weightGrams ||
      grams > 1_000_000
    )
      return [];
    return [
      {
        amount,
        courierId,
        courierName,
        chargeableWeightGrams: grams,
        service: courier.is_surface === true ? "Surface" : "Courier",
      },
    ];
  });
  if (!valid.length)
    throw new CourierProviderError("invalid_provider_response");
  valid.sort(
    (left, right) =>
      left.amount - right.amount ||
      left.courierId.localeCompare(right.courierId),
  );
  const { amount, ...metadata } = valid[0];
  return normalizedQuote(
    input,
    amount,
    { ...metadata, source: "Shiprocket serviceability API" },
    context.timestamp,
  );
}

async function quoteDelhivery(input, credentials, context) {
  const url = new URL(ENDPOINTS.delhivery);
  const { parcel } = input;
  const chargeableWeightGrams = Math.max(
    parcel.weightGrams,
    Math.ceil((parcel.lengthCm * parcel.widthCm * parcel.heightCm) / 5),
  );
  if (chargeableWeightGrams > 1_000_000)
    throw new CourierProviderError("invalid_parcel");
  url.searchParams.set("md", credentials.mode);
  url.searchParams.set(
    "ss",
    input.direction === "inbound" ? "DTO" : "Delivered",
  );
  url.searchParams.set("o_pin", input.originPin);
  url.searchParams.set("d_pin", input.destinationPin);
  url.searchParams.set("cgm", String(chargeableWeightGrams));
  url.searchParams.set("pt", "Pre-paid");
  const data = await requestJson(
    url,
    credentials.apiToken,
    input.provider,
    context.fetch,
    context.timeoutMs,
  );
  if (
    !Array.isArray(data) ||
    data.length !== 1 ||
    !data[0] ||
    typeof data[0] !== "object"
  )
    throw new CourierProviderError("invalid_provider_response");
  const amount = currencyPaise(data[0].total_amount);
  if (amount === null)
    throw new CourierProviderError("invalid_provider_response");
  return normalizedQuote(
    input,
    amount,
    {
      chargeableWeightGrams,
      courierId:
        credentials.mode === "E" ? "delhivery-express" : "delhivery-surface",
      courierName: "Delhivery",
      service: credentials.mode === "E" ? "Express" : "Surface",
      source: "Delhivery invoice shipping charge API",
    },
    context.timestamp,
  );
}

export async function quoteCourier(input, options = {}) {
  const provider =
    typeof input?.provider === "string" ? input.provider : "unknown";
  if (provider === "bluedart")
    return unavailable(provider, "provider_contract_required");
  try {
    const credentials = normalizeCourierCredentials(
      provider,
      input?.credentials,
    );
    const parsed = quoteInput.safeParse(input);
    if (!parsed.success) throw new CourierProviderError("invalid_quote_input");
    const fetcher = options.fetch ?? globalThis.fetch;
    if (typeof fetcher !== "function")
      throw new CourierProviderError("provider_unavailable");
    const timestampValue = (options.now ?? Date.now)();
    const timestamp =
      timestampValue instanceof Date
        ? timestampValue.getTime()
        : timestampValue;
    if (
      typeof timestamp !== "number" ||
      !Number.isFinite(timestamp) ||
      timestamp < 0 ||
      timestamp > 8_000_000_000_000_000
    )
      throw new CourierProviderError("invalid_quote_input");
    const timeoutMs =
      options.timeoutMs === undefined ? REQUEST_TIMEOUT_MS : options.timeoutMs;
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > REQUEST_TIMEOUT_MS
    )
      throw new CourierProviderError("invalid_quote_input");
    const context = { fetch: fetcher, timestamp, timeoutMs };
    return provider === "shiprocket"
      ? await quoteShiprocket(parsed.data, credentials, context)
      : await quoteDelhivery(parsed.data, credentials, context);
  } catch (error) {
    return unavailable(
      provider,
      error instanceof CourierProviderError
        ? error.code
        : "provider_unavailable",
    );
  }
}
