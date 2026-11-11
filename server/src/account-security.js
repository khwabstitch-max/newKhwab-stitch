import { emailInput, hashPassword, newPasswordInput } from "./credentials.js";
import { fail, requireFound } from "./errors.js";
import { escaped } from "./route-utils.js";

export function normalizedEmailMatch(email) {
  return {
    email: { $regex: "^\\s*" + escaped(email) + "\\s*$", $options: "i" },
  };
}

export async function resetAccountPassword(
  ctx,
  { email, password, userId, migrateLegacy = false },
) {
  const normalizedEmail = emailInput.parse(email);
  newPasswordInput.parse(password);
  const matches = await ctx.models.User.find(
    normalizedEmailMatch(normalizedEmail),
  )
    .select("+passwordHash +firebaseUid")
    .limit(3);
  if (matches.length > 1) {
    fail(
      409,
      "AMBIGUOUS_ACCOUNT",
      "Multiple accounts share this email. Resolve ownership and duplicate records manually before migration.",
    );
  }
  const user = requireFound(matches[0], "No account exists for this email.");
  if (userId && String(user._id) !== userId) {
    fail(
      409,
      "ACCOUNT_MISMATCH",
      "The specified account ID does not match the selected email.",
    );
  }
  if (user.disabled)
    fail(
      409,
      "ACCOUNT_DISABLED",
      "Review the disabled account before resetting credentials.",
    );
  const legacyMigration = !user.passwordHash;
  if (legacyMigration && (!migrateLegacy || !userId)) {
    fail(
      409,
      "LEGACY_MIGRATION_REQUIRED",
      "After independently verifying ownership, provide --migrate-legacy and the exact --user-id to preserve the legacy account and its orders.",
    );
  }
  const passwordHash = await hashPassword(password);
  await ctx.transaction(async (session) => {
    const expectedVersion = user.authVersion ?? 0;
    const updated = await ctx.models.User.updateOne(
      {
        _id: user._id,
        disabled: false,
        ...(expectedVersion === 0
          ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] }
          : { authVersion: expectedVersion }),
      },
      {
        $set: { email: normalizedEmail, passwordHash },
        $inc: { authVersion: 1 },
      },
      { session },
    );
    if (updated.modifiedCount !== 1) {
      fail(
        409,
        "ACCOUNT_CHANGED",
        "The account changed. Review it before resetting the password again.",
      );
    }
    await ctx.models.AuditEvent.create(
      [
        {
          action: legacyMigration
            ? "account.credentials_migrated"
            : "account.password_reset",
          resourceType: "user",
          resourceId: String(user._id),
          metadata: { source: "trusted-cli", legacyMigration },
        },
      ],
      { session },
    );
  });
  return { userId: String(user._id), legacyMigration };
}
