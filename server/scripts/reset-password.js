import { connect } from "./runtime.js";
import { readPassword } from "./read-password.js";
import { emailInput } from "../src/credentials.js";
import { objectId } from "../src/domain.js";
import { resetAccountPassword } from "../src/account-security.js";

const email = emailInput.parse(process.argv[2]);
let migrateLegacy = false;
let userId;
for (let index = 3; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === "--migrate-legacy") migrateLegacy = true;
  else if (flag === "--user-id") userId = objectId.parse(process.argv[++index]);
  else
    throw new Error(
      "Usage: npm run password:reset -- email@example.com [--migrate-legacy --user-id ACCOUNT_ID]. Password is read from stdin, never arguments.",
    );
}
const password = await readPassword();
const ctx = await connect();
try {
  await resetAccountPassword(ctx, { email, password, userId, migrateLegacy });
  console.log(
    "Password updated. Account ID and historical orders were preserved. All existing tokens were revoked; sign in again.",
  );
} finally {
  await ctx.disconnect();
}
