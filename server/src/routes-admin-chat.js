import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { AppError, fail, requireFound } from "./errors.js";
import { broadcastChatMessage, broadcastConversationStatus } from "./chat-socket.js";
import {
  DEFAULT_AUTO_GREETING,
  DEFAULT_QUICK_REPLIES,
  DEFAULT_CUSTOMER_PROMPTS,
} from "./chat-models.js";

export function adminChatRoutes(app, ctx, auth, adminOnly) {
  const { models, images } = ctx;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }).single("file");

  // 1. List conversations with filtering & search
  app.get("/api/admin/chat/conversations", auth, adminOnly, async (req, res, next) => {
    try {
      const { status, search } = req.query;
      const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const skip = (page - 1) * limit;

      const filter = {};
      if (status === "active") filter.status = "active";
      else if (status === "closed") filter.status = "closed";
      else if (status === "unread") filter.unreadCountAdmin = { $gt: 0 };

      if (search && typeof search === "string" && search.trim()) {
        const term = search.trim();
        // Match customerId or find customers whose displayName matches
        const matchingCustomers = await models.ChatCustomer.find({
          $or: [
            { customerId: { $regex: term, $options: "i" } },
            { displayName: { $regex: term, $options: "i" } },
          ],
        }).select("customerId").lean();

        const customerIds = matchingCustomers.map((c) => c.customerId);
        filter.$or = [
          { customerId: { $in: customerIds } },
          { customerId: { $regex: term, $options: "i" } },
          { "lastMessage.content": { $regex: term, $options: "i" } },
        ];
      }

      const [conversations, total, totalUnread] = await Promise.all([
        models.ChatConversation.find(filter)
          .sort({ lastMessageAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        models.ChatConversation.countDocuments(filter),
        models.ChatConversation.countDocuments({ unreadCountAdmin: { $gt: 0 } }),
      ]);

      // Enrich conversations with customer display name
      const customerIds = conversations.map((c) => c.customerId);
      const customers = await models.ChatCustomer.find({
        customerId: { $in: customerIds },
      }).lean();

      const customerMap = new Map(customers.map((c) => [c.customerId, c]));

      // Fallback: If any conversation has empty lastMessage, fetch latest message from ChatMessage
      const emptyLastMsgConvIds = conversations
        .filter((c) => !c.lastMessage?.content && c.lastMessage?.messageType !== "image")
        .map((c) => c._id);

      let latestMsgMap = new Map();
      if (emptyLastMsgConvIds.length > 0) {
        const latestMsgs = await models.ChatMessage.aggregate([
          { $match: { conversationId: { $in: emptyLastMsgConvIds } } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: "$conversationId", latest: { $first: "$$ROOT" } } },
        ]);
        latestMsgMap = new Map(latestMsgs.map((m) => [String(m._id), m.latest]));
      }

      const enriched = conversations.map((conv) => {
        const cust = customerMap.get(conv.customerId);
        let lastMessage = conv.lastMessage;
        let lastMessageAt = conv.lastMessageAt;
        if (!lastMessage?.content && lastMessage?.messageType !== "image") {
          const fallback = latestMsgMap.get(String(conv._id));
          if (fallback) {
            lastMessage = {
              content: fallback.content || (fallback.messageType === "image" ? "Photo attachment" : ""),
              senderType: fallback.senderType,
              messageType: fallback.messageType,
              createdAt: fallback.createdAt,
            };
            if (!lastMessageAt) lastMessageAt = fallback.createdAt;
          }
        }
        return {
          ...conv,
          lastMessage,
          lastMessageAt,
          displayName: cust?.displayName || "",
          notes: cust?.notes || "",
          lastSeenAt: cust?.lastSeenAt || null,
        };
      });

      res.json({
        data: {
          conversations: enriched,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit) || 1,
            totalUnread,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Get single conversation detail
  app.get("/api/admin/chat/conversations/:customerId", auth, adminOnly, async (req, res, next) => {
    try {
      const { customerId } = req.params;
      const conversation = await models.ChatConversation.findOne({ customerId }).lean();
      requireFound(conversation, "Conversation not found.");

      const customer = await models.ChatCustomer.findOne({ customerId }).lean();

      // Check if customer has any order references
      let relatedOrder = null;
      if (conversation.relatedOrderReference) {
        relatedOrder = await models.Order.findOne({
          code: conversation.relatedOrderReference,
        }).select("code status garment totalPaise createdAt").lean();
      }

      const totalMessages = await models.ChatMessage.countDocuments({ conversationId: conversation._id });

      res.json({
        data: {
          conversation,
          customer: {
            customerId,
            displayName: customer?.displayName || "",
            notes: customer?.notes || "",
            createdAt: customer?.createdAt || conversation.createdAt,
            lastSeenAt: customer?.lastSeenAt || null,
            totalMessages,
          },
          relatedOrder,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. Message history for admin view
  app.get("/api/admin/chat/conversations/:customerId/messages", auth, adminOnly, async (req, res, next) => {
    try {
      const { customerId } = req.params;
      const conversation = await models.ChatConversation.findOne({ customerId }).lean();
      requireFound(conversation, "Conversation not found.");

      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const query = { conversationId: conversation._id };

      if (req.query.before) {
        const beforeDate = new Date(req.query.before);
        if (!isNaN(beforeDate.getTime())) {
          query.createdAt = { $lt: beforeDate };
        }
      }

      const messages = await models.ChatMessage.find(query)
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .lean();

      const hasMore = messages.length > limit;
      const slice = hasMore ? messages.slice(0, limit) : messages;

      const resolved = slice.map((msg) => {
        if (msg.attachment?.filePath && images?.url) {
          try {
            msg.attachment.url = images.url(msg.attachment.filePath, 3600);
          } catch {
            // Keep stored URL
          }
        }
        return msg;
      });

      res.json({
        data: {
          messages: resolved.reverse(),
          hasMore,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. Admin sends reply to customer
  app.post("/api/admin/chat/conversations/:customerId/messages", auth, adminOnly, async (req, res, next) => {
    try {
      const { customerId } = req.params;
      const schema = z.object({
        clientMessageId: z.string().trim().min(1).max(80),
        content: z.string().trim().max(2000).optional().default(""),
        attachment: z
          .object({
            fileId: z.string().optional(),
            filePath: z.string().optional(),
            url: z.string().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
            mime: z.string().optional(),
            size: z.number().optional(),
          })
          .nullable()
          .optional(),
      });

      const { clientMessageId, content, attachment } = schema.parse(req.body);

      if (!content && !attachment) {
        fail(400, "MESSAGE_EMPTY", "Reply must contain text or an image.");
      }

      let conversation = await models.ChatConversation.findOne({ customerId });
      if (!conversation) {
        conversation = await models.ChatConversation.create({ customerId, status: "active" });
      }

      // Check deduplication
      const existing = await models.ChatMessage.findOne({
        conversationId: conversation._id,
        clientMessageId,
      });

      if (existing) {
        return res.json({ data: { message: existing } });
      }

      const messageType = attachment ? "image" : "text";

      const message = await models.ChatMessage.create({
        conversationId: conversation._id,
        customerId,
        clientMessageId,
        senderType: "admin",
        senderId: String(req.user._id),
        senderName: req.user.name || "Khwab Stitch Atelier",
        messageType,
        content,
        attachment: attachment || null,
        deliveryStatus: "delivered",
        deliveredAt: new Date(),
      });

      conversation.lastMessage = {
        content: content || (messageType === "image" ? "Photo attachment" : ""),
        senderType: "admin",
        messageType,
        createdAt: message.createdAt,
      };
      conversation.lastMessageAt = message.createdAt;
      conversation.unreadCountCustomer = (conversation.unreadCountCustomer || 0) + 1;
      await conversation.save();

      // Real-time broadcast
      const msgObj = typeof message?.toObject === "function" ? message.toObject() : message;
      const convObj = typeof conversation?.toObject === "function" ? conversation.toObject() : conversation;
      broadcastChatMessage(msgObj, convObj);

      res.status(201).json({ data: { message } });
    } catch (err) {
      next(err);
    }
  });

  // 5. Close or reopen conversation
  app.patch("/api/admin/chat/conversations/:customerId/status", auth, adminOnly, async (req, res, next) => {
    try {
      const { customerId } = req.params;
      const schema = z.object({
        status: z.enum(["active", "closed"]),
      });

      const { status } = schema.parse(req.body);
      const conversation = await models.ChatConversation.findOne({ customerId });
      requireFound(conversation, "Conversation not found.");

      conversation.status = status;
      await conversation.save();

      const convObj = typeof conversation?.toObject === "function" ? conversation.toObject() : conversation;
      broadcastConversationStatus(convObj);

      res.json({ data: { conversation } });
    } catch (err) {
      next(err);
    }
  });

  // 6. Update customer notes
  app.patch("/api/admin/chat/conversations/:customerId/notes", auth, adminOnly, async (req, res, next) => {
    try {
      const { customerId } = req.params;
      const schema = z.object({
        notes: z.string().trim().max(2000),
      });

      const { notes } = schema.parse(req.body);
      const customer = await models.ChatCustomer.findOne({ customerId });
      requireFound(customer, "Customer not found.");

      customer.notes = notes;
      await customer.save();

      res.json({ data: { notes: customer.notes } });
    } catch (err) {
      next(err);
    }
  });

  // 7. Mark conversation read by admin
  app.patch("/api/admin/chat/conversations/:customerId/read", auth, adminOnly, async (req, res, next) => {
    try {
      const { customerId } = req.params;
      const conversation = await models.ChatConversation.findOne({ customerId });

      if (conversation) {
        conversation.unreadCountAdmin = 0;
        await conversation.save();

        await models.ChatMessage.updateMany(
          { conversationId: conversation._id, senderType: "customer", deliveryStatus: { $ne: "read" } },
          { deliveryStatus: "read", readAt: new Date() },
        );
      }

      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  // 8. Admin upload image
  app.post("/api/admin/chat/upload", auth, adminOnly, (req, res, next) => {
    upload(req, res, async (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new AppError(413, "FILE_TOO_LARGE", "Image must be under 5 MiB."));
        }
        return next(err);
      }

      try {
        if (!req.file) {
          fail(400, "FILE_REQUIRED", "Select an image file to upload.");
        }

        let buffer, width, height;

        try {
          const input = sharp(req.file.buffer, {
            limitInputPixels: 24_000_000,
            animated: false,
            failOn: "warning",
          });
          const meta = await input.metadata();

          if (!["jpeg", "png", "webp"].includes(meta.format)) {
            fail(400, "INVALID_FORMAT", "Use a standard JPEG, PNG or WebP image.");
          }

          const processed = await input
            .rotate()
            .resize({
              width: 1920,
              height: 1920,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 85 })
            .toBuffer({ resolveWithObject: true });

          buffer = processed.data;
          width = processed.info.width;
          height = processed.info.height;
        } catch (imageErr) {
          if (imageErr.status) throw imageErr;
          fail(400, "INVALID_IMAGE", "Could not process image file.");
        }

        const uploadResult = await images.upload(buffer, {
          private: false,
          purpose: "chat",
          owner: String(req.user._id),
          mime: "image/webp",
        });

        const signedUrl = images.url(uploadResult.filePath, 3600);

        res.status(201).json({
          data: {
            fileId: uploadResult.fileId,
            filePath: uploadResult.filePath,
            url: signedUrl,
            width,
            height,
            mime: "image/webp",
            size: buffer.length,
          },
        });
      } catch (uploadFail) {
        next(uploadFail);
      }
    });
  });

  // 9. Admin export conversation transcript
  app.get("/api/admin/chat/conversations/:customerId/transcript", auth, adminOnly, async (req, res, next) => {
    try {
      const { customerId } = req.params;
      const conversation = await models.ChatConversation.findOne({ customerId }).lean();
      requireFound(conversation, "Conversation not found.");

      const customer = await models.ChatCustomer.findOne({ customerId }).lean();
      const messages = await models.ChatMessage.find({ conversationId: conversation._id })
        .sort({ createdAt: 1 })
        .lean();

      let transcript = `============================================================\n`;
      transcript += `KHWABSTITCH ATELIER - OFFICIAL CHAT ARCHIVE\n`;
      transcript += `Customer: ${customer?.displayName || "Valued Client"} (${customerId})\n`;
      if (conversation.relatedOrderReference) {
        transcript += `Related Order: ${conversation.relatedOrderReference}\n`;
      }
      transcript += `Export Date: ${new Date().toUTCString()}\n`;
      transcript += `Total Messages: ${messages.length}\n`;
      transcript += `============================================================\n\n`;

      for (const msg of messages) {
        const time = new Date(msg.createdAt).toISOString().replace("T", " ").replace(/\..+/, " UTC");
        const sender = msg.senderType === "customer" ? (customer?.displayName || "Customer") : (msg.senderName || "KhwabStitch Atelier");
        let line = `[${time}] ${sender} (${msg.senderType}):\n`;
        if (msg.content) {
          line += `  ${msg.content}\n`;
        }
        if (msg.attachment?.url) {
          line += `  [Attachment: ${msg.attachment.mime || "image"} - ${msg.attachment.filePath || "Photo"}]\n`;
        }
        transcript += `${line}\n`;
      }

      transcript += `============================================================\n`;
      transcript += `KhwabStitch Bespoke Atelier - Internal Record\n`;
      transcript += `============================================================\n`;

      const safeCustomerId = customerId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `khwabstitch-admin-transcript-${safeCustomerId}.txt`;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(transcript);
    } catch (err) {
      next(err);
    }
  });

  // 10. Get configurable quick replies
  app.get("/api/admin/chat/quick-replies", auth, adminOnly, async (req, res, next) => {
    try {
      const settings = await models.SiteSettings.findOne({ key: "main" }).lean();
      const replies = settings?.chatQuickReplies?.length ? settings.chatQuickReplies : DEFAULT_QUICK_REPLIES;
      res.json({ data: { quickReplies: replies } });
    } catch (err) {
      next(err);
    }
  });

  // 11. Update configurable quick replies
  app.put("/api/admin/chat/quick-replies", auth, adminOnly, async (req, res, next) => {
    try {
      const schema = z.object({
        quickReplies: z.array(z.string().trim().min(1).max(300)).min(1).max(30),
      });

      const { quickReplies } = schema.parse(req.body);
      await models.SiteSettings.updateOne(
        { key: "main" },
        { $set: { chatQuickReplies: quickReplies } },
        { upsert: true },
      );

      res.json({ data: { quickReplies } });
    } catch (err) {
      next(err);
    }
  });

  // 12. Get full chat automation & quick reply settings
  app.get("/api/admin/chat/settings", auth, adminOnly, async (req, res, next) => {
    try {
      const settings = await models.SiteSettings.findOne({ key: "main" }).lean();
      const autoGreeting = {
        enabled: settings?.chatAutoGreeting?.enabled !== false,
        message:
          (settings?.chatAutoGreeting?.message && settings.chatAutoGreeting.message.trim()) ||
          DEFAULT_AUTO_GREETING.message,
      };
      const quickReplies = settings?.chatQuickReplies?.length
        ? settings.chatQuickReplies
        : DEFAULT_QUICK_REPLIES;
      const customerPrompts = settings?.chatCustomerPrompts?.length
        ? settings.chatCustomerPrompts
        : DEFAULT_CUSTOMER_PROMPTS;

      res.json({
        data: {
          autoGreeting,
          quickReplies,
          customerPrompts,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 13. Update full chat automation & quick reply settings
  app.put("/api/admin/chat/settings", auth, adminOnly, async (req, res, next) => {
    try {
      const schema = z.object({
        autoGreeting: z
          .object({
            enabled: z.boolean(),
            message: z.string().trim().min(1).max(1000),
          })
          .optional(),
        quickReplies: z.array(z.string().trim().min(1).max(300)).min(1).max(30).optional(),
        customerPrompts: z.array(z.string().trim().min(1).max(120)).min(1).max(20).optional(),
      });

      const { autoGreeting, quickReplies, customerPrompts } = schema.parse(req.body);
      const updateFields = {};
      if (autoGreeting !== undefined) {
        updateFields.chatAutoGreeting = autoGreeting;
      }
      if (quickReplies !== undefined) {
        updateFields.chatQuickReplies = quickReplies;
      }
      if (customerPrompts !== undefined) {
        updateFields.chatCustomerPrompts = customerPrompts;
      }

      await models.SiteSettings.updateOne(
        { key: "main" },
        { $set: updateFields },
        { upsert: true },
      );

      const refreshed = await models.SiteSettings.findOne({ key: "main" }).lean();
      res.json({
        data: {
          autoGreeting: {
            enabled: refreshed?.chatAutoGreeting?.enabled !== false,
            message:
              (refreshed?.chatAutoGreeting?.message && refreshed.chatAutoGreeting.message.trim()) ||
              DEFAULT_AUTO_GREETING.message,
          },
          quickReplies: refreshed?.chatQuickReplies?.length
            ? refreshed.chatQuickReplies
            : DEFAULT_QUICK_REPLIES,
          customerPrompts: refreshed?.chatCustomerPrompts?.length
            ? refreshed.chatCustomerPrompts
            : DEFAULT_CUSTOMER_PROMPTS,
        },
      });
    } catch (err) {
      next(err);
    }
  });
}
