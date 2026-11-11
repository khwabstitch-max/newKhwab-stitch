import { removeStoredMedia } from "../src/media-storage.js";
import { connect } from "./runtime.js";
const ctx = await connect();
const execute = process.argv.includes("--execute");
const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
try {
  let scanned = 0,
    deleted = 0,
    failed = 0;
  const cursor = ctx.models.MediaAsset.find({
    references: 0,
    createdAt: { $lt: cutoff },
  }).cursor();
  for await (const item of cursor) {
    scanned++;
    if (!execute) continue;
    const asset = await ctx.models.MediaAsset.findOneAndUpdate(
      { _id: item._id, references: 0 },
      { $set: { deletingAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!asset) continue;
    try {
      await removeStoredMedia(ctx.images, asset);
      await ctx.models.MediaAsset.deleteOne({
        _id: asset._id,
        references: 0,
        deletingAt: { $ne: null },
      });
      deleted++;
    } catch {
      failed++;
      console.error(
        "Cleanup failed for media record " +
          item._id +
          "; retry after provider/database recovery.",
      );
    }
  }
  console.log(
    JSON.stringify({
      mode: execute ? "execute" : "dry-run",
      unattachedOlderThanDays: 7,
      scanned,
      deleted,
      failed,
    }),
  );
  if (failed) process.exitCode = 1;
} finally {
  await ctx.disconnect();
}
