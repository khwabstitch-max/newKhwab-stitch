import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, dateTime as date, readable } from "../lib/api";
import { useResource } from "../lib/hooks";
import { usePagedCollection } from "../lib/usePagedCollection";
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
import { Conversation, ResourceState } from "./Account";
import { PrivateImage } from "./Orders";
import { SupportProposals } from "../components/SupportProposals";
import { ListPager } from "../components/ListPager";

export function AdminSupport() {
  useLanguage();
  const [params, setParams] = useSearchParams(),
    id = params.get("ticket"),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [kind, setKind] = useState(""),
    resource = useResource(
      id
        ? `/support/${id}`
        : `/admin/support?limit=30&page=${page}${status ? `&status=${status}` : ""}${kind ? `&kind=${kind}` : ""}`,
    ),
    workers = usePagedCollection(id ? "/admin/workers?limit=30" : null),
    alerts = useResource("/admin/support/alerts");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [next, setNext] = useState(""),
    [note, setNote] = useState("");
  return (
    <>
      <PageHeading title={t("Guidance and care.")}>
        {t(
          "Review assistance and complaints. An initial human response is separate from resolution.",
        )}
      </PageHeading>
      <ErrorMessage message={error} />
      {!id && (alerts.data?.overdue > 0 || alerts.data?.dueSoon > 0) && (
        <Notice>
          {t("Initial human response targets")}: {alerts.data.overdue}{" "}
          {t("overdue")} · {alerts.data.dueSoon} {t("approaching deadline")}
        </Notice>
      )}
      {!id && (
        <div className="form-grid">
          <Field label={t("Filter status")} name="support-status">
            <select
              id="support-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("All statuses")}</option>
              {[
                "open",
                "acknowledged",
                "under_review",
                "awaiting_customer",
                "correction_proposed",
                "in_progress",
                "resolved",
                "closed",
              ].map((s) => (
                <option value={s} key={s}>
                  {readable(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Request type")} name="support-kind">
            <select
              id="support-kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("All requests")}</option>
              <option value="assistance">{t("Assistance")}</option>
              <option value="complaint">{t("Complaints")}</option>
            </select>
          </Field>
        </div>
      )}
      <ResourceState resource={resource} empty="No matching support requests">
        {id && resource.data && !Array.isArray(resource.data) ? (
          <section className="panel">
            <button className="text-button" onClick={() => setParams({})}>
              {t("All support requests")}
            </button>
            <p className="eyebrow">{resource.data.ticketNumber}</p>
            <h2>{resource.data.subject}</h2>
            <Badge>{readable(resource.data.status)}</Badge>
            <p>{resource.data.description}</p>
            <p>
              {t("Initial response target")} {date(resource.data.responseDueAt)}
            </p>
            {resource.data.firstHumanResponseAt && (
              <p>
                {t("First human response")}{" "}
                {date(resource.data.firstHumanResponseAt)}
              </p>
            )}
            {resource.data.contextShared && (
              <dl className="review-list">
                {Object.entries(resource.data.context || {}).map(([k, v]) => (
                  <div key={k}>
                    <dt>{readable(k)}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {resource.data.orderId && (
              <Link
                className="text-link"
                to={`/admin/orders/${resource.data.orderId}`}
              >
                {t("View linked order")}
              </Link>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api(`/support/${id}/status`, {
                    method: "PATCH",
                    body: {
                      revision: resource.data.revision,
                      status: next,
                      note,
                    },
                  });
                  setNote("");
                  resource.reload();
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label={t("Update ticket status")} name="ticket-next">
                <select
                  id="ticket-next"
                  required
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                >
                  <option value="">{t("Choose next status")}</option>
                  {[
                    "open",
                    "acknowledged",
                    "under_review",
                    "awaiting_customer",
                    "correction_proposed",
                    "in_progress",
                    "resolved",
                    "closed",
                  ].map((s) => (
                    <option value={s} key={s}>
                      {readable(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("Update / resolution details")}
                name="ticket-note"
              >
                <textarea
                  id="ticket-note"
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <Button className="button" busy={busy}>
                {t("Save status")}
              </Button>
            </form>
            <Field
              label={t("Assigned authorized master tailor")}
              name="assistance-assignee"
            >
              <select
                id="assistance-assignee"
                value={resource.data.assignedTo || ""}
                disabled={busy}
                onChange={async (e) => {
                  setBusy(true);
                  try {
                    await api(`/admin/support/${id}/assignment`, {
                      method: "PATCH",
                      body: {
                        revision: resource.data.revision,
                        assignedTo: e.target.value || null,
                      },
                    });
                    resource.reload();
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <option value="">{t("Admin support / unassigned")}</option>
                {resource.data.assignedTo &&
                  !workers.data.some(
                    (worker) => worker.owner === resource.data.assignedTo,
                  ) && (
                    <option value={resource.data.assignedTo}>
                      {resource.data.assignedTo}
                    </option>
                  )}
                {workers.data
                  ?.filter((w) => w.active && w.assistancePermission)
                  .map((w) => (
                    <option value={w.owner} key={w._id}>
                      {w.owner} · {w.skills.join(", ")}
                    </option>
                  ))}
              </select>
            </Field>
            <ErrorMessage message={workers.error} retry={workers.reload} />
            {workers.hasMore && (
              <button
                type="button"
                className="button secondary small"
                disabled={workers.loading || Boolean(workers.error)}
                onClick={workers.loadMore}
              >
                {t("Load more workers")}
              </button>
            )}
            <SupportProposals ticketId={id} staff onChange={resource.reload} />
            <Conversation id={resource.data.conversationId} />
          </section>
        ) : (
          !id &&
          Array.isArray(resource.data) &&
          resource.data.map((s) => (
            <Link
              className="account-row panel"
              key={s._id}
              to={`/admin/support?ticket=${s._id}`}
            >
              <span>
                <strong>{s.subject}</strong>
                <small>
                  {s.ticketNumber} · {readable(s.category)}
                </small>
                <small
                  className={
                    s.responseDueAt &&
                    !s.firstHumanResponseAt &&
                    new Date(s.responseDueAt) < new Date()
                      ? "field-error"
                      : ""
                  }
                >
                  {t("Response target")} {date(s.responseDueAt)}
                </small>
              </span>
              <Badge>{readable(s.status)}</Badge>
            </Link>
          ))
        )}
      </ResourceState>
      {!id && (
        <ListPager
          label="Support pagination"
          resource={resource}
          page={page}
          onChange={setPage}
        />
      )}
    </>
  );
}
export function AdminReviews() {
  useLanguage();
  const [page, setPage] = useState(1),
    resource = useResource(`/admin/reviews?limit=30&page=${page}`),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reasons, setReasons] = useState({});
  async function moderate(r, status) {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/reviews/${r._id}`, {
        method: "PATCH",
        body: { revision: r.revision, status, reason: reasons[r._id] || "" },
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
      <PageHeading title={t("Customer words, handled with care.")} />
      <Notice>
        {t(
          "Publish only with consent. Moderate spam, abuse, personal information and irrelevant content consistently. Critical feedback alone is not a reason to hide a review. Customer wording and ratings cannot be edited here.",
        )}
      </Notice>
      <ErrorMessage message={error} />
      <ResourceState resource={resource} empty="No reviews awaiting moderation">
        {resource.data?.map((r) => (
          <article className="panel" key={r._id}>
            <strong>{r.rating} / 5</strong>
            <Badge>{readable(r.status)}</Badge>
            <p>{r.text}</p>
            <small>
              {date(r.createdAt)} ·{" "}
              {t(
                r.consent
                  ? "Public display consent given"
                  : "No public display consent",
              )}
            </small>
            <Field
              label={t("Internal moderation reason")}
              name={`reason-${r._id}`}
              maxLength={1000}
              value={reasons[r._id] ?? r.moderationReason ?? ""}
              onChange={(e) =>
                setReasons({ ...reasons, [r._id]: e.target.value })
              }
            />
            <div className="stack-actions">
              <Button
                className="button small"
                disabled={!r.consent || r.status === "published"}
                busy={busy}
                onClick={() => moderate(r, "published")}
              >
                {t("Publish")}
              </Button>
              <Button
                className="button secondary small"
                busy={busy}
                onClick={() => moderate(r, "hidden")}
              >
                {t("Unpublish / hide")}
              </Button>
              <Button
                className="button secondary small"
                busy={busy}
                onClick={() => moderate(r, "rejected")}
              >
                {t("Reject with reason")}
              </Button>
            </div>
          </article>
        ))}
      </ResourceState>
      <ListPager
        label="Review pagination"
        resource={resource}
        page={page}
        onChange={setPage}
      />
    </>
  );
}
export function AdminWork() {
  useLanguage();
  const [applicationPage, setApplicationPage] = useState(1),
    [workerPage, setWorkerPage] = useState(1),
    [assignmentPage, setAssignmentPage] = useState(1),
    applications = useResource(
      `/admin/applications?limit=30&page=${applicationPage}`,
    ),
    workers = useResource(`/admin/workers?limit=30&page=${workerPage}`),
    assignments = useResource(
      `/admin/assignments?limit=30&page=${assignmentPage}`,
    ),
    orders = usePagedCollection("/admin/orders?limit=30"),
    workerChoices = usePagedCollection("/admin/workers?limit=30"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notes, setNotes] = useState({}),
    [assignment, setAssignment] = useState({
      orderId: "",
      worker: "",
      requirements: "",
      deadline: "",
    });
  const retry = useRef(crypto.randomUUID());
  async function review(a, status) {
    setBusy(true);
    try {
      await api(`/admin/applications/${a._id}`, {
        method: "PATCH",
        body: {
          revision: a.revision,
          status,
          reason: notes[a._id]?.reason || "",
          internalNotes: notes[a._id]?.internalNotes || a.internalNotes || "",
        },
      });
      applications.reload();
      workers.reload();
      workerChoices.refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title={t("The people behind the stitches.")} />
      <ErrorMessage message={error} />
      <section aria-label={t("Applications")}>
        <h2>{t("Applications")}</h2>
        <ResourceState resource={applications} empty="No applications yet">
          {applications.data?.map((a) => (
            <article className="panel" key={a._id}>
              <h3>
                {a.name} · {a.city}
              </h3>
              <Badge>{readable(a.status)}</Badge>
              <p>
                {a.phone} · {a.skills.join(", ")} ·{" "}
                {a.garments.map(readable).join(", ")}
              </p>
              <p>{a.introduction}</p>
              <dl className="review-list">
                {["experience", "availability", "capacity", "equipment"].map(
                  (k) => (
                    <div key={k}>
                      <dt>{readable(k)}</dt>
                      <dd>{a[k]}</dd>
                    </div>
                  ),
                )}
              </dl>
              {a.portfolioMediaIds?.map((id) => (
                <PrivateImage key={id} mediaId={id} />
              ))}
              <Field
                label={t(
                  "Reason / requested information shared with applicant",
                )}
                name={`application-reason-${a._id}`}
                maxLength={2000}
                value={notes[a._id]?.reason || ""}
                onChange={(e) =>
                  setNotes({
                    ...notes,
                    [a._id]: { ...notes[a._id], reason: e.target.value },
                  })
                }
              />
              <Field
                label={t("Internal assessment notes")}
                name={`assessment-${a._id}`}
                maxLength={4000}
                value={notes[a._id]?.internalNotes ?? a.internalNotes ?? ""}
                onChange={(e) =>
                  setNotes({
                    ...notes,
                    [a._id]: { ...notes[a._id], internalNotes: e.target.value },
                  })
                }
              />
              <div className="stack-actions">
                {["submitted", "information_requested"].includes(a.status) ? (
                  <Button
                    className="button small"
                    busy={busy}
                    onClick={() => review(a, "under_review")}
                  >
                    {t(
                      a.status === "information_requested"
                        ? "Resume review"
                        : "Begin review",
                    )}
                  </Button>
                ) : (
                  a.status === "under_review" && (
                    <>
                      <Button
                        className="button small"
                        busy={busy}
                        onClick={() => review(a, "approved")}
                      >
                        {t("Approve worker application")}
                      </Button>
                      <Button
                        className="button secondary small"
                        busy={busy}
                        onClick={() => review(a, "information_requested")}
                      >
                        {t("Request information")}
                      </Button>
                      <Button
                        className="button secondary small"
                        busy={busy}
                        onClick={() => review(a, "rejected")}
                      >
                        {t("Reject with reason")}
                      </Button>
                    </>
                  )
                )}
              </div>
              {a.conversationId && (
                <details>
                  <summary>{t("Private application conversation")}</summary>
                  <Conversation id={a.conversationId} />
                </details>
              )}
            </article>
          ))}
        </ResourceState>
        <ListPager
          label="Application pagination"
          resource={applications}
          page={applicationPage}
          onChange={setApplicationPage}
        />
      </section>
      <section className="panel" aria-label={t("Approved workers")}>
        <h2>{t("Approved workers")}</h2>
        <ResourceState resource={workers} empty="No approved workers">
          {workers.data?.map((w) => (
            <div className="worker-permissions" key={w._id}>
              <strong>{w.owner}</strong>
              <p>{w.skills.join(", ")}</p>
              {["active", "assistancePermission"].map((k) => (
                <label className="checkbox" key={k}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={w[k]}
                    onChange={async (e) => {
                      setBusy(true);
                      try {
                        await api(`/admin/workers/${w._id}`, {
                          method: "PATCH",
                          body: {
                            revision: w.revision,
                            active: w.active,
                            assistancePermission: w.assistancePermission,
                            [k]: e.target.checked,
                          },
                        });
                        workers.reload();
                        workerChoices.refresh();
                        if (
                          k === "active" &&
                          !e.target.checked &&
                          assignment.worker === w.owner
                        )
                          setAssignment((current) => ({
                            ...current,
                            worker: "",
                          }));
                      } catch (e) {
                        setError(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  {t(
                    k === "active"
                      ? "Worker access active"
                      : "May receive explicitly assigned master-tailor requests",
                  )}
                </label>
              ))}
            </div>
          ))}
        </ResourceState>
        <ListPager
          label="Worker pagination"
          resource={workers}
          page={workerPage}
          onChange={setWorkerPage}
        />
      </section>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/admin/assignments", {
              method: "POST",
              headers: { "Idempotency-Key": retry.current },
              body: {
                orderId: assignment.orderId,
                worker: assignment.worker,
                requirements: assignment.requirements,
                ...(assignment.deadline
                  ? { deadline: new Date(assignment.deadline).toISOString() }
                  : {}),
              },
            });
            retry.current = crypto.randomUUID();
            setAssignment({ ...assignment, requirements: "" });
            assignments.reload();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{t("Assign or reassign a job")}</h2>
        <Notice>
          {t(
            "Assigning a job ends the previous active assignment. Workers see only the design and measurements needed for their current jobs; order stages remain admin controlled.",
          )}
        </Notice>
        <Field label={t("Order")} name="assignment-order">
          <select
            id="assignment-order"
            required
            value={assignment.orderId}
            onChange={(e) =>
              setAssignment({ ...assignment, orderId: e.target.value })
            }
          >
            <option value="">{t("Choose order")}</option>
            {orders.data
              ?.filter(
                (o) =>
                  !["delivered", "cancelled", "rejected"].includes(o.status),
              )
              .map((o) => (
                <option key={o._id} value={o._id}>
                  {o.orderNumber}
                </option>
              ))}
          </select>
        </Field>
        <ErrorMessage message={orders.error} retry={orders.reload} />
        {orders.hasMore && (
          <button
            type="button"
            className="button secondary small"
            disabled={orders.loading || Boolean(orders.error)}
            onClick={orders.loadMore}
          >
            {t("Load more orders")}
          </button>
        )}
        <Field label={t("Worker")} name="assignment-worker">
          <select
            id="assignment-worker"
            required
            value={assignment.worker}
            onChange={(e) =>
              setAssignment({ ...assignment, worker: e.target.value })
            }
          >
            <option value="">{t("Choose approved worker")}</option>
            {assignment.worker &&
              !workerChoices.data.some(
                (worker) => worker.owner === assignment.worker,
              ) && (
                <option value={assignment.worker}>{assignment.worker}</option>
              )}
            {workerChoices.data
              ?.filter((w) => w.active)
              .map((w) => (
                <option key={w._id} value={w.owner}>
                  {w.owner} · {w.skills.join(", ")}
                </option>
              ))}
          </select>
        </Field>
        <ErrorMessage
          message={workerChoices.error}
          retry={workerChoices.reload}
        />
        {workerChoices.hasMore && (
          <button
            type="button"
            className="button secondary small"
            disabled={workerChoices.loading || Boolean(workerChoices.error)}
            onClick={workerChoices.loadMore}
          >
            {t("Load more workers")}
          </button>
        )}
        <Field label={t("Requirements")} name="assignment-requirements">
          <textarea
            id="assignment-requirements"
            required
            minLength={3}
            maxLength={3000}
            value={assignment.requirements}
            onChange={(e) =>
              setAssignment({ ...assignment, requirements: e.target.value })
            }
          />
        </Field>
        <Field
          label={t("Deadline (optional)")}
          name="assignment-deadline"
          type="datetime-local"
          value={assignment.deadline}
          onChange={(e) =>
            setAssignment({ ...assignment, deadline: e.target.value })
          }
        />
        <Button className="button" busy={busy}>
          {t("Save assignment")}
        </Button>
      </form>
      <ResourceState resource={assignments} empty="No assignments yet">
        {assignments.data?.map((a) => (
          <article className="panel" key={a._id}>
            <h3>
              {t("Assignment")} · {String(a.orderId).slice(-8)}
            </h3>
            <Badge>{t(a.active ? "Active" : "Ended")}</Badge>
            <p>{a.requirements}</p>
            <p>
              {t("Deadline")} {date(a.deadline)}
            </p>
            {a.progress?.map((p, i) => (
              <Notice key={i}>
                {readable(p.stage)} · {p.note} ·{" "}
                {t("Awaiting admin confirmation")}
              </Notice>
            ))}
            <Link className="text-link" to={`/admin/orders/${a.orderId}`}>
              {t("Review order and confirm progress")}
            </Link>
            {a.active && (
              <Button
                className="text-button danger"
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/admin/assignments/${a._id}`, {
                      method: "PATCH",
                      body: {
                        revision: a.revision,
                        active: false,
                        requirements: a.requirements,
                      },
                    });
                    assignments.reload();
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("End assignment")}
              </Button>
            )}
            {a.conversationId && (
              <details>
                <summary>{t("Job conversation")}</summary>
                <Conversation id={a.conversationId} />
              </details>
            )}
          </article>
        ))}
      </ResourceState>
      <ListPager
        label="Assignment pagination"
        resource={assignments}
        page={assignmentPage}
        onChange={setAssignmentPage}
      />
    </>
  );
}
