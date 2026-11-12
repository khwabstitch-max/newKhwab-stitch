import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rateLimitFor } from "./rate-limits.js";
import { objectId, revisionSchema } from "./domain.js";
import { fail, requireFound } from "./errors.js";
import {
  idOf,
  sameId,
  plain,
  pageQuery,
  pageResult,
  pinMedia,
  audit,
} from "./route-utils.js";
import { mediaUrl } from "./media-storage.js";
import {
  hashRequest,
  revised,
  assertAdmin,
  notify,
} from "./extension-utils.js";
import {
  ticketInput,
  messageInput,
  ticketStatusInput,
  ticketTransitions,
  responseDeadline,
  assertRetry,
} from "./support-domain.js";

const safeTicket = (doc) => {
  const { requestHash: _hash, clientId: _client, ...safe } = plain(doc);
  return { ...safe, context: safe.context || {} };
};
const safeMessage = (doc) => {
  const { requestHash: _hash, ...safe } = plain(doc);
  return safe;
};
export async function authorizedConversation(ctx, req, id, session) {
  const conversation = requireFound(
    await ctx.models.Conversation.findById(objectId.parse(String(id))).session(
      session || null,
    ),
    "Conversation not found.",
  );
  if (req.user.role === "admin") return conversation;
  const uid = req.user._id;
  if (conversation.kind === "assignment") {
    const [job, worker] = await Promise.all([
      ctx.models.WorkAssignment.findOne({
        _id: conversation.contextId,
        worker: uid,
        active: true,
      }).session(session || null),
      ctx.models.WorkerProfile.findOne({ owner: uid, active: true }).session(
        session || null,
      ),
    ]);
    if (job && worker) return conversation;
  } else if (sameId(conversation.owner, uid)) return conversation;
  else if (conversation.kind === "support") {
    const [ticket, worker] = await Promise.all([
      ctx.models.SupportTicket.findOne({
        _id: conversation.contextId,
        assignedTo: uid,
      }).session(session || null),
      ctx.models.WorkerProfile.findOne({
        owner: uid,
        active: true,
        assistancePermission: true,
      }).session(session || null),
    ]);
    if (ticket && worker) return conversation;
  }
  fail(404, "NOT_FOUND", "Conversation not found.");
}
export async function authorizedTicket(ctx, req, id, session) {
  const ticket = requireFound(
    await ctx.models.SupportTicket.findById(objectId.parse(String(id))).session(
      session || null,
    ),
  );
  if (req.user.role === "admin" || sameId(ticket.owner, req.user._id))
    return ticket;
  if (
    sameId(ticket.assignedTo, req.user._id) &&
    (await ctx.models.WorkerProfile.exists({
      owner: req.user._id,
      active: true,
      assistancePermission: true,
    }).session(session || null))
  )
    return ticket;
  fail(404, "NOT_FOUND", "Support request not found.");
}
export function supportRoutes(app, ctx, auth) {
  const { models } = ctx;
  const writes = rateLimitFor(ctx, "support-write", {
    windowMs: 15 * 60 * 1000,
    limit: 80,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ctx.limitHandler,
  });
  app.get("/api/worker/assistance", auth, async (req, res) => {
    requireFound(
      await models.WorkerProfile.findOne({
        owner: req.user._id,
        active: true,
        assistancePermission: true,
      }),
      "Master-tailor assistance access is required.",
    );
    const q = pageQuery(req.query, { status: z.string().max(40).optional() });
    const filter = {
      assignedTo: req.user._id,
      ...(q.status ? { status: q.status } : {}),
    };
    const [items, total] = await Promise.all([
      models.SupportTicket.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.SupportTicket.countDocuments(filter),
    ]);
    res.json(pageResult(items.map(safeTicket), total, q));
  });
  app.get("/api/support", auth, async (req, res) => {
    const q = pageQuery(req.query, {
      status: z.string().max(40).optional(),
      kind: z.enum(["assistance", "complaint"]).optional(),
    });
    const filter = {
      owner: req.user._id,
      ...(q.status ? { status: q.status } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
    };
    const [items, total] = await Promise.all([
      models.SupportTicket.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.SupportTicket.countDocuments(filter),
    ]);
    res.json(pageResult(items.map(safeTicket), total, q));
  });
  app.post("/api/support", auth, writes, async (req, res) => {
    const body = ticketInput.parse(req.body);
    let replay = false;
    const result = await ctx.transaction(async (session) => {
      const existing = await models.SupportTicket.findOne({
        owner: req.user._id,
        clientId: body.clientId,
      }).session(session);
      if (existing) {
        replay = true;
        return assertRetry(existing, body);
      }
      if (body.orderId)
        requireFound(
          await models.Order.findOne({
            _id: body.orderId,
            owner: req.user._id,
          }).session(session),
          "Request not found.",
        );
      if (body.draftId && /^[a-f\d]{24}$/i.test(body.draftId))
        requireFound(
          await models.Draft.findOne({
            _id: body.draftId,
            owner: req.user._id,
          }).session(session),
          "Draft not found.",
        );
      await pinMedia(ctx, body.attachmentIds, session, {
        owner: req.user._id,
        private: true,
        purposes: ["reference", "measurement"],
      });
      const settings = await models.SiteSettings.findOne({
        key: "main",
      }).session(session);
      const [ticket] = await models.SupportTicket.create(
        [
          {
            ...body,
            owner: req.user._id,
            ticketNumber: "KS-H-" + randomUUID().slice(0, 12).toUpperCase(),
            requestHash: hashRequest(body),
            responseDueAt: responseDeadline(new Date(), settings?.support),
            timeline: [
              {
                status: "open",
                at: new Date(),
                actor: String(req.user._id),
                note: "Request received. This is an automated receipt; a human response and resolution are separate steps.",
              },
            ],
          },
        ],
        { session },
      );
      const [conversation] = await models.Conversation.create(
        [{ owner: req.user._id, kind: "support", contextId: ticket._id }],
        { session },
      );
      ticket.conversationId = conversation._id;
      await ticket.save({ session });
      await audit(
        ctx,
        req,
        "support.created",
        "supportTicket",
        ticket._id,
        session,
        { kind: body.kind, contextShared: body.contextShared },
      );
      return ticket;
    });
    res.status(replay ? 200 : 201).json({ data: safeTicket(result) });
  });
  app.get("/api/support/:id", auth, async (req, res) =>
    res.json({ data: safeTicket(await authorizedTicket(ctx, req, idOf(req))) }),
  );
  app.patch("/api/support/:id/status", auth, writes, async (req, res) => {
    const body = ticketStatusInput.parse(req.body);
    const result = await ctx.transaction(async (session) => {
      const ticket = await authorizedTicket(ctx, req, idOf(req), session);
      if (req.user.role !== "admin") {
        if (
          !sameId(ticket.owner, req.user._id) ||
          !["resolved", "closed"].includes(ticket.status) ||
          body.status !== "open"
        )
          fail(
            403,
            "FORBIDDEN",
            "Only an administrator can manage support status. You may reopen a resolved request.",
          );
      }
      if (!ticketTransitions[ticket.status]?.includes(body.status))
        fail(
          409,
          "INVALID_TRANSITION",
          "This support status transition is unavailable.",
        );
      if (["resolved", "closed"].includes(body.status) && !body.note)
        fail(
          400,
          "RESOLUTION_REQUIRED",
          "Describe the resolution before closing a request.",
        );
      const updated = await revised(
        ctx,
        req,
        models.SupportTicket,
        ticket,
        body.revision,
        {
          status: body.status,
          ...(["resolved", "closed"].includes(body.status)
            ? { resolution: body.note }
            : {}),
        },
        "support.status_updated",
        session,
        {
          $push: {
            timeline: {
              status: body.status,
              note: body.note,
              at: new Date(),
              actor: String(req.user._id),
            },
          },
        },
      );
      await notify(ctx, ticket.owner, "support_update", ticket._id, session);
      return updated;
    });
    res.json({ data: safeTicket(result) });
  });
  app.get("/api/conversations", auth, async (req, res) => {
    const q = pageQuery(req.query);
    let filter;
    if (req.user.role === "admin") filter = {};
    else {
      const worker = await models.WorkerProfile.findOne({
        owner: req.user._id,
        active: true,
      }).lean();
      const jobs = worker
        ? await models.WorkAssignment.find({
            worker: req.user._id,
            active: true,
          })
            .select("conversationId")
            .lean()
        : [];
      const tickets = worker?.assistancePermission
        ? await models.SupportTicket.find({ assignedTo: req.user._id })
            .select("conversationId")
            .lean()
        : [];
      const permittedIds = [...jobs, ...tickets]
        .map((item) => item.conversationId)
        .filter(Boolean);
      filter = {
        $or: [
          { owner: req.user._id, kind: { $ne: "assignment" } },
          { _id: { $in: permittedIds } },
        ],
      };
    }
    const [items, total] = await Promise.all([
      models.Conversation.find(filter)
        .sort({ lastMessageAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.Conversation.countDocuments(filter),
    ]);
    const data = await Promise.all(
      items.map(async (item) => ({
        ...item,
        unread: await models.Message.countDocuments({
          conversation: item._id,
          sender: { $ne: req.user._id },
          ...(item.readAt?.[String(req.user._id)]
            ? {
                createdAt: { $gt: new Date(item.readAt[String(req.user._id)]) },
              }
            : {}),
        }),
      })),
    );
    res.json(pageResult(data, total, q));
  });
  app.get("/api/conversations/:id/messages", auth, async (req, res) => {
    const conversation = await authorizedConversation(ctx, req, idOf(req));
    const q = pageQuery(req.query);
    const [items, total] = await Promise.all([
      models.Message.find({ conversation: conversation._id })
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.Message.countDocuments({ conversation: conversation._id }),
    ]);
    const senders = await models.User.find({
      _id: { $in: [...new Set(items.map((item) => String(item.sender)))] },
    })
      .select("_id name role")
      .lean();
    const senderById = new Map(
      senders.map((sender) => [String(sender._id), sender]),
    );
    res.json(
      pageResult(
        items.map((item) => ({
          ...safeMessage(item),
          senderName:
            senderById.get(String(item.sender))?.name || "Former participant",
          senderRole: senderById.get(String(item.sender))?.role || "former",
        })),
        total,
        q,
      ),
    );
  });
  app.post("/api/conversations/:id/read", auth, async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    const conversation = await authorizedConversation(ctx, req, idOf(req));
    await models.Conversation.updateOne(
      { _id: conversation._id },
      { $set: { ["readAt." + String(req.user._id)]: new Date() } },
    );
    res.json({ data: { read: true } });
  });
  app.post(
    "/api/conversations/:id/messages",
    auth,
    writes,
    async (req, res) => {
      const body = messageInput.parse(req.body);
      let replay = false;
      const result = await ctx.transaction(async (session) => {
        const conversation = await authorizedConversation(
          ctx,
          req,
          idOf(req),
          session,
        );
        const existing = await models.Message.findOne({
          conversation: conversation._id,
          sender: req.user._id,
          clientId: body.clientId,
        }).session(session);
        if (existing) {
          replay = true;
          return assertRetry(existing, body);
        }
        await pinMedia(ctx, body.attachmentIds, session, {
          owner: req.user._id,
          private: true,
          purposes: ["reference", "measurement"],
        });
        const [message] = await models.Message.create(
          [
            {
              ...body,
              conversation: conversation._id,
              sender: req.user._id,
              requestHash: hashRequest(body),
            },
          ],
          { session },
        );
        await models.Conversation.updateOne(
          { _id: conversation._id },
          { $set: { lastMessageAt: new Date() } },
          { session },
        );
        if (
          conversation.kind === "support" &&
          !sameId(conversation.owner, req.user._id)
        )
          await models.SupportTicket.updateOne(
            { _id: conversation.contextId, firstHumanResponseAt: null },
            { $set: { firstHumanResponseAt: new Date() } },
            { session },
          );
        if (!sameId(conversation.owner, req.user._id))
          await notify(
            ctx,
            conversation.owner,
            "new_message",
            conversation._id,
            session,
          );
        await audit(
          ctx,
          req,
          "message.sent",
          "conversation",
          conversation._id,
          session,
        );
        return message;
      });
      res.status(replay ? 200 : 201).json({ data: safeMessage(result) });
    },
  );
  app.get(
    "/api/conversations/:id/attachments/:mediaId",
    auth,
    async (req, res) => {
      const conversation = await authorizedConversation(ctx, req, idOf(req));
      const mediaId = objectId.parse(req.params.mediaId);
      const linkedMessage = await models.Message.exists({
        conversation: conversation._id,
        attachmentIds: mediaId,
      });
      let linkedContext = false;
      if (conversation.kind === "support")
        linkedContext = !!(await models.SupportTicket.exists({
          _id: conversation.contextId,
          attachmentIds: mediaId,
        }));
      else if (conversation.kind === "application")
        linkedContext = !!(await models.WorkerApplication.exists({
          _id: conversation.contextId,
          portfolioMediaIds: mediaId,
        }));
      if (!linkedMessage && !linkedContext)
        fail(404, "NOT_FOUND", "Image not found.");
      const media = requireFound(
        await models.MediaAsset.findOne({
          _id: mediaId,
          private: true,
          deletingAt: null,
        }),
      );
      res.json({
        data: { url: mediaUrl(ctx.images, media, 300), expiresIn: 300 },
      });
    },
  );
  app.get("/api/admin/support", auth, async (req, res) => {
    assertAdmin(req);
    const q = pageQuery(req.query, {
      status: z.string().max(40).optional(),
      kind: z.enum(["assistance", "complaint"]).optional(),
      overdue: z.enum(["true", "false"]).optional(),
      attention: z.enum(["open"]).optional(),
    });
    const filter = {
      ...(q.attention === "open" ? { status: "open" } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.overdue === "true"
        ? {
            responseDueAt: { $lt: new Date() },
            firstHumanResponseAt: null,
            status: { $nin: ["resolved", "closed"] },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      models.SupportTicket.find(filter)
        .sort({ responseDueAt: 1, createdAt: 1, _id: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.SupportTicket.countDocuments(filter),
    ]);
    res.json(pageResult(items.map(safeTicket), total, q));
  });
  app.get("/api/admin/support/alerts", auth, async (req, res) => {
    assertAdmin(req);
    z.object({}).strict().parse(req.query);
    const pending = {
      firstHumanResponseAt: null,
      status: { $nin: ["resolved", "closed"] },
    };
    const now = new Date();
    const hourAhead = new Date(now.getTime() + 3600000);
    const [overdue, dueSoon, items] = await Promise.all([
      models.SupportTicket.countDocuments({
        ...pending,
        responseDueAt: { $lt: now },
      }),
      models.SupportTicket.countDocuments({
        ...pending,
        responseDueAt: { $gte: now, $lte: hourAhead },
      }),
      models.SupportTicket.find({
        ...pending,
        responseDueAt: { $lte: hourAhead },
      })
        .select("_id ticketNumber kind status responseDueAt")
        .sort({ responseDueAt: 1 })
        .limit(50)
        .lean(),
    ]);
    res.json({ data: { overdue, dueSoon, items } });
  });
  app.patch(
    "/api/admin/support/:id/assignment",
    auth,
    writes,
    async (req, res) => {
      assertAdmin(req);
      const body = z
        .object({ revision: revisionSchema, assignedTo: objectId.nullable() })
        .strict()
        .parse(req.body);
      const result = await ctx.transaction(async (session) => {
        const ticket = requireFound(
          await models.SupportTicket.findById(idOf(req)).session(session),
        );
        if (body.assignedTo)
          requireFound(
            await models.WorkerProfile.findOne({
              owner: body.assignedTo,
              active: true,
              assistancePermission: true,
            }).session(session),
            "Choose an authorized active master tailor.",
          );
        const updated = await revised(
          ctx,
          req,
          models.SupportTicket,
          ticket,
          body.revision,
          { assignedTo: body.assignedTo },
          "support.assigned",
          session,
        );
        if (body.assignedTo)
          await notify(
            ctx,
            body.assignedTo,
            "assistance_assigned",
            ticket._id,
            session,
          );
        return updated;
      });
      res.json({ data: safeTicket(result) });
    },
  );
}
