import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useSearchParams } from "react-router-dom";
import { ArrowRight, MessageCircle, Plus, Ruler, Scissors } from "lucide-react";
import { api, dateTime as date, readable } from "../lib/api";
import { useAuth } from "../lib/auth";
import { uploadMedia } from "../lib/media";
import { useResource, useSite } from "../lib/hooks";
import { t } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
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
import { PrivateImage, Profile } from "./Orders";
import { SupportProposals } from "../components/SupportProposals";
import { ListPager } from "../components/ListPager";

const sections = [
  ["", "Overview"],
  ["orders", "My orders"],
  ["tracking", "Track stitching"],
  ["drafts", "Saved drafts"],
  ["measurements", "My measurements"],
  ["profile", "Profile and addresses"],
  ["support", "Messages and support"],
  ["reviews", "My reviews"],
  ["work", "Work with us"],
  ["security", "Account and security"],
  ["benefits", "Stitching benefits"],
];
function usePageParam(name = "page") {
  const [params, setParams] = useSearchParams();
  const value = Number(params.get(name));
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  return [
    page,
    (nextPage) =>
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (nextPage > 1) next.set(name, String(nextPage));
        else next.delete(name);
        return next;
      }),
  ];
}
export function AccountLayout() {
  useLanguage();
  return (
    <div className="container page account-shell">
      <aside className="account-navigation">
        <p className="eyebrow">{t("YOUR KHWAB STITCH")}</p>
        <h2>{t("Made around you.")}</h2>
        <nav aria-label={t("Account navigation")}>
          {sections.map(([path, label]) => (
            <NavLink
              end={!path}
              key={path}
              to={`/account${path ? `/${path}` : ""}`}
            >
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <Link className="button small" to="/request">
          {t("New stitching request")}
          <Plus size={16} />
        </Link>
      </aside>
      <div className="account-main">
        <Outlet />
      </div>
    </div>
  );
}
export function ResourceState({
  resource,
  children,
  empty = "Nothing here yet",
}) {
  if (resource.loading) return <Spinner />;
  if (resource.error)
    return <ErrorMessage message={resource.error} retry={resource.reload} />;
  if (Array.isArray(resource.data) && !resource.data.length)
    return <Empty title={t(empty)} />;
  return children;
}
export function AccountOverview() {
  useLanguage();
  const { profile } = useAuth();
  const resource = useResource("/account/overview"),
    data = resource.data;
  return (
    <>
      <PageHeading
        eyebrow={t("YOUR PERSONAL ATELIER")}
        title={t("Welcome back, {0}.", {
          0: profile?.name?.split(" ")[0] || t("there"),
        })}
      >
        {t("Your ideas, requests and conversations, all in one place.")}
      </PageHeading>
      <ResourceState resource={resource}>
        <div className="stat-grid">
          {[
            ["Active orders", data?.activeOrders, "orders"],
            [
              "Quotes awaiting approval",
              data?.quotesAwaitingApproval,
              "orders",
            ],
            ["Saved drafts", data?.savedDrafts, "drafts"],
            ["Unread updates", data?.unreadNotifications, "support"],
          ].map(([label, count, route]) => (
            <Link className="stat" key={label} to={`/account/${route}`}>
              <span>{t(label)}</span>
              <strong>{count ?? 0}</strong>
            </Link>
          ))}
        </div>
        {data?.savedDrafts > 0 && (
          <section className="panel">
            <h2>{t("Your next idea is waiting.")}</h2>
            <div className="stack-actions">
              <Link className="button" to="/account/drafts">
                {t("Continue your saved request")}
              </Link>
              <Link className="button secondary" to="/request">
                {t("Start a new request")}
              </Link>
            </div>
          </section>
        )}
        <section className="panel">
          <h2>{t("Actions and latest updates")}</h2>
          <p>
            {t("account.actions.summary", { count: data?.actionsNeeded || 0 })}
          </p>
          {data?.recentOrders?.length ? (
            data.recentOrders.map((o) => (
              <Link className="account-row" key={o._id} to={`/orders/${o._id}`}>
                <span>
                  <strong>{o.orderNumber}</strong>
                  <small>{date(o.updatedAt || o.createdAt)}</small>
                </span>
                <Badge>{readable(o.status)}</Badge>
                <ArrowRight size={17} />
              </Link>
            ))
          ) : (
            <Empty
              title={t("Your first stitching story starts here")}
              action={
                <Link className="button" to="/catalogue">
                  {t("Explore Designs")}
                </Link>
              }
            />
          )}
        </section>
        {data?.worker && (
          <Link className="button secondary" to="/worker">
            {t("Open my worker workspace")}
          </Link>
        )}
      </ResourceState>
    </>
  );
}
export function AccountDrafts() {
  useLanguage();
  const [page, setPage] = usePageParam();
  const resource = useResource(`/drafts?limit=30&page=${page}`);
  const [error, setError] = useState("");
  return (
    <>
      <PageHeading
        title={t("Your ideas, safely kept.")}
        action={
          <Link className="button" to="/request">
            {t("Start a new request")}
          </Link>
        }
      >
        {t(
          "Each request has its own draft. Starting another keeps your saved work.",
        )}
      </PageHeading>
      <ErrorMessage message={error} />
      <ResourceState resource={resource} empty="No cloud drafts yet">
        <div className="account-cards">
          {resource.data?.map((d) => (
            <article className="panel" key={d._id}>
              <Badge>
                {d.status === "submitted" ? t("Submitted") : t("Draft")}
              </Badge>
              <h3>
                {d.title || readable(d.data?.garment || "Stitching request")}
              </h3>
              <p>
                {t("Last saved")} {date(d.updatedAt)}
              </p>
              {d.status === "submitted" && d.orderId ? (
                <Link className="text-link" to={`/orders/${d.orderId}`}>
                  {t("View my request")}
                </Link>
              ) : (
                <>
                  <Link className="button small" to={`/request?draft=${d._id}`}>
                    {t("Resume draft")}
                  </Link>
                  <button
                    className="text-button danger"
                    onClick={async () => {
                      if (!window.confirm(t("Delete this saved draft?")))
                        return;
                      try {
                        await api(`/drafts/${d._id}`, {
                          method: "DELETE",
                          body: { revision: d.revision },
                        });
                        if (resource.data.length === 1 && page > 1)
                          setPage(page - 1);
                        else resource.reload();
                      } catch (e) {
                        setError(e);
                      }
                    }}
                  >
                    {t("Delete draft")}
                  </button>
                </>
              )}
            </article>
          ))}
        </div>
      </ResourceState>
      <ListPager resource={resource} page={page} onChange={setPage} />
      <p className="small-print">
        {t(
          "Guest design choices are saved on this device. Guest measurements and addresses stay in the current browser session; sign in and save to keep them securely in your account.",
        )}
      </p>
    </>
  );
}
const allMeasurements = [
  "bust",
  "underbust",
  "waist",
  "hip",
  "shoulder",
  "length",
  "sleeveLength",
  "frontNeckDepth",
  "frontNeckWidth",
  "backNeckDepth",
  "backNeckWidth",
];
export function AccountMeasurements() {
  useLanguage();
  const resource = useResource("/measurements?limit=50");
  const [editing, setEditing] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const blank = () => ({
    name: "",
    garments: ["kurti"],
    unit: "in",
    method: "body",
    values: {},
    notes: "",
  });
  return (
    <>
      <PageHeading
        title={t("A fit worth remembering.")}
        action={
          <button className="button" onClick={() => setEditing(blank())}>
            <Ruler size={17} />
            {t("New measurement profile")}
          </button>
        }
      >
        {t(
          "Saved profiles are yours to update. Submitted orders keep the measurements you confirmed at the time.",
        )}
      </PageHeading>
      <ErrorMessage message={error} />
      {editing && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const { name, garments, unit, method, notes } = editing;
              const values = Object.fromEntries(
                Object.entries(editing.values)
                  .filter(([, v]) => v !== "")
                  .map(([k, v]) => [k, Number(v)]),
              );
              await api(
                `/measurements${editing._id ? `/${editing._id}` : ""}`,
                {
                  method: editing._id ? "PATCH" : "POST",
                  body: {
                    name,
                    garments,
                    unit,
                    method,
                    values,
                    notes,
                    ...(editing._id ? { revision: editing.revision } : {}),
                  },
                },
              );
              setEditing(null);
              resource.reload();
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label={t("Profile name")}
            name="measurement-profile-name"
            required
            maxLength={80}
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <fieldset>
            <legend>{t("Compatible garments")}</legend>
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
                        : editing.garments.filter((v) => v !== g),
                    })
                  }
                />
                {readable(g)}
              </label>
            ))}
          </fieldset>
          <div className="form-grid">
            <Field label={t("Measurement method")} name="profile-method">
              <select
                id="profile-method"
                value={editing.method}
                onChange={(e) =>
                  setEditing({ ...editing, method: e.target.value })
                }
              >
                <option value="body">{t("Body measurements")}</option>
                <option value="garment">
                  {t("Well-fitting garment measurements")}
                </option>
              </select>
            </Field>
            <Field
              label={t("Unit")}
              name="profile-unit"
              hint={t("Switching units converts your values.")}
            >
              <select
                id="profile-unit"
                value={editing.unit}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    unit: e.target.value,
                    values: Object.fromEntries(
                      Object.entries(editing.values).map(([k, v]) => [
                        k,
                        v === ""
                          ? ""
                          : Math.round(
                              Number(v) *
                                (e.target.value === "cm" ? 2.54 : 1 / 2.54) *
                                100,
                            ) / 100,
                      ]),
                    ),
                  })
                }
              >
                <option value="in">{t("Inches")}</option>
                <option value="cm">{t("Centimetres")}</option>
              </select>
            </Field>
            {allMeasurements.map((k) => (
              <Field
                key={k}
                label={`${readable(k)} (${editing.unit})`}
                name={`saved-${k}`}
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                value={editing.values[k] ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    values: { ...editing.values, [k]: e.target.value },
                  })
                }
              />
            ))}
          </div>
          <Field label={t("Instructions / notes")} name="profile-notes">
            <textarea
              id="profile-notes"
              value={editing.notes}
              maxLength={1000}
              onChange={(e) =>
                setEditing({ ...editing, notes: e.target.value })
              }
            />
          </Field>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              {t("Cancel")}
            </button>
            <Button className="button" busy={busy}>
              {t("Save measurement profile")}
            </Button>
          </div>
        </form>
      )}
      <ResourceState resource={resource} empty="No saved measurements yet">
        <div className="account-cards">
          {resource.data?.map((p) => (
            <article className="panel" key={p._id}>
              <h3>{p.name}</h3>
              <p>
                {p.garments.map(readable).join(", ")} · {readable(p.method)} ·{" "}
                {p.unit}
              </p>
              <small>
                {t("Updated")} {date(p.updatedAt)}
              </small>
              <details>
                <summary>{t("View values")}</summary>
                <dl className="review-list">
                  {Object.entries(p.values || {}).map(([k, v]) => (
                    <div key={k}>
                      <dt>{readable(k)}</dt>
                      <dd>
                        {v} {p.unit}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
              <button
                className="button secondary small"
                onClick={() => setEditing(structuredClone(p))}
              >
                {t("Edit")}
              </button>
              <button
                className="text-button danger"
                onClick={async () => {
                  if (!window.confirm(t("Delete this measurement profile?")))
                    return;
                  try {
                    await api(`/measurements/${p._id}`, {
                      method: "DELETE",
                      body: { revision: p.revision },
                    });
                    resource.reload();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                {t("Delete")}
              </button>
            </article>
          ))}
        </div>
      </ResourceState>
    </>
  );
}
export function AccountProfile() {
  return (
    <>
      <Profile />
      <AddressBook />
    </>
  );
}
function AddressBook() {
  useLanguage();
  const resource = useResource("/account/preferences"),
    [error, setError] = useState("");
  if (resource.loading) return <Spinner />;
  if (resource.error)
    return <ErrorMessage message={resource.error} retry={resource.reload} />;
  return (
    <AddressEditor
      key={resource.data?.revision}
      current={resource.data}
      reload={resource.reload}
      error={error}
      setError={setError}
    />
  );
}
function AddressEditor({ current, reload, error, setError }) {
  const [draft, setDraft] = useState(current),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/account/preferences", {
            method: "PATCH",
            body: {
              revision: draft.revision,
              addresses: draft.addresses,
              communications: draft.communications,
            },
          });
          reload();
        } catch (e) {
          setError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{t("Addresses and preferences")}</h2>
      <Notice>
        {t(
          "Updating an address changes your address book only. Contact us to request a change to an existing order.",
        )}
      </Notice>
      <ErrorMessage message={error} />
      {draft.addresses.map((a, i) => (
        <fieldset key={a.id}>
          <legend>{a.label || t("Address")}</legend>
          <div className="form-grid">
            {["label", "line1", "line2", "city", "state", "pin"].map((k) => (
              <Field
                key={k}
                label={t(
                  {
                    label: "Address label",
                    line1: "Address line 1",
                    line2: "Address line 2 (optional)",
                    city: "City",
                    state: "State",
                    pin: "PIN code",
                  }[k],
                )}
                name={`address-${i}-${k}`}
                required={k !== "line2"}
                minLength={
                  k === "line1"
                    ? 5
                    : ["city", "state"].includes(k)
                      ? 2
                      : undefined
                }
                maxLength={
                  k === "pin"
                    ? 6
                    : k === "label"
                      ? 60
                      : ["city", "state"].includes(k)
                        ? 100
                        : 200
                }
                pattern={k === "pin" ? "[1-9][0-9]{5}" : undefined}
                value={a[k] || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    addresses: draft.addresses.map((v, j) =>
                      i === j ? { ...v, [k]: e.target.value } : v,
                    ),
                  })
                }
              />
            ))}
          </div>
          <button
            className="text-button danger"
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                addresses: draft.addresses.filter((_, j) => j !== i),
              })
            }
          >
            {t("Remove address")}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary small"
        disabled={draft.addresses.length >= 10}
        onClick={() =>
          setDraft({
            ...draft,
            addresses: [
              ...draft.addresses,
              {
                id: crypto.randomUUID(),
                label: "",
                line1: "",
                line2: "",
                city: "",
                state: "",
                pin: "",
              },
            ],
          })
        }
      >
        {t("Add address")}
      </button>
      <fieldset>
        <legend>{t("Communication preferences")}</legend>
        {["orderUpdates", "marketing"].map((k) => (
          <label className="checkbox" key={k}>
            <input
              type="checkbox"
              checked={draft.communications[k]}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  communications: {
                    ...draft.communications,
                    [k]: e.target.checked,
                  },
                })
              }
            />
            {readable(k)}
          </label>
        ))}
      </fieldset>
      <Button className="button" busy={busy}>
        {t("Save addresses and preferences")}
      </Button>
    </form>
  );
}
export function Conversation({ id }) {
  useLanguage();
  const { profile } = useAuth();
  const [page, setPage] = useState(1),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attachments, setAttachments] = useState([]),
    [uploading, setUploading] = useState(false),
    [online, setOnline] = useState(() => navigator.onLine),
    [uncertain, setUncertain] = useState(false),
    [readError, setReadError] = useState("");
  const key = useRef(crypto.randomUUID()),
    attempt = useRef(null),
    readMarker = useRef(""),
    resource = useResource(
      id ? `/conversations/${id}/messages?page=${page}&limit=30` : null,
    );
  useEffect(() => {
    key.current = crypto.randomUUID();
    attempt.current = null;
    readMarker.current = "";
    setText("");
    setAttachments([]);
    setUncertain(false);
    setError("");
    setReadError("");
    setPage(1);
  }, [id]);
  useEffect(() => {
    if (
      !id ||
      resource.loading ||
      resource.error ||
      !resource.data ||
      document.hidden
    )
      return;
    const marker = `${id}:${resource.data[0]?._id || "empty"}`;
    if (readMarker.current === marker) return;
    let current = true;
    api(`/conversations/${id}/read`, { method: "POST", body: {} })
      .then(() => {
        if (current) {
          readMarker.current = marker;
          setReadError("");
        }
      })
      .catch(() => {
        if (current)
          setReadError(
            t(
              "Messages loaded, but their read status could not be saved. Refresh to try again.",
            ),
          );
      });
    return () => {
      current = false;
    };
  }, [id, resource.data, resource.loading, resource.error]);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  // Poll with backoff and pause while hidden. Every reconnect performs a persisted read.
  const reload = useRef(resource.reload);
  reload.current = resource.reload;
  useEffect(() => {
    if (!id) return;
    let timer,
      stopped = false,
      interval = 15000;
    const poll = () => {
      if (stopped) return;
      if (!document.hidden && navigator.onLine) {
        reload.current();
        interval = Math.min(interval * 1.4, 60000);
      }
      timer = setTimeout(poll, interval);
    };
    timer = setTimeout(poll, interval);
    const visible = () => {
      if (!document.hidden) {
        interval = 15000;
        reload.current();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [id]);
  return (
    <section className="conversation">
      <h3>{t("Private conversation")}</h3>
      <p className="small-print">
        {t(
          "Messages are saved securely. Updates refresh periodically; refresh to check sooner.",
        )}
      </p>
      <button className="text-button" onClick={resource.reload}>
        {t("Refresh messages")}
      </button>
      <ErrorMessage message={error} />
      {readError && (
        <p className="small-print" role="status">
          {readError}
        </p>
      )}
      <ResourceState resource={resource} empty="Your conversation starts here">
        <ol className="message-list">
          {resource.data?.map((m) => (
            <li key={m._id}>
              <div>
                <strong>
                  {String(m.sender) === String(profile?._id)
                    ? t("You")
                    : m.senderName || t("Participant")}
                </strong>
                <time>{date(m.createdAt)}</time>
              </div>
              <p>{m.text}</p>
              {m.attachmentIds?.map((mediaId) => (
                <PrivateImage
                  key={mediaId}
                  mediaId={mediaId}
                  accessPath={`/conversations/${id}/attachments/${mediaId}`}
                />
              ))}
            </li>
          ))}
        </ol>
      </ResourceState>
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {t("Newer")}
        </button>
        <span>
          {t("Page")} {page}
        </span>
        <button
          disabled={page >= (resource.pagination?.pages || 1)}
          onClick={() => setPage(page + 1)}
        >
          {t("Older")}
        </button>
      </div>
      {!online && (
        <Notice>
          {t(
            "You are offline. Your message stays in this form; reconnect before sending.",
          )}
        </Notice>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!online) return;
          setBusy(true);
          setError("");
          if (!attempt.current)
            attempt.current = {
              clientId: key.current,
              text,
              attachmentIds: [...attachments],
            };
          try {
            await api(`/conversations/${id}/messages`, {
              method: "POST",
              body: attempt.current,
            });
            setText("");
            setAttachments([]);
            key.current = crypto.randomUUID();
            attempt.current = null;
            setUncertain(false);
            resource.reload();
          } catch (e) {
            setError(e);
            if (!e.status || e.status >= 500) setUncertain(true);
            else {
              attempt.current = null;
              key.current = crypto.randomUUID();
              setUncertain(false);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t("Your message")} name={`message-${id}`}>
          <textarea
            id={`message-${id}`}
            required={!attachments.length}
            maxLength={4000}
            rows={3}
            value={text}
            disabled={busy || uncertain}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <UploadButton
          label={
            uploading ? t("Uploading securely…") : t("Attach private image")
          }
          disabled={busy || uncertain || uploading || attachments.length >= 3}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploading(true);
            try {
              const { data } = await uploadMedia(file, "reference");
              setAttachments((v) => [...v, data._id]);
            } catch (e) {
              setError(e);
            } finally {
              setUploading(false);
            }
          }}
        />
        {attachments.length > 0 && (
          <p className="small-print">
            {t("account.attachments.ready", { count: attachments.length })}
          </p>
        )}
        {uncertain && (
          <Notice>
            {t(
              "The result may be uncertain. Refresh the history to check. Retry sends the exact same message with the same key.",
            )}
          </Notice>
        )}
        <Button className="button" disabled={!online || uploading} busy={busy}>
          {t(error ? "Retry same message" : "Send message")}
        </Button>
      </form>
    </section>
  );
}
export function AccountSupport() {
  useLanguage();
  const [page, setPage] = usePageParam();
  const [params, setParams] = useSearchParams(),
    ticketId = params.get("ticket"),
    resource = useResource(
      ticketId ? `/support/${ticketId}` : `/support?limit=30&page=${page}`,
    );
  const [creating, setCreating] = useState(() =>
      Boolean(params.get("draft") || params.get("order")),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [form, setForm] = useState({
    kind: params.get("order") ? "complaint" : "assistance",
    category: params.get("step") === "measurements" ? "measurement" : "design",
    subject: "",
    description: "",
    contextShared: false,
  });
  const key = useRef(crypto.randomUUID()),
    attempt = useRef(null),
    site = useSite();
  async function changeStatus(status) {
    setBusy(true);
    try {
      await api(`/support/${ticketId}/status`, {
        method: "PATCH",
        body: {
          revision: resource.data.revision,
          status,
          note: "Customer requested this update.",
        },
      });
      resource.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title={t(
          ticketId
            ? "A conversation with your atelier."
            : "Need Help from a Master Tailor?",
        )}
        action={
          !ticketId && (
            <button className="button" onClick={() => setCreating(true)}>
              <MessageCircle size={17} />
              {t("Ask for guidance")}
            </button>
          )
        }
      >
        {t(
          "Send us your question. Our team will reply during the stated support hours. You can save your draft and continue later.",
        )}
      </PageHeading>
      <ErrorMessage message={error} />
      {creating && !ticketId && (
        <>
          {site.support && (
            <p className="small-print">
              {t("Support hours")}:{" "}
              {site.support.weekdays
                .map((day) =>
                  t(
                    [
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ][day],
                  ),
                )
                .join(", ")}{" "}
              · {String(site.support.startHour).padStart(2, "0")}:00–
              {String(site.support.endHour).padStart(2, "0")}:00 · {t("India time (Asia/Kolkata)")}
            </p>
          )}
          <form
            className="panel"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              if (!attempt.current)
                attempt.current = {
                  clientId: key.current,
                  ...form,
                  ...(params.get("order")
                    ? { orderId: params.get("order") }
                    : {}),
                  ...(params.get("draft")
                    ? { draftId: params.get("draft") }
                    : {}),
                  context: form.contextShared
                    ? { step: params.get("step") || "general" }
                    : {},
                  preferredContact: "in_app",
                  callbackAvailability: "",
                  attachmentIds: [],
                };
              try {
                const { data } = await api("/support", {
                  method: "POST",
                  body: attempt.current,
                });
                key.current = crypto.randomUUID();
                attempt.current = null;
                setUncertain(false);
                setCreating(false);
                setParams({ ticket: data._id });
              } catch (e) {
                setError(e);
                if (!e.status || e.status >= 500) setUncertain(true);
                else {
                  attempt.current = null;
                  key.current = crypto.randomUUID();
                  setUncertain(false);
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={t("What do you need?")} name="help-kind">
              <select
                id="help-kind"
                disabled={busy || uncertain}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="assistance">
                  {t("Master tailor guidance")}
                </option>
                <option value="complaint">
                  {t("Complaint or correction request")}
                </option>
              </select>
            </Field>
            <Field label={t("Category")} name="help-category">
              <select
                id="help-category"
                disabled={busy || uncertain}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {[
                  "design",
                  "measurement",
                  "fabric",
                  "transport",
                  "pricing",
                  "stitching",
                  "other",
                ].map((v) => (
                  <option key={v} value={v}>
                    {readable(v)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t("Subject")}
              name="help-subject"
              disabled={busy || uncertain}
              required
              minLength={3}
              maxLength={160}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
            <Field label={t("Tell us how we can help")} name="help-description">
              <textarea
                id="help-description"
                disabled={busy || uncertain}
                rows={4}
                required
                minLength={5}
                maxLength={4000}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Field>
            {params.get("draft") && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.contextShared}
                  disabled={busy || uncertain}
                  onChange={(e) =>
                    setForm({ ...form, contextShared: e.target.checked })
                  }
                />
                {t(
                  "Share my selected design, its components and current step with support. Measurements and addresses are not attached.",
                )}
              </label>
            )}
            <Notice>
              {t(
                "Replies arrive here in your private conversation. This is an asynchronous request, not a live connection or a booked callback. You can add private images after sending.",
              )}
            </Notice>
            {form.kind === "complaint" && (
              <p className="small-print">
                {site.support
                  ? t("We aim to provide an initial human response within {0} hours during configured support hours. Correction or transport plans and their timelines are confirmed separately.", { 0: site.support.responseHours })
                  : t("The team will reply here. Support hours and an initial response target will be confirmed by the atelier; correction and transport plans are agreed separately.")}
              </p>
            )}
            {uncertain && (
              <Notice>
                {t(
                  "The result may be uncertain. Retry sends the same help request and key; your entered information remains here.",
                )}
              </Notice>
            )}
            <div className="form-actions">
              <button
                className="button secondary"
                type="button"
                disabled={busy || uncertain}
                onClick={() => setCreating(false)}
              >
                {t("Cancel")}
              </button>
              <Button className="button" busy={busy}>
                {t(uncertain ? "Retry same help request" : "Send help request")}
              </Button>
            </div>
          </form>
        </>
      )}
      <ResourceState resource={resource} empty="No support requests yet">
        {ticketId && resource.data ? (
          <section className="panel">
            <button className="text-button" onClick={() => setParams({})}>
              {t("Back to conversations")}
            </button>
            <p className="eyebrow">{resource.data.ticketNumber}</p>
            <h2>{resource.data.subject}</h2>
            <Badge>{readable(resource.data.status)}</Badge>
            <p>{resource.data.description}</p>
            <p className="small-print">
              {t("Automated receipt")} · {date(resource.data.createdAt)}
              {resource.data.firstHumanResponseAt ? (
                <>
                  {" "}
                  · {t("First human response")}{" "}
                  {date(resource.data.firstHumanResponseAt)}
                </>
              ) : resource.data.responseDueAt ? (
                <>
                  {" "}
                  · {t("Initial response target")}{" "}
                  {date(resource.data.responseDueAt)}
                </>
              ) : null}
            </p>
            {resource.data.resolution && (
              <Notice>{resource.data.resolution}</Notice>
            )}
            {resource.data.timeline?.length > 0 && (
              <ol className="timeline">
                {resource.data.timeline.map((e, i) => (
                  <li key={i}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{readable(e.status)}</strong>
                      <small>{date(e.at)}</small>
                      <p>{e.note}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {["resolved", "closed"].includes(resource.data.status) && (
              <Button
                className="button secondary"
                busy={busy}
                onClick={() => changeStatus("open")}
              >
                {t("Reopen request")}
              </Button>
            )}
            <SupportProposals ticketId={ticketId} onChange={resource.reload} />
            <Conversation id={resource.data.conversationId} />
          </section>
        ) : (
          <div className="order-list">
            {resource.data?.map((s) => (
              <Link
                className="account-row"
                key={s._id}
                to={`/account/support?ticket=${s._id}`}
              >
                <span>
                  <small>{s.ticketNumber}</small>
                  <strong>{s.subject}</strong>
                  <small>{date(s.updatedAt)}</small>
                </span>
                <Badge>{readable(s.status)}</Badge>
              </Link>
            ))}
          </div>
        )}
      </ResourceState>
      {!ticketId && (
        <ListPager resource={resource} page={page} onChange={setPage} />
      )}
      {!ticketId && <ConversationIndex />}
      <Notifications />
    </>
  );
}
function ConversationIndex() {
  const [page, setPage] = useState(1),
    resource = useResource(`/conversations?limit=20&page=${page}`);
  return (
    <section className="panel">
      <h3>{t("All private conversations")}</h3>
      <ResourceState resource={resource} empty="No conversations yet">
        {resource.data?.map((c) => (
          <Link
            className="account-row"
            key={c._id}
            to={
              c.kind === "application"
                ? `/account/work?application=${c.contextId}`
                : c.kind === "assignment"
                  ? `/worker?job=${c.contextId}`
                  : `/account/support?ticket=${c.contextId}`
            }
          >
            <span>
              <strong>{readable(c.kind)}</strong>
              <small>{date(c.lastMessageAt || c.createdAt)}</small>
            </span>
            {c.unread > 0 && (
              <Badge>
                {t("account.messages.unread", { count: c.unread })}
              </Badge>
            )}
          </Link>
        ))}
      </ResourceState>
      <ListPager resource={resource} page={page} onChange={setPage} />
    </section>
  );
}
function Notifications() {
  const [page, setPage] = usePageParam("notificationsPage");
  const resource = useResource(`/notifications?limit=20&page=${page}`);
  const [error, setError] = useState("");
  return (
    <section className="panel" aria-label={t("Private updates")}>
      <h3>{t("Private updates")}</h3>
      <ErrorMessage message={error} />
      <ResourceState resource={resource} empty="No notifications yet">
        {resource.data?.map((n) => (
          <div className="account-row" key={n._id}>
            <span>
              <strong>{n.title || t("Account update")}</strong>
              <small>{date(n.createdAt)}</small>
            </span>
            {!n.readAt && (
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await api(`/notifications/${n._id}/read`, {
                      method: "POST",
                      body: {},
                    });
                    resource.reload();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                {t("Mark read")}
              </button>
            )}
          </div>
        ))}
      </ResourceState>
      <ListPager resource={resource} page={page} onChange={setPage} />
    </section>
  );
}
export function AccountReviews() {
  useLanguage();
  const [page, setPage] = usePageParam();
  const [ordersPage, setOrdersPage] = usePageParam("ordersPage");
  const resource = useResource(`/account/reviews?limit=30&page=${page}`),
    orders = useResource(
      `/orders?status=delivered&limit=30&page=${ordersPage}`,
    );
  const [form, setForm] = useState({
      orderId: "",
      rating: 5,
      text: "",
      consent: false,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [selectedOrder, setSelectedOrder] = useState(null);
  const orderOptions = orders.data || [];
  const selectedOutsidePage =
    selectedOrder && !orderOptions.some((o) => o._id === selectedOrder._id);
  return (
    <>
      <PageHeading title={t("Your words matter.")}>
        {t(
          "Review a completed order. Public testimonials are selected through moderation, and your wording and rating stay yours.",
        )}
      </PageHeading>
      <ErrorMessage message={error} />
      {saved && (
        <Notice>{t("Thank you. Your review is awaiting moderation.")}</Notice>
      )}
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/account/reviews", { method: "POST", body: form });
            setSaved(true);
            setForm({ ...form, text: "", orderId: "" });
            setSelectedOrder(null);
            resource.reload();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <section aria-label={t("Completed orders")}>
          <Field label={t("Completed order")} name="review-order">
            <select
              id="review-order"
              required
              value={form.orderId}
              onChange={(e) => {
                const orderId = e.target.value;
                setForm({ ...form, orderId });
                setSelectedOrder(
                  orderOptions.find((o) => o._id === orderId) || null,
                );
              }}
            >
              <option value="">{t("Choose an eligible order")}</option>
              {selectedOutsidePage && (
                <option value={selectedOrder._id}>
                  {selectedOrder.orderNumber}
                </option>
              )}
              {orderOptions
                ?.filter(
                  (o) =>
                    o._id === form.orderId ||
                    !resource.data?.some(
                      (r) => String(r.orderId) === String(o._id),
                    ),
                )
                .map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.orderNumber}
                  </option>
                ))}
            </select>
          </Field>
          {orders.loading && <Spinner />}
          <ErrorMessage message={orders.error} retry={orders.reload} />
          <p className="small-print">
            {t("Each completed order can be reviewed once.")}
          </p>
          <ListPager
            resource={orders}
            page={ordersPage}
            onChange={setOrdersPage}
          />
        </section>
        <Field label={t("Rating")} name="review-rating">
          <select
            id="review-rating"
            value={form.rating}
            onChange={(e) =>
              setForm({ ...form, rating: Number(e.target.value) })
            }
          >
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r} / 5
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Your review")} name="review-text">
          <textarea
            id="review-text"
            required
            minLength={5}
            maxLength={2000}
            rows={4}
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
        </Field>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => setForm({ ...form, consent: e.target.checked })}
          />
          {t("I consent to public display of this review after moderation.")}
        </label>
        <Button className="button" busy={busy}>
          {t("Submit review")}
        </Button>
      </form>
      <section aria-label={t("My reviews")}>
        <ResourceState resource={resource} empty="No reviews yet">
          {resource.data?.map((r) => (
            <article className="panel" key={r._id}>
              <strong>{r.rating} / 5</strong>
              <Badge>{readable(r.status)}</Badge>
              <p>{r.text}</p>
              <small>{date(r.createdAt)}</small>
            </article>
          ))}
        </ResourceState>
        <ListPager resource={resource} page={page} onChange={setPage} />
      </section>
    </>
  );
}
export function AccountWork() {
  useLanguage();
  const [page, setPage] = usePageParam();
  const [params, setParams] = useSearchParams();
  const chosen = params.get("application");
  const resource = useResource(`/applications?limit=30&page=${page}`),
    selected = useResource(chosen ? `/applications/${chosen}` : null),
    displayed = chosen ? selected : resource;
  const [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [portfolio, setPortfolio] = useState([]),
    [uploading, setUploading] = useState(false);
  const { profile } = useAuth(),
    key = useRef(crypto.randomUUID()),
    applicationMode = useRef("submitted"),
    editingApplication = useRef(null);
  const [form, setForm] = useState({
    name: profile?.name || "",
    phone: profile?.phone || "",
    city: "",
    skills: "",
    garments: ["kurti"],
    experience: "",
    availability: "",
    capacity: "",
    equipment: "",
    introduction: "",
    agreed: false,
  });
  return (
    <>
      <PageHeading
        title={t("Create with Khwab Stitch.")}
        action={
          <button
            className="button"
            onClick={() => {
              editingApplication.current = null;
              key.current = crypto.randomUUID();
              setEditing(true);
            }}
          >
            <Scissors size={17} />
            {t("Want to work as a tailor?")}
          </button>
        }
      >
        {t(
          "Tell us about your craft. Applying does not grant worker access; our team reviews every application.",
        )}
      </PageHeading>
      <ErrorMessage message={error} />
      {editing && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { agreed, ...fields } = form;
              if (!agreed && applicationMode.current !== "draft")
                throw new Error(
                  t("Please agree to the collaboration application terms."),
                );
              const { data } = await api(
                editingApplication.current
                  ? `/applications/${editingApplication.current._id}`
                  : "/applications",
                {
                  method: editingApplication.current ? "PATCH" : "POST",
                  body: {
                    ...(editingApplication.current
                      ? { revision: editingApplication.current.revision }
                      : { clientId: key.current }),
                    ...fields,
                    skills: form.skills
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                    portfolioMediaIds: portfolio,
                    termsVersion: "collaboration-v1",
                    status: applicationMode.current,
                  },
                },
              );
              key.current = crypto.randomUUID();
              setEditing(false);
              resource.reload();
              selected.reload();
              setParams(
                (current) => {
                  const next = new URLSearchParams(current);
                  next.set("application", data._id);
                  return next;
                },
                { replace: true },
              );
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            {[
              ["name", "Name"],
              ["phone", "Contact phone"],
              ["city", "City / service area"],
              ["skills", "Skills (comma separated)"],
              ["experience", "Relevant experience"],
              ["availability", "Availability"],
              ["capacity", "Approximate capacity"],
              ["equipment", "Equipment / workspace"],
            ].map(([k, l]) => (
              <Field
                key={k}
                label={t(l)}
                name={`application-${k}`}
                required={[
                  "name",
                  "phone",
                  "city",
                  "skills",
                  "experience",
                  "availability",
                ].includes(k)}
                maxLength={k === "phone" ? 20 : 1000}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            ))}
          </div>
          <fieldset>
            <legend>{t("Garment categories")}</legend>
            {["kurti", "suit", "blouse", "alteration"].map((g) => (
              <label className="checkbox" key={g}>
                <input
                  type="checkbox"
                  checked={form.garments.includes(g)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      garments: e.target.checked
                        ? [...form.garments, g]
                        : form.garments.filter((v) => v !== g),
                    })
                  }
                />
                {readable(g)}
              </label>
            ))}
          </fieldset>
          <Field
            label={t("A short introduction")}
            name="application-introduction"
          >
            <textarea
              id="application-introduction"
              required
              minLength={10}
              maxLength={2000}
              value={form.introduction}
              onChange={(e) =>
                setForm({ ...form, introduction: e.target.value })
              }
            />
          </Field>
          <UploadButton
            label={
              uploading
                ? t("Uploading securely…")
                : t("Add private sample work image")
            }
            disabled={uploading || portfolio.length >= 5}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setUploading(true);
              try {
                const { data } = await uploadMedia(file, "reference");
                setPortfolio((v) => [...v, data._id]);
              } catch (e) {
                setError(e);
              } finally {
                setUploading(false);
              }
            }}
          />
          <p className="small-print">
            {portfolio.length}{" "}
            {t(
              "private sample images. Please avoid identity documents or unrelated personal details.",
            )}
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              required
              checked={form.agreed}
              onChange={(e) => setForm({ ...form, agreed: e.target.checked })}
            />
            {t(
              "I agree that my application and sample work may be assessed privately. Approval, assignments and any collaboration terms will be confirmed separately; this application makes no payment or work guarantee.",
            )}
          </label>
          <div className="form-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              {t("Cancel")}
            </button>
            <Button
              className="button secondary"
              type="button"
              busy={busy}
              disabled={uploading}
              onClick={(e) => {
                applicationMode.current = "draft";
                const form = e.currentTarget.form;
                form.noValidate = true;
                form.requestSubmit();
                form.noValidate = false;
              }}
            >
              {t("Save application draft")}
            </Button>
            <Button
              className="button"
              busy={busy}
              disabled={uploading}
              onClick={() => {
                applicationMode.current = "submitted";
              }}
            >
              {t("Submit application")}
            </Button>
          </div>
        </form>
      )}
      {chosen && (
        <button
          className="text-button"
          onClick={() =>
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.delete("application");
              return next;
            })
          }
        >
          {t("All applications")}
        </button>
      )}
      <ResourceState resource={displayed} empty="No applications yet">
        {(chosen ? (selected.data ? [selected.data] : []) : resource.data)?.map(
          (a) => (
            <article className="panel" key={a._id}>
              <h3>
                {a.name} · {a.city}
              </h3>
              <Badge>{readable(a.status)}</Badge>
              <p>{a.reason}</p>
              <small>{date(a.createdAt)}</small>
              {["draft", "information_requested"].includes(a.status) && (
                <button
                  className="button secondary small"
                  onClick={() => {
                    editingApplication.current = a;
                    applicationMode.current = "submitted";
                    setForm({
                      name: a.name || "",
                      phone: a.phone || "",
                      city: a.city || "",
                      skills: (a.skills || []).join(", "),
                      garments: a.garments || [],
                      experience: a.experience || "",
                      availability: a.availability || "",
                      capacity: a.capacity || "",
                      equipment: a.equipment || "",
                      introduction: a.introduction || "",
                      agreed: false,
                    });
                    setPortfolio(a.portfolioMediaIds || []);
                    setEditing(true);
                    window.scrollTo?.({ top: 0, behavior: "auto" });
                  }}
                >
                  {t(
                    a.status === "draft"
                      ? "Resume application draft"
                      : "Update requested information",
                  )}
                </button>
              )}
              {[
                "draft",
                "submitted",
                "under_review",
                "information_requested",
              ].includes(a.status) && (
                <Button
                  className="text-button danger"
                  busy={busy}
                  onClick={async () => {
                    if (!window.confirm(t("Withdraw this application?")))
                      return;
                    setBusy(true);
                    try {
                      await api(`/applications/${a._id}/withdraw`, {
                        method: "POST",
                        body: { revision: a.revision },
                      });
                      resource.reload();
                      selected.reload();
                    } catch (e) {
                      setError(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t("Withdraw application")}
                </Button>
              )}
              {a.conversationId &&
                (chosen ? (
                  <Conversation key={a.conversationId} id={a.conversationId} />
                ) : (
                  <Link
                    className="text-link"
                    to={`/account/work?${new URLSearchParams({ ...Object.fromEntries(params), application: a._id })}`}
                  >
                    {t("Private application conversation")}
                  </Link>
                ))}
            </article>
          ),
        )}
      </ResourceState>
      {!chosen && (
        <ListPager resource={resource} page={page} onChange={setPage} />
      )}
      <Link className="text-link" to="/worker">
        {t("Approved worker? Open your assigned jobs")}
      </Link>
    </>
  );
}
export function WorkerWorkspace() {
  useLanguage();
  const [jobsPage, setJobsPage] = usePageParam("jobsPage");
  const [assistancePage, setAssistancePage] = usePageParam("assistancePage");
  const [params, setParams] = useSearchParams(),
    job = params.get("job"),
    assistanceId = params.get("assistance"),
    workerProfile = useResource("/worker/profile"),
    assistance = useResource(
      workerProfile.data?.assistancePermission
        ? `/worker/assistance?limit=30&page=${assistancePage}`
        : null,
    ),
    help = useResource(assistanceId ? `/support/${assistanceId}` : null),
    resource = useResource(
      job ? `/worker/jobs/${job}` : `/worker/jobs?limit=30&page=${jobsPage}`,
    ),
    [note, setNote] = useState(""),
    [stage, setStage] = useState("stitching"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const retry = useRef(crypto.randomUUID()),
    attempt = useRef(null);
  function itemPath(kind, id) {
    const next = new URLSearchParams(params);
    next.delete("job");
    next.delete("assistance");
    next.set(kind, id);
    return `/worker?${next}`;
  }
  function backToWork() {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("job");
      next.delete("assistance");
      return next;
    });
  }
  useEffect(() => {
    retry.current = crypto.randomUUID();
    attempt.current = null;
    setNote("");
    setStage("stitching");
    setUncertain(false);
    setError("");
  }, [job]);
  return (
    <div className="container page">
      <PageHeading title={t("Your craft, your assigned work.")}>
        {t(
          "Only your current assignments appear here. Progress reports go to the atelier for confirmation.",
        )}
      </PageHeading>
      <ErrorMessage message={error} />
      {workerProfile.data?.assistancePermission && (
        <section
          className="panel"
          aria-label={t("Assigned master-tailor assistance")}
        >
          <h2>{t("Assigned master-tailor assistance")}</h2>
          <ResourceState
            resource={assistance}
            empty="No assistance requests assigned to you"
          >
            {assistance.data?.map((ticket) => (
              <Link
                className="account-row"
                key={ticket._id}
                to={itemPath("assistance", ticket._id)}
              >
                <span>
                  <strong>{ticket.subject}</strong>
                  <small>{ticket.ticketNumber}</small>
                </span>
                <Badge>{readable(ticket.status)}</Badge>
              </Link>
            ))}
          </ResourceState>
          <ListPager
            resource={assistance}
            page={assistancePage}
            onChange={setAssistancePage}
          />
        </section>
      )}
      {assistanceId && (
        <ResourceState resource={help}>
          {help.data && (
            <section className="panel">
              <button className="text-button" onClick={backToWork}>
                {t("Back to assigned work")}
              </button>
              <h2>{help.data.subject}</h2>
              <Badge>{readable(help.data.status)}</Badge>
              <p>{help.data.description}</p>
              {help.data.contextShared && (
                <dl className="review-list">
                  {Object.entries(help.data.context || {}).map(
                    ([key, value]) => (
                      <div key={key}>
                        <dt>{readable(key)}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ),
                  )}
                </dl>
              )}
              {help.data.attachmentIds?.map((mediaId) => (
                <PrivateImage
                  key={mediaId}
                  mediaId={mediaId}
                  accessPath={`/conversations/${help.data.conversationId}/attachments/${mediaId}`}
                />
              ))}
              <Notice>
                {t(
                  "Guidance is shared with the customer. Design choices remain theirs to approve; contact an admin to confirm changes or resolve the request.",
                )}
              </Notice>
              <SupportProposals
                ticketId={assistanceId}
                staff
                onChange={assistance.reload}
              />
              <Conversation
                key={help.data.conversationId}
                id={help.data.conversationId}
              />
            </section>
          )}
        </ResourceState>
      )}
      {!assistanceId && (
        <section aria-label={t("Assigned stitching jobs")}>
          <ResourceState resource={resource} empty="No active assignments">
            {job && resource.data?._id === job ? (
              <section className="panel">
                <button className="text-button" onClick={backToWork}>
                  {t("All assigned jobs")}
                </button>
                <h2>
                  {resource.data.order?.orderNumber ||
                    t("Assigned stitching job")}
                </h2>
                <p>{resource.data.requirements}</p>
                {resource.data.order?.design && (
                  <p>
                    {resource.data.order.design.code} ·{" "}
                    {resource.data.order.design.title}
                  </p>
                )}
                {resource.data.order?.configuration?.components && (
                  <dl className="review-list">
                    {Object.entries(
                      resource.data.order.configuration.components,
                    ).map(([key, value]) => (
                      <div key={key}>
                        <dt>{readable(key)}</dt>
                        <dd>
                          {readable(value.source || "included")}
                          {value.notes ? ` · ${value.notes}` : ""}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {resource.data.order?.referenceMediaIds?.map((mediaId) => (
                  <PrivateImage
                    key={mediaId}
                    mediaId={mediaId}
                    accessPath={`/worker/jobs/${job}/attachments/${mediaId}`}
                  />
                ))}
                <p>
                  {t("Deadline")} {date(resource.data.deadline)}
                </p>
                <dl className="review-list">
                  {Object.entries(
                    resource.data.order?.measurements?.values || {},
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt>{readable(k)}</dt>
                      <dd>
                        {v} {resource.data.order.measurements.unit}
                      </dd>
                    </div>
                  ))}
                </dl>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    if (!attempt.current)
                      attempt.current = {
                        clientId: retry.current,
                        revision: resource.data.revision,
                        stage,
                        note,
                      };
                    try {
                      await api(`/worker/jobs/${job}/progress`, {
                        method: "POST",
                        body: attempt.current,
                      });
                      setNote("");
                      attempt.current = null;
                      retry.current = crypto.randomUUID();
                      setUncertain(false);
                      resource.reload();
                    } catch (e) {
                      setError(e);
                      if (!e.status || e.status >= 500) setUncertain(true);
                      else {
                        attempt.current = null;
                        retry.current = crypto.randomUUID();
                        setUncertain(false);
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Field
                    label={t("Reported stage for admin review")}
                    name="worker-stage"
                  >
                    <select
                      id="worker-stage"
                      value={stage}
                      disabled={busy || uncertain}
                      onChange={(e) => setStage(e.target.value)}
                    >
                      {[
                        "cutting",
                        "stitching",
                        "quality_check",
                        "ready_for_review",
                        "blocked",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {readable(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={t("Progress report for admin review")}
                    name="worker-progress"
                  >
                    <textarea
                      id="worker-progress"
                      required
                      minLength={3}
                      maxLength={2000}
                      value={note}
                      disabled={busy || uncertain}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                  {uncertain && (
                    <Notice>
                      {t(
                        "The result may be uncertain. Retry sends the same progress report and key; your order stage changes only after admin confirmation.",
                      )}
                    </Notice>
                  )}
                  <Button className="button" busy={busy}>
                    {t(
                      uncertain
                        ? "Retry same progress report"
                        : "Send progress report",
                    )}
                  </Button>
                </form>
                {resource.data.conversationId && (
                  <Conversation id={resource.data.conversationId} />
                )}
              </section>
            ) : (
              (Array.isArray(resource.data) ? resource.data : []).map((a) => (
                <Link
                  key={a._id}
                  className="account-row panel"
                  to={itemPath("job", a._id)}
                >
                  <span>
                    <strong>{a.orderNumber || t("Assigned job")}</strong>
                    <small>{a.requirements}</small>
                    <small>
                      {t("Deadline")} {date(a.deadline)}
                    </small>
                  </span>
                  <ArrowRight size={17} />
                </Link>
              ))
            )}
          </ResourceState>
          {!job && (
            <ListPager
              resource={resource}
              page={jobsPage}
              onChange={setJobsPage}
            />
          )}
        </section>
      )}
    </div>
  );
}
