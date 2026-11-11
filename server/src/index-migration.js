export async function ensureIndexes(models, log = () => {}) {
  let indexes = [];
  try {
    indexes = await models.User.collection.indexes();
  } catch (error) {
    if (error.code !== 26 && error.codeName !== "NamespaceNotFound")
      throw error;
  }
  const obsolete = indexes.find((index) => index.name === "firebaseUid_1");
  if (
    obsolete &&
    (obsolete.unique !== true ||
      JSON.stringify(obsolete.key) !== JSON.stringify({ firebaseUid: 1 }) ||
      obsolete.sparse ||
      obsolete.partialFilterExpression)
  ) {
    throw new Error(
      "Unexpected firebaseUid_1 index definition. An operator must review it; no index was dropped.",
    );
  }

  // Build the new credential uniqueness protection before removing the old UID
  // index. Legacy account documents and historical order owners stay untouched.
  if (indexes.length) {
    const conflicts = await models.User.aggregate([
      { $match: { passwordHash: { $type: "string" } } },
      {
        $project: {
          email: 1,
          normalized: {
            $toLower: { $trim: { input: { $ifNull: ["$email", ""] } } },
          },
        },
      },
      {
        $group: {
          _id: "$normalized",
          count: { $sum: 1 },
          nonNormalized: {
            $max: { $cond: [{ $eq: ["$email", "$normalized"] }, 0, 1] },
          },
        },
      },
      {
        $match: {
          $or: [{ count: { $gt: 1 } }, { nonNormalized: 1 }, { _id: "" }],
        },
      },
      { $limit: 1 },
    ]);
    if (conflicts.length) {
      throw new Error(
        "Credential email duplicates or normalization problems require trusted operator resolution. No obsolete index was dropped.",
      );
    }
  }
  for (const Model of Object.values(models)) {
    await Model.createIndexes();
    log("Ensured indexes for " + Model.modelName);
  }
  if (obsolete) {
    await models.User.collection.dropIndex("firebaseUid_1");
    log(
      "Removed obsolete firebaseUid_1 only. Account documents and IDs were preserved.",
    );
  }
}

export async function assertCredentialIndexes(models) {
  let indexes;
  try {
    indexes = await models.User.collection.indexes();
  } catch (error) {
    if (error.code !== 26 && error.codeName !== "NamespaceNotFound")
      throw error;
    throw new Error(
      "Authentication indexes are missing. Run npm run db:indexes before starting the API.",
      { cause: error },
    );
  }
  if (indexes.some((index) => index.name === "firebaseUid_1")) {
    throw new Error(
      "Legacy authentication index migration is required. Run npm run db:indexes; startup never drops live indexes automatically.",
    );
  }
  const credentialIndex = indexes.find(
    (index) => index.name === "email_credential_unique",
  );
  if (
    !credentialIndex?.unique ||
    JSON.stringify(credentialIndex.key) !== JSON.stringify({ email: 1 }) ||
    credentialIndex.partialFilterExpression?.passwordHash?.$type !== "string"
  ) {
    throw new Error(
      "Credential email uniqueness is not configured. Run npm run db:indexes before starting the API.",
    );
  }
}
