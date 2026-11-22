import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { AppError, fail } from "./errors.js";
import {
  generateGuestCredentials,
  hashGuestToken,
  DEFAULT_AUTO_GREETING,
  DEFAULT_CUSTOMER_PROMPTS,
} from "./chat-models.js";
import { broadcastChatMessage } from "./chat-socket.js";

export function parseCookies(req) {
  const list = {};
  const rc = req.headers?.cookie;
  if (!rc) return list;
  for (const cookie of rc.split(";")) {
    const parts = cookie.split("=");
    const key = parts[0]?.trim();
    if (key) {
      list[key] = decodeURIComponent(parts.slice(1).join("=").trim());
    }
  }
  return list;
}

export function chatGuestAuth(models) {
  return async (req, res, next) => {
    try {
      const cookies = parseCookies(req);
      const headerToken = cookies.khwab_guest_token || req.get("x-guest-token") || req.get("authorization")?.replace(/^Bearer\s+/i, "");
      const headerCustomerId = req.get("x-customer-id") || req.query.customerId;

      if (!headerToken) {
        fail(401, "GUEST_UNAUTHORIZED", "Guest session required to access chat.");
      }

      const tokenHash = hashGuestToken(headerToken);
      const query = { guestTokenHash: tokenHash };
      if (headerCustomerId) {
        query.customerId = headerCustomerId;
      }

      const customer = await models.ChatCustomer.findOne(query);
      if (!customer) {
        fail(401, "GUEST_SESSION_EXPIRED", "Chat session expired or invalid. Please refresh.");
      }

      req.chatCustomer = customer;
      res.set("Cache-Control", "private, no-store");
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function chatRoutes(app, ctx, limits = {}) {
  const { models, images, config } = ctx;
  const guestAuth = chatGuestAuth(models);
  const noop = (_req, _res, next) => next();
  const chatLimit = limits.chatLimit || noop;
  const uploadLimit = limits.uploadLimit || noop;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: (config.SERVERLESS ? 3 : 5) * 1024 * 1024, files: 1 },
  }).single("file");

  // 1. Initialize or resume anonymous guest customer session
  app.post("/api/chat/guest", async (req, res, next) => {
    try {
      const schema = z.object({
        displayName: z.string().trim().max(60).optional(),
        customerId: z.string().trim().max(40).optional(),
        guestToken: z.string().trim().max(128).optional(),
      });

      const parsed = schema.safeParse(req.body || {});
      const { displayName, customerId, guestToken } = parsed.success ? parsed.data : {};

      // If existing credentials supplied, verify them
      if (customerId && guestToken) {
        const hash = hashGuestToken(guestToken);
        const existing = await models.ChatCustomer.findOne({
          customerId,
          guestTokenHash: hash,
        });

        if (existing) {
          if (displayName && displayName !== existing.displayName) {
            existing.displayName = displayName;
          }
          existing.lastSeenAt = new Date();
          await existing.save();

          // Ensure conversation exists
          let conversation = await models.ChatConversation.findOne({ customerId: existing.customerId });
          if (!conversation) {
            conversation = await models.ChatConversation.create({
              customerId: existing.customerId,
              status: "active",
            });
          }

          return res.json({
            data: {
              customerId: existing.customerId,
              guestToken,
              displayName: existing.displayName,
              conversationId: conversation._id,
            },
          });
        }
      }

      // Generate new anonymous credentials
      const creds = generateGuestCredentials();
      const sanitizedName = displayName ? displayName.slice(0, 60) : "";

      const customer = await models.ChatCustomer.create({
        customerId: creds.customerId,
        displayName: sanitizedName,
        guestTokenHash: creds.guestTokenHash,
        lastSeenAt: new Date(),
      });

      const conversation = await models.ChatConversation.create({
        customerId: customer.customerId,
        status: "active",
      });

      const isProd = config?.NODE_ENV === "production";
      if (typeof res.cookie === "function") {
        res.cookie("khwab_guest_token", creds.guestToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: "lax",
          maxAge: 90 * 24 * 60 * 60 * 1000,
          path: "/api/chat",
        });
      }

      res.status(201).json({
        data: {
          customerId: customer.customerId,
          guestToken: creds.guestToken,
          displayName: customer.displayName,
          conversationId: conversation._id,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 1b. Public endpoint to fetch customer question prompts
  app.get("/api/chat/prompts", async (req, res, next) => {
    try {
      const settings = await models.SiteSettings.findOne({ key: "main" }).lean();
      const prompts = settings?.chatCustomerPrompts?.length
        ? settings.chatCustomerPrompts
        : DEFAULT_CUSTOMER_PROMPTS;
      res.json({ data: { prompts } });
    } catch (err) {
      next(err);
    }
  });

  // 2. Fetch current customer conversation state
  app.get("/api/chat/conversation", guestAuth, async (req, res, next) => {
    try {
      const customer = req.chatCustomer;
      let conversation = await models.ChatConversation.findOne({ customerId: customer.customerId });

      if (!conversation) {
        conversation = await models.ChatConversation.create({
          customerId: customer.customerId,
          status: "active",
        });
      }

      const settings = await models.SiteSettings.findOne({ key: "main" }).lean();
      const customerPrompts = settings?.chatCustomerPrompts?.length
        ? settings.chatCustomerPrompts
        : DEFAULT_CUSTOMER_PROMPTS;

      res.json({
        data: {
          conversation: {
            _id: conversation._id,
            customerId: conversation.customerId,
            status: conversation.status,
            lastMessage: conversation.lastMessage,
            lastMessageAt: conversation.lastMessageAt,
            unreadCountCustomer: conversation.unreadCountCustomer,
            relatedOrderReference: conversation.relatedOrderReference,
          },
          customer: {
            customerId: customer.customerId,
            displayName: customer.displayName,
          },
          customerPrompts,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. Fetch paginated message history for customer
  app.get("/api/chat/messages", guestAuth, async (req, res, next) => {
    try {
      const customer = req.chatCustomer;
      const conversation = await models.ChatConversation.findOne({ customerId: customer.customerId });

      if (!conversation) {
        return res.json({ data: { messages: [], hasMore: false } });
      }

      const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
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

      // Ensure signed URLs for attachments are valid
      const resolved = slice.map((msg) => {
        if (msg.attachment?.filePath && images?.url) {
          try {
            msg.attachment.url = images.url(msg.attachment.filePath, 3600);
          } catch {
            // Keep stored URL as fallback
          }
        }
        return msg;
      });

      res.json({
        data: {
          messages: resolved.reverse(), // Chronological order for client
          hasMore,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. Customer sends a message
  app.post("/api/chat/messages", guestAuth, chatLimit, async (req, res, next) => {
    try {
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
        relatedOrderReference: z.string().trim().max(50).optional(),
      });

      const { clientMessageId, content, attachment, relatedOrderReference } = schema.parse(req.body);

      if (!content && !attachment) {
        fail(400, "MESSAGE_EMPTY", "Message must contain either text or an attachment.");
      }

      const customer = req.chatCustomer;
      let conversation = await models.ChatConversation.findOne({ customerId: customer.customerId });

      if (!conversation) {
        conversation = await models.ChatConversation.create({
          customerId: customer.customerId,
          status: "active",
        });
      }

      // Check for duplicate message (idempotency via clientMessageId)
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
        customerId: customer.customerId,
        clientMessageId,
        senderType: "customer",
        senderId: customer.customerId,
        senderName: customer.displayName || "Customer",
        messageType,
        content,
        attachment: attachment || null,
        deliveryStatus: "delivered", // Reached server & dispatched to admin
        deliveredAt: new Date(),
      });

      // Update conversation state and unread counter for admin
      conversation.lastMessage = {
        content: content || (messageType === "image" ? "Photo attachment" : ""),
        senderType: "customer",
        messageType,
        createdAt: message.createdAt,
      };
      conversation.lastMessageAt = message.createdAt;
      conversation.unreadCountAdmin = (conversation.unreadCountAdmin || 0) + 1;
      conversation.status = "active"; // Customer message reopens closed chat
      if (relatedOrderReference) {
        conversation.relatedOrderReference = relatedOrderReference;
      }
      await conversation.save();

      // Broadcast in real time
      broadcastChatMessage(message.toObject(), conversation.toObject());

      // If this is the customer's very first message in the conversation, trigger auto-greeting if enabled
      let autoGreeting = null;
      const priorMessagesCount = await models.ChatMessage.countDocuments({
        conversationId: conversation._id,
        _id: { $ne: message._id },
      });

      if (priorMessagesCount === 0) {
        const settings = await models.SiteSettings.findOne({ key: "main" }).lean();
        const greetingConfig = settings?.chatAutoGreeting;
        const isEnabled = greetingConfig?.enabled !== false;
        const greetingText =
          (greetingConfig?.message && greetingConfig.message.trim()) ||
          DEFAULT_AUTO_GREETING.message;

        if (isEnabled && greetingText) {
          autoGreeting = await models.ChatMessage.create({
            conversationId: conversation._id,
            customerId: customer.customerId,
            clientMessageId: `greeting_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            senderType: "admin",
            senderId: "khwabstitch-atelier",
            senderName: "KhwabStitch Atelier",
            messageType: "text",
            content: greetingText,
            deliveryStatus: "delivered",
            deliveredAt: new Date(),
          });

          conversation.lastMessage = {
            content: greetingText,
            senderType: "admin",
            messageType: "text",
            createdAt: autoGreeting.createdAt,
          };
          conversation.lastMessageAt = autoGreeting.createdAt;
          conversation.unreadCountCustomer = (conversation.unreadCountCustomer || 0) + 1;
          await conversation.save();

          // Broadcast greeting to customer and admin
          setTimeout(() => {
            broadcastChatMessage(autoGreeting.toObject(), conversation.toObject());
          }, 300);
        }
      }

      res.status(201).json({
        data: {
          message,
          autoGreeting: autoGreeting ? autoGreeting.toObject() : null,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 5. Upload image for chat attachment
  app.post("/api/chat/upload", guestAuth, uploadLimit, (req, res, next) => {
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

        const customer = req.chatCustomer;
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

        // Upload to ImageKit
        const privatePolicy = config.IMAGEKIT_PRIVATE_POLICY_VERIFIED === "true";
        let uploadResult;

        try {
          uploadResult = await images.upload(buffer, {
            private: privatePolicy,
            purpose: "chat",
            owner: customer.customerId,
            mime: "image/webp",
          });
        } catch (uploadErr) {
          // If private media unverified, retry as standard upload
          if (uploadErr.code === "PRIVATE_MEDIA_UNVERIFIED") {
            uploadResult = await images.upload(buffer, {
              private: false,
              purpose: "chat",
              owner: customer.customerId,
              mime: "image/webp",
            });
          } else {
            throw uploadErr;
          }
        }

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

  // 6. Mark messages as read by customer
  app.patch("/api/chat/read", guestAuth, async (req, res, next) => {
    try {
      const customer = req.chatCustomer;
      const conversation = await models.ChatConversation.findOne({ customerId: customer.customerId });

      if (conversation) {
        conversation.unreadCountCustomer = 0;
        await conversation.save();

        await models.ChatMessage.updateMany(
          { conversationId: conversation._id, senderType: "admin", deliveryStatus: { $ne: "read" } },
          { deliveryStatus: "read", readAt: new Date() },
        );
      }

      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  // 7. Update guest customer display name
  app.patch("/api/chat/profile", guestAuth, async (req, res, next) => {
    try {
      const schema = z.object({
        displayName: z.string().trim().max(60),
      });

      const { displayName } = schema.parse(req.body);
      const customer = req.chatCustomer;
      customer.displayName = displayName;
      await customer.save();

      res.json({ data: { displayName: customer.displayName } });
    } catch (err) {
      next(err);
    }
  });

  // 8. Download chat transcript for verified customer
  app.get("/api/chat/transcript", guestAuth, async (req, res, next) => {
    try {
      const customer = req.chatCustomer;
      const conversation = await models.ChatConversation.findOne({ customerId: customer.customerId });

      if (!conversation) {
        fail(404, "NOT_FOUND", "No conversation history found.");
      }

      const messages = await models.ChatMessage.find({ conversationId: conversation._id })
        .sort({ createdAt: 1 })
        .lean();

      let transcript = `============================================================\n`;
      transcript += `KHWABSTITCH ATELIER - CONVERSATION TRANSCRIPT\n`;
      transcript += `Customer: ${customer.displayName || "Valued Client"} (${customer.customerId})\n`;
      if (conversation.relatedOrderReference) {
        transcript += `Related Order: ${conversation.relatedOrderReference}\n`;
      }
      transcript += `Export Date: ${new Date().toUTCString()}\n`;
      transcript += `Total Messages: ${messages.length}\n`;
      transcript += `============================================================\n\n`;

      for (const msg of messages) {
        const time = new Date(msg.createdAt).toISOString().replace("T", " ").replace(/\..+/, " UTC");
        const sender = msg.senderType === "customer" ? (customer.displayName || "Customer") : (msg.senderName || "KhwabStitch Atelier");
        let line = `[${time}] ${sender}:\n`;
        if (msg.content) {
          line += `  ${msg.content}\n`;
        }
        if (msg.attachment?.url) {
          line += `  [Attachment: ${msg.attachment.mime || "image"} - ${msg.attachment.filePath || "Photo"}]\n`;
        }
        transcript += `${line}\n`;
      }

      transcript += `============================================================\n`;
      transcript += `KhwabStitch Bespoke Atelier - Confidential Conversation\n`;
      transcript += `============================================================\n`;

      const safeCustomerId = customer.customerId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `khwabstitch-transcript-${safeCustomerId}.txt`;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(transcript);
    } catch (err) {
      next(err);
    }
  });
}
