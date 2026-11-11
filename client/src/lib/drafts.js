/** Browser drafts: ordinary choices survive 30 days; personal data lives in this tab only. */
export const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PREFIX = "khwab:request:v2:";
const SENSITIVE = [
  "measurements",
  "customer",
  "address",
  "logistics",
  "referenceMediaIds",
  "notes",
  "fabricDetails",
  "assistanceRequests",
];
const PARTS = ["sleeveLength", "sleeve", "neck", "back", "fit", "extra"];
const BASE_FIELDS = {
  kurti: ["bust", "waist", "hip", "shoulder", "length"],
  suit: ["bust", "waist", "hip", "shoulder", "length"],
  blouse: ["bust", "underbust", "waist", "shoulder", "length"],
  alteration: ["bust", "waist", "hip", "shoulder", "length"],
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const safeId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{12,100}$/.test(id);
const storageFor = (options, name) => options[name] ?? globalThis[name];

export function createDraft(
  initial = {},
  { id = crypto.randomUUID(), now = Date.now() } = {},
) {
  const draft = {
    id,
    submissionKey: crypto.randomUUID(),
    createdAt: now,
    localRevision: 0,
    garment: "kurti",
    quantity: 1,
    designId: "",
    configuration: {
      source: "catalogue",
      mode: "exact",
      changedParts: [],
      components: {},
      addonIds: [],
      extraInitialized: false,
    },
    measurements: {
      unit: "in",
      method: "assistance",
      values: {},
      notes: "",
      reconfirmFields: [],
    },
    referenceMediaIds: [],
    customer: { name: "", phone: "" },
    address: { line1: "", line2: "", city: "", state: "", pin: "" },
    logistics: {
      inbound: { method: "dropoff" },
      outbound: { method: "collect" },
    },
    ...clone(initial),
  };
  // Earlier MongoDB records may have omitted empty nested objects. Restore defaults,
  // while retaining every entered value rather than replacing whole sections.
  draft.configuration = {
    source: "catalogue",
    mode: "exact",
    changedParts: [],
    addonIds: [],
    ...draft.configuration,
    components: { ...draft.configuration?.components },
  };
  const previousConfig = initial.configuration || {};
  if (!Array.isArray(previousConfig.changedParts)) {
    draft.configuration.changedParts =
      previousConfig.source === "reference"
        ? ["sleeve", "neck", "back"]
        : Object.keys(previousConfig.components || {}).filter((kind) =>
            PARTS.includes(kind),
          );
  }
  // Old drafts selected additions on the garment page. Retain those choices in
  // the separate additions step; new drafts distinguish a parked empty choice.
  if (typeof previousConfig.extraInitialized !== "boolean") {
    draft.configuration.extraInitialized = Boolean(
      previousConfig.addonIds?.length,
    );
    if (previousConfig.addonIds?.length)
      draft.configuration.changedParts = [
        ...new Set([...draft.configuration.changedParts, "extra"]),
      ];
  }
  draft.measurements = {
    unit: "in",
    method: "assistance",
    notes: "",
    reconfirmFields: [],
    ...draft.measurements,
    values: { ...draft.measurements?.values },
  };
  draft.measurements.takenBy ||= draft.measurements.method === "assistance" ? "assistance" : "self";
  draft.customer = { name: "", phone: "", ...draft.customer };
  draft.address = {
    line1: "",
    line2: "",
    city: "",
    state: "",
    pin: "",
    ...draft.address,
  };
  draft.logistics = {
    inbound: { method: "dropoff", ...draft.logistics?.inbound },
    outbound: { method: "collect", ...draft.logistics?.outbound },
  };
  return draft;
}

/** Explicit allowlist: private references/notes never enter persistent browser storage. */
function ordinaryData(draft) {
  const configuration = draft.configuration || {};
  return {
    id: draft.id,
    submissionKey: draft.submissionKey,
    createdAt: draft.createdAt,
    garment: draft.garment,
    quantity: draft.quantity,
    designId: draft.designId,
    configuration: {
      source: configuration.source,
      mode: configuration.mode,
      changedParts: configuration.changedParts || [],
      addonIds: configuration.addonIds || [],
      extraInitialized: Boolean(configuration.extraInitialized),
      components: Object.fromEntries(
        Object.entries(configuration.components || {}).map(([part, value]) => [
          part,
          {
            source: value.source,
            ...(value.optionId ? { optionId: value.optionId } : {}),
          },
        ]),
      ),
    },
    step: draft.step,
  };
}

export function saveDraft(draft, options = {}) {
  if (!safeId(draft?.id)) return { ok: false, reason: "invalid" };
  const now = options.now ?? Date.now();
  try {
    const local = storageFor(options, "localStorage");
    const session = storageFor(options, "sessionStorage");
    const key = PREFIX + draft.id;
    const previous = JSON.parse(local.getItem(key) || "null");
    const expected = options.expectedRevision ?? draft.localRevision ?? 0;
    if (
      previous &&
      previous.expiresAt > now &&
      previous.revision !== expected
    ) {
      return { ok: false, reason: "conflict", revision: previous.revision };
    }
    const revision = (previous?.revision || 0) + 1;
    const record = {
      revision,
      savedAt: now,
      expiresAt: now + DRAFT_RETENTION_MS,
      data: ordinaryData(draft),
    };
    // Write the complete private version to session storage first. Never fall back to public persistence.
    session.setItem(key, JSON.stringify({ revision, data: clone(draft) }));
    local.setItem(key, JSON.stringify(record));
    return { ok: true, revision, savedAt: now };
  } catch (error) {
    return { ok: false, reason: "storage", message: error.message };
  }
}

export function loadDraft(id, options = {}) {
  if (!safeId(id)) return null;
  try {
    const local = storageFor(options, "localStorage");
    const session = storageFor(options, "sessionStorage");
    const key = PREFIX + id;
    const record = JSON.parse(local.getItem(key) || "null");
    if (!record) return null;
    if (record.expiresAt <= (options.now ?? Date.now())) {
      local.removeItem(key);
      session.removeItem(key);
      return null;
    }
    const privateRecord = JSON.parse(session.getItem(key) || "null");
    // A newer edit in another tab must not be overwritten by this tab's older session copy.
    const recovered =
      privateRecord?.revision === record.revision
        ? privateRecord.data
        : record.data;
    const draft = createDraft(recovered, { id, now: record.savedAt });
    draft.id = id;
    draft.localRevision = record.revision;
    draft.savedAt = record.savedAt;
    if (privateRecord?.revision !== record.revision) {
      draft.sensitiveDataUnavailable = true;
      // Mark reference components incomplete rather than suggesting the image survived.
      for (const value of Object.values(draft.configuration.components || {})) {
        if (value.source === "reference") value.needsReference = true;
      }
    }
    return draft;
  } catch {
    return null;
  }
}

export function listLocalDrafts(options = {}) {
  try {
    const local = storageFor(options, "localStorage");
    const drafts = [];
    for (let index = 0; index < local.length; index += 1) {
      const key = local.key(index);
      if (key?.startsWith(PREFIX)) {
        const record = JSON.parse(local.getItem(key));
        if (record.expiresAt > (options.now ?? Date.now()))
          drafts.push({
            ...record.data,
            savedAt: record.savedAt,
            localRevision: record.revision,
          });
      }
    }
    return drafts.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export function removeDraft(id, options = {}) {
  if (!safeId(id)) return false;
  try {
    storageFor(options, "localStorage").removeItem(PREFIX + id);
    storageFor(options, "sessionStorage").removeItem(PREFIX + id);
    return true;
  } catch {
    return false;
  }
}

/** Exact catalogue copies skip all component steps; reference components are independent. */
export function deriveComponentSteps(configuration = {}) {
  if (configuration.source === "catalogue" && configuration.mode === "exact")
    return [];
  if (
    configuration.source === "reference" &&
    !Array.isArray(configuration.changedParts)
  )
    return ["sleeve", "neck", "back"];
  return PARTS.filter((part) =>
    (configuration.changedParts || []).includes(part),
  );
}

export function resolveMeasurementFields(
  garment,
  configuration = {},
  options = [],
) {
  const fields = new Set(BASE_FIELDS[garment] || []);
  const sleeve = configuration.components?.sleeve;
  const selected = options.find(
    (option) => String(option._id || option.id) === String(sleeve?.optionId),
  );
  const length = options.find(
    (option) =>
      String(option._id || option.id) ===
      String(configuration.components?.sleeveLength?.optionId),
  );
  const sleeveless =
    length?.lengthStyle === "sleeveless" ||
    (!length &&
      selected &&
      /sleeveless|no sleeves/i.test(
        `${selected.name || ""} ${selected.code || ""} ${selected.value || ""}`,
      ));
  if (!sleeveless && sleeve?.source !== "reference") fields.add("sleeveLength");
  for (const [kind, component] of Object.entries(
    configuration.components || {},
  )) {
    if (sleeveless && kind === "sleeve") continue;
    const option = options.find(
      (item) => String(item._id || item.id) === String(component.optionId),
    );
    for (const field of option?.measurementFields || [])
      fields.add(typeof field === "string" ? field : field.key);
  }
  return [...fields].filter(
    (field) =>
      Boolean(field) &&
      !(
        sleeveless &&
        ["sleeveLength", "armhole", "sleeveOpening"].includes(field)
      ),
  );
}

export function convertMeasurements(values, from, to) {
  if (from === to) return { ...values };
  const factor =
    from === "in" && to === "cm"
      ? 2.54
      : from === "cm" && to === "in"
        ? 1 / 2.54
        : null;
  if (factor === null) throw new Error("Unsupported measurement unit");
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value === "" ||
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
        ? value
        : Math.round(Number(value) * factor * 100) / 100,
    ]),
  );
}

export function requestReturnTo(id, step = "review") {
  if (!safeId(id)) return "/request";
  const allowed = [
    "design",
    "components",
    "measurements",
    "logistics",
    "review",
    ...PARTS.map((part) => `component-${part}`),
  ];
  return `/request?draft=${encodeURIComponent(id)}&step=${allowed.includes(step) ? step : "review"}`;
}

export function sensitiveDraftKeys() {
  return [...SENSITIVE];
}
export function clearPrivateDrafts(options = {}) {
  try {
    const session = storageFor(options, "sessionStorage");
    const keys = [];
    for (let i = 0; i < session.length; i++) {
      const key = session.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) session.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
