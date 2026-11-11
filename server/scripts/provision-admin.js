import { connect } from "./runtime.js";
import { emailInput } from "../src/credentials.js";

const email = emailInput.parse(process.argv[2]);
const flags = process.argv.slice(3);
if (flags.some((flag) => flag !== "--revoke")) {
  throw new Error(
    "Usage: npm run admin:provision -- email@example.com [--revoke]",
  );
}
const revoke = flags.includes("--revoke");
const ctx = await connect();
try {
  const user = await ctx.models.User.findOne({
    email,
    passwordHash: { $type: "string" },
  });
  if (!user) {
    throw new Error(
      "No credential account found. Register first, or use the trusted password-reset migration after verifying legacy account ownership.",
    );
  }
  if (user.disabled && !revoke)
    throw new Error("Disabled accounts cannot become administrators.");
  await ctx.transaction(async (session) => {
    await ctx.models.User.updateOne(
      { _id: user._id },
      {
        $set: { role: revoke ? "customer" : "admin" },
        $inc: { authVersion: 1 },
      },
      { session },
    );
    await ctx.models.AuditEvent.create(
      [
        {
          action: revoke ? "admin.revoked" : "admin.provisioned",
          resourceType: "user",
          resourceId: String(user._id),
          metadata: {
            role: revoke ? "customer" : "admin",
            source: "trusted-cli",
          },
        },
      ],
      { session },
    );
  });
  console.log("Role updated. All existing tokens were revoked; sign in again.");
} finally {
  await ctx.disconnect();
}
