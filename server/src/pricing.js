import { z } from "zod";
import { GARMENTS, objectId } from "./domain.js";
import { configurationInput, logisticsInput } from "./workflow-input.js";
import { fail, requireFound } from "./errors.js";
import { requestHash } from "./domain.js";
import { assertOrderServiceEnabled } from "./routes-services.js";

export const estimateInput = z
  .object({
    garment: z.enum(GARMENTS),
    quantity: z.number().int().min(1).max(10),
    designId: objectId.optional(),
    configuration: configurationInput.optional(),
    logistics: logisticsInput.optional(),
  })
  .strict();
export const PRICING_VERSION = "2026-11-production-review-v4";
const componentNames = {
  sleeve: "Sleeve design",
  sleeveLength: "Sleeve length",
  neck: "Front neck design",
  back: "Back neck design",
  fit: "Fit",
};
const sleeveMeasurements = new Set(["sleeveLength", "sleeveOpening", "armhole"]);
export { isPublishedOptionRecord as isPublishedOption } from "./option-maintenance.js";
import { isPublishedOptionRecord as isPublishedOption } from "./option-maintenance.js";
export const isSupportedAddon = (option) => (option.serviceType || "stitching") === "stitching";
export function submittedConfiguration(configuration, estimate) {
  if (!configuration) return undefined;
  return {
    ...configuration,
    components: configuration.mode === "exact" ? {} : Object.fromEntries(
      Object.entries(configuration.components || {}).filter(([kind]) => !estimate.components[kind]?.suppressed),
    ),
    addonIds: (estimate.addons || []).map((addon) => addon.optionId),
  };
}
const snapshotFields = (option) => ({
  code: option.code || "",
  imageMediaIds: [...new Set([option.imageMediaId, ...(option.imageMediaIds || [])].filter(Boolean).map(String))],
  name: option.name,
  nameHi: option.nameHi || "",
  revision: option.revision || 0,
  sleeveStyle: option.sleeveStyle || "other",
  lengthStyle: option.lengthStyle,
  measurementFields: option.measurementFields || [],
  compatibleLengthStyles: option.compatibleLengthStyles || [],
  incompatibleOptionIds: (option.incompatibleOptionIds || []).map(String),
  sleevePricingMode: option.sleevePricingMode || "separate",
  combinedLengthPrices: option.combinedLengthPrices || [],
  materialCoverage: option.materialCoverage || "labor_only",
  materialNotes: option.materialNotes || "",
  serviceType: option.serviceType || "stitching",
});
// Legacy or incomplete service-area records never become a zero transport quote.
export function matchingServiceArea(serviceAreas, pin) {
  if (!Array.isArray(serviceAreas) || typeof pin !== "string" || !/^[1-9]\d{5}$/.test(pin)) return null;
  let best = null;
  let specificity = 0;
  for (const area of serviceAreas) {
    if (!area?.enabled || !Array.isArray(area.pinPrefixes)) continue;
    const score = Math.max(0, ...area.pinPrefixes.filter(prefix =>
      typeof prefix === "string" && /^[1-9]\d{0,5}$/.test(prefix) && pin.startsWith(prefix),
    ).map(prefix => prefix.length));
    if (score > specificity) { best = area; specificity = score; }
  }
  return best;
}
export function calculateEstimate(
  input,
  { design = null, options = [], settings = {} } = {},
) {
  const lineItems = [],
    pendingItems = [],
    components = {},
    addons = [],
    quantity = input.quantity;
  const add = (code, label, unitAmountPaise, scope = "garment", extra = {}) => {
    if (!Number.isSafeInteger(unitAmountPaise) || unitAmountPaise < 0)
      return pendingItems.push({
        code,
        label,
        reason: "This charge will be confirmed after tailor review.",
      });
    const units = scope === "garment" ? quantity : 1;
    lineItems.push({
      code,
      label,
      unitAmountPaise,
      quantity: units,
      scope,
      amountPaise: unitAmountPaise * units,
      ...extra,
    });
  };
  const pending = (code, label, reason, details = {}) =>
    pendingItems.push({ code, label, reason, ...details });
  const byId = new Map(options.map((option) => [String(option._id), option]));
  const config = input.configuration;
  if (config?.source === "catalogue" && !design)
    fail(400, "DESIGN_REQUIRED", "Choose a published catalogue design.");
  if (design && design.garment !== input.garment)
    fail(
      400,
      "INCOMPATIBLE_DESIGN",
      "This design does not match your garment.",
    );
  const base =
    design?.startingPricePaise ?? settings.garmentBasePrices?.[input.garment];
  const uploadedDesign = config?.source === "reference";
  if (uploadedDesign)
    pending(
      "stitching",
      "Custom design stitching",
      "Your uploaded design will be reviewed before we confirm stitching and customization prices.",
    );
  else if (base === undefined)
    pending(
      "stitching",
      "Base stitching",
      "Stitching price after tailor review.",
    );
  else add("stitching", `Base stitching · ${design?.title || input.garment}`, base);
  if (input.garment === "alteration")
    pending(
      "alteration:assessment",
      "Garment assessment",
      "Alteration work and the final price are confirmed after we review the garment.",
    );
  const usedOptions = new Set();
  const includedAddons = new Set((config?.source === "catalogue" ? design?.includedAddonIds || [] : []).map(String));
  const chargeOption = (kind, id, isAddon = false, included = false) => {
    const option = byId.get(String(id));
    if (
      !option ||
      (!included && !isPublishedOption(option)) ||
      !option.garments?.includes(input.garment) ||
      option.kind !== (isAddon ? "extra" : kind) ||
      (isAddon && !isSupportedAddon(option))
    )
      fail(
        409,
        "OPTION_UNAVAILABLE",
        "A selected option changed or is unavailable. Review your selections.",
      );
    const snapshot = {
      source: included ? "original" : "option",
      optionId: String(option._id),
      ...snapshotFields(option),
      ...(included ? { included: true } : {}),
    };
    usedOptions.add(String(option._id));
    if (!isAddon) components[kind] = snapshot;
    else addons.push(snapshot);
    const label = isAddon ? option.name : `${componentNames[kind]} adjustment · ${option.name}`;
    const details = isAddon ? { materialCoverage: snapshot.materialCoverage, materialNotes: snapshot.materialNotes } : {};
    if (uploadedDesign && kind !== "sleeveLength") {
      pending(
        `${kind}:${id}`,
        label,
        "The selected detail will be priced after we review your uploaded design.",
      );
      return;
    }
    if (kind === "sleeveLength")
      add(`${kind}:${id}`, "Sleeve length — no additional charge", 0, "garment", { included: true });
    else if (included || option.priceMode === "included")
      add(`${kind}:${id}`, label, 0, "garment", { included: true, ...details });
    else if (option.priceMode === "additional")
      add(`${kind}:${id}`, label, option.amountPaise, "garment", details);
    else if (option.priceMode === "replacement")
      add(
        `${kind}:${id}`,
        label,
        option.replacementAdjustmentPaise,
        "garment", details,
      );
    else
      pending(
        `${kind}:${id}`,
        label,
        "Pending tailor review; this option has no configured charge.",
      );
  };
  const original = (kind) => {
    const id = design?.defaultComponents?.[kind],
      option = id ? byId.get(String(id)) : null;
    if (
      option &&
      option.garments?.includes(input.garment) &&
      option.kind === kind
    ) {
      components[kind] = {
        source: "original",
        optionId: String(id),
        ...snapshotFields(option),
        included: true,
      };
      usedOptions.add(String(id));
      add(`${kind}:included`, `${componentNames[kind]} · ${option.name} · included`, 0, "garment", {
        included: true,
      });
    } else if (!["fit", "sleeveLength"].includes(kind)) {
      components[kind] = {
        source: "original",
        name:
          design?.designDetails?.[kind] ||
          "Original design details awaiting confirmation",
        nameHi: design?.designDetails?.[`${kind}Hi`] || "",
        needsReview: true,
      };
      pending(
        `${kind}:original`,
        componentNames[kind],
        "We will confirm the original design details and any additional work before stitching.",
      );
    }
  };
  if (config) {
    const applicableKinds = input.garment === "alteration" ? ["fit"] : ["sleeveLength", "sleeve", "neck", "back", "fit"];
    if (input.garment === "alteration" && config.mode !== "exact" &&
        Object.entries(config.components).some(([kind, choice]) => !applicableKinds.includes(kind) && choice?.source !== "original"))
      fail(409, "INAPPLICABLE_CUSTOMIZATION", "These design customizations are not available for an alteration request.");
    for (const kind of applicableKinds) {
      if (kind === "sleeve" && components.sleeveLength?.lengthStyle === "sleeveless") {
        components.sleeve = { source: "original", name: "Sleeveless", suppressed: true, sleeveStyle: "sleeveless", measurementFields: [] };
        continue;
      }
      const chosen = config.components[kind];
      if (
        config.source === "catalogue" &&
        (config.mode === "exact" ||
          !chosen ||
          chosen.source === "original" ||
          (chosen.source === "option" &&
            String(chosen.optionId) ===
              String(design?.defaultComponents?.[kind])))
      )
        original(kind);
      else if (chosen?.source === "option") chargeOption(kind, chosen.optionId);
      else if (["reference", "help"].includes(chosen?.source)) {
        components[kind] = {
          source: chosen.source,
          ...(chosen.referenceMediaId ? { referenceMediaId: chosen.referenceMediaId } : {}),
          notes: chosen.notes || "",
        };
        pending(
          `${kind}:${chosen.source}`,
          componentNames[kind],
          "Price after tailor review. Feasibility and visible details must be confirmed.",
        );
      } else if (!["fit", "sleeveLength"].includes(kind))
        pending(
          `${kind}:unspecified`,
          componentNames[kind],
          "Choose this part or request tailor guidance.",
        );
    }
    const selectedAddons = config.source === "catalogue" && config.mode === "exact"
      ? [...includedAddons] : config.addonsChanged === false
        ? config.source === "catalogue" ? [...includedAddons] : []
        : config.addonIds;
    for (const id of selectedAddons) chargeOption("extra", id, true, includedAddons.has(String(id)));

    const sleeve = components.sleeve, length = components.sleeveLength;
    const changedPair = sleeve?.source === "option" || length?.source === "option";
    if (length?.lengthStyle && length.lengthStyle !== "sleeveless" && sleeve?.optionId && changedPair) {
      if (!sleeve.compatibleLengthStyles.length)
        pending("sleeve:compatibility", "Sleeve design and length", "Price after tailor review. Compatibility for this sleeve design and length has not been configured.");
      else if (!sleeve.compatibleLengthStyles.includes(length.lengthStyle))
        fail(409, "INCOMPATIBLE_SLEEVE_LENGTH", `${sleeve.name} is not configured for ${length.name}. Choose a compatible sleeve design or length; your other choices have been kept.`);
    }
    const selected = [...Object.values(components), ...addons].filter((item) => item.optionId);
    if (config.mode !== "exact")
      for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
        const left = selected[i], right = selected[j];
        if (left.source !== "option" && right.source !== "option") continue;
        if (left.incompatibleOptionIds.includes(right.optionId) || right.incompatibleOptionIds.includes(left.optionId))
          fail(409, "INCOMPATIBLE_OPTIONS", `${left.name} and ${right.name} are not compatible. Choose another option or ask the master tailor; neither neckline has been changed automatically.`);
      }
  } else
    pending(
      "legacy-configuration",
      "Design details",
      "Design preferences and customization charges await tailor review.",
    );
  for (const direction of ["inbound", "outbound"]) {
    const transport = input.logistics?.[direction];
    if (!transport) {
      pending(
        `transport:${direction}`,
        `${direction} transport`,
        "Choose how you will send and receive your garment.",
      );
      continue;
    }
    if (transport.method !== "business") {
      add(
        `transport:${direction}`,
        transport.method === "customer_courier"
          ? `${direction}: customer pays their courier directly`
          : `${direction}: ${transport.method}`,
        0,
        "shipment",
        { direction, method: transport.method },
      );
      continue;
    }
    const pin = transport.address?.pin;
    const area = matchingServiceArea(settings.serviceAreas, pin);
    const rate = area?.[`${direction}Paise`];
    if (!area || rate === null || rate === undefined)
      pending(
        `transport:${direction}`,
        `${direction} transport`,
        "Pickup or delivery charges will be confirmed for your PIN code after review.",
        { direction, method: "business", postalCode: pin || "" },
      );
    else
      add(
        `transport:${direction}`,
        `${direction} transport · ${area.name}`,
        rate,
        "shipment",
        { direction, method: "business", postalCode: pin, serviceAreaName: area.name, serviceAreaNameHi: area.nameHi || "" },
      );
  }
  const knownSubtotalPaise = lineItems.reduce(
    (total, item) => total + item.amountPaise,
    0,
  );
  const explicitLengthStyle = components.sleeveLength?.lengthStyle;
  const isSleeveless = explicitLengthStyle
    ? explicitLengthStyle === "sleeveless"
    : components.sleeve?.sleeveStyle === "sleeveless";
  const measurementFields = [
    ...new Set(
      [...Object.values(components).flatMap((c) => c.measurementFields || []),
        ...(explicitLengthStyle && !isSleeveless ? ["sleeveLength"] : [])],
    ),
  ].filter(
    (key) =>
      !sleeveMeasurements.has(key) || !isSleeveless,
  );
  return {
    currency: "INR",
    pricingVersion: PRICING_VERSION,
    configurationVersion: requestHash({
      pricingVersion: PRICING_VERSION,
      design: design
        ? {
            id: String(design._id),
            revision: design.revision || 0,
            base,
            defaults: design.defaultComponents || {},
            includedAddonIds: design.includedAddonIds || [],
          }
        : null,
      options: options.filter((o) => usedOptions.has(String(o._id))).map((o) => ({
        id: String(o._id),
        revision: o.revision || 0,
      })),
      settingsRevision: settings.revision || 0,
    }),
    lineItems,
    pendingItems,
    knownSubtotalPaise,
    knownGarmentSubtotalPaise: lineItems.filter(line => line.scope === "garment").reduce((total, line) => total + line.amountPaise, 0),
    knownTransportSubtotalPaise: lineItems.filter(line => line.scope === "shipment").reduce((total, line) => total + line.amountPaise, 0),
    uploadedDesignReviewRequired: uploadedDesign,
    estimatedTotalPaise: pendingItems.length ? null : knownSubtotalPaise,
    hasPending: pendingItems.length > 0,
    components,
    addons,
    measurementFields,
    label: pendingItems.length ? "Known subtotal" : "Estimated total",
    finalQuoteRequired: true,
  };
}
export async function loadEstimate(ctx, input, session = null) {
  await assertOrderServiceEnabled(ctx, input.garment, session);
  const design = input.designId
    ? requireFound(
        await ctx.models.Design.findOne({
          _id: input.designId,
          status: "published",
          garment: input.garment,
        })
          .session(session)
          .lean(),
        "The selected design is unavailable.",
      )
    : null;
  const ids = [
    ...Object.values(design?.defaultComponents || {}),
    ...(design?.includedAddonIds || []),
    ...Object.values(input.configuration?.components || {}).map(
      (c) => c.optionId,
    ),
    ...(input.configuration?.addonIds || []),
  ].filter(Boolean);
  const [options, settings] = await Promise.all([
    ctx.models.DesignOption.find({ _id: { $in: ids } })
      .session(session)
      .lean(),
    ctx.models.SiteSettings.findOne({ key: "main" }).session(session).lean(),
  ]);
  return calculateEstimate(input, {
    design,
    options,
    settings: settings || {},
  });
}
export function pricingRoutes(app, ctx) {
  app.post("/api/pricing/estimate", async (req, res) => {
    const body = estimateInput.parse(req.body);
    // This public endpoint returns configured costs only; it never dereferences private reference IDs.
    res
      .set("Cache-Control", "no-store")
      .json({ data: await loadEstimate(ctx, body) });
  });
}
