import { labelToken, localize, t } from "../i18n/core";

const componentCopy = {
  sleeve: ["Sleeve design", "Sleeve design adjustment"],
  sleeveLength: ["Sleeve length", "Sleeve length — no additional charge"],
  neck: ["Front neck design", "Front neck design adjustment"],
  back: ["Back neck design", "Back neck design adjustment"],
  fit: ["Fit", "Fit adjustment"],
};

// Presentation only: codes, money, quote versions and accepted snapshots stay intact.
// Unknown/custom quote lines remain exactly as authored rather than being translated.
export function estimateLineLabel(line, estimate = {}, design = {}) {
  if (!line || typeof line !== "object") return typeof line === "string" ? line : "";
  const code = String(line.code || ""), [kind, identity] = code.split(":");
  const original = typeof line.label === "string" ? line.label : "";
  if (kind === "stitching") {
    let title = localize(design, "title") || original.split(" · ").slice(1).join(" · ");
    if (["kurti", "suit", "blouse", "alteration"].includes(title)) title = labelToken(title);
    return [t("Base stitching"), title].filter(Boolean).join(" · ");
  }
  if (kind === "sleeveLength") return t("Sleeve length — no additional charge");
  if (componentCopy[kind]) {
    const component = estimate.components?.[kind];
    const name = component?.name ? localize(component, "name") : original.split(" · ").slice(1).filter(value => value !== "included").join(" · ");
    if (identity === "included" && name) return t("{0} · {1} · included", { 0: t(componentCopy[kind][0]), 1: name });
    return [t(name ? componentCopy[kind][1] : componentCopy[kind][0]), name].filter(Boolean).join(" · ");
  }
  if (kind === "extra") {
    const addon = estimate.addons?.find(item => String(item.optionId) === identity);
    return addon ? localize(addon, "name") : original;
  }
  if (kind === "transport" && ["inbound", "outbound"].includes(identity)) {
    const title = t(identity === "inbound" ? "Inbound fabric transport" : "Outbound outfit transport");
    const area = original.split(" · ").slice(1).join(" · ");
    const method = original.includes("customer pays their courier directly") ? t("Your chosen courier")
      : original === "inbound: dropoff" ? t("Drop off your fabric")
        : original === "outbound: collect" ? t("Collect your finished outfit") : area;
    return [title, method].filter(Boolean).join(" · ");
  }
  if (code === "legacy-configuration") return t("Design details");
  return original;
}
