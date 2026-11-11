import { connect } from "./runtime.js";
import { ensureIndexes } from "../src/index-migration.js";

const ctx = await connect();
try {
  await ensureIndexes(ctx.models, (message) => console.log(message));
} finally {
  await ctx.disconnect();
}
