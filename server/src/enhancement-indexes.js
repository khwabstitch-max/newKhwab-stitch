// Startup checks never change live indexes. Apply reviewed additions with db:indexes.
export async function assertEnhancementIndexes(models) {
  const names = [
    "Draft",
    "AccountPreferences",
    "MeasurementProfile",
    "Conversation",
    "Message",
    "SupportTicket",
    "SupportProposal",
    "WorkerApplication",
    "WorkerProfile",
    "WorkAssignment",
    "Review",
    "Notification",
    "ServiceDefinition",
    "PasswordAction",
    "AccountIdentity",
  ];
  await Promise.all(names.map(async (name) => {
    const model = models[name];
    if (!model) return;
    const required = model.schema
      .indexes()
      .filter(
        ([, options]) =>
          options.unique || options.expireAfterSeconds !== undefined,
      );
    if (!required.length) return;
    let actual;
    try {
      actual = await model.collection.indexes();
    } catch {
      throw new Error(
        `Required ${name} indexes are missing. Review backups and run npm run db:indexes before starting this version.`,
      );
    }
    for (const [keys, options] of required) {
      const found = actual.find(
        (index) => JSON.stringify(index.key) === JSON.stringify(keys),
      );
      if (
        !found ||
        (options.unique && !found.unique) ||
        (options.expireAfterSeconds !== undefined &&
          found.expireAfterSeconds !== options.expireAfterSeconds) ||
        JSON.stringify(found.partialFilterExpression || {}) !==
          JSON.stringify(options.partialFilterExpression || {})
      )
        throw new Error(
          `Required ${name} indexes are missing or incompatible. Review backups and run npm run db:indexes before starting this version.`,
        );
    }
  }));
}
