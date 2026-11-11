import { createHash } from "node:crypto";
import { fail } from "./errors.js";
import { checkRevision, audit } from "./route-utils.js";

const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const hashRequest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
export function assertAdmin(req) {
  if (req.user.role !== "admin")
    fail(403, "FORBIDDEN", "Administrator access is required.");
}
export async function revised(
  ctx,
  req,
  Model,
  current,
  revision,
  fields,
  action,
  session,
  extra = {},
) {
  checkRevision(current, revision);
  const result = await Model.findOneAndUpdate(
    { _id: current._id, revision },
    { $set: fields, $inc: { revision: 1 }, ...extra },
    { returnDocument: "after", session, runValidators: true },
  );
  if (!result)
    fail(
      409,
      "REVISION_CONFLICT",
      "This record changed. Refresh it and try again.",
    );
  await audit(ctx, req, action, Model.modelName, current._id, session);
  return result;
}
export async function notify(ctx, owner, kind, resourceId, session) {
  return ctx.models.Notification.create(
    [{ owner, kind, resourceId: String(resourceId) }],
    { session },
  );
}
export const publicApplication = (document) => {
  const value = document?.toObject ? document.toObject() : document;
  const {
    internalNotes: _notes,
    requestHash: _hash,
    clientId: _client,
    ...safe
  } = value;
  return safe;
};
