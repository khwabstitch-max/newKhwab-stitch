import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, RefreshCw } from "lucide-react";
import { useLanguage } from "../i18n/Language";
import { t, localize } from "../i18n/core";
import { api } from "../lib/api";
import { usePagedCollection } from "../lib/usePagedCollection";
import { ErrorMessage, Field } from "./ui";
import { DesignImage, DesignPresentation } from "./DesignGallery";
import template from "../data/teal-kurti.json";
const fields = [
  ["neck", "Neck design"],
  ["sleeve", "Sleeve design"],
  ["back", "Back design"],
  ["style", "Garment style"],
  ["fabric", "Fabric shown"],
  ["fabricRequirement", "Fabric required"],
  ["turnaround", "Delivery estimate"],
];
export function DesignEditorExtras({ editing, setEditing, busy }) {
  useLanguage();
  const optionResource = usePagedCollection("/admin/options?limit=30");
  const componentOptions = optionResource.data;
  const available = (option) =>
    option.active &&
    (!option.status || option.status === "published") &&
    (!option.garments?.length || option.garments.includes(editing.garment));
  const cache = useRef({
    board: { url: template.boardAsset, width: 1536, height: 1024 },
  });
  const [images, setImages] = useState(cache.current),
    [version, setVersion] = useState(0);
  const key = editing.mediaIds.join(",");
  useEffect(() => {
    let active = true;
    for (const id of key.split(",").filter(Boolean)) {
      if (cache.current[id]) continue;
      api(`/media/${id}/access`)
        .then((result) => {
          if (active) {
            cache.current = { ...cache.current, [id]: result.data };
            setImages(cache.current);
          }
        })
        .catch(() => {
          if (active) {
            cache.current = { ...cache.current, [id]: { unavailable: true } };
            setImages(cache.current);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [key, version]);
  function patch(key, value) {
    setEditing((d) => ({ ...d, [key]: value }));
  }
  function detail(key, value) {
    setEditing((d) => ({
      ...d,
      designDetails: { ...d.designDetails, [key]: value },
    }));
  }
  function rate(index, key, value) {
    setEditing((d) => ({
      ...d,
      priceOptions: (d.priceOptions || []).map((row, i) =>
        i === index
          ? {
              ...row,
              [key]: value,
              ...(key === "amount"
                ? { amountPaise: Math.round(Number(value) * 100) }
                : {}),
            }
          : row,
      ),
    }));
  }
  function view(index, key, value) {
    setEditing((d) => ({
      ...d,
      imageViews: (d.imageViews || []).map((row, i) =>
        i === index ? { ...row, [key]: value } : row,
      ),
    }));
  }
  function reorder(index, delta) {
    setEditing((d) => {
      const rows = [...d.imageViews];
      [rows[index], rows[index + delta]] = [rows[index + delta], rows[index]];
      return { ...d, imageViews: rows };
    });
  }
  const views = (editing.imageViews || []).map((view) => ({
    ...images[view.mediaId],
    ...view,
    id: view.mediaId,
  }));
  const preview = {
    ...editing,
    views,
    coverImageUrl: images[editing.coverMediaId]?.url,
    images: editing.mediaIds.map((id) => ({ ...images[id], id })),
    startingPricePaise: editing.priceOptions?.length
      ? Math.min(...editing.priceOptions.map((row) => row.amountPaise))
      : editing.startingPricePaise,
  };
  return (
    <div className="design-editor-extras">
      <section>
        <h3>{t("Design details")}</h3>
        <fieldset>
          <legend>{t("Included catalogue components")}</legend>
          <p className="small-print">
            {t(
              "Map the original components in this complete design. Leave unconfirmed legacy details for review; do not guess. Included parts are not charged again.",
            )}
          </p>
          <div className="form-grid">
            {[
              ["sleeve", "Sleeve Design"],
              ["sleeveLength", "Sleeve Length"],
              ["neck", "Front Neck Design"],
              ["back", "Back Neck Design"],
              ["fit", "Fit"],
            ].map(([kind, label]) => {
              const choices = componentOptions.filter(
                (option) => available(option) && option.kind === kind,
              );
              const selected = editing.defaultComponents?.[kind];
              return (
                <Field key={kind} label={t(label)} name={`default-${kind}`}>
                  <select
                    id={`default-${kind}`}
                    disabled={busy}
                    value={editing.defaultComponents?.[kind] || ""}
                    onChange={(e) => {
                      const next = { ...editing.defaultComponents };
                      if (e.target.value) next[kind] = e.target.value;
                      else delete next[kind];
                      patch("defaultComponents", next);
                    }}
                  >
                    <option value="">{t("Details pending review")}</option>
                    {selected &&
                      !choices.some((option) => option._id === selected) && (
                        <option value={selected}>
                          {localize(
                            componentOptions.find(
                              (option) => option._id === selected,
                            ),
                            "name",
                          ) ||
                            `${t("Saved component not yet loaded")} · ${String(selected).slice(-8)}`}
                        </option>
                      )}
                    {choices.map((o) => (
                      <option key={o._id} value={o._id}>
                        {localize(o, "name")}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })}
          </div>
          <fieldset>
            <legend>{t("Included catalogue add-ons")}</legend>
            <p className="small-print">
              {t(
                "Select finishing details already covered by this catalogue price. They are shown as included and are not charged again.",
              )}
            </p>
            {componentOptions
              .filter(
                (option) =>
                  available(option) &&
                  option.kind === "extra" &&
                  (!option.serviceType || option.serviceType === "stitching"),
              )
              .map((option) => (
                <label className="checkbox" key={option._id}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={(editing.includedAddonIds || []).includes(
                      option._id,
                    )}
                    onChange={(e) =>
                      patch(
                        "includedAddonIds",
                        e.target.checked
                          ? [...(editing.includedAddonIds || []), option._id]
                          : (editing.includedAddonIds || []).filter(
                              (id) => id !== option._id,
                            ),
                      )
                    }
                  />
                  {localize(option, "name")}
                </label>
              ))}
            {(editing.includedAddonIds || [])
              .filter(
                (id) =>
                  !componentOptions.some(
                    (option) =>
                      option._id === id &&
                      available(option) &&
                      option.kind === "extra" &&
                      (!option.serviceType ||
                        option.serviceType === "stitching"),
                  ),
              )
              .map((id) => (
                <label className="checkbox" key={id}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked
                    onChange={() =>
                      patch(
                        "includedAddonIds",
                        editing.includedAddonIds.filter(
                          (value) => value !== id,
                        ),
                      )
                    }
                  />
                  {t("Saved add-on unavailable or not yet loaded")} ·{" "}
                  {String(id).slice(-8)}
                </label>
              ))}
          </fieldset>
          <ErrorMessage
            message={optionResource.error}
            retry={optionResource.reload}
          />
          {optionResource.hasMore && (
            <button
              type="button"
              className="button secondary small"
              disabled={optionResource.loading}
              onClick={optionResource.loadMore}
            >
              {t("Load more component choices")}
            </button>
          )}
        </fieldset>
        <p className="small-print">
          {t(
            "Describe the actual design. Leave information blank until you have confirmed it.",
          )}
        </p>
        <div className="form-grid">
          {fields.map(([key, label]) => (
            <div className="bilingual-pair" key={key}>
              <Field
                label={t(label)}
                name={`detail-${key}`}
                maxLength="300"
                value={editing.designDetails?.[key] || ""}
                onChange={(event) => detail(key, event.target.value)}
              />
              <Field
                label={t("Hindi version (optional)")}
                name={`detail-${key}-hi`}
                lang="hi"
                maxLength="300"
                value={editing.designDetails?.[key + "Hi"] || ""}
                onChange={(event) => detail(key + "Hi", event.target.value)}
              />
            </div>
          ))}
        </div>
        <Field label={t("Booking and fabric notes")} name="serviceNotes">
          <textarea
            id="serviceNotes"
            rows="4"
            maxLength="1500"
            value={editing.serviceNotes || ""}
            onChange={(event) => patch("serviceNotes", event.target.value)}
          />
        </Field>
        <Field
          label={t("Hindi booking notes (optional)")}
          name="serviceNotesHi"
        >
          <textarea
            id="serviceNotesHi"
            lang="hi"
            rows="4"
            maxLength="1500"
            value={editing.serviceNotesHi || ""}
            onChange={(event) => patch("serviceNotesHi", event.target.value)}
          />
        </Field>
      </section>
      <section>
        <h3>{t("Stitching price options")}</h3>
        <p className="small-print">
          {t(
            "Prices are for stitching only. The lowest option becomes the catalogue starting price.",
          )}
        </p>
        {(editing.priceOptions || []).map((row, index) => (
          <fieldset className="rate-editor" key={index}>
            <legend>{t("Price option {0}", { 0: index + 1 })}</legend>
            <div className="form-grid">
              <Field
                label={t("Service label")}
                name={`rate-label-${index}`}
                required
                minLength="2"
                maxLength="100"
                value={row.label}
                onChange={(event) => rate(index, "label", event.target.value)}
              />
              <Field
                label={t("Hindi service label (optional)")}
                name={`rate-label-hi-${index}`}
                lang="hi"
                maxLength="100"
                value={row.labelHi || ""}
                onChange={(event) => rate(index, "labelHi", event.target.value)}
              />
              <Field
                label={t("Stitching price (INR)")}
                name={`rate-amount-${index}`}
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                required
                value={row.amount ?? String(row.amountPaise / 100)}
                onChange={(event) => rate(index, "amount", event.target.value)}
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={row.isStartingPrice}
                  onChange={(event) =>
                    rate(index, "isStartingPrice", event.target.checked)
                  }
                />
                {t("Show + for a starting rate")}
              </label>
            </div>
            <button
              type="button"
              className="text-button danger"
              onClick={() =>
                patch(
                  "priceOptions",
                  editing.priceOptions.filter((_, i) => i !== index),
                )
              }
             data-admin-mutates>
              <Trash2 size={14} />
              {t("Remove price option")}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button secondary small"
          disabled={(editing.priceOptions || []).length >= 6}
          onClick={() =>
            patch("priceOptions", [
              ...(editing.priceOptions || []),
              {
                label: "",
                labelHi: "",
                amount: "",
                amountPaise: 0,
                isStartingPrice: false,
              },
            ])
          }
         data-admin-mutates>
          <Plus size={15} />
          {t("Add price option")}
        </button>
      </section>
      <section>
        <div className="section-heading">
          <h3>{t("Labelled image previews")}</h3>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              cache.current = {
                board: { url: template.boardAsset, width: 1536, height: 1024 },
              };
              setImages(cache.current);
              setVersion((value) => value + 1);
            }}
          >
            <RefreshCw size={14} />
            {t("Refresh previews")}
          </button>
        </div>
        <p className="small-print">
          {t(
            "Attach photos above, then label views or crop a single board into separate previews. Crop values are percentages of the original image.",
          )}
        </p>
        <div className="editor-preview-actions">
          <button
            type="button"
            className="button secondary small"
            disabled={!editing.mediaIds.length || busy || views.length >= 16}
            onClick={() =>
              patch("imageViews", [
                ...(editing.imageViews || []),
                {
                  mediaId: editing.coverMediaId || editing.mediaIds[0],
                  label: "New preview",
                  labelHi: "",
                  crop: null,
                },
              ])
            }
           data-admin-mutates>
            <Plus size={15} />
            {t("Add preview")}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={!editing.mediaIds.length || busy}
            onClick={() => {
              if (
                editing.imageViews?.length &&
                !window.confirm(
                  t("Replace the current previews with this board layout?"),
                )
              )
                return;
              const id = editing.coverMediaId || editing.mediaIds[0];
              patch(
                "imageViews",
                template.design.imageViews.map((view) => ({
                  ...view,
                  mediaId: id,
                })),
              );
            }}
           data-admin-mutates>
            {t("Use teal board preview layout")}
          </button>
        </div>
        <div className="preview-editor-grid">
          {views.map((row, index) => (
            <fieldset className="preview-editor" key={index}>
              <legend>{t("Preview {0}", { 0: index + 1 })}</legend>
              <div className="editor-photo">
                <DesignImage image={row} alt={t(row.label)} />
              </div>
              <Field label={t("Source image")} name={`view-image-${index}`}>
                <select
                  id={`view-image-${index}`}
                  value={row.mediaId}
                  onChange={(event) =>
                    view(index, "mediaId", event.target.value)
                  }
                >
                  {editing.mediaIds.map((id, i) => (
                    <option value={id} key={id}>
                      {t("Image {0}", { 0: i + 1 })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("Preview label")}
                name={`view-label-${index}`}
                required
                minLength="2"
                maxLength="80"
                value={row.label}
                onChange={(event) => view(index, "label", event.target.value)}
              />
              <Field
                label={t("Hindi preview label (optional)")}
                name={`view-label-hi-${index}`}
                lang="hi"
                maxLength="80"
                value={row.labelHi || ""}
                onChange={(event) => view(index, "labelHi", event.target.value)}
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!row.crop}
                  onChange={(event) =>
                    view(
                      index,
                      "crop",
                      event.target.checked
                        ? null
                        : { x: 0, y: 0, width: 100, height: 100 },
                    )
                  }
                />
                {t("Use full image")}
              </label>
              {row.crop && (
                <div className="crop-grid">
                  {[
                    ["x", "Left (%)", 0],
                    ["y", "Top (%)", 0],
                    ["width", "Width (%)", 5],
                    ["height", "Height (%)", 5],
                  ].map(([key, label, min]) => (
                    <Field
                      key={key}
                      label={t(label)}
                      name={`crop-${index}-${key}`}
                      type="number"
                      required
                      min={min}
                      max="100"
                      step="any"
                      value={row.crop[key]}
                      onChange={(event) =>
                        view(index, "crop", {
                          ...row.crop,
                          [key]: Number(event.target.value),
                        })
                      }
                    />
                  ))}
                </div>
              )}
              <div className="row-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setEditing((d) => ({
                      ...d,
                      coverMediaId: row.mediaId,
                      imageViews: [
                        d.imageViews[index],
                        ...d.imageViews.filter((_, i) => i !== index),
                      ],
                    }))
                  }
                 data-admin-discard>
                  {t("Use as cover preview")}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === 0}
                  aria-label={t("Move preview {0} up", { 0: index + 1 })}
                  onClick={() => reorder(index, -1)}
                 data-admin-mutates>
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === views.length - 1}
                  aria-label={t("Move preview {0} down", { 0: index + 1 })}
                  onClick={() => reorder(index, 1)}
                 data-admin-mutates>
                  <ArrowDown size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={t("Remove preview {0}", { 0: index + 1 })}
                  onClick={() =>
                    patch(
                      "imageViews",
                      editing.imageViews.filter((_, i) => i !== index),
                    )
                  }
                 data-admin-mutates>
                  <Trash2 size={15} />
                </button>
              </div>
            </fieldset>
          ))}
        </div>
      </section>
      <details className="customer-preview">
        <summary>{t("Live customer preview")}</summary>
        <p className="small-print">
          {t(
            "Switch English / Hindi to review both versions before publishing.",
          )}
        </p>
        <DesignPresentation design={preview} preview />
      </details>
    </div>
  );
}
