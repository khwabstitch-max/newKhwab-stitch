// History refreshes renew private photo links without losing concurrent socket messages.
export function mergeChatMessages(current, incoming, { now = Date.now(), forcePhotoRefresh = false } = {}) {
  const result = [...current];
  for (const message of incoming) {
    const index = result.findIndex((previous) =>
      (message._id && previous._id === message._id) ||
      (message.clientMessageId && previous.clientMessageId === message.clientMessageId)
    );
    if (index < 0) {
      result.push(message.attachment?.url ? { ...message, _photoUrlUpdatedAt: now } : message);
      continue;
    }
    const previous = result[index];
    const hasPhoto = Boolean(message.attachment?.url);
    const samePhoto = hasPhoto && previous.attachment?.url && previous.attachment.fileId === message.attachment.fileId;
    const currentIsFresh = samePhoto && Number.isFinite(previous._photoUrlUpdatedAt) && now - previous._photoUrlUpdatedAt < 240_000;
    const retainUrl = currentIsFresh && !forcePhotoRefresh;
    result[index] = {
      ...previous,
      ...message,
      ...(hasPhoto ? {
        attachment: { ...previous.attachment, ...message.attachment, url: retainUrl ? previous.attachment.url : message.attachment.url },
        _photoUrlUpdatedAt: retainUrl ? previous._photoUrlUpdatedAt : now,
      } : { _photoUrlUpdatedAt: undefined }),
      deliveryStatus: previous.deliveryStatus === "read" ? "read" : message.deliveryStatus,
    };
  }
  return result.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
}

// A failed old image may fall outside the latest history window. Renew its own
// window once per minute; missing provider files must not create request loops.
export function claimChatPhotoRefresh(attempts, message, now = Date.now()) {
  const time = Date.parse(message?.createdAt);
  if (!message?._id || !message?.attachment?.url || !Number.isFinite(time)) return null;
  const lastAttempt = attempts.get(message._id);
  if (lastAttempt !== undefined && now - lastAttempt < 60_000) return null;
  if (attempts.size >= 256) {
    for (const [key, attemptedAt] of attempts) {
      if (now - attemptedAt >= 60_000) attempts.delete(key);
    }
    if (attempts.size >= 256) attempts.delete(attempts.keys().next().value);
  }
  attempts.set(message._id, now);
  return new Date(time + 1).toISOString();
}
