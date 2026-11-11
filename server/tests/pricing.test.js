import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateEstimate, estimateInput } from "../src/pricing.js";
import { orderInput } from "../src/domain.js";

const ids = {
  design: "100000000000000000000001",
  sleeve: "100000000000000000000002",
  neck: "100000000000000000000003",
  back: "100000000000000000000004",
  change: "100000000000000000000005",
  extra: "100000000000000000000006",
  ref: "100000000000000000000007",
};
const options = [
  {
    _id: ids.sleeve,
    name: "Original sleeves",
    kind: "sleeve",
    garments: ["kurti"],
    active: true,
    priceMode: "additional",
    amountPaise: 9000,
  },
  {
    _id: ids.neck,
    name: "Round neckline",
    kind: "neck",
    garments: ["kurti"],
    active: true,
    priceMode: "included",
  },
  {
    _id: ids.back,
    name: "Original back",
    kind: "back",
    garments: ["kurti"],
    active: true,
    priceMode: "included",
  },
  {
    _id: ids.change,
    name: "Elbow sleeves",
    kind: "sleeve",
    garments: ["kurti"],
    active: true,
    priceMode: "additional",
    amountPaise: 12000,
    measurementFields: ["sleeveLength"],
  },
  {
    _id: ids.extra,
    name: "Lace",
    kind: "extra",
    garments: ["kurti"],
    active: true,
    priceMode: "additional",
    amountPaise: 5000,
  },
];
const design = {
  _id: ids.design,
  title: "Catalogue kurti",
  garment: "kurti",
  startingPricePaise: 65000,
  defaultComponents: { sleeve: ids.sleeve, neck: ids.neck, back: ids.back },
};
const input = (changes = {}) => ({
  garment: "kurti",
  quantity: 1,
  designId: ids.design,
  configuration: {
    source: "catalogue",
    mode: "exact",
    components: {},
    addonIds: [],
  },
  logistics: {
    inbound: { method: "dropoff" },
    outbound: { method: "collect" },
  },
  ...changes,
});
const priced = (value = input(), changes = {}) =>
  calculateEstimate(value, { design, options, settings: {}, ...changes });

test("exact catalogue components are included once regardless of standalone component charge", () => {
  const value = priced();
  assert.equal(value.knownSubtotalPaise, 65000);
  assert.equal(value.estimatedTotalPaise, 65000);
  assert.equal(value.components.sleeve.source, "original");
  assert.equal(
    value.lineItems.filter((line) => line.code === "stitching").length,
    1,
  );
});
test("customizing only sleeves preserves original neck and back; replacement removes earlier option cost", () => {
  const value = input();
  value.configuration.mode = "custom";
  value.configuration.components.sleeve = {
    source: "option",
    optionId: ids.change,
  };
  const changed = priced(value);
  assert.equal(changed.knownSubtotalPaise, 77000);
  assert.equal(changed.components.neck.source, "original");
  assert.equal(changed.components.back.source, "original");
  value.configuration.components.sleeve.optionId = ids.sleeve;
  assert.equal(priced(value).knownSubtotalPaise, 65000);
});
test("adding and removing an optional addon changes only its charge", () => {
  const value = input();
  value.configuration.mode = "custom";
  value.configuration.addonIds = [ids.extra];
  assert.equal(priced(value).knownSubtotalPaise, 70000);
  value.configuration.addonIds = [];
  assert.equal(priced(value).knownSubtotalPaise, 65000);
});
test("quantity multiplies garment prices and transport is charged once for each shipment leg", () => {
  const address = {
    line1: "123 Test street",
    line2: "",
    city: "Delhi",
    state: "Delhi",
    pin: "110001",
  };
  const value = input({
    quantity: 3,
    logistics: {
      inbound: { method: "business", address },
      outbound: { method: "business", address },
    },
  });
  const result = priced(value, {
    settings: {
      serviceAreas: [
        {
          name: "Delhi",
          enabled: true,
          pinPrefixes: ["110"],
          inboundPaise: 8000,
          outboundPaise: 10000,
        },
      ],
    },
  });
  assert.equal(result.knownSubtotalPaise, 213000);
  assert.deepEqual(
    result.lineItems
      .filter((line) => line.scope === "shipment")
      .map((line) => line.quantity),
    [1, 1],
  );
});
test("mixed references preserve per-part associations and never present unknown work as free or final", () => {
  const value = input({
    designId: undefined,
    configuration: {
      source: "reference",
      mode: "custom",
      addonIds: [],
      components: {
        sleeve: { source: "reference", referenceMediaId: ids.ref },
        neck: { source: "option", optionId: ids.neck },
        back: { source: "reference", referenceMediaId: ids.ref },
      },
    },
  });
  const result = priced(value, { design: null });
  assert.equal(result.estimatedTotalPaise, null);
  assert.equal(result.hasPending, true);
  assert.equal(result.components.sleeve.referenceMediaId, ids.ref);
  assert.equal(result.components.neck.source, "option");
  assert.equal(result.pendingItems.length, 3);
});
test("unconfigured or legacy component data produces pending review without inventing a component", () => {
  const result = priced(input(), {
    design: { ...design, defaultComponents: undefined },
  });
  assert.equal(result.estimatedTotalPaise, null);
  assert.equal(result.pendingItems.length, 3);
  assert.equal(result.components.sleeve.optionId, undefined);
});
test("replacement adjustments require an explicit configured delta; bundled base is never guessed", () => {
  const value = input();
  value.configuration.mode = "custom";
  value.configuration.components.sleeve = {
    source: "option",
    optionId: ids.change,
  };
  let changed = options.map((option) =>
    option._id === ids.change
      ? {
          ...option,
          priceMode: "replacement",
          replacementAdjustmentPaise: undefined,
        }
      : option,
  );
  assert.equal(priced(value, { options: changed }).estimatedTotalPaise, null);
  changed = changed.map((option) =>
    option._id === ids.change
      ? { ...option, replacementAdjustmentPaise: 3000 }
      : option,
  );
  assert.equal(priced(value, { options: changed }).knownSubtotalPaise, 68000);
});
test("changed, archived, incompatible, or wrong-kind selected options fail instead of silently repricing", () => {
  const value = input();
  value.configuration.mode = "custom";
  value.configuration.components.sleeve = {
    source: "option",
    optionId: ids.change,
  };
  assert.throws(
    () =>
      priced(value, { options: options.filter((o) => o._id !== ids.change) }),
    /option changed|option.*unavailable/,
  );
  assert.throws(
    () =>
      priced(value, {
        options: options.map((o) =>
          o._id === ids.change ? { ...o, active: false } : o,
        ),
      }),
    /unavailable/,
  );
  value.configuration.components.sleeve.optionId = ids.neck;
  assert.throws(() => priced(value), /unavailable/);
});
test("transport absent serviceability or configured null rate stays pending", () => {
  const value = input({
    logistics: {
      inbound: { method: "business", address: { pin: "110001" } },
      outbound: { method: "collect" },
    },
  });
  assert.equal(priced(value).estimatedTotalPaise, null);
  assert.ok(
    priced(value).pendingItems.some(
      (item) => item.code === "transport:inbound",
    ),
  );
});
test("browser-supplied prices cannot enter authoritative estimate input", () => {
  assert.equal(
    estimateInput.safeParse({ ...input(), amountPaise: 1 }).success,
    false,
  );
  const value = input();
  value.configuration.components.sleeve = {
    source: "option",
    optionId: ids.change,
    amountPaise: 1,
  };
  assert.equal(estimateInput.safeParse(value).success, false);
});
test("sleeveless style removes inapplicable sleeve measurements", () => {
  const value = input();
  value.configuration.mode = "custom";
  value.configuration.components.sleeve = {
    source: "option",
    optionId: ids.change,
  };
  const result = priced(value, {
    options: options.map((o) =>
      o._id === ids.change
        ? {
            ...o,
            sleeveStyle: "sleeveless",
            measurementFields: ["sleeveLength", "armhole"],
          }
        : o,
    ),
  });
  assert.deepEqual(result.measurementFields, []);
});
test("new workflow permits unusual positive measurements while legacy validation stays compatible", () => {
  const body = {
    ...input(),
    preferences: {},
    measurements: {
      unit: "in",
      method: "body",
      values: { bust: 110, waist: 100, hip: 120, shoulder: 14, length: 40 },
    },
    referenceMediaIds: [],
    customer: { name: "Test customer", phone: "9876543210" },
    address: {
      line1: "123 Test road",
      city: "Delhi",
      state: "Delhi",
      pin: "110001",
    },
    fabricAcknowledged: true,
  };
  assert.equal(orderInput.safeParse(body).success, true);
  body.measurements.reconfirmFields = ["bust"];
  assert.equal(orderInput.safeParse(body).success, false);
});

test("new customer-arranged transport needs no address while legacy requests and business legs keep address validation", () => {
  const body = {
    ...input(),
    preferences: {},
    measurements: { unit: "in", method: "assistance", values: {} },
    referenceMediaIds: [],
    customer: { name: "Test customer", phone: "9876543210" },
    fabricAcknowledged: true,
    fabricDetails: "Customer-provided cotton",
  };
  assert.equal(orderInput.safeParse(body).success, true);
  const legacy = { ...body };
  delete legacy.configuration;
  assert.equal(orderInput.safeParse(legacy).success, false);
  body.logistics.inbound = { method: "business" };
  assert.equal(orderInput.safeParse(body).success, false);
});
