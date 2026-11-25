import { z } from "zod";
import { fail } from "./errors.js";

// The client may send cached display metadata, but only fileId is authoritative.
export const chatAttachmentInput = z.object({ fileId: z.string().min(1).max(256) }).strip().nullable().optional();
export const chatCustomerIdInput = z.string().regex(/^cust_[a-zA-Z0-9_-]{4,35}$/);
export const chatHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
  before: z.iso.datetime({ offset: true }).optional(),
  customerId: chatCustomerIdInput.optional(),
}).strict();
const metadata = record => ({
  fileId: record._id, filePath: record.filePath, width: record.width,
  height: record.height, mime: record.mime, size: record.size,
});

export function requirePrivateChat(config) {
  if (config.IMAGEKIT_PRIVATE_POLICY_VERIFIED !== "true")
    fail(503, "PRIVATE_MEDIA_UNVERIFIED", "Private image storage has not been verified by the operator.");
}

export async function storeChatAttachment(ctx, buffer, { owner, customerId = "", width, height, log }) {
  requirePrivateChat(ctx.config);
  const stored = await ctx.images.upload(buffer, { private: true, purpose: "chat", owner: owner.split(":")[1], mime: "image/webp" });
  try {
    const url = ctx.images.url(stored.filePath, 300);
    const record = await ctx.models.ChatAttachment.create({
      _id: stored.fileId, owner, customerId, filePath: stored.filePath,
      private: true, width, height, mime: "image/webp", size: buffer.length,
    });
    return { ...metadata(record), url };
  } catch (error) {
    try { await ctx.images.remove(stored.fileId); }
    catch { log?.error({ event: "chat_upload_orphan" }, "Chat upload cleanup requires operator review"); }
    throw error;
  }
}

export async function attachmentForMessage(ctx, supplied, owner, customerId) {
  if (!supplied) return null;
  const record = await ctx.models.ChatAttachment.findOneAndUpdate({
    _id: supplied.fileId, owner, private: true, customerId: { $in: ["", customerId] },
  }, { $set: { customerId } }, { returnDocument: "after" });
  if (!record) fail(400, "INVALID_CHAT_ATTACHMENT", "Upload an image for this conversation before attaching it.");
  return metadata(record);
}

export async function resolveChatMessages(ctx, messages, customerId) {
  const ids = [...new Set(messages.flatMap(message => message.attachment?.fileId ? [message.attachment.fileId] : []))];
  const records = ids.length ? await ctx.models.ChatAttachment.find({ _id: { $in: ids }, customerId, private: true }).lean() : [];
  const byId = new Map(records.map(record => [record._id, record]));
  return messages.map(document => {
    const message = typeof document.toObject === "function" ? document.toObject() : { ...document };
    if (!message.attachment) return message;
    const record = byId.get(message.attachment.fileId);
    // Legacy client-provided paths have no trustworthy provenance. Never sign them.
    message.attachment = record ? { ...metadata(record), url: ctx.images.url(record.filePath, 300) } : null;
    return message;
  });
}

let activeUploads = 0;
export function chatUploadGate(_req, res, next) {
  if (activeUploads >= 2) fail(429, "UPLOAD_BUSY", "Image processing is busy. Please try again shortly.");
  activeUploads++;
  let released = false;
  const release = () => { if (!released) { released = true; activeUploads--; } };
  res.once("finish", release); res.once("close", release); next();
}
