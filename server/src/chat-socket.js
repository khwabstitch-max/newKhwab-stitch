import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { tokenService } from "./auth.js";
import { hashGuestToken } from "./chat-models.js";

let ioInstance = null;
const socketRateLimits = new Map();

function checkSocketLimit(socketId, maxEvents = 40, windowMs = 10000) {
  const now = Date.now();
  let entry = socketRateLimits.get(socketId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    socketRateLimits.set(socketId, entry);
    return true;
  }
  entry.count++;
  return entry.count <= maxEvents;
}

function isValidCustomerId(id) {
  return typeof id === "string" && /^cust_[a-zA-Z0-9_-]{4,40}$/.test(id);
}

export function getChatIo() {
  return ioInstance;
}

export async function authorizeAdminSocket(models, tokens, token) {
  const claims = tokens.verify(token);
  const user = await models.User.findById(claims.sub);
  if (!user || user.disabled || user.role !== "admin" || (user.authVersion ?? 0) !== claims.version)
    throw new Error("UNAUTHORIZED");
  return user;
}

async function refreshAdminSockets() {
  if (!ioInstance) return;
  await Promise.all([...ioInstance.sockets.sockets.values()].map(async socket => {
    if (socket.data.user?.role !== "admin") return;
    try { await socket.data.revalidate(); }
    catch { socket.disconnect(true); }
  }));
}

export function initChatSocket(httpServer, ctx) {
  const { config, models, logger } = ctx;
  const tokens = tokenService(config);

  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || config.origins.includes(origin)) {
          callback(null, true);
        } else if (
          config.NODE_ENV !== "production" &&
          /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin)
        ) {
          callback(null, true);
        } else {
          callback(new Error("Origin not allowed"));
        }
      },
      methods: ["GET", "POST"],
      credentials: false,
    },
    pingTimeout: 20000,
    pingInterval: 15000,
  });

  ioInstance = io;

  // Authenticate socket connections: Admin JWT or Customer Guest Token
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      const token = auth.token || socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");
      const guestToken = auth.guestToken || socket.handshake.headers["x-guest-token"];
      const requestedCustomerId = auth.customerId;

      // 1. Try admin authentication first
      if (token) {
        try {
          const user = await authorizeAdminSocket(models, tokens, token);
          if (user) {
            socket.data.revalidate = () => authorizeAdminSocket(models, tokens, token);
            socket.data.expiresAt = jwt.decode(token).exp * 1000;
            socket.data.user = {
              role: "admin",
              id: String(user._id),
              name: user.name || "Khwab Stitch Atelier",
            };
            return next();
          }
        } catch {
          // Token invalid, fall through
        }
      }

      // 2. Try guest customer authentication
      if (guestToken) {
        if (typeof guestToken !== "string" || guestToken.length > 128 ||
            (requestedCustomerId && !isValidCustomerId(requestedCustomerId)))
          return next(new Error("UNAUTHORIZED"));
        const hash = hashGuestToken(guestToken);
        const query = { guestTokenHash: hash };
        if (requestedCustomerId) {
          query.customerId = requestedCustomerId;
        }
        const customer = await models.ChatCustomer.findOne(query);

        if (customer) {
          socket.data.user = {
            role: "customer",
            customerId: customer.customerId,
            name: customer.displayName || "Customer",
          };
          return next();
        }
      }

      return next(new Error("UNAUTHORIZED"));
    } catch (err) {
      logger.error({ errorName: err.name }, "Chat socket authentication error");
      return next(new Error("AUTHENTICATION_FAILED"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    let expiryTimer;
    if (user.role === "admin") {
      expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiresAt - Date.now()));
      expiryTimer.unref?.();
      socket.use(async (_packet, next) => {
        try { await socket.data.revalidate(); next(); }
        catch { socket.disconnect(true); next(new Error("UNAUTHORIZED")); }
      });
    }

    if (user.role === "admin") {
      // Admin joins the general inbox notifications room
      socket.join("admin:inbox");
      logger.info({ adminId: user.id }, "Admin connected to chat socket");

      // Admin joins a specific customer conversation room
      socket.on("admin_join_conversation", async (payload) => {
        if (!checkSocketLimit(socket.id)) return;
        const customerId = payload?.customerId;
        if (!isValidCustomerId(customerId)) return;
        socket.join(`conversation:${customerId}`);
        socket.to(`conversation:${customerId}`).emit("user_online", {
          role: "admin",
          timestamp: new Date().toISOString(),
        });
      });

      // Admin leaves a conversation room
      socket.on("admin_leave_conversation", (payload) => {
        const customerId = payload?.customerId;
        if (!isValidCustomerId(customerId)) return;
        socket.leave(`conversation:${customerId}`);
      });
    } else if (user.role === "customer") {
      // Customer can ONLY join their own room
      const customerRoom = `conversation:${user.customerId}`;
      socket.join(customerRoom);
      logger.info({ customerId: user.customerId }, "Customer connected to chat socket");

      // Broadcast customer online to room (received by admins viewing this chat)
      socket.to(customerRoom).emit("user_online", {
        role: "customer",
        customerId: user.customerId,
        timestamp: new Date().toISOString(),
      });

      // Update customer last seen timestamp in DB
      models.ChatCustomer.updateOne(
        { customerId: user.customerId },
        { lastSeenAt: new Date() },
      ).catch(() => {});
    }

    // Typing indicators (scoped strictly to room with rate limiting and payload validation)
    socket.on("typing_start", (payload) => {
      if (!checkSocketLimit(socket.id)) return;
      const targetCustomerId = user.role === "customer" ? user.customerId : payload?.customerId;
      if (!isValidCustomerId(targetCustomerId)) return;
      socket.to(`conversation:${targetCustomerId}`).emit("typing_start", {
        senderType: user.role,
        customerId: targetCustomerId,
      });
    });

    socket.on("typing_stop", (payload) => {
      if (!checkSocketLimit(socket.id)) return;
      const targetCustomerId = user.role === "customer" ? user.customerId : payload?.customerId;
      if (!isValidCustomerId(targetCustomerId)) return;
      socket.to(`conversation:${targetCustomerId}`).emit("typing_stop", {
        senderType: user.role,
        customerId: targetCustomerId,
      });
    });

    // Real-time message read acknowledgement
    socket.on("mark_read", async (payload) => {
      if (!checkSocketLimit(socket.id)) return;
      const targetCustomerId = user.role === "customer" ? user.customerId : payload?.customerId;
      if (!isValidCustomerId(targetCustomerId)) return;

      try {
        const conversation = await models.ChatConversation.findOne({ customerId: targetCustomerId });
        if (!conversation) return;

        const now = new Date();
        if (user.role === "customer") {
          conversation.unreadCountCustomer = 0;
          await conversation.save();
          await models.ChatMessage.updateMany(
            { conversationId: conversation._id, senderType: "admin", deliveryStatus: { $ne: "read" } },
            { deliveryStatus: "read", readAt: now },
          );
        } else if (user.role === "admin") {
          conversation.unreadCountAdmin = 0;
          await conversation.save();
          await models.ChatMessage.updateMany(
            { conversationId: conversation._id, senderType: "customer", deliveryStatus: { $ne: "read" } },
            { deliveryStatus: "read", readAt: now },
          );
        }

        io.to(`conversation:${targetCustomerId}`).emit("messages_read", {
          readerRole: user.role,
          customerId: targetCustomerId,
          readAt: now.toISOString(),
        });
      } catch (err) {
        logger.error({ errorName: err.name }, "Failed to mark messages read on socket");
      }
    });

    socket.on("disconnect", () => {
      clearTimeout(expiryTimer);
      socketRateLimits.delete(socket.id);
      if (user.role === "customer") {
        io.to(`conversation:${user.customerId}`).emit("user_offline", {
          role: "customer",
          customerId: user.customerId,
          timestamp: new Date().toISOString(),
        });
      } else if (user.role === "admin") {
        io.to("admin:inbox").emit("user_offline", {
          role: "admin",
          adminId: user.id,
          timestamp: new Date().toISOString(),
        });
      }
    });
  });

  return io;
}

export async function broadcastChatMessage(message, conversation) {
  if (!ioInstance) return;
  await refreshAdminSockets();
  const customerId = message.customerId;
  const room = `conversation:${customerId}`;

  // Broadcast to customer and any admin who joined this conversation room
  ioInstance.to(room).to("admin:inbox").emit("new_message", {
    message,
    conversation: {
      _id: conversation._id,
      customerId: conversation.customerId,
      status: conversation.status,
      unreadCountAdmin: conversation.unreadCountAdmin,
      unreadCountCustomer: conversation.unreadCountCustomer,
      lastMessageAt: conversation.lastMessageAt,
    },
  });

  // Keep admin inbox conversation list refreshed in real time
  ioInstance.to("admin:inbox").emit("inbox_update", {
    customerId,
    lastMessage: message,
    unreadCountAdmin: conversation.unreadCountAdmin,
  });


}

export async function broadcastConversationStatus(conversation) {
  if (!ioInstance) return;
  await refreshAdminSockets();
  const customerId = conversation.customerId;
  const eventName = conversation.status === "closed" ? "conversation_closed" : "conversation_reopened";

  ioInstance.to(`conversation:${customerId}`).emit(eventName, {
    customerId,
    status: conversation.status,
  });

  ioInstance.to("admin:inbox").emit("conversation_status_change", {
    customerId,
    status: conversation.status,
  });
}
