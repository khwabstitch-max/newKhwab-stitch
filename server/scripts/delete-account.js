import { connect } from "./runtime.js";
import { emailInput } from "../src/credentials.js";
import {
  inspectAccountDeletion,
  executeAccountDeletion,
} from "../src/account-deletion.js";

const email = emailInput.parse(process.argv[2]);
const flags = process.argv.slice(3);
if (flags.some((flag) => flag !== "--execute")) {
  throw new Error(
    "Usage: npm run account:delete -- email@example.com [--execute]",
  );
}
const execute = flags.includes("--execute");
const ctx = await connect();
try {
  const { user, activeOrders, privateAssets } = await inspectAccountDeletion(
    ctx,
    email,
  );
  console.log(
    JSON.stringify({
      mode: execute ? "execute" : "dry-run",
      activeOrders,
      privateAssets,
      deletionRequested: !!user?.deletionRequestedAt,
      accountPresent: !!user,
    }),
  );
  if (execute && user) {
    await executeAccountDeletion(ctx, user);
    console.log(
      "Local account credentials and private media removed; terminal orders anonymized. Authentication cannot recreate deleted accounts. Verify provider caches and backup retention separately.",
    );
  }
} finally {
  await ctx.disconnect();
}
