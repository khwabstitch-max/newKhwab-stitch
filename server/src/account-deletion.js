import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { fail } from "./errors.js";
import { emailInput } from "./credentials.js";
import { normalizedEmailMatch } from "./account-security.js";
import { draftMediaIds } from "./routes-drafts.js";
import { cleanupExtensionAccount } from "./extension-cleanup.js";
import { orderPublicMediaPins } from "./reference-integrity.js";
import { releaseMedia } from "./route-utils.js";
import { assertCommerceDeletionAllowed } from "./commerce-service.js";
export async function inspectAccountDeletion(ctx, email) {
  const users = await ctx.models.User.find(
    normalizedEmailMatch(emailInput.parse(email)),
  ).limit(2);
  if (users.length > 1)
    fail(
      409,
      "AMBIGUOUS_ACCOUNT",
      "An operator must resolve duplicate account ownership before deletion.",
    );
  const user = users[0] || null;
  if (!user) return { user: null, activeOrders: 0, privateAssets: 0 };
  const activeOrders = await ctx.models.Order.countDocuments({
    owner: user._id,
    status: { $nin: ["delivered", "cancelled", "rejected"] },
  });
  const privateAssets = await ctx.models.MediaAsset.countDocuments({
    owner: user._id,
    private: true,
  });
  return { user, activeOrders, privateAssets };
}
export async function executeAccountDeletion(ctx, user) {
  if (!(await ctx.models.User.exists({ _id: user._id })))
    return { alreadyComplete: true };
  if (user.role === "admin")
    fail(
      409,
      "ADMIN_DELETION_BLOCKED",
      "Revoke administrator access before deleting an admin account.",
    );
  if (!user.deletionRequestedAt)
    fail(
      409,
      "DELETION_NOT_REQUESTED",
      "Record a customer deletion request first.",
    );
  const active = await ctx.models.Order.countDocuments({
    owner: user._id,
    status: { $nin: ["delivered", "cancelled", "rejected"] },
  });
  if (active)
    fail(409, "ACTIVE_ORDERS", "Resolve active orders before deletion.");
  await ctx.models.User.updateOne(
    { _id: user._id },
    { $set: { disabled: true }, $inc: { authVersion: 1 } },
  );
  await ctx.transaction(async (session) => {
    await assertCommerceDeletionAllowed(ctx, user._id, session);
    await ctx.models.User.updateOne(
      { _id: user._id },
      { $inc: { mutationFence: 1 } },
      { session },
    );
    const stillActive = await ctx.models.Order.countDocuments({
      owner: user._id,
      status: { $nin: ["delivered", "cancelled", "rejected"] },
    }).session(session);
    if (stillActive)
      fail(
        409,
        "ACTIVE_ORDERS",
        "An active order requires review; the account remains disabled.",
      );
    const orders = await ctx.models.Order.find({ owner: user._id }).session(
      session,
    );
    for (const order of orders) {
      const publicPins = orderPublicMediaPins(order);
      // An asset used by an option and a guide was pinned once for each category.
      await releaseMedia(ctx, publicPins.optionImages, session);
      await releaseMedia(ctx, publicPins.guideImages, session);
      for (const id of order.referenceMediaIds)
        await ctx.models.MediaAsset.updateOne(
          { _id: id, references: { $gt: 0 } },
          { $inc: { references: -1 } },
          { session },
        );
      const quotes = order.quotes.map(({ notes: _notes, ...q }) => ({
        ...q,
        notes: "",
        notesHi: "",
      }));
      const acceptedQuote = order.acceptedQuote
        ? {
            ...order.acceptedQuote,
            notes: "",
            notesHi: "",
            acceptedBy: "deleted-user",
          }
        : null;
      const timeline = order.timeline.map((t) => ({
        ...t,
        actor: "deleted-user",
        note: "",
        noteHi: "",
      }));
      await ctx.models.Order.updateOne(
        { _id: order._id },
        {
          $set: {
            owner: new mongoose.Types.ObjectId(),
            idempotencyKey: "deleted-" + randomUUID(),
            requestHash: "deleted",
            customer: { name: "Deleted customer", phone: "" },
            address: {},
            measurements: {
              unit: order.measurements?.unit,
              method: "deleted",
              values: {},
              notes: "",
            },
            preferences: {},
            preferenceLabelsHi: {},
            configuration: {},
            designSnapshot: order.designSnapshot ? { ...order.designSnapshot, components: {} } : null,
            logistics: {},
            fulfilment: {},
            estimate: order.estimate
              ? { ...order.estimate, components: {} }
              : undefined,
            referenceMediaIds: [],
            notes: "",
            fabricDetails: "",
            quotes,
            acceptedQuote,
            timeline,
            anonymizedAt: new Date(),
          },
          $unset: { preferredDate: 1, draftId: 1, guideSnapshots: 1, publicMediaPins: 1 },
        },
        { session },
      );
    }
    const drafts = await ctx.models.Draft.find({ owner: user._id }).session(
      session,
    );
    for (const draft of drafts)
      if (draft.status === "draft")
        for (const id of draftMediaIds(draft.data))
          await ctx.models.MediaAsset.updateOne(
            { _id: id, references: { $gt: 0 } },
            { $inc: { references: -1 } },
            { session },
          );
    await ctx.models.Draft.deleteMany({ owner: user._id }, { session });
    await cleanupExtensionAccount(ctx, user, session);
    await ctx.models.AuditEvent.create(
      [
        {
          action: "account.deletion_started",
          resourceType: "user",
          resourceId: String(user._id),
          metadata: { source: "trusted-cli" },
        },
      ],
      { session },
    );
  });
  // External calls are retryable, separate from the database transaction.
  // Metadata remains after failures so an operator can finish cleanup safely.
  const cursor = ctx.models.MediaAsset.find({
    owner: user._id,
    private: true,
  }).cursor();
  for await (const item of cursor) {
    const asset = await ctx.models.MediaAsset.findOneAndUpdate(
      { _id: item._id, references: 0 },
      { $set: { deletingAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!asset)
      fail(
        409,
        "MEDIA_REFERENCED",
        "A private asset is still referenced. Account remains disabled for review.",
      );
    await ctx.images.remove(asset.fileId);
    await ctx.models.MediaAsset.deleteOne({ _id: asset._id, references: 0 });
  }
  await ctx.transaction(async (session) => {
    await ctx.models.User.deleteOne(
      { _id: user._id, disabled: true },
      { session },
    );
    await ctx.models.AuditEvent.create(
      [
        {
          action: "account.deleted",
          resourceType: "user",
          resourceId: String(user._id),
          metadata: {
            source: "trusted-cli",
            retained: "anonymized-terminal-order-records",
          },
        },
      ],
      { session },
    );
  });
  return { alreadyComplete: false };
}
