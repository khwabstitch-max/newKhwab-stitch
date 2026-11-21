import test from "node:test";
import assert from "node:assert/strict";
import {
  CourierProviderError,
  normalizeCourierCredentials,
  quoteCourier,
} from "../src/courier-providers.js";

const NOW = Date.parse("2026-11-20T09:30:00.000Z");
const parcel = { weightGrams: 500, lengthCm: 20, widthCm: 15, heightCm: 10 };
const request = (extra = {}) => ({
  provider: "shiprocket",
  credentials: { apiToken: "unit-test-token" },
  originPin: "110001",
  destinationPin: "400001",
  direction: "outbound",
  parcel: { ...parcel },
  ...extra,
});
const carrier = (extra = {}) => ({
  courier_company_id: 43,
  courier_name: "Delhivery Surface",
  rate: 82.35,
  charge_weight: 0.6,
  is_surface: true,
  blocked: 0,
  odablock: false,
  ...extra,
});
const shiprocketBody = (couriers = [carrier()], extra = {}) => ({
  currency: "INR",
  data: { available_courier_companies: couriers },
  ...extra,
});
const response = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
const context = (data, options = {}) => ({
  fetch: async () => response(data),
  now: () => NOW,
  ...options,
});

test("provider credential normalization permits only supported provider-specific fields", () => {
  assert.deepEqual(
    normalizeCourierCredentials("shiprocket", { apiToken: " token-value " }),
    { apiToken: "token-value" },
  );
  assert.deepEqual(
    normalizeCourierCredentials("delhivery", { apiToken: "token" }),
    { apiToken: "token", mode: "S" },
  );
  assert.deepEqual(
    normalizeCourierCredentials("delhivery", { apiToken: "token", mode: "E" }),
    { apiToken: "token", mode: "E" },
  );
  for (const [provider, credentials, code] of [
    [
      "shiprocket",
      { apiToken: "token", endpoint: "https://attacker.example" },
      "invalid_credentials",
    ],
    [
      "shiprocket",
      { apiToken: "token\r\nInjected:secret" },
      "invalid_credentials",
    ],
    [
      "shiprocket",
      { email: "user@example.com", password: "password" },
      "invalid_credentials",
    ],
    ["delhivery", { apiToken: "token", mode: "Air" }, "invalid_credentials"],
    ["bluedart", { apiToken: "token" }, "provider_contract_required"],
    ["toString", { apiToken: "token" }, "unsupported_provider"],
  ])
    assert.throws(
      () => normalizeCourierCredentials(provider, credentials),
      (error) => error instanceof CourierProviderError && error.code === code,
    );
});

test("Shiprocket quotes use the fixed HTTPS endpoint, physical pickup direction and bearer header", async () => {
  let captured;
  const input = request();
  const result = await quoteCourier(input, {
    now: () => NOW,
    fetch: async (url, options) => {
      captured = { url: new URL(url), options };
      return response(shiprocketBody());
    },
  });
  assert.equal(captured.url.origin, "https://apiv2.shiprocket.in");
  assert.equal(captured.url.pathname, "/v1/external/courier/serviceability/");
  assert.equal(captured.url.searchParams.get("pickup_postcode"), "110001");
  assert.equal(captured.url.searchParams.get("delivery_postcode"), "400001");
  assert.equal(captured.url.searchParams.get("weight"), "0.5");
  assert.equal(captured.url.searchParams.get("length"), "20");
  assert.equal(captured.url.searchParams.get("breadth"), "15");
  assert.equal(captured.url.searchParams.get("height"), "10");
  assert.equal(captured.url.searchParams.get("cod"), "0");
  assert.equal(captured.url.searchParams.has("is_return"), false);
  assert.equal(captured.url.searchParams.has("token"), false);
  assert.equal(
    captured.options.headers.Authorization,
    "Bearer unit-test-token",
  );
  assert.equal(captured.options.redirect, "error");
  assert.ok(captured.options.signal instanceof AbortSignal);
  assert.equal(result.available, true);
  assert.equal(result.totalPaise, 8235);
  assert.equal(result.currency, "INR");
  assert.equal(result.courierId, "43");
  assert.equal(result.chargeableWeightGrams, 600);
  assert.equal(result.originPin, "110001");
  assert.deepEqual(result.parcel, parcel);
  assert.equal(result.quotedAt, "2026-11-20T09:30:00.000Z");
  assert.equal(result.validUntil, "2026-11-20T09:35:00.000Z");
  assert.equal(JSON.stringify(result).includes("unit-test-token"), false);
});

test("Shiprocket selects the lowest actual available price and excludes blocked or malformed options", async () => {
  const result = await quoteCourier(
    request(),
    context(
      shiprocketBody([
        carrier({ courier_company_id: 1, rate: 0, blocked: 1 }),
        carrier({ courier_company_id: 2, rate: 1, odablock: true }),
        carrier({ courier_company_id: 3, rate: -1 }),
        carrier({ courier_company_id: 4, rate: "unavailable" }),
        carrier({
          courier_company_id: 5,
          rate: "71.04",
          courier_name: "Blue Dart Surface",
        }),
        carrier({ courier_company_id: 6, rate: "99.00" }),
      ]),
    ),
  );
  assert.equal(result.totalPaise, 7104);
  assert.equal(result.courierId, "5");
  assert.equal(result.courierName, "Blue Dart Surface");
});

test("inbound Shiprocket requires declared value and requests the actual reverse lane", async () => {
  let calls = 0;
  const inbound = request({
    direction: "inbound",
    originPin: "400001",
    destinationPin: "110001",
  });
  const fetcher = async (url) => {
    calls++;
    const captured = new URL(url);
    assert.equal(captured.searchParams.get("pickup_postcode"), "400001");
    assert.equal(captured.searchParams.get("delivery_postcode"), "110001");
    assert.equal(captured.searchParams.get("is_return"), "1");
    assert.equal(captured.searchParams.get("declared_value"), "450.25");
    return response(shiprocketBody());
  };
  assert.deepEqual(
    await quoteCourier(inbound, { fetch: fetcher, now: () => NOW }),
    {
      available: false,
      provider: "shiprocket",
      reasonCode: "declared_value_required",
    },
  );
  assert.equal(calls, 0);
  const result = await quoteCourier(
    { ...inbound, parcel: { ...parcel, declaredValuePaise: 45025 } },
    { fetch: fetcher, now: () => NOW },
  );
  assert.equal(result.available, true);
  assert.equal(calls, 1);
});

test("Delhivery uses the account invoice total, prepaid mode and volumetric chargeable grams", async () => {
  let captured;
  const result = await quoteCourier(
    request({
      provider: "delhivery",
      credentials: { apiToken: "delhivery-test", mode: "E" },
      parcel: { ...parcel, lengthCm: 30, widthCm: 20, heightCm: 10 },
    }),
    {
      now: () => NOW,
      fetch: async (url, options) => {
        captured = { url: new URL(url), options };
        return response([{ total_amount: "147.90", gross_amount: 125.34 }]);
      },
    },
  );
  assert.equal(captured.url.origin, "https://track.delhivery.com");
  assert.equal(captured.url.pathname, "/api/kinko/v1/invoice/charges/.json");
  assert.equal(captured.url.searchParams.get("md"), "E");
  assert.equal(captured.url.searchParams.get("ss"), "Delivered");
  assert.equal(captured.url.searchParams.get("o_pin"), "110001");
  assert.equal(captured.url.searchParams.get("d_pin"), "400001");
  assert.equal(captured.url.searchParams.get("cgm"), "1200");
  assert.equal(captured.url.searchParams.get("pt"), "Pre-paid");
  assert.equal(captured.options.headers.Authorization, "Token delhivery-test");
  assert.equal(result.totalPaise, 14790);
  assert.equal(result.chargeableWeightGrams, 1200);
  assert.equal(result.service, "Express");
  assert.equal(result.quoteType, "live_account_estimate");
});

test("Delhivery inbound uses DTO and the physical customer-to-atelier pickup lane", async () => {
  let captured;
  const result = await quoteCourier(
    request({
      provider: "delhivery",
      credentials: { apiToken: "token" },
      direction: "inbound",
      originPin: "400001",
      destinationPin: "110001",
    }),
    context([{ total_amount: 120 }], {
      fetch: async (url) => {
        captured = new URL(url);
        return response([{ total_amount: 120 }]);
      },
    }),
  );
  assert.equal(captured.searchParams.get("ss"), "DTO");
  assert.equal(captured.searchParams.get("md"), "S");
  assert.equal(captured.searchParams.get("o_pin"), "400001");
  assert.equal(captured.searchParams.get("d_pin"), "110001");
  assert.equal(result.totalPaise, 12000);
});

test("Blue Dart and unsupported provider failures never call an invented endpoint", async () => {
  let calls = 0;
  const options = {
    fetch: async () => {
      calls++;
      throw new Error("must not call");
    },
  };
  assert.deepEqual(
    await quoteCourier(request({ provider: "bluedart" }), options),
    {
      available: false,
      provider: "bluedart",
      reasonCode: "provider_contract_required",
    },
  );
  assert.equal(
    (await quoteCourier(request({ provider: "https://localhost/" }), options))
      .reasonCode,
    "unsupported_provider",
  );
  assert.equal(calls, 0);
});

test("invalid quote inputs, credentials and remote endpoint injection do not reach providers", async () => {
  let calls = 0;
  const options = {
    fetch: async () => {
      calls++;
      return response(shiprocketBody());
    },
  };
  for (const change of [
    { originPin: "001100" },
    { destinationPin: "http://localhost" },
    { direction: "return" },
    { parcel: { ...parcel, weightGrams: 0 } },
    { parcel: { ...parcel, lengthCm: Infinity } },
    { parcel: { ...parcel, endpoint: "http://localhost" } },
    { credentials: { apiToken: "token", baseUrl: "http://localhost" } },
  ])
    assert.equal(
      (await quoteCourier(request(change), options)).available,
      false,
    );
  assert.equal(calls, 0);
});

test("negative, excessive, ambiguous and malformed account prices never become quotes", async () => {
  for (const value of [
    -1,
    "",
    null,
    true,
    "1e2",
    "Infinity",
    "1,000",
    "Rs 50",
    "5.001",
    1_000_001,
  ]) {
    const shiprocket = await quoteCourier(
      request(),
      context(shiprocketBody([carrier({ rate: value })])),
    );
    const delhivery = await quoteCourier(
      request({ provider: "delhivery" }),
      context([{ total_amount: value }]),
    );
    assert.equal(
      shiprocket.reasonCode,
      "invalid_provider_response",
      String(value),
    );
    assert.equal(
      delhivery.reasonCode,
      "invalid_provider_response",
      String(value),
    );
  }
  const zero = await quoteCourier(
    request({ provider: "delhivery" }),
    context([{ total_amount: 0 }]),
  );
  assert.equal(zero.totalPaise, 0);
});

test("empty and malformed Shiprocket responses cannot silently fall back to fabricated rates", async () => {
  assert.equal(
    (await quoteCourier(request(), context(shiprocketBody([])))).reasonCode,
    "not_serviceable",
  );
  for (const body of [
    { currency: "USD", data: { available_courier_companies: [carrier()] } },
    { currency: "INR", data: {} },
    [],
    shiprocketBody([carrier({ courier_company_id: null })]),
    shiprocketBody([carrier({ courier_name: "" })]),
    shiprocketBody([carrier({ charge_weight: 0.1 })]),
    shiprocketBody([carrier({ charge_weight: -1 })]),
  ])
    assert.equal(
      (await quoteCourier(request(), context(body))).reasonCode,
      "invalid_provider_response",
    );
});

test("Delhivery accepts exactly one well-formed invoice row without substituting a subtotal", async () => {
  for (const body of [
    { total_amount: 100 },
    [],
    [{ total_amount: 100 }, { total_amount: 50 }],
    [{ gross_amount: 100 }],
    [{ error: "sensitive account error" }],
  ]) {
    const result = await quoteCourier(
      request({ provider: "delhivery" }),
      context(body),
    );
    assert.deepEqual(result, {
      available: false,
      provider: "delhivery",
      reasonCode: "invalid_provider_response",
    });
  }
});

test("provider status and network errors are mapped to safe reason codes", async () => {
  for (const [status, code] of [
    [401, "authentication_failed"],
    [403, "authentication_failed"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [302, "provider_redirect"],
  ]) {
    const result = await quoteCourier(
      request(),
      context(
        {},
        {
          fetch: async () =>
            response({ secret: "unit-test-token" }, { status }),
        },
      ),
    );
    assert.deepEqual(result, {
      available: false,
      provider: "shiprocket",
      reasonCode: code,
    });
  }
  const result = await quoteCourier(
    request(),
    context(
      {},
      {
        fetch: async () => {
          throw new Error("unit-test-token internal provider error");
        },
      },
    ),
  );
  assert.deepEqual(result, {
    available: false,
    provider: "shiprocket",
    reasonCode: "provider_unavailable",
  });
});

test("malformed JSON, unexpected content types and oversized streamed bodies are rejected", async () => {
  for (const fetcher of [
    async () =>
      new Response("<html>not JSON</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    async () =>
      new Response("{", { headers: { "Content-Type": "application/json" } }),
    async () =>
      response(
        {},
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "600000",
          },
        },
      ),
    async () =>
      new Response(new Uint8Array(512 * 1024 + 1), {
        headers: { "Content-Type": "application/json" },
      }),
  ])
    assert.equal(
      (await quoteCourier(request(), context({}, { fetch: fetcher })))
        .reasonCode,
      "invalid_provider_response",
    );
});

test("timeouts bound fetchers and response bodies even when they ignore abort", async () => {
  let signal;
  const fetchTimeout = await quoteCourier(request(), {
    fetch: async (_, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
    now: () => NOW,
    timeoutMs: 10,
  });
  assert.equal(fetchTimeout.reasonCode, "provider_timeout");
  assert.equal(signal.aborted, true);
  const stalledBody = await quoteCourier(request(), {
    fetch: async () =>
      new Response(new ReadableStream({ start() {} }), {
        headers: { "Content-Type": "application/json" },
      }),
    now: () => NOW,
    timeoutMs: 10,
  });
  assert.equal(stalledBody.reasonCode, "provider_timeout");
});
