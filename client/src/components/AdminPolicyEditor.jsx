import { t } from "../i18n/core";
import { adminCopy } from "../i18n/admin-experience";
import { BilingualFields } from "./AdminHomepageEditor";
import { Field } from "./ui";

export function AdminPolicyEditor({ value, onChange }) {
  if (!value) return <button type="button" className="button secondary" onClick={() => onChange({
    version: "service-v1",
    assurance: adminCopy["admin.policy.defaultAssurance"].en,
    assuranceHi: adminCopy["admin.policy.defaultAssurance"].hi,
    alterationMargin: adminCopy["admin.policy.defaultMargin"].en,
    alterationMarginHi: adminCopy["admin.policy.defaultMargin"].hi,
    correctionTransport: adminCopy["admin.policy.defaultTransport"].en,
    correctionTransportHi: adminCopy["admin.policy.defaultTransport"].hi,
  })}>{t("Configure assurance policy")}</button>;
  return <fieldset><legend>{t("admin.policy.title")}</legend>
    <BilingualFields prefix="policy" value={value} onChange={onChange} fields={[["assurance", "admin.policy.assurance", true, 2500], ["alterationMargin", "admin.policy.margin", true, 1500], ["correctionTransport", "admin.policy.transport", true, 1500]]} />
    <details className="admin-advanced"><summary>{t("admin.nav.advanced")}</summary><Field name="policy-version" label={t("admin.policy.reference")} required maxLength={50} value={value.version || ""} onChange={event => onChange({ ...value, version: event.target.value })} /></details>
  </fieldset>;
}
