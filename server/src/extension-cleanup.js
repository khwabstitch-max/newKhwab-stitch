import mongoose from "mongoose";
import { releaseMedia } from "./route-utils.js";

// Called inside the existing deletion transaction before provider cleanup. This
// makes retrying provider deletion safe: released records no longer exist.
export async function cleanupExtensionAccount(ctx, user, session) {
  const { models } = ctx;
  const owner = user._id;
  if (!models.Conversation) return;
  const conversations = await models.Conversation.find({ owner })
    .select("_id")
    .session(session);
  const conversationIds = conversations.map((item) => item._id);
  const messages = await models.Message.find({
    $or: [{ conversation: { $in: conversationIds } }, { sender: owner }],
  }).session(session);
  for (const message of messages)
    await releaseMedia(ctx, message.attachmentIds, session);
  await models.Message.deleteMany(
    { conversation: { $in: conversationIds } },
    { session },
  );
  await models.Message.updateMany(
    { sender: owner },
    {
      $set: {
        sender: new mongoose.Types.ObjectId(),
        text: "[Message removed following account deletion]",
        attachmentIds: [],
        requestHash: "deleted",
      },
    },
    { session },
  );
  await models.Conversation.deleteMany({ owner }, { session });
  const tickets = await models.SupportTicket.find({ owner }).session(session);
  for (const ticket of tickets)
    await releaseMedia(ctx, ticket.attachmentIds, session);
  await models.SupportTicket.deleteMany({ owner }, { session });
  await models.SupportTicket.updateMany(
    { assignedTo: owner },
    { $set: { assignedTo: null }, $inc: { revision: 1 } },
    { session },
  );
  const applications = await models.WorkerApplication.find({ owner }).session(
    session,
  );
  for (const application of applications)
    await releaseMedia(ctx, application.portfolioMediaIds, session);
  await models.WorkerApplication.deleteMany({ owner }, { session });
  await models.WorkAssignment.updateMany(
    { worker: owner },
    {
      $set: {
        worker: new mongoose.Types.ObjectId(),
        active: false,
        requirements: "",
        progress: [],
        history: [{ action: "worker-account-deleted", at: new Date() }],
        conversationId: null,
      },
      $inc: { revision: 1 },
    },
    { session },
  );
  for (const name of [
    "AccountPreferences",
    "MeasurementProfile",
    "WorkerProfile",
    "Review",
    "Notification",
    "PasswordAction",
    "AccountIdentity",
    "SupportProposal",
  ])
    if (models[name]) await models[name].deleteMany({ owner }, { session });
}
