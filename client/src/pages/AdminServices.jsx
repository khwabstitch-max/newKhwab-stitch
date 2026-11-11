import { useState } from "react";
import { api, readable } from "../lib/api";
import { useResource } from "../lib/hooks";
import { t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import {
  Badge,
  Button,
  ErrorMessage,
  Field,
  Notice,
  PageHeading,
} from "../components/ui";
import { ResourceState } from "./Account";
import { ListPager } from "../components/ListPager";
const base = {
  code: "",
  name: "",
  serviceType: "stitching",
  active: false,
  audiences: ["women"],
  itemTypes: ["kurti"],
  componentKinds: [],
  measurementFields: [],
  workflowStages: [],
  workerSkills: [],
  materials: "customer",
  materialInstructions: "",
  revision: 0,
};
export function AdminServices() {
  useLanguage();
  const [page, setPage] = useState(1),
    resource = useResource(`/admin/services?limit=30&page=${page}`),
    [editing, setEditing] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const patch = (key, value) => setEditing((d) => ({ ...d, [key]: value }));
  return (
    <>
      <PageHeading
        title={t("Services, with room to grow.")}
        action={
          <button className="button" onClick={() => setEditing({ ...base })}>
            {t("Configure a service")}
          </button>
        }
      />
      <Notice>
        {t(
          "Current ordering supports customer-fabric stitching and alterations. Embroidery, painting, knitting and additional crafts can be planned here; they remain unavailable until an appropriate order flow has been implemented and tested.",
        )}
      </Notice>
      <ErrorMessage message={error} />
      {editing && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { _id, createdAt, updatedAt, ...body } = editing;
              void _id;
              void createdAt;
              void updatedAt;
              await api(`/admin/services/${body.code}`, {
                method: "PATCH",
                body,
              });
              setEditing(null);
              resource.reload();
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <Field
              label={t("Service code")}
              name="service-code"
              required
              pattern="[a-z][a-z0-9_]{0,49}"
              disabled={Boolean(editing._id)}
              value={editing.code}
              onChange={(e) => patch("code", e.target.value)}
            />
            <Field
              label={t("Display name")}
              name="service-name"
              required
              maxLength={120}
              value={editing.name}
              onChange={(e) => patch("name", e.target.value)}
            />
            <Field label={t("Service type")} name="service-type">
              <select
                id="service-type"
                value={editing.serviceType}
                onChange={(e) => patch("serviceType", e.target.value)}
              >
                {[
                  "stitching",
                  "alteration",
                  "embroidery",
                  "painting",
                  "knitting",
                  "other",
                ].map((v) => (
                  <option key={v} value={v}>
                    {readable(v)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Materials arrangement")} name="service-materials">
              <select
                id="service-materials"
                value={editing.materials}
                onChange={(e) => patch("materials", e.target.value)}
              >
                <option value="customer">
                  {t("Customer supplies material")}
                </option>
                <option value="business">
                  {t("Business supplies material")}
                </option>
                <option value="review">
                  {t("Discuss material arrangement")}
                </option>
              </select>
            </Field>
            {[
              ["audiences", "Audience categories"],
              ["itemTypes", "Garment / item categories"],
              ["componentKinds", "Design component groups"],
              ["workerSkills", "Worker skills"],
            ].map(([key, label]) => (
              <Field
                key={key}
                label={t(`${label} (comma separated)`)}
                name={`service-${key}`}
                required={["audiences", "itemTypes"].includes(key)}
                value={editing[key].join(",")}
                onChange={(e) =>
                  patch(
                    key,
                    e.target.value.split(",").map((v) => v.trim()),
                  )
                }
              />
            ))}
          </div>
          <Field
            label={t("Material instructions")}
            name="material-instructions"
          >
            <textarea
              id="material-instructions"
              maxLength={1000}
              value={editing.materialInstructions}
              onChange={(e) => patch("materialInstructions", e.target.value)}
            />
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              disabled={
                !["stitching", "alteration"].includes(editing.serviceType)
              }
              checked={editing.active}
              onChange={(e) => patch("active", e.target.checked)}
            />
            {t("Activate this supported service")}
          </label>
          <p className="small-print">
            {t(
              "Inactive services have no public order button. Measurement and stage templates for future services require an appropriate tested adapter before activation.",
            )}
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              {t("Cancel")}
            </button>
            <Button className="button" busy={busy}>
              {t("Save service definition")}
            </Button>
          </div>
        </form>
      )}
      <ResourceState
        resource={resource}
        empty="No service overrides yet. Current stitching and alterations use the existing defaults."
      >
        {resource.data?.map((s) => (
          <article className="panel" key={s._id}>
            <h3>{s.name}</h3>
            <Badge>{s.active ? t("Active") : t("Unavailable")}</Badge>
            <p>
              {s.audiences.join(", ")} · {s.itemTypes.join(", ")}
            </p>
            <p>{s.materialInstructions}</p>
            <button
              className="button secondary small"
              onClick={() => setEditing({ ...base, ...s })}
            >
              {t("Edit service")}
            </button>
          </article>
        ))}
      </ResourceState>
      <ListPager
        label="Service pagination"
        resource={resource}
        page={page}
        onChange={setPage}
      />
    </>
  );
}
