import { t } from "../i18n/core";

const lengthStyles = new Set([
  "sleeveless",
  "short",
  "elbow",
  "three_quarter",
  "full",
  "custom",
]);
const idOf = (option) =>
  String(option?._id || option?.id || option?.optionId || "");
const available = (option) =>
  option &&
  option.active !== false &&
  option.published !== false &&
  !option.archived &&
  (option.status == null || option.status === "published");

function effectiveOption(kind, configuration, design, options, snapshots) {
  const selected = configuration.components?.[kind];
  const followsOriginal =
    configuration.source === "catalogue" &&
    (configuration.mode === "exact" ||
      !selected ||
      selected.source === "original");
  const optionId = followsOriginal
    ? design?.defaultComponents?.[kind]
    : selected?.source === "option"
      ? selected.optionId
      : null;
  if (optionId) {
    return (
      options.find((option) => idOf(option) === String(optionId)) ||
      (idOf(snapshots[kind]) === String(optionId) ? snapshots[kind] : null)
    );
  }
  return followsOriginal && snapshots[kind]?.source === "original"
    ? snapshots[kind]
    : null;
}

/** Resolve only the effective selection; a stale estimate cannot restore a
 * previous length while a newer option/reference/help choice is pending. */
export function effectiveLengthStyle(
  configuration = {},
  design,
  knownOptions = [],
  estimateComponents = {},
) {
  const length = effectiveOption(
    "sleeveLength",
    configuration,
    design,
    knownOptions,
    estimateComponents,
  );
  if (lengthStyles.has(length?.lengthStyle)) return length.lengthStyle;
  const selected = configuration.components?.sleeveLength;
  if (
    selected &&
    !(configuration.source === "catalogue" && configuration.mode === "exact")
  )
    return null;
  // Legacy configurations represented some lengths on the sleeve record. Keep
  // them readable until an explicit separate length is selected.
  const sleeve = effectiveOption(
    "sleeve",
    configuration,
    design,
    knownOptions,
    estimateComponents,
  );
  return lengthStyles.has(sleeve?.sleeveStyle) ? sleeve.sleeveStyle : null;
}

export function optionCompatibility(
  option,
  { lengthStyle, oppositeOptionId, oppositeOption } = {},
) {
  if (!available(option))
    return {
      compatible: false,
      reason: t("This design is not currently published or available."),
    };
  if (option.kind === "sleeve" && lengthStyle === "sleeveless")
    return {
      compatible: false,
      reason: t(
        "A sleeve design is not used with Sleeveless. Your previous sleeve choice is kept for switching back.",
      ),
    };
  if (
    option.kind === "sleeve" &&
    lengthStyle &&
    !option.compatibleLengthStyles?.includes(lengthStyle)
  )
    return {
      compatible: false,
      reason: t(
        "This sleeve design is not configured for the selected sleeve length. Choose another combination or ask a master tailor.",
      ),
    };
  if (["neck", "back"].includes(option.kind)) {
    const oppositeId = oppositeOptionId || idOf(oppositeOption);
    if (
      oppositeId &&
      (option.incompatibleOptionIds?.some(
        (id) => String(id) === String(oppositeId),
      ) ||
        oppositeOption?.incompatibleOptionIds?.some(
          (id) => String(id) === idOf(option),
        ))
    )
      return {
        compatible: false,
        reason: t(
          "These front and back neck designs cannot be combined. Choose another design or ask a master tailor.",
        ),
      };
  }
  return { compatible: true, reason: "" };
}

export function isEnabledAddon(option, garment) {
  return Boolean(
    available(option) &&
    option.kind === "extra" &&
    (option.serviceType || "stitching") === "stitching" &&
    (!garment || !option.garments?.length || option.garments.includes(garment)),
  );
}

export function extraMaterialLabel(option = {}) {
  const label =
    option.materialCoverage === "labor_and_materials"
      ? t("Includes stitching labor and the materials listed by the atelier.")
      : option.materialCoverage === "review" ||
          (option.materialCoverage && option.materialCoverage !== "labor_only")
        ? t("Labor and materials coverage after tailor review.")
        : t("Stitching labor only; materials are not supplied.");
  return option.materialNotes?.trim()
    ? `${label} ${option.materialNotes.trim()}`
    : label;
}
