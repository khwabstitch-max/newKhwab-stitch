import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";

const { Schema } = mongoose;
const oid = Schema.Types.ObjectId;
const opts = { timestamps: true, strict: "throw", versionKey: false };

export function hashGuestToken(rawToken) {
  if (typeof rawToken !== "string" || !rawToken.trim()) return "";
  return createHash("sha256").update(rawToken.trim()).digest("hex");
}

export function verifyGuestToken(rawToken, storedHash) {
  if (!rawToken || !storedHash) return false;
  const computed = hashGuestToken(rawToken);
  if (!computed || computed.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
}

export function generateGuestCredentials() {
  const customerId = "cust_" + randomBytes(8).toString("hex");
  const guestToken = randomBytes(32).toString("hex");
  const guestTokenHash = hashGuestToken(guestToken);
  return { customerId, guestToken, guestTokenHash };
}

export function createChatSchemas() {
  const ChatCustomer = new Schema(
    {
      customerId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        maxlength: 40,
        trim: true,
      },
      displayName: {
        type: String,
        maxlength: 60,
        trim: true,
        default: "",
      },
      guestTokenHash: {
        type: String,
        required: true,
        select: false,
        maxlength: 128,
      },
      lastSeenAt: {
        type: Date,
        default: Date.now,
      },
      notes: {
        type: String,
        maxlength: 2000,
        trim: true,
        default: "",
      },
    },
    opts,
  );

  const ChatConversation = new Schema(
    {
      customerId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        maxlength: 40,
        trim: true,
      },
      status: {
        type: String,
        enum: ["active", "closed"],
        default: "active",
        index: true,
      },
      lastMessage: {
        type: new Schema(
          {
            content: { type: String, maxlength: 2000, default: "" },
            senderType: {
              type: String,
              enum: ["customer", "admin", "system"],
              default: "customer",
            },
            messageType: {
              type: String,
              enum: ["text", "image"],
              default: "text",
            },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
        default: () => ({}),
      },
      lastMessageAt: {
        type: Date,
        default: Date.now,
        index: true,
      },
      unreadCountAdmin: {
        type: Number,
        default: 0,
        min: 0,
      },
      unreadCountCustomer: {
        type: Number,
        default: 0,
        min: 0,
      },
      relatedOrderReference: {
        type: String,
        maxlength: 50,
        trim: true,
        default: "",
      },
    },
    opts,
  );

  const ChatMessage = new Schema(
    {
      conversationId: {
        type: oid,
        ref: "ChatConversation",
        required: true,
        index: true,
      },
      customerId: {
        type: String,
        required: true,
        index: true,
        maxlength: 40,
      },
      clientMessageId: {
        type: String,
        required: true,
        maxlength: 80,
        trim: true,
      },
      senderType: {
        type: String,
        enum: ["customer", "admin", "system"],
        required: true,
      },
      senderId: {
        type: String,
        required: true,
        maxlength: 80,
      },
      senderName: {
        type: String,
        maxlength: 60,
        trim: true,
        default: "",
      },
      messageType: {
        type: String,
        enum: ["text", "image"],
        default: "text",
      },
      content: {
        type: String,
        maxlength: 2000,
        trim: true,
        default: "",
      },
      attachment: {
        type: new Schema(
          {
            fileId: { type: String, default: "" },
            filePath: { type: String, default: "" },
            url: { type: String, default: "" },
            width: { type: Number },
            height: { type: Number },
            mime: { type: String, default: "image/webp" },
            size: { type: Number },
          },
          { _id: false },
        ),
        default: null,
      },
      deliveryStatus: {
        type: String,
        enum: ["sent", "delivered", "read"],
        default: "sent",
        index: true,
      },
      deliveredAt: { type: Date, default: null },
      readAt: { type: Date, default: null },
    },
    opts,
  );

  // Indexes for query performance and deduplication
  ChatMessage.index({ conversationId: 1, createdAt: -1, _id: -1 });
  ChatMessage.index({ conversationId: 1, clientMessageId: 1 }, { unique: true });
  ChatConversation.index({ status: 1, lastMessageAt: -1 });
  ChatCustomer.index({ guestTokenHash: 1 });

  // Provider IDs are immutable primary keys, so ownership lookup needs no new
  // uniqueness migration. Existing untracked uploads are never trusted.
  const ChatAttachment = new Schema({
    _id: { type: String, required: true, maxlength: 256 },
    owner: { type: String, required: true, maxlength: 100 },
    customerId: { type: String, default: "", maxlength: 40 },
    filePath: { type: String, required: true, maxlength: 2000 },
    private: { type: Boolean, required: true, enum: [true] },
    width: Number, height: Number,
    mime: { type: String, required: true, enum: ["image/webp"] },
    size: { type: Number, required: true, min: 0 },
  }, opts);
  return { ChatCustomer, ChatConversation, ChatMessage, ChatAttachment };
}

export const DEFAULT_AUTO_GREETING = {
  enabled: true,
  message:
    "Hello! Welcome to KhwabStitch Atelier. Thank you for reaching out! Please share the design or outfit you would like stitched, and our master craftsman will assist you shortly.",
};

export const DEFAULT_QUICK_REPLIES = [
  "Hello! Welcome to KhwabStitch. How can we help you with your stitching today?",
  "Could you please share the fabric type and your preferred neck and sleeve design?",
  "Our master tailor will inspect your reference and provide an exact quotation.",
  "Your measurements are saved. Would you like standard delivery or express atelier delivery?",
  "Thank you for contacting KhwabStitch Atelier! We are on it.",
];

export const DEFAULT_CUSTOMER_PROMPTS = [
  "Custom Stitching Enquiry",
  "How to provide measurements?",
  "Price estimate for suit / kurti",
  "Turnaround and delivery time",
];
