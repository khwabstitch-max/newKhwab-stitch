import { z } from "zod";
import { rateLimitFor } from "./rate-limits.js";
import {
  COMPONENT_KINDS,
  componentInput,
  configurationInput,
  measurementKeys,
} from "./workflow-input.js";
import { objectId, revisionSchema, MEASUREMENT_FIELDS } from "./domain.js";
import { estimateInput, loadEstimate } from "./pricing.js";
import { fail, requireFound } from "./errors.js";
import {
  idOf,
  sameId,
  checkRevision,
  audit,
  plain,
  pageQuery,
  pageResult,
} from "./route-utils.js";
import { authorizedTicket } from "./routes-support.js";
import { retryId, assertRetry } from "./support-domain.js";
import { hashRequest, notify } from "./extension-utils.js";
import { draftReferenceIds, fenceNewReferences } from "./reference-integrity.js";

export const proposalInput = z
  .object({
    clientId: retryId,
    revision: revisionSchema,
    draftRevision: revisionSchema,
    summary: z.string().trim().min(5).max(2000),
    pricingImpact: z.string().trim().min(3).max(1000),
    measurementImpact: z.string().trim().min(3).max(1000),
    changes: z
      .object(
        Object.fromEntries(
          COMPONENT_KINDS.map((kind) => [kind, componentInput.optional()]),
        ),
      )
      .strict()
      .refine(
        (changes) => Object.keys(changes).length > 0,
        "Choose at least one component to propose.",
      ),
  })
  .strict();
const safeProposal = (document) => {
  const { requestHash: _hash, clientId: _client, ...safe } = plain(document);
  return safe;
};
const trustedConfiguration = (configuration) =>
  configuration
    ? {
        source: configuration.source,
        mode: configuration.mode,
        components: configuration.mode === "exact" ? {} : Array.isArray(configuration.changedParts)
          ? Object.fromEntries(Object.entries(configuration.components || {}).filter(([kind]) => configuration.changedParts.includes(kind)))
          : configuration.components,
        addonIds: configuration.addonIds,
        addonsChanged: configuration.addonsChanged ?? (Array.isArray(configuration.changedParts) ? configuration.changedParts.includes("extra") : undefined),
        notes: configuration.notes,
      }
    : undefined;
const estimateFor = (data) =>
  estimateInput.parse({
    garment: data.garment,
    quantity: Number(data.quantity),
    ...(data.designId ? { designId: data.designId } : {}),
    configuration: trustedConfiguration(data.configuration),
    ...(data.logistics ? { logistics: data.logistics } : {}),
  });
async function relatedDraft(ctx, ticket, session) {
  if (!ticket.contextShared || !ticket.draftId) return null;
  const identifier = /^[a-f\d]{24}$/i.test(ticket.draftId)
    ? { _id: ticket.draftId }
    : { clientId: ticket.draftId };
  return ctx.models.Draft.findOne({
    ...identifier,
    owner: ticket.owner,
    status: "draft",
  }).session(session || null);
}
async function assertStaff(ctx, req, ticket, session) {
  if (req.user.role === "admin") return;
  if (
    sameId(ticket.assignedTo, req.user._id) &&
    (await ctx.models.WorkerProfile.exists({
      owner: req.user._id,
      active: true,
      assistancePermission: true,
    }).session(session || null))
  )
    return;
  fail(
    403,
    "FORBIDDEN",
    "Only authorized assigned staff can propose a design change.",
  );
}
async function proposedDraft(ctx, draft, changes, session) {
  const data = structuredClone(draft.data);
  if (!data.configuration)
    fail(
      409,
      "DESIGN_CONFIGURATION_REQUIRED",
      "Save an explicit design configuration before requesting a change proposal.",
    );
  const selected = configurationInput.parse({
    ...trustedConfiguration(data.configuration),
    mode: "custom",
    components: { ...data.configuration.components, ...changes },
  });
  data.configuration = {
    ...data.configuration,
    ...selected,
    changedParts: [
      ...new Set([
        ...(data.configuration.changedParts || []),
        ...Object.keys(changes),
      ]),
    ],
  };
  for (const component of Object.values(changes))
    if (component.source === "reference") {
      if (!data.referenceMediaIds?.includes(component.referenceMediaId))
        fail(
          400,
          "INVALID_MEDIA",
          "A proposal may use only references already attached to this draft.",
        );
      requireFound(
        await ctx.models.MediaAsset.findOne({
          _id: component.referenceMediaId,
          owner: draft.owner,
          private: true,
          deletingAt: null,
        }).session(session || null),
        "Private reference unavailable.",
      );
    }
  const estimate = await loadEstimate(ctx, estimateFor(data), session);
  return { data, estimate };
}
export function proposalMeasurementFields(data, before, after, changedKinds) {
  const map = {
    sleeve: ["sleeveLength", "armhole", "sleeveOpening"],
    sleeveLength: ["sleeveLength", "armhole", "sleeveOpening"],
    neck: ["frontNeckDepth", "frontNeckWidth"],
    back: ["backNeckDepth", "backNeckWidth"],
    fit: ["bust", "underbust", "waist", "hip"],
  };
  const available = new Set([
    ...(MEASUREMENT_FIELDS[data.garment] || []),
    ...(after.measurementFields || []),
  ]);
  const lengthStyle = after.components?.sleeveLength?.lengthStyle;
  if (lengthStyle ? lengthStyle === "sleeveless" : after.components?.sleeve?.sleeveStyle === "sleeveless") {
    available.delete("sleeveLength");
    available.delete("sleeveOpening");
    available.delete("armhole");
  }
  const affected = changedKinds.flatMap((kind) => [
    ...(map[kind] || []),
    ...(before.components?.[kind]?.measurementFields || []),
    ...(after.components?.[kind]?.measurementFields || []),
  ]);
  return [
    ...new Set([...(data.measurements?.reconfirmFields || []), ...affected]),
  ].filter((field) => available.has(field) && measurementKeys.includes(field));
}
export function proposalRoutes(app, ctx, auth) {
  const { models } = ctx;
  const writes = rateLimitFor(ctx, "proposal-write", {
    windowMs: 60 * 60 * 1000,
    limit: 50,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ctx.limitHandler,
  });
  app.get("/api/support/:id/proposals", auth, async (req, res) => {
    const ticket = await authorizedTicket(ctx, req, idOf(req));
    const q = pageQuery(req.query);
    const [items, total, draft] = await Promise.all([
      models.SupportProposal.find({ ticketId: ticket._id })
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.SupportProposal.countDocuments({ ticketId: ticket._id }),
      relatedDraft(ctx, ticket),
    ]);
    let context = null;
    if (draft) {
      let currentEstimate = null,
        estimateError = "";
      try {
        currentEstimate = await loadEstimate(ctx, estimateFor(draft.data));
      } catch (error) {
        if ((error.status && error.status < 500) || error.name === "ZodError")
          estimateError =
            "Save a complete, available design configuration before requesting a proposal.";
        else throw error;
      }
      context = {
        draftId: draft._id,
        draftRevision: draft.revision,
        ticketRevision: ticket.revision,
        garment: draft.data.garment,
        components: draft.data.configuration?.components || {},
        currentEstimate,
        estimateError,
      };
    }
    res.json({ ...pageResult(items.map(safeProposal), total, q), context });
  });
  app.post("/api/support/:id/proposals", auth, writes, async (req, res) => {
    const body = proposalInput.parse(req.body);
    let replay = false;
    const result = await ctx.transaction(async (session) => {
      const ticket = await authorizedTicket(ctx, req, idOf(req), session);
      await assertStaff(ctx, req, ticket, session);
      const existing = await models.SupportProposal.findOne({
        ticketId: ticket._id,
        staff: req.user._id,
        clientId: body.clientId,
      }).session(session);
      if (existing) {
        replay = true;
        return assertRetry(existing, body);
      }
      checkRevision(ticket, body.revision);
      const draft = requireFound(
        await relatedDraft(ctx, ticket, session),
        "The customer must authorize design context and save an editable cloud draft before a proposal can be made. Submitted orders require a reviewed quote.",
      );
      checkRevision(draft, body.draftRevision);
      const beforeEstimate = await loadEstimate(
        ctx,
        estimateFor(draft.data),
        session,
      );
      const { estimate: afterEstimate } = await proposedDraft(
        ctx,
        draft,
        body.changes,
        session,
      );
      await fenceNewReferences(ctx, draftReferenceIds({ configuration: { components: body.changes } }), {}, session);
      const [proposal] = await models.SupportProposal.create(
        [
          {
            owner: ticket.owner,
            ticketId: ticket._id,
            draftId: draft._id,
            staff: req.user._id,
            clientId: body.clientId,
            requestHash: hashRequest(body),
            baseDraftRevision: draft.revision,
            summary: body.summary,
            pricingImpact: body.pricingImpact,
            measurementImpact: body.measurementImpact,
            changes: body.changes,
            beforeEstimate,
            afterEstimate,
          },
        ],
        { session },
      );
      const changed = await models.SupportTicket.updateOne(
        { _id: ticket._id, revision: body.revision },
        {
          $inc: { revision: 1 },
          $push: {
            timeline: {
              status: ticket.status,
              at: new Date(),
              actor: String(req.user._id),
              note: "A design change was proposed for customer review. No selections have been changed.",
            },
          },
        },
        { session },
      );
      if (!changed.modifiedCount)
        fail(
          409,
          "REVISION_CONFLICT",
          "The assistance request changed. Refresh it.",
        );
      await audit(
        ctx,
        req,
        "support.change_proposed",
        "supportProposal",
        proposal._id,
        session,
        { components: Object.keys(body.changes) },
      );
      await notify(ctx, ticket.owner, "design_proposal", proposal._id, session);
      return proposal;
    });
    res.status(replay ? 200 : 201).json({ data: safeProposal(result) });
  });
  app.post(
    "/api/support/:id/proposals/:proposalId/decision",
    auth,
    writes,
    async (req, res) => {
      const body = z
        .object({
          revision: revisionSchema,
          draftRevision: revisionSchema,
          decision: z.enum(["accept", "decline"]),
        })
        .strict()
        .parse(req.body);
      const result = await ctx.transaction(async (session) => {
        const ticket = await authorizedTicket(ctx, req, idOf(req), session);
        if (!sameId(ticket.owner, req.user._id))
          fail(
            403,
            "FORBIDDEN",
            "Only the customer can accept a proposed design change.",
          );
        const proposal = requireFound(
          await models.SupportProposal.findOne({
            _id: objectId.parse(req.params.proposalId),
            ticketId: ticket._id,
            owner: req.user._id,
          }).session(session),
        );
        const status = body.decision === "accept" ? "accepted" : "declined";
        if (proposal.status === status) return proposal;
        checkRevision(proposal, body.revision);
        if (proposal.status !== "pending")
          fail(
            409,
            "PROPOSAL_UNAVAILABLE",
            "This proposal is no longer awaiting a decision.",
          );
        let acceptedDraftRevision;
        if (body.decision === "accept") {
          const draft = requireFound(
            await relatedDraft(ctx, ticket, session),
            "The editable draft is unavailable. Submitted orders require a new reviewed quote.",
          );
          checkRevision(draft, body.draftRevision);
          if (
            draft.revision !== proposal.baseDraftRevision ||
            !sameId(draft._id, proposal.draftId)
          )
            fail(
              409,
              "DRAFT_CHANGED",
              "Your draft changed after this proposal. Ask the tailor to review it again before accepting.",
            );
          const beforeEstimate = await loadEstimate(
            ctx,
            estimateFor(draft.data),
            session,
          );
          const { data, estimate } = await proposedDraft(
            ctx,
            draft,
            proposal.changes,
            session,
          );
          if (
            estimate.configurationVersion !==
            proposal.afterEstimate.configurationVersion
          )
            fail(
              409,
              "PROPOSAL_PRICE_CHANGED",
              "Pricing or design availability changed. A fresh proposal is required before acceptance.",
            );
          data.measurements = {
            ...data.measurements,
            reconfirmFields: proposalMeasurementFields(
              data,
              beforeEstimate,
              estimate,
              Object.keys(proposal.changes),
            ),
          };
          data.estimateVersion = estimate.configurationVersion;
          await fenceNewReferences(ctx, draftReferenceIds(data), draftReferenceIds(draft.data), session);
          const updated = await models.Draft.findOneAndUpdate(
            {
              _id: draft._id,
              owner: req.user._id,
              status: "draft",
              revision: body.draftRevision,
            },
            { $set: { data }, $inc: { revision: 1 } },
            { session, returnDocument: "after" },
          );
          if (!updated)
            fail(
              409,
              "REVISION_CONFLICT",
              "Your draft changed in another tab. Refresh it before accepting.",
            );
          acceptedDraftRevision = updated.revision;
          await models.SupportProposal.updateMany(
            {
              draftId: draft._id,
              status: "pending",
              _id: { $ne: proposal._id },
            },
            { $set: { status: "superseded" }, $inc: { revision: 1 } },
            { session },
          );
          await audit(
            ctx,
            req,
            "draft.support_change_accepted",
            "draft",
            draft._id,
            session,
            {
              proposalId: String(proposal._id),
              components: Object.keys(proposal.changes),
            },
          );
        }
        const updated = await models.SupportProposal.findOneAndUpdate(
          { _id: proposal._id, revision: body.revision, status: "pending" },
          {
            $set: {
              status,
              decidedAt: new Date(),
              decidedBy: req.user._id,
              ...(acceptedDraftRevision !== undefined
                ? { acceptedDraftRevision }
                : {}),
            },
            $inc: { revision: 1 },
          },
          { session, returnDocument: "after" },
        );
        if (!updated)
          fail(409, "REVISION_CONFLICT", "The proposal changed. Refresh it.");
        await audit(
          ctx,
          req,
          "support.proposal_" + status,
          "supportProposal",
          proposal._id,
          session,
        );
        return updated;
      });
      res.json({ data: safeProposal(result) });
    },
  );
}
