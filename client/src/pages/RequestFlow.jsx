import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, CornerDownRight } from "lucide-react";
import { api, money, readable } from "../lib/api";
import { uploadMedia } from "../lib/media";
import { estimateLineLabel } from "../lib/order-labels";
import { useAuth } from "../lib/auth";
import { useResource, useSite } from "../lib/hooks";
import { usePagedCollection } from "../lib/usePagedCollection";
import {
  createDraft,
  loadDraft,
  saveDraft,
  removeDraft,
  deriveComponentSteps,
  resolveMeasurementFields,
  convertMeasurements,
  requestReturnTo,
} from "../lib/drafts";
import { VisualOptions, optionPriceLabel } from "../components/VisualOptions";
import { SleeveLengthOptions } from "../components/SleeveLengthOptions";
import { MeasurementGuides } from "../components/MeasurementGuides";
import {
  effectiveLengthStyle,
  optionCompatibility,
  extraMaterialLabel,
  isEnabledAddon,
} from "../lib/customization";
import {
  Button,
  ErrorMessage,
  Field,
  Notice,
  PageHeading,
  Steps,
  UploadButton,
} from "../components/ui";
import { t, localize, contentTranslation } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import "./request.css";
const kinds = {
  sleeveLength: "Sleeve length",
  sleeve: "Sleeve design",
  neck: "Front neck design",
  back: "Back neck design",
  fit: "Fit",
  extra: "Extra add-ons",
};
const baseFields = {
  kurti: ["bust", "waist", "hip", "shoulder", "length"],
  suit: ["bust", "waist", "hip", "shoulder", "length"],
  blouse: ["bust", "underbust", "waist", "shoulder", "length"],
  alteration: [],
};
const emptyAddress = () => ({
  line1: "",
  line2: "",
  city: "",
  state: "",
  pin: "",
});
const cloudId = (value) => /^[a-f\d]{24}$/i.test(value || "");
const mergeOptions = (records) => {
  const byId = new Map();
  for (const record of records)
    byId.set(record._id, { ...byId.get(record._id), ...record });
  return [...byId.values()];
};
const cleanConfig = (c, sleeveless = false) => ({
  source: c.source,
  mode: c.mode,
  components: Object.fromEntries(
    Object.entries(c.mode === "exact" ? {} : c.components || {})
      .filter(
        ([kind]) =>
          kind !== "extra" &&
          !(sleeveless && kind === "sleeve") &&
          (!Array.isArray(c.changedParts) || c.changedParts.includes(kind)),
      )
      .map(([k, v]) => [
        k,
        {
          source:
            (v.source === "reference" && !v.referenceMediaId) ||
            (v.source === "option" && !v.optionId)
              ? "help"
              : v.source,
          ...(v.source === "option" && v.optionId
            ? { optionId: v.optionId }
            : {}),
          ...(v.source === "reference" && v.referenceMediaId
            ? { referenceMediaId: v.referenceMediaId }
            : {}),
          notes: v.notes || "",
        },
      ]),
  ),
  addonIds: c.mode === "exact" ? [] : c.addonIds || [],
  addonsChanged:
    c.mode !== "exact" && Boolean(c.changedParts?.includes("extra")),
});
const estimateBody = (d, sleeveless = false) => ({
  garment: d.garment,
  quantity: Number(d.quantity),
  ...(d.designId ? { designId: d.designId } : {}),
  configuration: cleanConfig(d.configuration, sleeveless),
  logistics: d.logistics,
});
function Price({ data, error, loading, retry, design }) {
  return (
    <section className="panel request-price">
      <p className="eyebrow">{t("YOUR STITCHING ESTIMATE")}</p>
      <h2>{data ? money(data.knownSubtotalPaise) : "—"}</h2>
      <p>{t(data?.hasPending ? "Known subtotal" : "Estimated total")}</p>
      {data?.hasPending && (
        <p className="pending-price">{t("Pending tailor review")}</p>
      )}
      {loading && <small role="status">{t("Updating estimate…")}</small>}
      <ErrorMessage message={error} retry={retry} />
      {data && (
        <details>
          <summary>{t("Price breakdown")}</summary>
          <dl className="review-list">
            {data.lineItems.map((line) => (
              <div key={line.code}>
                <dt>
                  {estimateLineLabel(line, data, design)}
                  <small>
                    {t(
                      line.scope === "shipment"
                        ? "Per shipment"
                        : "Per garment",
                    )}{" "}
                    × {line.quantity}
                  </small>
                  {line.materialCoverage && (
                    <small>{extraMaterialLabel(line)}</small>
                  )}
                </dt>
                <dd>
                  {line.included ? t("Included") : money(line.amountPaise)}
                </dd>
              </div>
            ))}
          </dl>
          {data.pendingItems.map((p) => (
            <p className="pending-price" key={p.code}>
              <strong>{estimateLineLabel(p, data, design)}</strong>
              <br />
              {t(p.reason)}
            </p>
          ))}
        </details>
      )}
      <small>
        {t(
          "Known charges are an estimate. Tailor review and your acceptance of the final quote are required before stitching.",
        )}
      </small>
    </section>
  );
}
function PolicyCopy({ policies, field, fallback }) {
  const content = contentTranslation(policies, field);
  if (!content.text) return fallback;
  return <><span lang={content.sourceLanguage}>{content.text}</span>{content.missingTranslation && <small className="content-language-note">{t("Policy text is shown in its original English because a Hindi translation has not been added. Ask our team if you need help.")}</small>}</>;
}
function Address({ leg, value, onChange }) {
  return (
    <div className="form-grid">
      {[
        ["line1", "Address line 1"],
        ["line2", "Address line 2 (optional)"],
        ["city", "City"],
        ["state", "State"],
        ["pin", "PIN code"],
      ].map(([k, label]) => (
        <Field
          key={k}
          label={t(label)}
          name={`${leg}-${k}`}
          required={k !== "line2"}
          minLength={k === "line1" ? 5 : undefined}
          maxLength={k === "pin" ? 6 : 200}
          pattern={k === "pin" ? "[1-9][0-9]{5}" : undefined}
          value={value[k] || ""}
          onChange={(e) => onChange({ ...value, [k]: e.target.value })}
        />
      ))}
    </div>
  );
}
function Reference({ id, index = 0, onRemove }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    api(`/media/${id}/access`, { signal: c.signal })
      .then(({ data }) => {
        if (!c.signal.aborted) setUrl(data.url);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e);
      });
    return () => c.abort();
  }, [id]);
  return (
    <div className="reference-preview">
      {url ? (
        <img
          src={url}
          alt={t("Private reference {0}", { 0: index + 1 })}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span>
          {t("Private reference")} {index + 1}
        </span>
      )}
      <ErrorMessage message={error} />
      {onRemove && (
        <button className="text-button danger" type="button" onClick={onRemove}>
          {t("Remove")}
        </button>
      )}
    </div>
  );
}
function Summary({ draft, design, estimate }) {
  return (
    <div className="compact-design-summary">
      <strong>
        {localize(design, "title") || t("Your uploaded reference")}
      </strong>
      <p>
        {t(
          draft.configuration.mode === "exact"
            ? "Same as shown"
            : "Customize this design",
        )}
      </p>
      {Object.entries(estimate?.components || {}).map(([k, c]) => (
        <small key={k}>
          {t(kinds[k] || k)}:{" "}
          {c.name ||
            t(
              c.source === "help"
                ? "Master-tailor guidance requested"
                : c.source === "reference"
                  ? "Follow my uploaded reference"
                  : "Catalogue detail pending review",
            )}
        </small>
      ))}
    </div>
  );
}
export function RequestWizard() {
  useLanguage();
  const auth = useAuth(),
    user = auth?.profile || auth?.user,
    site = useSite(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const requested = params.get("draft");
  const userId = user?._id;
  const routeStep = useRef(params.get("step"));
  routeStep.current = params.get("step");
  const [draft, setDraft] = useState(
    () =>
      loadDraft(requested) ||
      createDraft({
        garment: baseFields[params.get("garment")]
          ? params.get("garment")
          : "kurti",
        designId: params.get("design") || "",
        ...(params.get("source") === "reference" && !params.get("design")
          ? { configuration: { source: "reference", mode: "custom" } }
          : {}),
        customer: { name: user?.name || "", phone: user?.phone || "" },
      }),
  );
  const [step, setStep] = useState(
      params.get("step") || draft.step || "design",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [saved, setSaved] = useState(""),
    [restoring, setRestoring] = useState(cloudId(requested)),
    [conflict, setConflict] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [editing, setEditing] = useState(false),
    [estimate, setEstimate] = useState(null),
    [pricedKey, setPricedKey] = useState(""),
    [originalSnapshot, setOriginalSnapshot] = useState(null),
    [originalRefresh, setOriginalRefresh] = useState(0),
    [priceError, setPriceError] = useState(""),
    [priceBusy, setPriceBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [search, setSearch] = useState("");
  const current = useRef(draft);
  current.current = draft;
  const revision = useRef(draft.localRevision || 0),
    cloud = useRef(
      draft.cloudId
        ? { id: draft.cloudId, revision: draft.cloudRevision }
        : null,
    ),
    attempt = useRef(null),
    before = useRef(null),
    cloudBusy = useRef(false);
  const designs = usePagedCollection(
      `/designs?limit=12&garment=${draft.garment}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    ),
    options = usePagedCollection(
      step.startsWith("component-") && step !== "component-extra" &&
      !["reference", "help"].includes(draft.configuration.components[step.slice(10)]?.source) &&
      (draft.configuration.source === "catalogue" || draft.configuration.components[step.slice(10)]?.source === "option")
        ? `/options?limit=12&garment=${draft.garment}&kind=${step.slice(10)}`
        : null,
    ),
    additions = usePagedCollection(
      `/options?limit=12&garment=${draft.garment}&kind=extra`,
    ),
    services = useResource("/services?limit=50"),
    profiles = useResource(
      user ? `/measurements?garment=${draft.garment}&limit=50` : null,
    ),
    addressBook = useResource(user ? "/account/preferences" : null);
  const selectedDesign = useResource(
    draft.designId && !designs.data?.some((d) => d._id === draft.designId)
      ? `/designs/id/${draft.designId}`
      : null,
  );
  const config = draft.configuration,
    design =
      designs.data?.find((d) => d._id === draft.designId) ||
      (selectedDesign.data?._id === draft.designId
        ? selectedDesign.data
        : null);
  const originals =
    originalSnapshot?.designId === draft.designId &&
    originalSnapshot?.garment === draft.garment
      ? originalSnapshot
      : null;
  const knownOptions = mergeOptions([
    ...options.knownData,
    ...additions.knownData,
    ...[
      ...Object.entries(originals?.components || {}),
      ...Object.entries(estimate?.components || {}),
    ]
      .filter(([, record]) => record.optionId)
      .map(([kind, record]) => ({ ...record, _id: record.optionId, kind })),
  ]);
  const activeConfig = cleanConfig(config);
  const lengthStyle = effectiveLengthStyle(
    activeConfig,
    design,
    knownOptions,
    estimate?.components || {},
  );
  const sleeveless = lengthStyle === "sleeveless";
  const separateLength = Boolean(
    activeConfig.components.sleeveLength ||
    design?.defaultComponents?.sleeveLength,
  );
  const parts = deriveComponentSteps(config).filter(
    (kind) => !(kind === "sleeve" && sleeveless),
  );
  const steps = [
    "design",
    ...parts.map((kind) => `component-${kind}`),
    "measurements",
    "logistics",
    "review",
  ];
  const index = Math.max(0, steps.indexOf(step));
  function partId(kind) {
    const choice = activeConfig.components[kind];
    return config.source === "catalogue" &&
      (!choice || choice.source === "original")
      ? design?.defaultComponents?.[kind]
      : choice?.source === "option"
        ? choice.optionId
        : null;
  }
  function partRecord(kind) {
    return knownOptions.find((record) => record._id === partId(kind));
  }
  function compatibility(option) {
    const oppositeKind =
      option.kind === "neck" ? "back" : option.kind === "back" ? "neck" : null;
    const opposite =
      option.kind === "neck"
        ? partRecord("back")
        : option.kind === "back"
          ? partRecord("neck")
          : null;
    return optionCompatibility(option, {
      lengthStyle: separateLength ? lengthStyle : null,
      oppositeOptionId: oppositeKind ? partId(oppositeKind) : undefined,
      oppositeOption: opposite,
    });
  }
  const optionName = (id) =>
    localize(
      knownOptions.find((option) => option._id === id),
      "name",
    );
  const originalName = (kind) =>
    optionName(design?.defaultComponents?.[kind]) ||
    originals?.components?.[kind]?.name ||
    (estimate?.components?.[kind]?.source === "original" &&
    estimate.components[kind].optionId === design?.defaultComponents?.[kind]
      ? estimate.components[kind].name
      : "") ||
    design?.designDetails?.[kind];
  // Original defaults must remain available independently of the visible option
  // batches and of the customer's replacement estimate, including restored drafts.
  useEffect(() => {
    if (config.source !== "catalogue" || !draft.designId) return;
    const controller = new AbortController();
    const designId = draft.designId,
      garment = draft.garment;
    api("/pricing/estimate", {
      method: "POST",
      auth: false,
      signal: controller.signal,
      body: {
        garment,
        designId,
        quantity: 1,
        configuration: {
          source: "catalogue",
          mode: "exact",
          components: {},
          addonIds: [],
        },
      },
    })
      .then(({ data }) => {
        if (!controller.signal.aborted)
          setOriginalSnapshot({
            designId,
            garment,
            components: data.components || {},
            error: "",
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setOriginalSnapshot({ designId, garment, components: {}, error });
      });
    return () => controller.abort();
  }, [draft.designId, draft.garment, config.source, originalRefresh]);
  useEffect(() => {
    if (
      step !== "component-extra" ||
      config.extraInitialized ||
      (config.source === "catalogue" && !design)
    )
      return;
    setDraft((previous) => ({
      ...previous,
      configuration: {
        ...previous.configuration,
        addonIds: previous.configuration.addonIds?.length
          ? previous.configuration.addonIds
          : design?.includedAddonIds || [],
        extraInitialized: true,
      },
    }));
  }, [step, config.extraInitialized, config.source, design]);
  const label = (s) =>
    s.startsWith("component-")
      ? t(kinds[s.slice(10)])
      : t(
          {
            design: "Your garment",
            measurements: "Your fit",
            logistics: "Fabric and delivery",
            review: "Review",
          }[s] || s,
        );
  const persist = useCallback(() => {
    const value = saveDraft(
      { ...current.current, step },
      { expectedRevision: revision.current },
    );
    if (value.ok) {
      revision.current = value.revision;
      setSaved("Saved on this device");
      return true;
    }
    setSaved(
      value.reason === "conflict"
        ? "This draft changed in another tab. Reload or keep a separate copy."
        : "Save failed. Keep this page open and retry saving.",
    );
    return false;
  }, [step]);
  useEffect(() => {
    if (!requested) setParams({ draft: draft.id, step }, { replace: true });
  }, [requested, draft.id, step, setParams]);
  useEffect(() => {
    if (params.get("step")) setStep(params.get("step"));
  }, [params]);
  useEffect(() => {
    if (!cloudId(requested)) {
      setRestoring(false);
      return;
    }
    if (!userId) {
      setRestoring(false);
      return;
    }
    const c = new AbortController();
    setRestoring(true);
    api(`/drafts/${requested}`, { signal: c.signal })
      .then(({ data }) => {
        if (c.signal.aborted) return;
        if (data.status === "submitted") {
          navigate(`/orders/${data.orderId}`, { replace: true });
          return;
        }
        const recovered = createDraft(
          { ...data.data, cloudId: data._id, cloudRevision: data.revision },
          { id: data.clientId },
        );
        revision.current = loadDraft(recovered.id)?.localRevision || 0;
        cloud.current = { id: data._id, revision: data.revision };
        setDraft(recovered);
        setStep(routeStep.current || recovered.step || "review");
        setSaved("Saved to your account");
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setRestoring(false);
      });
    return () => c.abort();
  }, [requested, userId, navigate]);
  useEffect(() => {
    if (restoring) return;
    const timer = setTimeout(persist, 400);
    return () => clearTimeout(timer);
  }, [draft, step, restoring, persist]);
  useEffect(() => {
    const handler = (e) => {
      if (
        saved.startsWith("Save failed") ||
        saved.startsWith("This draft changed")
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saved]);
  const priceKey = JSON.stringify(estimateBody(draft, sleeveless));
  const hasCurrentEstimate = Boolean(estimate && pricedKey === priceKey);
  useEffect(() => {
    if (restoring || (config.source === "catalogue" && !draft.designId)) {
      setEstimate(null);
      setPriceBusy(false);
      return;
    }
    const c = new AbortController();
    setPriceBusy(true);
    setPriceError("");
    const timer = setTimeout(() => {
      api("/pricing/estimate", {
        method: "POST",
        auth: false,
        body: JSON.parse(priceKey),
        signal: c.signal,
      })
        .then(({ data }) => {
          if (
            !data ||
            !Array.isArray(data.lineItems) ||
            !Array.isArray(data.pendingItems) ||
            !Number.isSafeInteger(data.knownSubtotalPaise)
          )
            throw new Error(
              "The estimate could not be read. Please refresh it before submitting.",
            );
          if (!c.signal.aborted) {
            setEstimate(data);
            setPricedKey(priceKey);
            setPriceError("");
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) {
            setEstimate(null);
            setPriceError(e);
          }
        })
        .finally(() => {
          if (!c.signal.aborted) setPriceBusy(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [priceKey, refresh, restoring, config.source, draft.designId]);
  const patch = (values) => {
    setDraft((d) => ({ ...d, ...values }));
    setError("");
  };
  const nested = (key, values) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...values } }));
  const measurementContext = (garment, method) => {
    const previous = `${draft.garment}:${draft.measurements.method}`;
    const selections = { ...draft.measurements.guideSelections, [previous]: draft.measurements.guideIds || [] };
    return { guideSelections: selections, guideIds: selections[`${garment}:${method}`] || [] };
  };
  function go(value) {
    setStep(value);
    setParams({ draft: requested || draft.id, step: value });
    setError("");
    window.scrollTo?.({ top: 0, behavior: "auto" });
  }
  function selectPart(kind, value) {
    const affected = {
      sleeve: ["sleeveLength", "armhole", "sleeveOpening"],
      sleeveLength: ["sleeveLength", "armhole", "sleeveOpening"],
      neck: ["frontNeckDepth", "frontNeckWidth"],
      back: ["backNeckDepth", "backNeckWidth"],
      fit: ["bust", "waist", "hip"],
    }[kind];
    setDraft((d) => ({
      ...d,
      configuration: {
        ...d.configuration,
        components: { ...d.configuration.components, [kind]: value },
      },
      measurements: {
        ...d.measurements,
        reconfirmFields: [
          ...new Set([
            ...(d.measurements.reconfirmFields || []),
            ...(affected || []).filter(
              (k) => d.measurements.values[k] !== undefined,
            ),
          ]),
        ],
      },
    }));
  }
  function requestPart(kind, enabled = true) {
    setDraft((previous) => ({
      ...previous,
      configuration: {
        ...previous.configuration,
        changedParts: enabled
          ? [...new Set([...(previous.configuration.changedParts || []), kind])]
          : (previous.configuration.changedParts || []).filter(
              (part) => part !== kind,
            ),
        ...(kind === "extra" &&
        enabled &&
        !previous.configuration.extraInitialized
          ? {
              addonIds: previous.configuration.addonIds?.length
                ? previous.configuration.addonIds
                : design?.includedAddonIds || [],
              extraInitialized: true,
            }
          : {}),
      },
    }));
  }
  const effective = {
    ...activeConfig,
    components: {
      ...Object.fromEntries(
        Object.entries(design?.defaultComponents || {}).map(([k, id]) => [
          k,
          { source: "original", optionId: id },
        ]),
      ),
      ...activeConfig.components,
    },
  };
  const fields = [
    ...new Set([
      ...resolveMeasurementFields(draft.garment, effective, knownOptions),
      ...(estimate?.measurementFields || []),
    ]),
  ].filter(
    (k) =>
      !(["sleeveLength", "armhole", "sleeveOpening"].includes(k) && sleeveless),
  );
  function validate(section) {
    if (section === "design") {
      if (config.source === "catalogue" && !draft.designId)
        return "Choose a catalogue design or upload your reference.";
      if (config.source === "reference" && !draft.referenceMediaIds.length)
        return "Sign in and upload your private reference before continuing.";
    }
    if (section.startsWith("component-")) {
      const kind = section.slice(10);
      if (kind === "extra" || (kind === "sleeve" && sleeveless)) return "";
      const c = config.components[kind];
      if (!c && config.source === "catalogue") return "";
      if (
        !c ||
        (c.source === "option" && !c.optionId) ||
        (c.source === "reference" &&
          !draft.referenceMediaIds.includes(c.referenceMediaId))
      )
        return "Choose how this component should be made.";
      const selectedOption = c.source === "option" ? partRecord(kind) : null;
      if (selectedOption && !compatibility(selectedOption).compatible)
        return compatibility(selectedOption).reason;
    }
    if (section === "measurements") {
      if (["self","tailor"].includes(draft.measurements.takenBy) && draft.measurements.method === "assistance") return "Choose body or a well-fitting garment as the measurement method.";
      if (draft.garment === "alteration" && !draft.measurements.notes?.trim())
        return "Describe the alteration needed.";
      if (draft.measurements.method !== "assistance" && draft.measurements.takenBy !== "assistance") {
        if (
          [
            ...new Set([
              ...(baseFields[draft.garment] || []),
              ...(estimate?.measurementFields || []),
              ...(!sleeveless && lengthStyle ? ["sleeveLength"] : []),
            ]),
          ].some((k) => !(Number(draft.measurements.values[k]) > 0))
        )
          return "Complete the required measurements, or choose measurement assistance.";
        if (draft.measurements.reconfirmFields?.some((k) => fields.includes(k)))
          return "Reconfirm the measurements affected by your design change.";
      }
    }
    if (section === "logistics") {
      if (
        draft.customer.name?.length < 2 ||
        !/^(?:\+?91)?[6-9]\d{9}$/.test(
          (draft.customer.phone || "").replace(/[()\s-]/g, ""),
        )
      )
        return "Enter your name and a valid Indian mobile number.";
      for (const leg of ["inbound", "outbound"]) {
        const item = draft.logistics[leg],
          a = item.address;
        if (
          item.method === "business" &&
          (!a ||
            a.line1.length < 5 ||
            !a.city ||
            !a.state ||
            !/^[1-9]\d{5}$/.test(a.pin))
        )
          return `Complete the ${leg} address and PIN.`;
      }
    }
    return "";
  }
  async function saveCloud() {
    if (!persist()) return false;
    if (!user) {
      navigate(
        `/login?returnTo=${encodeURIComponent(requestReturnTo(draft.id, step))}`,
      );
      return false;
    }
    if (cloudBusy.current || conflict) return false;
    cloudBusy.current = true;
    setSaved("Saving…");
    try {
      const value = { ...current.current, step },
        payload = {
          data: value,
          title:
            design?.title || `${readable(draft.garment)} stitching request`,
        };
      const { data } = await api(
        cloud.current ? `/drafts/${cloud.current.id}` : "/drafts",
        {
          method: cloud.current ? "PATCH" : "POST",
          body: cloud.current
            ? { ...payload, revision: cloud.current.revision }
            : { ...payload, clientId: value.id },
        },
      );
      if (
        !cloud.current &&
        JSON.stringify(data.data) !== JSON.stringify(value)
      ) {
        cloud.current = { id: data._id, revision: data.revision };
        setConflict(true);
        return false;
      }
      cloud.current = { id: data._id, revision: data.revision };
      setSaved("Saved to your account");
      setDraft((d) => ({
        ...d,
        cloudId: data._id,
        cloudRevision: data.revision,
      }));
      return true;
    } catch (e) {
      setError(e);
      setSaved("Save failed. Your entries remain here.");
      if (e.status === 409) setConflict(true);
      return false;
    } finally {
      cloudBusy.current = false;
    }
  }
  function edit(value) {
    before.current = structuredClone(draft);
    setEditing(true);
    if (value.startsWith("component-")) requestPart(value.slice(10));
    go(value);
  }
  function next(e) {
    e.preventDefault();
    const message = validate(step);
    if (message) {
      setError(message);
      return;
    }
    if (editing) {
      setEditing(false);
      before.current = null;
      go("review");
    } else go(steps[index + 1] || "review");
  }
  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { data } = await uploadMedia(file, "reference");
      patch({ referenceMediaIds: [...draft.referenceMediaIds, data._id] });
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!user) {
      if (!persist()) {
        setError(
          "Your draft could not be preserved. Keep this page open and retry saving before signing in.",
        );
        return;
      }
      navigate(
        `/login?returnTo=${encodeURIComponent(requestReturnTo(draft.id, "review"))}`,
      );
      return;
    }
    if (!attempt.current) {
      if (!draft.fabricAcknowledged) {
        setError("Acknowledge the service terms before submitting.");
        return;
      }
      for (const s of steps.filter((v) => v !== "review")) {
        const message = validate(s);
        if (message) {
          go(s);
          setError(message);
          return;
        }
      }
      if (!hasCurrentEstimate || priceBusy || priceError) {
        setError("Review a current estimate before submitting.");
        return;
      }
      if (!(await saveCloud())) return;
      attempt.current = {
        garment: draft.garment,
        quantity: Number(draft.quantity),
        ...(draft.designId ? { designId: draft.designId } : {}),
        configuration: cleanConfig(config, sleeveless),
        logistics: draft.logistics,
        preferences: {
          neck: "",
          sleeve: "",
          back: "",
          fit: "",
          length: "",
          extraWork: "",
        },
        measurements: {
          unit: draft.measurements.unit,
          method: draft.measurements.method,
          takenBy: draft.measurements.takenBy,
          notes: draft.measurements.notes || "",
          guideIds: draft.measurements.guideIds || [],
          reconfirmFields: (draft.measurements.reconfirmFields || []).filter(
            (field) => fields.includes(field),
          ),
          values: Object.fromEntries(
            Object.entries(draft.measurements.values)
              .filter(
                ([k, v]) => fields.includes(k) && v !== "" && v !== undefined,
              )
              .map(([k, v]) => [k, Number(v)]),
          ),
        },
        customer: draft.customer,
        referenceMediaIds: draft.referenceMediaIds,
        notes: draft.notes || "",
        fabricDetails: draft.fabricDetails || "",
        ...(draft.preferredDate ? { preferredDate: draft.preferredDate } : {}),
        fabricAcknowledged: true,
        policyVersion: site.policies?.version || "service-v1",
        estimateVersion: estimate.configurationVersion,
        draftId: cloud.current.id,
        draftRevision: cloud.current.revision,
      };
    }
    setBusy(true);
    try {
      const { data } = await api("/orders", {
        method: "POST",
        body: attempt.current,
        headers: { "Idempotency-Key": draft.submissionKey },
      });
      removeDraft(draft.id);
      navigate(`/orders/${data._id}`, {
        replace: true,
        state: { submitted: true },
      });
    } catch (e) {
      setError(e);
      if (!e.status || e.status >= 500) setUncertain(true);
      else {
        attempt.current = null;
        setUncertain(false);
        patch({ submissionKey: crypto.randomUUID() });
        if (e.status === 409) setRefresh((v) => v + 1);
      }
    } finally {
      setBusy(false);
    }
  }
  if (cloudId(requested) && !user)
    return (
      <div className="container page narrow">
        <PageHeading title={t("Your saved request is private.")} />
        <Link
          className="button"
          to={`/login?returnTo=${encodeURIComponent(requestReturnTo(requested, step))}`}
        >
          {t("Sign in to resume")}
        </Link>
      </div>
    );
  if (restoring)
    return (
      <div className="container page">
        <p role="status">{t("Restoring your saved request…")}</p>
      </div>
    );
  const garments = Array.isArray(services.data)
    ? [...new Set(services.data.flatMap((s) => s.itemTypes))]
    : Object.keys(baseFields);
  const priceProps = {
    data: hasCurrentEstimate ? estimate : null,
    error: priceError,
    loading: priceBusy,
    retry: () => setRefresh((v) => v + 1),
  };
  return (
    <div
      className={`container page wizard-page ${step === "review" ? "review-step" : ""}`}
    >
      <PageHeading title={t("Let's create something made for you.")}>
        {t(
          "Choose a design, share your preferences and add your measurements. Our master tailor can help at any step.",
        )}
      </PageHeading>
      <div className="wizard-progress-shell">
        <Steps current={index} labels={steps.map(label)} />
        <div className="draft-toolbar">
          <div className="wizard-toolbar-meta">
            <span className="wizard-active-link">
              <ArrowDown size={14} aria-hidden="true" />
              <span>
                {t("Step {0} of {1}", { 0: index + 1, 1: steps.length })}
              </span>
              <span className="wizard-active-sep" aria-hidden="true">
                ·
              </span>
              <strong>{label(step)}</strong>
            </span>
            <span className="wizard-draft-status" role="status">
              {t(saved || "Your choices stay with this draft.")}
            </span>
          </div>
          <div className="wizard-draft-actions">
            <button
              type="button"
              className="button secondary small wizard-draft-save"
              disabled={busy}
              onClick={saveCloud}
            >
              {t("Save draft")}
            </button>
            <Link
              className="text-link wizard-tailor-help"
              onClick={(e) => {
                if (!persist()) e.preventDefault();
              }}
              to={`/account/support?draft=${cloud.current?.id || draft.id}&step=${step}`}
            >
              {t("Need Help from a Master Tailor?")}
            </Link>
          </div>
        </div>
      </div>
      {draft.sensitiveDataUnavailable && (
        <Notice>
          {t(
            "Design choices were recovered from this device. Personal details and private reference associations need to be entered again, or restore your account draft.",
          )}
        </Notice>
      )}
      {conflict && (
        <Notice>
          {t("A saved version has changed. Your current entries remain here.")}
          <button
            className="text-button"
            onClick={() => {
              setConflict(false);
              navigate(`/request?draft=${cloud.current.id}&step=review`);
            }}
          >
            {t("Load saved version")}
          </button>
          <button
            className="text-button"
            onClick={() => {
              const copy = createDraft({
                ...draft,
                cloudId: undefined,
                cloudRevision: undefined,
              });
              copy.id = crypto.randomUUID();
              copy.submissionKey = crypto.randomUUID();
              cloud.current = null;
              revision.current = 0;
              setDraft(copy);
              setConflict(false);
              setParams({ draft: copy.id, step });
            }}
          >
            {t("Keep a separate draft")}
          </button>
        </Notice>
      )}
      <div className="wizard-grid">
        <form
          className="panel wizard-form"
          onSubmit={step === "review" ? submit : next}
        >
          <div className="wizard-section-link">
            <CornerDownRight size={14} aria-hidden="true" />
            <span>
              {t("Step {0} of {1}", { 0: index + 1, 1: steps.length })}
            </span>
            <strong>{label(step)}</strong>
          </div>
          <h2>{label(step)}</h2>
          <ErrorMessage message={error} />
          <fieldset className="request-fields" disabled={busy || uncertain}>
            {step === "design" && (
              <>
                <div className="garment-choices">
                  {garments.map((g) => (
                    <label
                      key={g}
                      className={`choice ${g === draft.garment ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="garment"
                        checked={g === draft.garment}
                        onChange={() =>
                          patch({
                            garment: g,
                            designId: "",
                            measurements: {
                              ...draft.measurements,
                              ...measurementContext(g, draft.measurements.method),
                              reconfirmFields: Object.keys(
                                draft.measurements.values,
                              ),
                            },
                          })
                        }
                      />
                      {readable(g)}
                    </label>
                  ))}
                </div>
                <Field
                  label={t("Quantity")}
                  name="quantity"
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={draft.quantity}
                  onChange={(e) => patch({ quantity: e.target.value })}
                />
                <fieldset>
                  <legend>{t("Where does your design begin?")}</legend>
                  {[
                    ["catalogue", "Choose a Khwab Stitch design"],
                    ["reference", "Upload my own reference"],
                  ].map(([value, text]) => (
                    <label key={value} className="checkbox">
                      <input
                        type="radio"
                        name="design-source"
                        checked={config.source === value}
                        onChange={() =>
                          patch({
                            designId:
                              value === "reference" ? "" : draft.designId,
                            configuration: {
                              ...config,
                              source: value,
                              mode: value === "catalogue" ? "exact" : "custom",
                              changedParts:
                                value === "reference"
                                  ? ["sleeve", "neck", "back"]
                                  : [],
                              components: {},
                              addonIds: [],
                              extraInitialized: false,
                            },
                          })
                        }
                      />
                      {t(text)}
                    </label>
                  ))}
                </fieldset>
                {config.source === "catalogue" ? (
                  <>
                    <Field
                      label={t("Find a design")}
                      name="find-design"
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <ErrorMessage
                      message={designs.error}
                      retry={designs.reload}
                    />
                    <div className="request-designs">
                      {designs.data
                        .filter((d) => d.garment === draft.garment)
                        .map((d) => (
                          <label
                            className={`request-design ${draft.designId === d._id ? "selected" : ""}`}
                            key={d._id}
                          >
                            <input
                              type="radio"
                              name="designId"
                              checked={d._id === draft.designId}
                              onChange={() =>
                                patch({
                                  designId: d._id,
                                  configuration: {
                                    ...config,
                                    mode: "exact",
                                    changedParts: [],
                                    components: {},
                                    addonIds: [],
                                    extraInitialized: false,
                                  },
                                  measurements: {
                                    ...draft.measurements,
                                    reconfirmFields: Object.keys(
                                      draft.measurements.values,
                                    ),
                                  },
                                })
                              }
                            />
                            {d.coverImageUrl ? (
                              <img
                                src={d.coverImageUrl}
                                alt={localize(d, "title")}
                                loading="lazy"
                              />
                            ) : (
                              <span className="photo-fallback">
                                {t("Design photo not yet available")}
                              </span>
                            )}
                            <strong>{localize(d, "title")}</strong>
                            <small>
                              {d.code} · {money(d.startingPricePaise)}
                            </small>
                            {draft.designId === d._id && (
                              <span>✓ {t("Selected")}</span>
                            )}
                          </label>
                        ))}
                    </div>
                    {designs.loading && (
                      <p role="status">{t("Loading designs…")}</p>
                    )}
                    {!designs.loading &&
                      !designs.error &&
                      designs.data.length === 0 && (
                        <p role="status">{t("No catalogue designs found.")}</p>
                      )}
                    {designs.hasMore && (
                      <button
                        className="button secondary"
                        type="button"
                        disabled={designs.loading || Boolean(designs.error)}
                        onClick={designs.loadMore}
                      >
                        {t("Load more catalogue designs")}
                      </button>
                    )}
                    {design &&
                      !designs.data.some((item) => item._id === design._id) && (
                        <p>
                          {t("Selected design")}:{" "}
                          <strong>{localize(design, "title")}</strong>
                        </p>
                      )}
                    {design && (
                      <>
                        <fieldset>
                          <legend>
                            {t("How would you like your outfit?")}
                          </legend>
                          {[
                            ["exact", "Same as shown"],
                            ["custom", "Customize this design"],
                          ].map(([value, text]) => (
                            <label className="checkbox" key={value}>
                              <input
                                type="radio"
                                name="design-mode"
                                checked={config.mode === value}
                                onChange={() =>
                                  nested("configuration", { mode: value })
                                }
                              />
                              {t(text)}
                            </label>
                          ))}
                        </fieldset>
                        <dl className="review-list">
                          {Object.entries(kinds)
                            .filter(([kind]) => kind !== "extra")
                            .map(([k, name]) => (
                              <div key={k}>
                                <dt>{t(name)}</dt>
                                <dd>
                                  {originalName(k) ||
                                    t("Catalogue detail pending tailor review")}
                                </dd>
                              </div>
                            ))}
                        </dl>
                        <ErrorMessage
                          message={originals?.error}
                          retry={() => setOriginalRefresh((value) => value + 1)}
                        />
                        <p>
                          {t(
                            config.mode === "exact"
                              ? "Your catalogue design is preserved. Continue directly to measurements."
                              : "Only your selected parts have customization steps. Unchanged components stay as shown.",
                          )}
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Notice>
                      {t(
                        "Our tailor will review your reference and contact you to confirm feasibility, stitching charges, and the final quote before work begins.",
                      )}
                    </Notice>
                    {user ? (
                      <UploadButton
                        label={
                          uploading
                            ? t("Uploading securely…")
                            : t("Choose a reference image")
                        }
                        disabled={
                          uploading || draft.referenceMediaIds.length >= 5
                        }
                        onChange={upload}
                      />
                    ) : (
                      <>
                        <p>
                          {t(
                            "Sign in before a private upload. Choose your file after returning; a local file selection cannot survive a full-page sign-in.",
                          )}
                        </p>
                        <Link
                          className="button secondary"
                          onClick={(e) => {
                            if (!persist()) e.preventDefault();
                          }}
                          to={`/login?returnTo=${encodeURIComponent(requestReturnTo(draft.id, "design"))}`}
                        >
                          {t("Sign in for private uploads")}
                        </Link>
                      </>
                    )}
                    <div className="reference-previews">
                      {draft.referenceMediaIds.map((id, i) => (
                        <Reference
                          key={id}
                          id={id}
                          index={i}
                          onRemove={() =>
                            patch({
                              referenceMediaIds: draft.referenceMediaIds.filter(
                                (v) => v !== id,
                              ),
                            })
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
                <Notice>
                  {t(
                    "Catalogue images are stitching references, not ready-made garments. You provide the fabric.",
                  )}
                </Notice>
                {config.mode === "custom" &&
                  (design || config.source === "reference") && (
                    <fieldset>
                      <legend>
                        {t("Which parts would you like to change?")}
                      </legend>
                      {Object.entries(kinds).map(([kind, name]) => (
                        <label className="checkbox" key={kind}>
                          <input
                            type="checkbox"
                            checked={(config.changedParts || []).includes(kind)}
                            onChange={(event) =>
                              requestPart(kind, event.target.checked)
                            }
                          />
                          {t(name)}
                        </label>
                      ))}
                    </fieldset>
                  )}
              </>
            )}
            {step === "component-extra" && (
              <>
                <h3>{t("Optional additions")}</h3>
                {config.addonIds?.length > 0 && (
                  <ul aria-label={t("Selected finishing details")}>
                    {config.addonIds.map((id, index) => {
                      const option =
                        knownOptions.find((record) => record._id === id) ||
                        estimate?.addons?.find(
                          (record) => record.optionId === id,
                        );
                      const name =
                        localize(option, "name") ||
                        t("Saved addition {0}", { 0: index + 1 });
                      return (
                        <li key={id}>
                          {name}{" "}
                          <button
                            className="text-button"
                            type="button"
                            aria-label={`${t("Remove")} ${name}`}
                            onClick={() =>
                              nested("configuration", {
                                addonIds: config.addonIds.filter(
                                  (value) => value !== id,
                                ),
                                extraInitialized: true,
                              })
                            }
                          >
                            {t("Remove")}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {config.source === "catalogue" && design && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      nested("configuration", {
                        addonIds: design.includedAddonIds || [],
                        extraInitialized: true,
                      })
                    }
                  >
                    {t("Keep original catalogue additions")}
                  </button>
                )}
                <Notice>
                  {t(
                    "Choose only the finishing details you need. Materials are supplied only when the atelier explicitly lists them as included.",
                  )}
                </Notice>
                <ErrorMessage
                  message={additions.error}
                  retry={additions.reload}
                />
                <div className="request-designs">
                  {mergeOptions([
                    ...additions.data,
                    ...additions.knownData.filter((option) =>
                      config.addonIds?.includes(option._id),
                    ),
                  ])
                    .filter((option) => isEnabledAddon(option, draft.garment))
                    .map((o) => (
                      <label className="request-design" key={o._id}>
                        <input
                          type="checkbox"
                          checked={config.addonIds?.includes(o._id) || false}
                          onChange={(e) =>
                            nested("configuration", {
                              addonIds: e.target.checked
                                ? [...(config.addonIds || []), o._id]
                                : (config.addonIds || []).filter(
                                    (id) => id !== o._id,
                                  ),
                              extraInitialized: true,
                            })
                          }
                        />
                        {o.imageUrl ? (
                          <img
                            src={o.imageUrl}
                            alt={localize(o, "imageAlt") || localize(o, "name")}
                            loading="lazy"
                          />
                        ) : (
                          <span className="photo-fallback">
                            {t("Photo not yet available")}
                          </span>
                        )}
                        <strong>{localize(o, "name")}</strong>
                        <small>{localize(o, "description")}</small>
                        <small>
                          {design?.includedAddonIds?.includes(o._id)
                            ? t("Included")
                            : optionPriceLabel(o)}
                        </small>
                        <small>{extraMaterialLabel(o)}</small>
                      </label>
                    ))}
                </div>
                {additions.loading && (
                  <p role="status">{t("Loading additions…")}</p>
                )}
                {additions.hasMore && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={additions.loading || Boolean(additions.error)}
                    onClick={additions.loadMore}
                  >
                    {t("Load more additions")}
                  </button>
                )}
                <Link
                  className="text-link"
                  onClick={(event) => {
                    if (!persist()) event.preventDefault();
                  }}
                  to={`/account/support?draft=${cloud.current?.id || draft.id}&step=component-extra`}
                >
                  {t("Need Help from a Master Tailor?")}
                </Link>
              </>
            )}
            {step.startsWith("component-") &&
              step !== "component-extra" &&
              (() => {
                const kind = step.slice(10),
                  selected = config.components[kind],
                  original = design?.defaultComponents?.[kind];
                const activeOption = partRecord(kind);
                const candidates = mergeOptions([
                  ...options.data,
                  ...(activeOption &&
                  !options.data.some(
                    (option) => option._id === activeOption._id,
                  )
                    ? [activeOption]
                    : []),
                ]);
                const visibleOptions = candidates
                  .filter(
                    (option) =>
                      option._id === original ||
                      compatibility(option).compatible,
                  )
                  .map((option) => {
                    return option._id === original
                      ? { ...option, priceMode: "included" }
                      : option;
                  });
                const galleryProps = {
                  garment: draft.garment,
                  options: visibleOptions,
                  selectedId:
                    !selected || selected.source === "original"
                      ? original
                      : selected.optionId,
                  originalId: original,
                  onSelect: (id) =>
                    selectPart(kind, {
                      ...selected,
                      source: "option",
                      optionId: id,
                      notes: selected?.notes || "",
                    }),
                  onReset:
                    config.source === "catalogue"
                      ? () =>
                          selectPart(kind, {
                            ...selected,
                            source: "original",
                            notes: selected?.notes || "",
                          })
                      : undefined,
                  hasMore: options.hasMore,
                  onLoadMore: options.error ? options.reload : options.loadMore,
                  loadingMore: options.loading,
                  loading: options.loading,
                  error: options.error,
                };
                return (
                  <>
                    {!(kind === "sleeve" && sleeveless) && (
                      <fieldset>
                        <legend>
                          {t("For this part, what would you prefer?")}
                        </legend>
                        {[
                          ...(config.source === "catalogue"
                            ? [
                                [
                                  "original",
                                  kind === "sleeve"
                                    ? "Keep original catalogue sleeve"
                                    : kind === "sleeveLength"
                                      ? "Keep original catalogue sleeve length"
                                      : "Keep original catalogue detail",
                                ],
                              ]
                            : []),
                          ["reference", "Follow my uploaded reference"],
                          ["option", "Choose from Khwab Stitch designs"],
                          ["help", "Need help from a master tailor"],
                        ].map(([value, text]) => (
                          <label className="checkbox" key={value}>
                            <input
                              type="radio"
                              name={`component-source-${kind}`}
                              checked={
                                (selected?.source ||
                                  (config.source === "catalogue"
                                    ? "original"
                                    : "")) === value
                              }
                              onChange={() =>
                                selectPart(kind, {
                                  ...selected,
                                  source: value,
                                  ...(value === "reference" &&
                                  !selected?.referenceMediaId &&
                                  draft.referenceMediaIds[0]
                                    ? {
                                        referenceMediaId:
                                          draft.referenceMediaIds[0],
                                      }
                                    : {}),
                                  notes: selected?.notes || "",
                                })
                              }
                            />
                            {t(text)}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    {kind === "sleeve" && sleeveless ? (
                      <Notice>
                        {t(
                          "A sleeve design is not used with Sleeveless. Your previous sleeve choice is kept for switching back.",
                        )}
                      </Notice>
                    ) : selected?.source === "help" ? (
                      <Notice>
                        {t(
                          "Price after tailor review. Request guidance for this part; your other choices stay saved.",
                        )}
                      </Notice>
                    ) : selected?.source === "reference" ? (
                      <>
                        <Field
                          label={t("Reference for this component")}
                          name={`reference-${kind}`}
                        >
                          <select
                            id={`reference-${kind}`}
                            required
                            value={selected.referenceMediaId || ""}
                            onChange={(e) =>
                              selectPart(kind, {
                                ...selected,
                                referenceMediaId: e.target.value,
                              })
                            }
                          >
                            <option value="">{t("Choose a reference")}</option>
                            {draft.referenceMediaIds.map((id, i) => (
                              <option value={id} key={id}>
                                {t("Reference")} {i + 1}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {selected.referenceMediaId && (
                          <Reference id={selected.referenceMediaId} />
                        )}
                        {user ? (
                          <UploadButton
                            label={
                              uploading
                                ? t("Uploading securely…")
                                : t("Add a private close-up")
                            }
                            disabled={
                              uploading || draft.referenceMediaIds.length >= 5
                            }
                            onChange={upload}
                          />
                        ) : (
                          <Link
                            className="button secondary"
                            onClick={(event) => {
                              if (!persist()) event.preventDefault();
                            }}
                            to={`/login?returnTo=${encodeURIComponent(requestReturnTo(draft.id, step))}`}
                          >
                            {t("Sign in for private uploads")}
                          </Link>
                        )}
                        <Notice>
                          {t(
                            "Price after tailor review. Hidden or unclear components need clarification; they are not automatically specified.",
                          )}
                        </Notice>
                      </>
                    ) : config.source === "reference" &&
                      selected?.source !== "option" ? (
                      <Notice>
                        {t(
                          "Choose whether to follow your reference or open the Khwab Stitch gallery for this part.",
                        )}
                      </Notice>
                    ) : (
                      <>
                        <ErrorMessage
                          message={options.error}
                          retry={options.reload}
                        />
                        {options.loading && (
                          <p role="status">{t("Loading designs…")}</p>
                        )}
                        <button type="button" className="text-button" disabled={options.loading} onClick={options.refresh}>{t("Refresh designs")}</button>
                        {candidates.some(
                          (option) =>
                            option._id !== original &&
                            !compatibility(option).compatible,
                        ) && (
                          <Notice>
                            {t(
                              kind === "sleeve"
                                ? "Some sleeve designs are hidden because this length combination is not configured. Choose another length or ask a master tailor."
                                : "Some neck designs are hidden because they conflict with your other neckline. Your other neckline has not been changed.",
                            )}
                          </Notice>
                        )}
                        {kind === "sleeveLength" ? (
                          <SleeveLengthOptions
                            {...galleryProps}

                          />
                        ) : (
                          <VisualOptions
                            key={`${kind}:${draft.garment}`}
                            kind={kind}
                            {...galleryProps}
                          />
                        )}
                      </>
                    )}
                    {kind === "sleeveLength" &&
                      !sleeveless &&
                      partRecord("sleeve") &&
                      !compatibility(partRecord("sleeve")).compatible && (
                        <Notice>
                          {compatibility(partRecord("sleeve")).reason}{" "}
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              requestPart("sleeve");
                              go("component-sleeve");
                            }}
                          >
                            {t("Choose a compatible sleeve design")}
                          </button>
                        </Notice>
                      )}
                    <Link
                      className="text-link"
                      onClick={(event) => {
                        if (!persist()) event.preventDefault();
                      }}
                      to={`/account/support?draft=${cloud.current?.id || draft.id}&step=${step}`}
                    >
                      {t("Need Help from a Master Tailor?")}
                    </Link>
                    <ErrorMessage
                      message={originals?.error}
                      retry={() => setOriginalRefresh((value) => value + 1)}
                    />
                    <p>
                      {t("Original → Your selection")}:{" "}
                      {originalName(kind) || t("Tailor review needed")} →{" "}
                      {!selected || selected.source === "original"
                        ? t("Same as shown")
                        : selected.source === "reference"
                          ? t("Uploaded reference")
                          : selected.source === "help"
                            ? t("Master-tailor guidance requested")
                            : optionName(selected?.optionId) ||
                              (selected?.optionId &&
                              estimate?.components?.[kind]?.optionId ===
                                selected.optionId
                                ? estimate.components[kind].name
                                : "") ||
                              t(
                                selected?.source === "help"
                                  ? "Master-tailor guidance requested"
                                  : selected?.source === "reference"
                                    ? "Uploaded reference"
                                    : "Choose your option",
                              )}
                    </p>
                    <Field
                      label={t("Notes for this part (optional)")}
                      name={`notes-${kind}`}
                    >
                      <textarea
                        id={`notes-${kind}`}
                        maxLength={1000}
                        value={selected?.notes || ""}
                        onChange={(e) =>
                          selectPart(kind, {
                            ...(selected || {
                              source:
                                config.source === "catalogue"
                                  ? "original"
                                  : "help",
                            }),
                            notes: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </>
                );
              })()}
            {step === "measurements" && (
              <>
                <Summary draft={draft} design={design} estimate={estimate} />
                <Field label={t("Who will take the measurements?")} name="taken-by"><select id="taken-by" value={draft.measurements.takenBy || (draft.measurements.method === "assistance" ? "assistance" : "self")} onChange={event => nested("measurements", { takenBy: event.target.value })}><option value="self">{t("I will measure myself")}</option><option value="tailor">{t("My tailor will take the measurements")}</option><option value="assistance">{t("I need help")}</option></select></Field>
                <Field
                  label={t("What is being measured?")}
                  name="method"
                >
                  <select
                    id="method"
                    value={draft.measurements.method}
                    onChange={(e) =>
                      nested("measurements", { method: e.target.value, ...measurementContext(draft.garment, e.target.value) })
                    }
                  >
                    {draft.measurements.method === "assistance" && <option value="assistance">{t("Choose body or well-fitting garment")}</option>}
                    <option value="body">{t("Body measurements")}</option>
                    <option value="garment">
                      {t("Well-fitting garment measurements")}
                    </option>
                  </select>
                </Field>
                <MeasurementGuides garment={draft.garment} method={draft.measurements.method} selectedIds={draft.measurements.guideIds || []} onSelect={guideIds=>nested("measurements",{guideIds})} />
                {draft.measurements.method === "assistance" || draft.measurements.takenBy === "assistance" ? (
                  <Notice>
                    {t(
                      "Measurements are awaiting tailor assistance. No standard size is assumed; confirmed measurements are needed before work begins.",
                    )}
                  </Notice>
                ) : (
                  <>
                    <Field
                      label={t("Measurement unit")}
                      name="unit"
                      hint={t(
                        "Changing units converts values without erasing them.",
                      )}
                    >
                      <select
                        id="unit"
                        value={draft.measurements.unit}
                        onChange={(e) =>
                          nested("measurements", {
                            unit: e.target.value,
                            values: convertMeasurements(
                              draft.measurements.values,
                              draft.measurements.unit,
                              e.target.value,
                            ),
                          })
                        }
                      >
                        <option value="in">{t("Inches")}</option>
                        <option value="cm">{t("Centimetres")}</option>
                      </select>
                    </Field>
                    {profiles.data?.length > 0 && (
                      <Field
                        label={t("Use a saved profile")}
                        name="measurement-profile"
                      >
                        <select
                          id="measurement-profile"
                          defaultValue=""
                          onChange={(e) => {
                            const p = profiles.data.find(
                              (v) => v._id === e.target.value,
                            );
                            if (p)
                              nested("measurements", {
                                unit: p.unit,
                                method: p.method,
                                ...measurementContext(draft.garment, p.method),
                                values: {
                                  ...convertMeasurements(draft.measurements.values, draft.measurements.unit, p.unit),
                                  ...p.values,
                                },
                                notes: p.notes,
                                reconfirmFields: fields,
                              });
                          }}
                        >
                          <option value="">{t("Choose profile")}</option>
                          {profiles.data.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Notice>
                      {t(
                        draft.measurements.method === "garment"
                          ? "Measure a well-fitting garment. Provide full circumferences (flat width × 2) for around-body fields. Garment and body measurements are reviewed separately."
                          : "Use a soft tape without pulling tight. Enter full body circumferences. Ask for guidance if unsure.",
                      )}
                    </Notice>
                    <div className="form-grid">
                      {fields.map((k) => (
                        <Field
                          key={k}
                          label={`${readable(k)} (${draft.measurements.unit})`}
                          name={`measure-${k}`}
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={draft.measurements.unit === "cm" ? 2540 : 1000}
                          required={
                            (baseFields[draft.garment] || []).includes(k) ||
                            (estimate?.measurementFields || []).includes(k) ||
                            (k === "sleeveLength" &&
                              !sleeveless &&
                              Boolean(lengthStyle))
                          }
                          value={draft.measurements.values[k] ?? ""}
                          onChange={(e) =>
                            nested("measurements", {
                              values: {
                                ...draft.measurements.values,
                                [k]: e.target.value,
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                    {Object.values(draft.measurements.values).some(
                      (v) => Number(v) > 200,
                    ) && (
                      <Notice>
                        {t(
                          "Some values are unusual. Check the unit and your entries; our tailor can review legitimate unusual measurements.",
                        )}
                      </Notice>
                    )}
                    {draft.measurements.reconfirmFields?.some((k) =>
                      fields.includes(k),
                    ) && (
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            if (e.target.checked)
                              nested("measurements", { reconfirmFields: [] });
                          }}
                        />
                        {t(
                          "I have reconfirmed the measurements affected by these changes.",
                        )}
                      </label>
                    )}
                  </>
                )}
                <Field
                  label={t(
                    draft.garment === "alteration"
                      ? "What needs to be altered?"
                      : "Measurement notes (optional)",
                  )}
                  name="measurementNotes"
                >
                  <textarea
                    id="measurementNotes"
                    required={draft.garment === "alteration"}
                    maxLength={1000}
                    value={draft.measurements.notes || ""}
                    onChange={(e) =>
                      nested("measurements", { notes: e.target.value })
                    }
                  />
                </Field>
                <Notice>
                  <PolicyCopy policies={site.policies} field="assurance" fallback={t("We stitch your fabric with care according to the design and measurements you approve. If we make an error against those details, we take responsibility and work with you to correct it without an additional correction stitching charge.")} />
                </Notice>
                <p className="small-print">
                  <PolicyCopy policies={site.policies} field="alterationMargin" fallback={t("Where the fabric and design allow, we aim to leave approximately 1.5 inches of alteration margin on each side. We will confirm the available margin when reviewing your garment.")} />
                </p>
                <Link
                  onClick={(e) => {
                    if (!persist()) e.preventDefault();
                  }}
                  to={`/account/support?draft=${cloud.current?.id || draft.id}&step=measurements`}
                  className="text-link"
                >
                  {t("Measurement help")}
                </Link>
              </>
            )}
            {step === "logistics" && (
              <>
                <div className="form-grid">
                  <Field
                    label={t("Your name")}
                    name="customerName"
                    required
                    minLength={2}
                    maxLength={100}
                    value={draft.customer.name}
                    onChange={(e) =>
                      nested("customer", { name: e.target.value })
                    }
                  />
                  <Field
                    label={t("WhatsApp / phone")}
                    name="phone"
                    type="tel"
                    required
                    value={draft.customer.phone}
                    onChange={(e) =>
                      nested("customer", { phone: e.target.value })
                    }
                  />
                </div>
                <Field
                  label={t("Fabric details (optional)")}
                  name="fabricDetails"
                >
                  <textarea
                    id="fabricDetails"
                    maxLength={1000}
                    value={draft.fabricDetails || ""}
                    onChange={(e) => patch({ fabricDetails: e.target.value })}
                  />
                </Field>
                {[
                  [
                    "inbound",
                    "How will your fabric reach us?",
                    [
                      ["dropoff", "I will drop it off."],
                      ["customer_courier", "I will arrange courier delivery."],
                      ["business", "Please arrange pickup from my address."],
                    ],
                  ],
                  [
                    "outbound",
                    "How would you like to receive your stitched outfit?",
                    [
                      ["collect", "I will collect it."],
                      [
                        "customer_courier",
                        "I will arrange my own pickup/courier.",
                      ],
                      ["business", "Please arrange delivery to my address."],
                    ],
                  ],
                ].map(([leg, title, choices]) => (
                  <fieldset key={leg}>
                    <legend>{t(title)}</legend>
                    {choices.map(([value, text]) => (
                      <label className="checkbox" key={value}>
                        <input
                          type="radio"
                          name={`transport-${leg}`}
                          checked={draft.logistics[leg].method === value}
                          onChange={() =>
                            nested("logistics", {
                              [leg]: { ...draft.logistics[leg], method: value },
                            })
                          }
                        />
                        {t(text)}
                      </label>
                    ))}
                    {draft.logistics[leg].method === "business" ? (
                      <>
                        {addressBook.data?.addresses?.length > 0 && (
                          <Field
                            label={t("Use a saved address")}
                            name={`saved-address-${leg}`}
                          >
                            <select
                              id={`saved-address-${leg}`}
                              defaultValue=""
                              onChange={(e) => {
                                const selected =
                                  addressBook.data.addresses.find(
                                    (a) => a.id === e.target.value,
                                  );
                                if (selected) {
                                  const { line1, line2, city, state, pin } =
                                    selected;
                                  nested("logistics", {
                                    [leg]: {
                                      ...draft.logistics[leg],
                                      address: {
                                        line1,
                                        line2,
                                        city,
                                        state,
                                        pin,
                                      },
                                    },
                                  });
                                }
                              }}
                            >
                              <option value="">
                                {t("Choose saved address")}
                              </option>
                              {addressBook.data.addresses.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label} · {a.city}
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                        <Address
                          leg={leg}
                          value={draft.logistics[leg].address || emptyAddress()}
                          onChange={(address) =>
                            nested("logistics", {
                              [leg]: { ...draft.logistics[leg], address },
                            })
                          }
                        />
                        <small>
                          {t(
                            "Serviceability and scheduling require confirmation. This preference does not book a courier. Unconfigured transport rates remain pending.",
                          )}
                        </small>
                      </>
                    ) : (
                      <small>
                        {t(
                          draft.logistics[leg].method === "customer_courier"
                            ? "You pay your chosen courier directly. No Khwab Stitch transport charge is added; your courier is not free."
                            : "No Khwab Stitch transport charge for this arrangement.",
                        )}
                      </small>
                    )}
                  </fieldset>
                ))}
                <Field
                  label={t("Preferred date (optional)")}
                  name="preferredDate"
                  type="date"
                  min={new Date().toLocaleDateString("en-CA", {
                    timeZone: "Asia/Kolkata",
                  })}
                  hint={t("A preference, not a guaranteed completion date.")}
                  value={draft.preferredDate || ""}
                  onChange={(e) => patch({ preferredDate: e.target.value })}
                />
                <Field label={t("Notes (optional)")} name="request-notes">
                  <textarea
                    id="request-notes"
                    maxLength={2000}
                    value={draft.notes || ""}
                    onChange={(e) => patch({ notes: e.target.value })}
                  />
                </Field>
              </>
            )}
            {step === "review" && (
              <>
                <p>
                  {t(
                    "Review your request. Final feasibility, pricing and timeline are confirmed after tailor review.",
                  )}
                </p>
                {[
                  ["design", "Service / garment and design"],
                  ["measurements", "Measurements"],
                  ["logistics", "Fabric and transport"],
                ].map(([s, title]) => (
                  <section className="review-section" key={s}>
                    <div className="section-heading">
                      <h3>{t(title)}</h3>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => edit(s)}
                      >
                        {t("Edit")} {t(title)}
                      </button>
                    </div>
                    {s === "design" ? (
                      <>
                        <p>
                          {readable(draft.garment)} × {draft.quantity}
                        </p>
                        <Summary
                          draft={draft}
                          design={design}
                          estimate={estimate}
                        />
                      </>
                    ) : s === "measurements" ? (
                      <>
                        <p>
                          {readable(draft.measurements.method)} ·{" "}
                          {draft.measurements.unit}
                        </p>
                        <dl className="review-list">
                          {Object.entries(draft.measurements.values)
                            .filter(([k]) => fields.includes(k))
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt>{readable(k)}</dt>
                                <dd>
                                  {v} {draft.measurements.unit}
                                </dd>
                              </div>
                            ))}
                        </dl>
                        <p>{draft.measurements.notes}</p>
                      </>
                    ) : (
                      <>
                        <p>
                          {draft.customer.name} · {draft.customer.phone}
                        </p>
                        <p>{draft.fabricDetails}</p>
                        {["inbound", "outbound"].map((leg) => (
                          <p key={leg}>
                            <strong>
                              {t(
                                leg === "inbound"
                                  ? "Inbound fabric transport"
                                  : "Outbound outfit transport",
                              )}
                            </strong>{" "}
                            · {readable(draft.logistics[leg].method)}
                            {draft.logistics[leg].method === "business" && (
                              <>
                                {" "}
                                · {draft.logistics[leg].address?.line1},{" "}
                                {draft.logistics[leg].address?.city},{" "}
                                {draft.logistics[leg].address?.pin}
                              </>
                            )}
                          </p>
                        ))}
                        <p>{draft.notes}</p>
                      </>
                    )}
                  </section>
                ))}
                {config.mode === "exact" && estimate?.addons?.length > 0 && (
                  <section className="review-section">
                    <h3>{t("Included finishing details")}</h3>
                    <ul>
                      {estimate.addons.map((option) => (
                        <li key={option.optionId}>
                          <strong>{localize(option, "name")}</strong> —{" "}
                          {extraMaterialLabel(option)}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {config.mode === "custom" &&
                  [
                    "sleeve",
                    "sleeveLength",
                    "neck",
                    "back",
                    "extra",
                    ...(parts.includes("fit") ? ["fit"] : []),
                  ].map((kind) => {
                    const choice = activeConfig.components[kind];
                    const selectedAddons =
                      estimate?.addons ||
                      knownOptions.filter(
                        (option) =>
                          option.kind === "extra" &&
                          (activeConfig.addonsChanged
                            ? config.addonIds
                            : design?.includedAddonIds
                          )?.includes(option._id),
                      );
                    return (
                      <section className="review-section" key={kind}>
                        <div className="section-heading">
                          <h3>{t(kinds[kind])}</h3>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => edit(`component-${kind}`)}
                          >
                            {t("Edit")} {t(kinds[kind])}
                          </button>
                        </div>
                        {kind === "extra" ? (
                          selectedAddons.length ? (
                            <ul>
                              {selectedAddons.map((option) => (
                                <li key={option.optionId || option._id}>
                                  <strong>{localize(option, "name")}</strong> —{" "}
                                  {extraMaterialLabel(option)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>{t("No extra add-ons selected")}</p>
                          )
                        ) : (
                          <p>
                            {kind === "sleeve" && sleeveless
                              ? t(
                                  "Not applicable with Sleeveless. Your previous sleeve selection is saved.",
                                )
                              : !choice || choice.source === "original"
                                ? originalName(kind) || t("Same as shown")
                                : choice.source === "reference"
                                  ? t("Uploaded reference")
                                  : choice.source === "help"
                                    ? t("Master-tailor guidance requested")
                                    : optionName(choice.optionId) ||
                                      estimate?.components?.[kind]?.name ||
                                      t("Saved selection awaiting review")}
                          </p>
                        )}
                        {choice?.notes && <p>{choice.notes}</p>}
                      </section>
                    );
                  })}
                <Price {...priceProps} design={design} />
                <Notice>
                  <PolicyCopy policies={site.policies} field="assurance" fallback={t("If we make an error against your confirmed design and measurements, we take responsibility and work with you to correct it without an additional correction stitching charge.")} />
                </Notice>
                <p className="small-print">
                  <PolicyCopy policies={site.policies} field="correctionTransport" fallback={t("Measurement changes, new design requests, fabric limitations and correction transport are reviewed separately. Any correction plan and charge are confirmed with you first.")} />
                </p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    required
                    checked={draft.fabricAcknowledged || false}
                    onChange={(e) =>
                      patch({ fabricAcknowledged: e.target.checked })
                    }
                  />
                  <span>
                    {t(
                      "I provide the fabric and have reviewed my selections. This is a stitching request requiring tailor review and final quote acceptance. I acknowledge the service terms and current policy.",
                    )}{" "}
                    <Link to="/terms">{t("Service terms")}</Link> ·{" "}
                    {site.policies?.version || "service-v1"}
                  </span>
                </label>
                {!user && (
                  <Notice>
                    <strong>{t("Your design choices are ready.")}</strong>{" "}
                    {t(
                      "Sign in to submit and track your request. Your choices stay saved; you will review and explicitly submit after returning.",
                    )}
                  </Notice>
                )}
                {uncertain && (
                  <Notice>
                    {t(
                      "The result is uncertain. Check My orders, then retry the same request and key to avoid duplicates.",
                    )}{" "}
                    <Link to="/orders">{t("My orders")}</Link>
                  </Notice>
                )}
              </>
            )}
          </fieldset>
          <div className="form-actions request-actions">
            {editing ? (
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setDraft(before.current);
                  before.current = null;
                  setEditing(false);
                  go("review");
                }}
              >
                {t("Cancel changes")}
              </button>
            ) : index > 0 ? (
              <button
                className="button secondary"
                type="button"
                disabled={busy || uncertain}
                onClick={() => go(steps[index - 1])}
              >
                {t("Back")}
              </button>
            ) : (
              <span />
            )}
            <Button
              className="button"
              busy={busy}
              disabled={uploading || conflict || (
                step === "review" && !editing && user && !uncertain &&
                (!hasCurrentEstimate || priceBusy || Boolean(priceError))
              )}
            >
              {t(
                editing
                  ? "Save changes"
                  : step === "review"
                    ? uncertain
                      ? "Retry same request"
                      : "Submit Stitching Request"
                    : "Continue",
              )}
            </Button>
          </div>
        </form>
        <aside className="wizard-aside">
          <Price {...priceProps} design={design} />
          <p className="small-print">
            {t(
              "Guest design choices stay on this device for 30 days. Guest measurements, addresses, notes and private reference associations stay in this tab's session. Save a draft to your account for secure recovery on other devices.",
            )}
          </p>
          <Link
            className="text-link"
            onClick={(e) => {
              if (!persist()) e.preventDefault();
            }}
            to={`/account/support?draft=${cloud.current?.id || draft.id}&step=${step}`}
          >
            {t("Need Help from a Master Tailor?")}
          </Link>
        </aside>
      </div>
    </div>
  );
}
