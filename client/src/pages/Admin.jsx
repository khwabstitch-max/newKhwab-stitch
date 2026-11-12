import { DesignEditorExtras } from "../components/DesignEditorExtras";
import { AdminWebsiteSettings } from "../components/AdminWebsiteSettings";
import { TokenListEditor } from "../components/AdminFields";
import { amountInput, parseAmount } from "../lib/admin-values";
import "../admin-experience.css";
import tealTemplate from "../data/teal-kurti.json";
import { t, localize } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ClipboardList,
  FolderOpen,
  Image,
  LayoutDashboard,
  Pencil,
  Plus,
  Save,
  Settings,
  Shirt,
  Trash2,
  Users,
} from "lucide-react";
import { api, date, idOf, money, readable } from "../lib/api";
import { uploadMedia } from "../lib/media";
import { useResource } from "../lib/hooks";
import { CatalogueImages } from "../components/CatalogueImages";
import { OptionPreview } from "../components/VisualOptions";
import { usePagedCollection } from "../lib/usePagedCollection";
import {
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Field,
  Notice,
  PageHeading,
  Spinner,
  UploadButton,
} from "../components/ui";
import { OrderList, PrivateImage } from "./Orders";
const sleeveLengths = [
  ["sleeveless", "Sleeveless"],
  ["short", "Short"],
  ["elbow", "Elbow length"],
  ["three_quarter", "Three-quarter"],
  ["full", "Full length"],
  ["custom", "Custom length"],
];
const optionKindLabels = {
  sleeve: "Sleeve Design",
  sleeveLength: "Sleeve Length",
  neck: "Front Neck Design",
  back: "Back Neck Design",
  fit: "Fit",
  extra: "Extra Add-ons",
};
const ownerGroups = [
  { id: "overview", tasks: [["", "admin.nav.dashboard", LayoutDashboard], ["?view=attention", "admin.nav.attention", Activity]] },
  { id: "catalogue", tasks: [["designs", "admin.nav.designs", Shirt], ["categories", "admin.nav.categories", FolderOpen], ["options?kind=neck", "admin.nav.front", Pencil], ["options?kind=back", "admin.nav.back", Pencil], ["options?kind=sleeve", "admin.nav.sleeve", Pencil], ["options?kind=sleeveLength", "admin.nav.length", Pencil], ["options?kind=extra", "admin.nav.addons", Pencil]] },
  { id: "orders", tasks: [["orders", "admin.nav.orders", ClipboardList], ["customers", "admin.nav.customers", Users]] },
  { id: "marketing", tasks: [["settings?section=hero", "admin.nav.homepage", Settings], ["settings?section=slides", "admin.nav.slides", Image], ["settings?section=contact", "admin.nav.website", Settings], ["media", "admin.nav.media", Image]] },
  { id: "team", tasks: [["support", "admin.nav.support", ClipboardList], ["reviews", "admin.nav.reviews", Pencil], ["work", "admin.nav.work", Users]] },
  { id: "business", tasks: [["measurement-guides", "admin.nav.guides", Activity], ["settings?section=business", "admin.nav.pricing", Settings]] },
];
function protectOwnerNavigation(event) {
  const control = event.target.closest('a,button[data-admin-discard]');
  if (!control || control.target === "_blank" || control.closest(".admin-settings-tabs")) return;
  const editors = [...document.querySelectorAll("form[data-admin-editor]")];
  if (!editors.length) return;
  const saving = editors.some(editor => editor.querySelector('fieldset[data-admin-lock][disabled]'));
  const dirty = editors.some(editor => editor.dataset.adminDirty === "true");
  if (saving || (dirty && !window.confirm(t("admin.form.discard")))) {
    event.preventDefault(); event.stopPropagation();
  } else if (dirty) editors.forEach(editor => { editor.dataset.adminDirty = "false"; });
}
const adminPath = path => `/admin${path ? /^[?#]/.test(path) ? path : "/" + path : ""}`;
export function AdminLayout() {
  useLanguage();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const commerce = useResource("/admin/commerce/settings");
  const active = path => {
    const target = new URL(adminPath(path), "https://atelier.invalid");
    if (target.pathname !== location.pathname && !(path === "orders" && location.pathname.startsWith("/admin/orders/"))) return false;
    const query = new URLSearchParams(location.search);
    if (target.searchParams.size) return [...target.searchParams].every(([key, value]) => query.get(key) === value);
    return !["kind", "section", "status", "view"].some(key => query.has(key));
  };
  useEffect(() => {
    const dirty = () => Boolean(document.querySelector('form[data-admin-editor][data-admin-dirty="true"]'));
    const beforeUnload = event => { if (dirty()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", protectOwnerNavigation, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", protectOwnerNavigation, true); };
  }, []);
  const taskLink = ([path, label, Icon]) => <Link key={path} className={active(path) ? "active" : ""} aria-current={active(path) ? "page" : undefined} to={adminPath(path)} onClick={() => setMenuOpen(false)}><Icon size={18} aria-hidden="true" />{t(label)}</Link>;
  const extraTasks = [["services", "admin.nav.services", Shirt], ["commerce", "admin.nav.commerce", Activity], ["options?kind=fit", "Fit", Pencil], ["audit", "admin.nav.audit", Activity]];
  return (
    <div className="admin-shell admin-shell--owner" onClickCapture={event => { const form = event.target.closest("form[data-admin-editor]"); if (form && event.target.closest("button[data-admin-mutates]")) form.dataset.adminDirty = "true"; }} onChangeCapture={event => { const form = event.target.closest("form[data-admin-editor]"); if (form) form.dataset.adminDirty = "true"; }}>
      <aside className={`admin-nav owner-admin-nav ${menuOpen ? "is-open" : ""}`}>
        <p className="eyebrow">{t("THE ATELIER DESK")}</p>
        <h2>{t("admin.workspace")}</h2>
        <button type="button" className="admin-menu-toggle button secondary" aria-expanded={menuOpen} aria-controls="admin-task-drawer" onClick={() => setMenuOpen(value => !value)}>{t("admin.menu.toggle")}</button>
        <div id="admin-task-drawer" className="admin-nav-drawer">
        <Field className="admin-task-search" name="admin-task-search" label={t("admin.searchTasks")} type="search" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="admin-nav-groups">
          {ownerGroups.map(group => {
            const tasks = [...group.tasks, ...(group.id === "marketing" && commerce.data?.enabled ? [["commerce", "admin.nav.commerce", Activity]] : [])];
            const matches = tasks.filter(([, label]) => t(label).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
            const advanced = group.id === "business" ? extraTasks.filter(([, label]) => t(label).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) : [];
            if (!matches.length && !advanced.length) return null;
            return <details className="admin-nav-group" key={group.id} open={search ? true : (groups[group.id] ?? tasks.some(([path]) => active(path)))} onToggle={event => { if (!search) { const open = event.currentTarget.open; setGroups(previous => previous[group.id] === open ? previous : { ...previous, [group.id]: open }); } }}>
              <summary>{t(`admin.group.${group.id}`)}</summary>
              <nav aria-label={t(`admin.group.${group.id}`)}>{matches.map(taskLink)}</nav>
              {advanced.length > 0 && <details className="admin-advanced" open={Boolean(search) || advanced.some(([path]) => active(path))}><summary>{t("admin.nav.advanced")}</summary><nav aria-label={t("admin.nav.advanced")}>{advanced.map(taskLink)}</nav></details>}
            </details>;
          })}
        </div>
        {search && ![...ownerGroups.flatMap(group => group.tasks), ...extraTasks].some(([, label]) => t(label).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <p role="status">{t("admin.noTasks")}</p>}
        <Link className="text-link" to="/catalogue">
          {t("View the collection ")}
          <ArrowUpRight size={16} />
        </Link>
        </div>
      </aside>
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  );
}
export function AdminDashboard() {
  useLanguage();
  const { data, loading, error, reload } = useResource("/admin/dashboard");
  if (loading) return <Spinner />;
  if (error) return <ErrorMessage message={error} retry={reload} />;
  return (
    <>
      <PageHeading
        eyebrow={t("ATELIER OVERVIEW")}
        title={t("admin.dashboard.title")}
      >
        {t(
          "admin.dashboard.description",
        )}
      </PageHeading>
      <div className="admin-quick-tasks"><Link to="/admin/orders?status=request_received"><ClipboardList size={22} />{t("admin.dashboard.review")}</Link><Link to="/admin/designs"><Plus size={22} />{t("admin.dashboard.catalogue")}</Link><Link to="/admin/settings?section=hero"><Settings size={22} />{t("admin.dashboard.homepage")}</Link></div>
      <div className="stat-grid">{[...(data?.counts?.byStatus ? [["Request received",data.counts.byStatus.request_received || 0,"/admin/orders?status=request_received"],["Under review",data.counts.byStatus.under_review || 0,"/admin/orders?status=under_review"],["Quote sent",data.counts.byStatus.quote_sent || 0,"/admin/orders?status=quote_sent"],["Ready",data.counts.byStatus.ready || 0,"/admin/orders?status=ready"]] : []),["Total requests",data?.counts?.totalOrders,"/admin/orders"],["Designs",data?.counts?.designs,"/admin/designs"]].map(([label,value,to])=><Link className="stat" key={label} to={to}><span>{t(label)}</span><strong>{value ?? "?"}</strong></Link>)}</div>
<section id="needs-attention" className="panel admin-attention-list" tabIndex={-1}><h2>{t("admin.nav.attention")}</h2>{[[data?.counts?.byStatus?.request_received,"admin.dashboard.review","/admin/orders?status=request_received"],[data?.counts?.pendingReviews,"admin.nav.reviews","/admin/reviews?status=pending"],[data?.counts?.pendingApplications,"admin.nav.work","/admin/work?attention=pending"],[data?.counts?.openHelpRequests,"admin.nav.support","/admin/support?attention=open"],[data?.counts?.missingDesignPhotos,"admin.dashboard.missingPhotos","/admin/designs?attention=missing_photo"],[data?.counts?.missingDesignPrices,"admin.dashboard.missingPrices","/admin/designs?attention=missing_price"]].filter(([count])=>Number.isInteger(count)&&count>0).map(([count,label,to])=><p key={label}><Link className="text-link" to={to}>{t(label,{0:count})} <strong>{count}</strong></Link></p>)}{data?.counts && ![data.counts.byStatus?.request_received,data.counts.pendingReviews,data.counts.pendingApplications,data.counts.openHelpRequests,data.counts.missingDesignPhotos,data.counts.missingDesignPrices].some(value=>Number.isInteger(value)&&value>0)&&<p>{t("admin.dashboard.noAttention")}</p>}</section>
      <section className="panel">
        <div className="section-heading">
          <h2>{t("Latest requests")}</h2>
          <Link className="text-link" to="/admin/orders">
            {t("View all requests")}
          </Link>
        </div>
        {data?.recentOrders?.length ? (
          <div className="order-list">
            {data.recentOrders.map((o) => (
              <Link
                className="order-row"
                key={o._id}
                to={`/admin/orders/${o._id}`}
              >
                <div>
                  <small>{o.orderNumber}</small>
                  <h3>{o.customer?.name || readable(o.garment)}</h3>
                  <p>{date(o.createdAt)}</p>
                </div>
                <Badge>{readable(o.status)}</Badge>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title={t("A quiet atelier")}>
            {t("New requests will appear here.")}
          </Empty>
        )}
      </section>
    </>
  );
}
const newDesign = {
  title: "",
  titleHi: "",
  descriptionHi: "",
  code: "",
  slug: "",
  garment: "kurti",
  description: "",
  category: "",
  startingPricePaise: 50000,
  mediaIds: [],
  coverMediaId: null,
  status: "draft",
  imageViews: [],
  priceOptions: [],
  designDetails: {},
  defaultComponents: {},
  searchLabels: [],
  searchLabelsHi: [],
  includedAddonIds: [],
  serviceNotes: "",
  serviceNotesHi: "",
};
export function AdminDesigns() {
  useLanguage();
  const [filters, setFilters] = useSearchParams();
  const attention = ["missing_photo", "missing_price"].includes(filters.get("attention")) ? filters.get("attention") : "";
  const [keyword, setKeyword] = useState(filters.get("search") || "");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload, pagination } = useResource(
    `/admin/designs?page=${page}&limit=20${attention ? `&attention=${attention}` : ""}${filters.get("search") ? `&search=${encodeURIComponent(filters.get("search"))}` : ""}`,
  );
  useEffect(() => { setPage(1); setKeyword(filters.get("search") || ""); }, [filters]);
  const { data: categories } = useResource("/admin/categories?limit=50");
  const { data: library } = useResource("/media?limit=50&purpose=catalogue");
  const [editing, setEditing] = useState(null),
    [price, setPrice] = useState(""),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [success, setSuccess] = useState("");
  function edit(d) {
    setEditing({
      ...newDesign,
      ...d,
      code: d.code || "KS-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      category: idOf(d.category) || "",
      mediaIds: (d.mediaIds || []).map(idOf),
      coverMediaId: idOf(d.coverMediaId) || null,
      imageViews: d.imageViews?.length
        ? d.imageViews.map((view) => ({ ...view, mediaId: idOf(view.mediaId) }))
        : (d.mediaIds || []).map((id, index) => ({
            mediaId: idOf(id),
            label: `Image ${index + 1}`,
            crop: null,
          })),
    });
    setPrice(amountInput(d.startingPricePaise ?? 0));
    setActionError("");
    setSuccess("");
  }
  function patch(k, v) {
    setEditing((d) => ({
      ...d,
      [k]: v,
    }));
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      let current = editing;
      if (current.mediaIds.includes("board")) {
        const { data: asset } = await api("/media/presets/teal-kurti", {
          method: "POST",
          body: {},
        });
        const id = idOf(asset);
        current = {
          ...current,
          mediaIds: current.mediaIds.map((value) =>
            value === "board" ? id : value,
          ),
          coverMediaId:
            current.coverMediaId === "board" ? id : current.coverMediaId,
          imageViews: (current.imageViews || []).map((view) => ({
            ...view,
            mediaId: view.mediaId === "board" ? id : view.mediaId,
          })),
        };
        setEditing(current);
      }
      const body = {
        designDetails: current.designDetails || {},
        defaultComponents: current.defaultComponents || {},
        includedAddonIds: current.includedAddonIds || [],
        serviceNotes: current.serviceNotes || "",
        serviceNotesHi: current.serviceNotesHi || "",
        priceOptions: (current.priceOptions || []).map(
          ({ label, labelHi, amountPaise, isStartingPrice }) => ({
            label,
            labelHi: labelHi || "",
            amountPaise,
            isStartingPrice,
          }),
        ),
        imageViews: (current.imageViews || []).map(
          ({ mediaId, label, labelHi, crop }) => ({
            mediaId,
            label,
            labelHi: labelHi || "",
            crop: crop || null,
          }),
        ),
        title: editing.title,
        titleHi: editing.titleHi || "",
        descriptionHi: editing.descriptionHi || "",
        searchLabels: editing.searchLabels || [],
        searchLabelsHi: editing.searchLabelsHi || [],
        code: editing.code,
        slug: editing.slug,
        garment: editing.garment,
        description: editing.description,
        category: editing.category || null,
        startingPricePaise: current.priceOptions?.length
          ? Math.min(...current.priceOptions.map((row) => row.amountPaise))
          : parseAmount(price),
        mediaIds: current.mediaIds,
        coverMediaId: current.coverMediaId,
        status: editing.status,
        ...(editing._id
          ? {
              revision: editing.revision,
            }
          : {}),
      };
      await api(`/admin/designs${editing._id ? `/${editing._id}` : ""}`, {
        method: editing._id ? "PATCH" : "POST",
        body,
      });
      setEditing(null);
      setSuccess(
        "Design saved. Published designs are visible in the collection.",
      );
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setActionError("");
    try {
      const { data: m } = await uploadMedia(file, "catalogue");
      setEditing((d) => ({
        ...d,
        mediaIds: [...d.mediaIds, idOf(m)],
        imageViews: [
          ...(d.imageViews || []),
          {
            mediaId: idOf(m),
            label: `Image ${d.mediaIds.length + 1}`,
            labelHi: "",
            crop: null,
          },
        ],
        coverMediaId: d.coverMediaId || idOf(m),
      }));
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }
  function move(i, delta) {
    setEditing((d) => {
      const ids = [...d.mediaIds];
      [ids[i], ids[i + delta]] = [ids[i + delta], ids[i]];
      return {
        ...d,
        mediaIds: ids,
      };
    });
  }
  return (
    <>
      <PageHeading
        eyebrow={t("THE COLLECTION")}
        title={t("Designs with a point of view.")}
        action={
          <div className="editor-preview-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => edit(structuredClone(tealTemplate.design))}
             data-admin-discard>
              {t("Use teal kurti template")}
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => edit(newDesign)}
             data-admin-discard>
              <Plus size={17} />
              {t("New design")}
            </button>
          </div>
        }
      >
        {t("Create drafts, consider the details, publish when ready.")}
      </PageHeading>
      <div className="admin-form-toolbar"><Field label={t("admin.form.search")} name="admin-design-search" type="search" value={keyword} onChange={event => setKeyword(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); const next = new URLSearchParams(filters); keyword.trim() ? next.set("search", keyword.trim()) : next.delete("search"); setFilters(next); } }} /><button type="button" className="button secondary" onClick={() => { const next = new URLSearchParams(filters); keyword.trim() ? next.set("search", keyword.trim()) : next.delete("search"); setFilters(next); }}>{t("Search")}</button>{attention && <Link className="text-link" to="/admin/designs">{t("View all designs")}</Link>}</div>
      <ErrorMessage message={actionError} />
      {success && <Notice>{success}</Notice>}
      {editing && (
        <form className="panel" onSubmit={save} data-admin-editor>
          <fieldset disabled={busy} className="design-edit-fields" data-admin-lock>
            <div className="section-heading">
              <h2>{editing._id ? t("Edit design") : t("New design")}</h2>
              <button
                type="button"
                className="text-button"
                onClick={() => setEditing(null)}
               data-admin-discard>
                {t("Close editor")}
              </button>
            </div>
            <div className="form-grid">
              <Field
                label={t("Design title")}
                name="designTitle"
                required
                maxLength="120"
                value={editing.title}
                onChange={(e) => {
                  patch("title", e.target.value);
                  if (!editing._id)
                    patch(
                      "slug",
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    );
                }}
              />
              <Field
                label={t("Hindi title (optional)")}
                name="designTitleHi"
                lang="hi"
                maxLength="120"
                value={editing.titleHi || ""}
                onChange={(e) => patch("titleHi", e.target.value)}
              />
              <Field
                label={t("Hindi description (optional)")}
                name="designDescriptionHi"
              >
                <textarea
                  id="designDescriptionHi"
                  lang="hi"
                  rows="3"
                  maxLength="4000"
                  value={editing.descriptionHi || ""}
                  onChange={(e) => patch("descriptionHi", e.target.value)}
                />
              </Field>
              <Field
                label={t("Design code")}
                name="code"
                required
                maxLength="30"
                value={editing.code}
                onChange={(e) => patch("code", e.target.value)}
              />
              <Field
                label={t("URL slug")}
                name="slug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                value={editing.slug}
                onChange={(e) => patch("slug", e.target.value)}
              />
              <Field label={t("Garment")} name="designGarment">
                <select
                  id="designGarment"
                  value={editing.garment}
                  onChange={(e) => patch("garment", e.target.value)}
                >
                  {["kurti", "suit", "blouse", "alteration"].map((g) => (
                    <option value={g} key={g}>
                      {readable(g)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("Category")} name="designCategory">
                <select
                  id="designCategory"
                  value={editing.category}
                  onChange={(e) => patch("category", e.target.value)}
                >
                  <option value="">{t("No category")}</option>
                  {categories?.map((c) => (
                    <option key={c._id} value={c._id}>
                      {localize(c, "name")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("Stitching starting price (INR)")}
                name="startingPrice"
                type="number"
                step="0.01"
                min="0"
                max="1000000"
                required
                value={
                  editing.priceOptions?.length
                    ? Math.min(
                        ...editing.priceOptions.map((row) => row.amountPaise),
                      ) / 100
                    : price
                }
                readOnly={Boolean(editing.priceOptions?.length)}
                hint={
                  editing.priceOptions?.length
                    ? t("Uses the lowest stitching price option below.")
                    : undefined
                }
                onChange={(e) => setPrice(e.target.value)}
              />
              <Field label={t("Publication")} name="designStatus">
                <select
                  id="designStatus"
                  value={editing.status}
                  onChange={(e) => patch("status", e.target.value)}
                >
                  <option value="draft">{t("Draft")}</option>
                  <option value="published">{t("Published")}</option>
                  <option value="archived">{t("Archived")}</option>
                </select>
              </Field>
            </div>
            <Field label={t("Stitching description")} name="description">
              <textarea
                id="description"
                required
                rows="4"
                maxLength="4000"
                value={editing.description}
                onChange={(e) => patch("description", e.target.value)}
              />
            </Field>
            <TokenListEditor label="admin.design.searchWords" name="design-search-words" value={editing.searchLabels || []} onChange={value => patch("searchLabels", value)} hint="admin.design.searchHelp" />
            <TokenListEditor label="admin.design.searchWordsHi" name="design-search-words-hi" value={editing.searchLabelsHi || []} onChange={value => patch("searchLabelsHi", value)} hint="admin.design.searchHelp" />
            <h3>{t("Design images")}</h3>
            <details className="image-upload-help">
              <summary>{t("How to add images")}</summary>
              <p>
                {t(
                  "Choose clear photos that show the front, back and important details. Upload a JPEG, PNG or WebP image up to 5 MiB, then choose the cover photo.",
                )}
              </p>
            </details>
            <p className="small-print">
              {t(
                "Upload public catalogue photos. Reorder them and choose the cover image. Removing here detaches the image when saved; it does not delete it.",
              )}
            </p>
            <ol className="file-list">
              {editing.mediaIds.map((id, i) => (
                <li key={id}>
                  <span>
                    {t("Image ")}
                    {i + 1}{" "}
                    {editing.coverMediaId === id && <Badge>{t("Cover")}</Badge>}
                  </span>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => patch("coverMediaId", id)}
                     data-admin-mutates>
                      {t("Set cover")}
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={i === 0}
                      aria-label={t("Move image {0} up", {
                        0: i + 1,
                      })}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={i === editing.mediaIds.length - 1}
                      aria-label={t("Move image {0} down", {
                        0: i + 1,
                      })}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label={t("Detach image {0}", {
                        0: i + 1,
                      })}
                      onClick={() =>
                        setEditing((d) => ({
                          ...d,
                          mediaIds: d.mediaIds.filter((x) => x !== id),
                          imageViews: (d.imageViews || []).filter(
                            (view) => view.mediaId !== id,
                          ),
                          coverMediaId:
                            d.coverMediaId === id ? null : d.coverMediaId,
                        }))
                      }
                     data-admin-mutates>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <Field
              label={t("Attach an existing catalogue image")}
              name="existingImage"
            >
              <select
                id="existingImage"
                value=""
                disabled={busy || editing.mediaIds.length >= 8}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id)
                    setEditing((d) => ({
                      ...d,
                      mediaIds: [...d.mediaIds, id],
                      imageViews: [
                        ...(d.imageViews || []),
                        {
                          mediaId: id,
                          label: `Image ${d.mediaIds.length + 1}`,
                          labelHi: "",
                          crop: null,
                        },
                      ],
                      coverMediaId: d.coverMediaId || id,
                    }));
                }}
              >
                <option value="">{t("Choose from the media library")}</option>
                {(library || [])
                  .filter(
                    (m) =>
                      m.purpose === "catalogue" &&
                      !m.private &&
                      !editing.mediaIds.includes(m._id),
                  )
                  .map((m, i) => (
                    <option key={m._id} value={m._id}>
                      {t("Catalogue image {0} \xB7 {1}", {
                        0: i + 1,
                        1: date(m.createdAt),
                      })}
                    </option>
                  ))}
              </select>
            </Field>
            <UploadButton
              disabled={busy || editing.mediaIds.length >= 8}
              label={t("Upload catalogue image")}
              onChange={upload}
            />
            <DesignEditorExtras
              editing={{
                ...editing,
                startingPricePaise: Math.round(Number(price) * 100),
              }}
              setEditing={setEditing}
              busy={busy}
            />
            <div className="form-actions">
              <Button className="button" busy={busy}>
                <Save size={16} />
                {t("Save design")}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorMessage message={error} retry={reload} />
      ) : !data?.length ? (
        <Empty title={t("A collection waiting to happen")}>
          {t("Start with a draft design.")}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Design")}</th>
                <th>{t("Stitching from")}</th>
                <th>{t("Status")}</th>
                <th>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d._id}>
                  <td>
                    <strong>{localize(d, "title")}</strong>
                    <small>
                      {d.code} · {readable(d.garment)}
                    </small>
                  </td>
                  <td>{money(d.startingPricePaise)}</td>
                  <td>
                    <Badge>{d.status}</Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="text-button" onClick={() => edit(d)} data-admin-discard>
                        {t("Edit")}
                      </button>
                      <button
                        className="text-button danger"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              t(
                                "Permanently delete this unused draft? Used or published designs must be archived.",
                              ),
                            )
                          )
                            return;
                          try {
                            await api(`/admin/designs/${d._id}`, {
                              method: "DELETE",
                              body: {
                                revision: d.revision,
                              },
                            });
                            reload();
                          } catch (e) {
                            setActionError(e);
                          }
                        }}
                      >
                        {t("Delete draft")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {t("Previous")}
        </button>
        <span>
          {t("Page {0}", {
            0: page,
          })}
        </span>
        <button
          disabled={page >= (pagination?.pages || 1)}
          onClick={() => setPage(page + 1)}
        >
          {t("Next")}
        </button>
      </div>
    </>
  );
}
export function AdminTaxonomy({ options = false }) {
  useLanguage();
  const [params] = useSearchParams();
  const selectedKind = options && Object.hasOwn(optionKindLabels, params.get("kind")) ? params.get("kind") : "";
  const [search, setSearch] = useState("");
  const kind = options ? "options" : "categories";
  const taxonomy = usePagedCollection(`/admin/${kind}?limit=30${selectedKind ? `&kind=${selectedKind}` : ""}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`);
  const { data, loading, error } = taxonomy;
  const reload = taxonomy.refresh;
  const { data: optionImages } = useResource(
    options ? "/media?limit=50&purpose=catalogue" : null,
  );
  const [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const [preview, setPreview] = useState(null);
  useEffect(() => { setEditing(null); setActionError(""); }, [selectedKind]);
  const compatibleChoices = usePagedCollection(
    options && editing && ["neck", "back"].includes(editing.kind)
      ? "/admin/options?limit=30"
      : null,
  );
  const blank = options
    ? {
        name: "",
        kind: selectedKind || "neck",
        garments: ["kurti", "suit", "blouse"],
        active: true,
        description: "",
        imageMediaId: null,
        imageAlt: "",
        priceMode: "pending",
        amountPaise: 0,
        replacementAdjustmentPaise: 0,
        measurementFields: [],
        sleeveStyle: "other",
        lengthStyle: "custom",
        compatibleLengthStyles: [],
        incompatibleOptionIds: [],
        sleevePricingMode: "separate",
        combinedLengthPrices: [],
        displayOrder: 0,
        status: "draft",
        materialCoverage: "labor_only",
        materialNotes: "",
        serviceType: "stitching",
      }
    : {
        name: "",
        slug: "",
        active: true,
      };
  return (
    <>
      <PageHeading
        eyebrow={t("ATELIER DETAILS")}
        title={
          options
            ? selectedKind ? t(`admin.options.${selectedKind === "neck" ? "front" : selectedKind}.title`) : t("Choices that make it personal.")
            : t("A well-organized collection.")
        }
        action={
          <button
            className="button"
            onClick={() =>
              setEditing({
                ...blank,
              })
            }
           data-admin-discard>
            <Plus size={16} />
            {options ? t("New option") : t("New category")}
          </button>
        }
      />
      <p>{t(options ? "admin.options.description" : "Create categories to help customers find the right garment design.")}</p>
      {selectedKind === "sleeveLength" && <Notice>{t("admin.options.lengthFree")}</Notice>}
      <Field label={t("admin.form.search")} name="admin-option-search" type="search" value={search} onChange={event => setSearch(event.target.value)} />
      <ErrorMessage message={actionError} />
      {editing && (
        <form
          className="panel"
          data-admin-editor
          onSubmit={async (e) => {
            e.preventDefault();
            if (photoBusy || busy) return;
            setBusy(true);
            setActionError("");
            try {
              const body = options
                ? {
                    name: editing.name,
                    ...(editing.code ? { code: editing.code } : {}),
                    nameHi: editing.nameHi || "",
                    kind: editing.kind,
                    garments: editing.garments,
                    active: editing.active,
                    description: editing.description || "",
                    descriptionHi: editing.descriptionHi || "",
                    imageMediaId: editing.imageMediaId || null,
                    imageMediaIds: editing.imageMediaIds || [],
                    imageAlt: editing.imageAlt || "",
                    imageAltHi: editing.imageAltHi || "",
                    priceMode: editing.kind === "sleeveLength" ? "included" : editing.priceMode || "pending",
                    amountPaise: editing.kind === "sleeveLength" ? 0 : Number(editing.amountPaise || 0),
                    replacementAdjustmentPaise: Number(
                      editing.replacementAdjustmentPaise || 0,
                    ),
                    measurementFields: editing.measurementFields || [],
                    sleeveStyle: editing.sleeveStyle || "other",
                    ...(editing.kind === "sleeveLength"
                      ? { lengthStyle: editing.lengthStyle || "custom" }
                      : {}),
                    compatibleLengthStyles:
                      editing.kind === "sleeve"
                        ? editing.compatibleLengthStyles || []
                        : [],
                    incompatibleOptionIds: ["neck", "back"].includes(
                      editing.kind,
                    )
                      ? editing.incompatibleOptionIds || []
                      : [],
                    sleevePricingMode: "separate",
                    combinedLengthPrices: [],
                    displayOrder: Number(editing.displayOrder || 0),
                    status:
                      editing.status ||
                      (editing.active ? "published" : "archived"),
                    materialCoverage:
                      editing.kind === "extra"
                        ? editing.materialCoverage || "labor_only"
                        : "labor_only",
                    materialNotes:
                      editing.kind === "extra"
                        ? editing.materialNotes || ""
                        : "",
                    serviceType:
                      editing.kind === "extra"
                        ? editing.serviceType || "stitching"
                        : "stitching",
                  }
                : {
                    name: editing.name,
                    nameHi: editing.nameHi || "",
                    slug: editing.slug,
                    active: editing.active,
                  };
              if (editing._id) body.revision = editing.revision;
              await api(
                `/admin/${kind}${editing._id ? `/${editing._id}` : ""}`,
                {
                  method: editing._id ? "PATCH" : "POST",
                  body,
                },
              );
              setEditing(null);
              reload();
            } catch (e) {
              setActionError(e);
            } finally {
              setBusy(false);
            }
          }}>
<fieldset className="admin-form-fields" data-admin-lock disabled={busy || photoBusy}>
          <h2>
            {options
              ? editing._id
                ? t("Edit option")
                : t("New option")
              : editing._id
                ? t("Edit category")
                : t("New category")}
          </h2>
          <Field
            label={t("Name")}
            name="taxonomyName"
            required
            maxLength="80"
            value={editing.name}
            onChange={(e) =>
              setEditing({
                ...editing,
                name: e.target.value,
              })
            }
          />
          <Field
            label={t("Hindi name (optional)")}
            name="taxonomyNameHi"
            lang="hi"
            maxLength="80"
            value={editing.nameHi || ""}
            onChange={(e) => setEditing({ ...editing, nameHi: e.target.value })}
          />
          {options ? (
            <>
              <Field label={t("Option type")} name="optionKind">
                <select
                  id="optionKind"
                  disabled={Boolean(selectedKind)}
                  value={editing.kind}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      kind: e.target.value,
                    })
                  }
                >
                  {[
                    "sleeve",
                    "sleeveLength",
                    "neck",
                    "back",
                    "fit",
                    "extra",
                  ].map((k) => (
                    <option key={k} value={k}>
                      {t(optionKindLabels[k])}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("Hindi explanation (optional)")}
                name="option-description-hi"
              >
                <textarea
                  id="option-description-hi"
                  lang="hi"
                  maxLength={1000}
                  value={editing.descriptionHi || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, descriptionHi: e.target.value })
                  }
                />
              </Field>
              <Field label={t("Stable option code")} name="option-code" value={editing.code || ""} onChange={event=>setEditing({...editing,code:event.target.value.toUpperCase()})}/>
              <CatalogueImages scope={`${kind}:${editing._id || selectedKind || "new"}`} onBusyChange={setPhotoBusy} ids={editing.imageMediaIds?.length ? editing.imageMediaIds : editing.imageMediaId ? [editing.imageMediaId] : []} onChange={ids=>setEditing(current=>current ? {...current,imageMediaIds:ids,imageMediaId:ids[0]||null} : current)}/>
              {editing.sourceCrops?.length>0 && <details><summary>{t("Source and crop provenance")}</summary><pre>{JSON.stringify(editing.sourceCrops,null,2)}</pre></details>}
              <fieldset>
                <legend>{t("Applicable garments")}</legend>
                {["kurti", "suit", "blouse", "alteration"].map((g) => (
                  <label className="checkbox" key={g}>
                    <input
                      type="checkbox"
                      checked={editing.garments.includes(g)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          garments: e.target.checked
                            ? [...editing.garments, g]
                            : editing.garments.filter((x) => x !== g),
                        })
                      }
                    />
                    {readable(g)}
                  </label>
                ))}
              </fieldset>
              <Field label={t("Short explanation")} name="option-description">
                <textarea
                  id="option-description"
                  maxLength={1000}
                  value={editing.description || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                />
              </Field>
              <Field
                label={t("Option photograph")}
                name="option-image"
                hint={t(
                  "Upload a public catalogue image in Media library first. Options without photos show a labelled fallback.",
                )}
              >
                <select
                  id="option-image"
                  value={editing.imageMediaId || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      imageMediaId: e.target.value || null,
                    })
                  }
                >
                  <option value="">{t("Photo not yet available")}</option>
                  {optionImages
                    ?.filter((m) => !m.private)
                    .map((m, i) => (
                      <option key={m._id} value={m._id}>
                        {t("Catalogue image")} {i + 1} ·{" "}
                        {String(m._id).slice(-8)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label={t("Accessible image description")}
                name="option-image-alt"
                maxLength={300}
                value={editing.imageAlt || ""}
                onChange={(e) =>
                  setEditing({ ...editing, imageAlt: e.target.value })
                }
              />
              {editing.kind === "back" && (
                <p className="small-print">
                  {t(
                    "Choose a clear back-view photograph that shows this neckline.",
                  )}
                </p>
              )}
              <Field
                label={t("Hindi image description (optional)")}
                name="option-image-alt-hi"
                lang="hi"
                maxLength={300}
                value={editing.imageAltHi || ""}
                onChange={(e) =>
                  setEditing({ ...editing, imageAltHi: e.target.value })
                }
              />
              <div className="form-grid">
                <Field
                  label={t("Display order")}
                  name="option-display-order"
                  type="number"
                  min={-10000}
                  max={10000}
                  step="1"
                  value={editing.displayOrder || 0}
                  onChange={(e) =>
                    setEditing({ ...editing, displayOrder: e.target.value })
                  }
                />
                <Field
                  label={t("Option publication")}
                  name="option-publication"
                >
                  <select
                    id="option-publication"
                    value={
                      editing.status ||
                      (editing.active ? "published" : "archived")
                    }
                    onChange={(e) =>
                      setEditing({ ...editing, status: e.target.value })
                    }
                  >
                    {["draft", "published", "archived"].map((status) => (
                      <option key={status} value={status}>
                        {t(readable(status))}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="small-print">
                {t(
                  "Customers can choose an option only when it is published and available.",
                )}
              </p>
              {editing.kind !== "sleeveLength" ? <div className="form-grid">
                <Field label={t("Price treatment")} name="option-price-mode">
                  <select
                    id="option-price-mode"
                    value={editing.priceMode || "pending"}
                    onChange={(e) =>
                      setEditing({ ...editing, priceMode: e.target.value })
                    }
                  >
                    {["pending", "included", "additional", "replacement"].map(
                      (v) => (
                        <option key={v} value={v}>
                          {readable(v)}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <Field
                  label={t("Additional charge (INR)")}
                  name="option-price"
                  type="number"
                  min={0}
                  max={1000000}
                  step="0.01"
                  value={(editing.amountPaise || 0) / 100}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      amountPaise: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
                {editing.priceMode === "replacement" && (
                  <Field
                    label={t("Explicit replacement adjustment (INR)")}
                    name="replacement-adjustment"
                    type="number"
                    min={0}
                    max={1000000}
                    step="0.01"
                    hint={t(
                      "The configured adjustment is added to the bundle. Never subtract guessed included component costs.",
                    )}
                    value={(editing.replacementAdjustmentPaise || 0) / 100}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        replacementAdjustmentPaise: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      })
                    }
                  />
                )}
              </div> : <p>{t("Choose sleeve length ? no additional charge")}</p>}
              {editing.kind === "sleeve" && (
                <>
                  <Field label={t("Sleeve style")} name="option-sleeve-style">
                    <select
                      id="option-sleeve-style"
                      value={editing.sleeveStyle || "other"}
                      onChange={(e) =>
                        setEditing({ ...editing, sleeveStyle: e.target.value })
                      }
                    >
                      {[
                        "sleeveless",
                        "short",
                        "elbow",
                        "three_quarter",
                        "full",
                        "other",
                      ].map((v) => (
                        <option key={v} value={v}>
                          {readable(v)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="small-print">
                    {t(
                      "Sleeve style is retained for older catalogue records. Configure the separate length choices below for new combinations.",
                    )}
                  </p>
                  <fieldset>
                    <legend>{t("Compatible sleeve lengths")}</legend>
                    <p className="small-print">
                      {t(
                        "Select only lengths this design supports. An empty list leaves compatibility for tailor review.",
                      )}
                    </p>
                    {sleeveLengths.map(([style, label]) => (
                      <label className="checkbox" key={style}>
                        <input
                          type="checkbox"
                          checked={(
                            editing.compatibleLengthStyles || []
                          ).includes(style)}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              compatibleLengthStyles: e.target.checked
                                ? [
                                    ...(editing.compatibleLengthStyles || []),
                                    style,
                                  ]
                                : (editing.compatibleLengthStyles || []).filter(
                                    (item) => item !== style,
                                  ),
                            })
                          }
                        />
                        {t(label)}
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              {editing.kind === "sleeveLength" && (
                <Field
                  label={t("Sleeve length preference")}
                  name="option-length-style"
                  hint={t(
                    "This is a style preference. Exact inches or centimetres are collected during measurements.",
                  )}
                >
                  <select
                    id="option-length-style"
                    value={editing.lengthStyle || "custom"}
                    onChange={(e) =>
                      setEditing({ ...editing, lengthStyle: e.target.value })
                    }
                  >
                    {sleeveLengths.map(([style, label]) => (
                      <option key={style} value={style}>
                        {t(label)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {["neck", "back"].includes(editing.kind) && (
                <fieldset>
                  <legend>{t("Incompatible neckline combinations")}</legend>
                  <p className="small-print">
                    {t(
                      "Select opposite neckline options that cannot be combined with this design. The customer must review conflicts; selecting one neckline never changes the other.",
                    )}
                  </p>
                  {compatibleChoices.data
                    .filter(
                      (item) =>
                        item._id !== editing._id &&
                        item.kind ===
                          (editing.kind === "neck" ? "back" : "neck"),
                    )
                    .map((item) => (
                      <label className="checkbox" key={item._id}>
                        <input
                          type="checkbox"
                          checked={(
                            editing.incompatibleOptionIds || []
                          ).includes(item._id)}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              incompatibleOptionIds: e.target.checked
                                ? [
                                    ...(editing.incompatibleOptionIds || []),
                                    item._id,
                                  ]
                                : (editing.incompatibleOptionIds || []).filter(
                                    (id) => id !== item._id,
                                  ),
                            })
                          }
                        />
                        {localize(item, "name")}
                      </label>
                    ))}
                  {(editing.incompatibleOptionIds || [])
                    .filter(
                      (id) =>
                        !compatibleChoices.data.some(
                          (item) =>
                            item._id === id &&
                            item._id !== editing._id &&
                            item.kind ===
                              (editing.kind === "neck" ? "back" : "neck"),
                        ),
                    )
                    .map((id) => (
                      <label className="checkbox" key={id}>
                        <input
                          type="checkbox"
                          checked
                          onChange={() =>
                            setEditing({
                              ...editing,
                              incompatibleOptionIds:
                                editing.incompatibleOptionIds.filter(
                                  (value) => value !== id,
                                ),
                            })
                          }
                        />
                        {t("Saved option unavailable or not yet loaded")} ·{" "}
                        {id.slice(-8)}
                      </label>
                    ))}
                  <ErrorMessage
                    message={compatibleChoices.error}
                    retry={compatibleChoices.reload}
                  />
                  {compatibleChoices.hasMore && (
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={compatibleChoices.loading}
                      onClick={compatibleChoices.loadMore}
                    >
                      {t("Load more compatibility choices")}
                    </button>
                  )}
                </fieldset>
              )}
              {editing.kind === "extra" && (
                <>
                  <Field
                    label={t("Price covers")}
                    name="addon-material-coverage"
                  >
                    <select
                      id="addon-material-coverage"
                      value={editing.materialCoverage || "labor_only"}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          materialCoverage: e.target.value,
                        })
                      }
                    >
                      <option value="labor_only">
                        {t("Stitching labor only; customer supplies materials")}
                      </option>
                      <option value="labor_and_materials">
                        {t("Labor and explicitly listed materials")}
                      </option>
                      <option value="review">
                        {t("Materials and supply require tailor review")}
                      </option>
                    </select>
                  </Field>
                  <Field
                    label={t("Material and supply details")}
                    name="addon-material-notes"
                    required={
                      editing.active &&
                      editing.materialCoverage === "labor_and_materials" &&
                      !["draft", "archived"].includes(editing.status)
                    }
                  >
                    <textarea
                      id="addon-material-notes"
                      required={
                        editing.active &&
                        editing.materialCoverage === "labor_and_materials" &&
                        !["draft", "archived"].includes(editing.status)
                      }
                      maxLength={1000}
                      value={editing.materialNotes || ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          materialNotes: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label={t("Add-on service")} name="addon-service">
                    <select
                      id="addon-service"
                      value={editing.serviceType || "stitching"}
                      onChange={(e) =>
                        setEditing({ ...editing, serviceType: e.target.value })
                      }
                    >
                      <option value="stitching">
                        {t("Stitching and finishing")}
                      </option>
                      {editing.serviceType &&
                        editing.serviceType !== "stitching" && (
                          <option value={editing.serviceType}>
                            {t("Unavailable future service")} ·{" "}
                            {readable(editing.serviceType)}
                          </option>
                        )}
                    </select>
                  </Field>
                  <p className="small-print">
                    {t(
                      "Fabric, lining, lace and other materials are not supplied unless explicitly listed. Embroidery, painting and other future services cannot be published as active add-ons.",
                    )}
                  </p>
                </>
              )}
              <fieldset>
                <legend>{t("Additional required measurements")}</legend>
                {[
                  "sleeveLength",
                  "frontNeckDepth",
                  "frontNeckWidth",
                  "backNeckDepth",
                  "backNeckWidth",
                  "armhole",
                  "sleeveOpening",
                ].map((k) => (
                  <label className="checkbox" key={k}>
                    <input
                      type="checkbox"
                      checked={(editing.measurementFields || []).includes(k)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          measurementFields: e.target.checked
                            ? [...(editing.measurementFields || []), k]
                            : (editing.measurementFields || []).filter(
                                (v) => v !== k,
                              ),
                        })
                      }
                    />
                    {readable(k)}
                  </label>
                ))}
              </fieldset>
            </>
          ) : (
            <Field
              label={t("URL slug")}
              name="taxonomySlug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              value={editing.slug}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  slug: e.target.value,
                })
              }
            />
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={editing.active}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  active: e.target.checked,
                })
              }
            />
            {t("Available to customers")}
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditing(null)}
             data-admin-discard>
              {t("Cancel")}
            </button>
            <Button className="button" busy={busy}>
              {options ? t("Save option") : t("Save category")}
            </Button>
          </div>
        </fieldset>
</form>
      )}
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorMessage message={error} retry={reload} />
      ) : !data?.length ? (
        <Empty title={options ? t("No options yet") : t("No categories yet")} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{options ? t("Type / garments") : t("Slug")}</th>
                <th>{t("Availability")}</th>
                <th>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item._id}>
                  <td>{localize(item, "name")}</td>
                  <td>
                    {options
                      ? `${t(optionKindLabels[item.kind] || readable(item.kind))} · ${item.garments?.map(readable).join(", ")}`
                      : item.slug}
                  </td>
                  <td>
                    <Badge>
                      {options
                        ? t(
                            readable(
                              item.status ||
                                (item.active ? "published" : "archived"),
                            ),
                          )
                        : item.active
                          ? t("Active")
                          : t("Hidden")}
                    </Badge>
                    {options && !item.active && (
                      <small>{t("Unavailable")}</small>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="text-button"
                        onClick={() =>
                          setEditing({
                            ...blank,
                            ...item,
                            ...(options
                              ? {
                                  status:
                                    item.status ||
                                    (item.active ? "published" : "archived"),
                                }
                              : {}),
                          })
                        }
                       data-admin-discard>
                        {t("Edit")}
                      </button>
                      <button
                        className="text-button danger"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              t(options ? "Archive {0}? Saved requests retain this option." : "Delete {0}? Items in use cannot be deleted.", {
                                0: localize(item, "name"),
                              }),
                            )
                          )
                            return;
                          setActionError("");
                          try {
                            await api(`/admin/${kind}/${item._id}`, {
                              method: "DELETE",
                              body: {
                                revision: item.revision,
                              },
                            });
                            reload();
                          } catch (e) {
                            setActionError(e);
                          }
                        }}
                      >
                        {t(options ? "Archive" : "Delete")}
                      </button>
                      {options && <>
                        {item.images?.length > 0 && <button className="text-button" onClick={event => setPreview({ ...item, imageUrl: item.images[0].url, returnFocus: event.currentTarget })}>{t("Preview")}</button>}
                        <button className="text-button danger" onClick={async () => {
                          if (!window.confirm(t("Permanently delete this unused option? Referenced options must be archived."))) return;
                          try { await api(`/admin/options/${item._id}/permanent`, { method: "DELETE", body: { revision: item.revision } }); reload(); }
                          catch (error) { setActionError(error); }
                        }}>{t("Delete unused option permanently")}</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {taxonomy.hasMore && (
        <button
          type="button"
          className="button secondary"
          disabled={taxonomy.loading}
          onClick={taxonomy.loadMore}
        >
          {t("Load more entries")}
        </button>
      )}
      <p className="small-print">
        {t(
          "Entries load in bounded batches. Deletion is checked against current references by the server.",
        )}
      </p>
      {preview && <OptionPreview option={preview} returnFocus={preview.returnFocus} onClose={() => setPreview(null)} />}
    </>
  );
}
export function AdminOrders() {
  useLanguage();
  return <OrderList admin />;
}
export function AdminCustomers() {
  useLanguage();
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const { data, loading, error, reload, pagination } = useResource(
    `/admin/customers?limit=20&page=${page}&search=${encodeURIComponent(search)}`,
  );
  return (
    <>
      <PageHeading
        eyebrow={t("PEOPLE BEHIND THE REQUESTS")}
        title={t("Customer directory.")}
      />
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q);
          setPage(1);
        }}
      >
        <Field
          label={t("Search customers by name or email")}
          name="customerSearch"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="button">{t("Search")}</button>
      </form>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorMessage message={error} retry={reload} />
      ) : !data?.length ? (
        <Empty title={t("No customers found")} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Email")}</th>
                <th>{t("Phone (unverified)")}</th>
                <th>{t("Account")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c._id}>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.phone || "—"}</td>
                  <td>
                    {c.disabled
                      ? t("Disabled")
                      : c.deletionRequestedAt
                        ? t("Deletion requested")
                        : readable(c.role)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {t("Previous")}
        </button>
        <span>
          {t("Page {0}", {
            0: page,
          })}
        </span>
        <button
          disabled={page >= (pagination?.pages || 1)}
          onClick={() => setPage(page + 1)}
        >
          {t("Next")}
        </button>
      </div>
    </>
  );
}
export function AdminMedia() {
  useLanguage();
  const [page, setPage] = useState(1),
    [purpose, setPurpose] = useState("catalogue"),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const { data, loading, error, reload, pagination } = useResource(
    `/media?page=${page}&limit=20`,
  );
  return (
    <>
      <PageHeading
        eyebrow={t("THE VISUAL LIBRARY")}
        title={t("Images, handled with care.")}
      />
      <ErrorMessage message={actionError} />
      <div className="panel inline-form">
        <Field label={t("Image purpose")} name="mediaPurpose">
          <select
            id="mediaPurpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          >
            <option value="catalogue">{t("Public catalogue image")}</option>
            <option value="banner">{t("Public website banner")}</option>
          </select>
        </Field>
        <UploadButton
          label={busy ? t("Uploading\u2026") : t("Upload image")}
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setActionError("");
            try {
              await uploadMedia(file, purpose);
              reload();
            } catch (e) {
              setActionError(e);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorMessage message={error} retry={reload} />
      ) : !data?.length ? (
        <Empty title={t("No images yet")} />
      ) : (
        <div className="media-grid">
          {data.map((m) => (
            <article className="panel media-card" key={m._id}>
              <Badge>
                {m.private ? t("Private") : t("Public")} · {readable(m.purpose)}
              </Badge>
              <PrivateImage mediaId={m._id} publicImage={!m.private} />
              <small>
                {t("Added {0}", {
                  0: date(m.createdAt),
                })}
              </small>
              <small>
                {t("Media reference: {0}", {
                  0: m._id,
                })}
              </small>
              <button
                className="text-button danger"
                onClick={async () => {
                  if (
                    !window.confirm(
                      t(
                        m.storage === "bundled"
                          ? "Remove this included image from the media library? The template file stays in the app."
                          : "Permanently delete this image? Referenced images cannot be deleted.",
                      ),
                    )
                  )
                    return;
                  setActionError("");
                  try {
                    await api(`/media/${m._id}`, {
                      method: "DELETE",
                    });
                    reload();
                  } catch (e) {
                    setActionError(e);
                  }
                }}
              >
                <Trash2 size={15} />
                {m.storage === "bundled"
                  ? t("Remove library entry")
                  : t("Delete unused image")}
              </button>
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {t("Previous")}
        </button>
        <span>
          {t("Page {0}", {
            0: page,
          })}
        </span>
        <button
          disabled={page >= (pagination?.pages || 1)}
          onClick={() => setPage(page + 1)}
        >
          {t("Next")}
        </button>
      </div>
    </>
  );
}
export function AdminSettings() {
  useLanguage();
  const resource = useResource("/admin/settings");
  if (resource.loading) return <Spinner />;
  if (resource.error)
    return <ErrorMessage message={resource.error} retry={resource.reload} />;
  return (
    <SettingsForm
      key={resource.data?.revision}
      settings={resource.data || {}}
      onSave={resource.reload}
    />
  );
}
function SettingsForm(props) { return <AdminWebsiteSettings {...props} />; }
export function AdminAudit() {
  useLanguage();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload, pagination } = useResource(
    `/admin/audit?limit=25&page=${page}`,
  );
  return (
    <>
      <PageHeading
        eyebrow={t("A CLEAR RECORD")}
        title={t("Atelier audit history.")}
      >
        {t(
          "Sensitive changes are recorded with actor and time. Private request contents are not duplicated here.",
        )}
      </PageHeading>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorMessage message={error} retry={reload} />
      ) : !data?.length ? (
        <Empty title={t("No audit events yet")} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("When")}</th>
                <th>{t("Action")}</th>
                <th>{t("Resource")}</th>
                <th>{t("Actor")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a._id}>
                  <td>{date(a.createdAt)}</td>
                  <td>{readable(a.action)}</td>
                  <td>
                    {readable(a.resourceType)} <small>{a.resourceId}</small>
                  </td>
                  <td>{a.actor?.name || idOf(a.actor) || t("System")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {t("Previous")}
        </button>
        <span>
          {t("Page {0}", {
            0: page,
          })}
        </span>
        <button
          disabled={page >= (pagination?.pages || 1)}
          onClick={() => setPage(page + 1)}
        >
          {t("Next")}
        </button>
      </div>
    </>
  );
}
