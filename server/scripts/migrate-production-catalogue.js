import { parseArgs } from "node:util";
import { connect } from "./runtime.js";
import { writeCatalogueBackup } from "../src/catalogue-backup.js";
import { productionCataloguePlan, productionCatalogueSummary } from "../src/catalogue-migration.js";

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false } } });
if (values.apply && values["dry-run"]) throw new Error("Choose either --dry-run or --apply.");
let ctx;
async function recordsFor(session = null) {
  // Driver operations in one transaction run sequentially.
  const designs = await ctx.models.Design.find({}).session(session).lean();
  const options = await ctx.models.DesignOption.find({}).session(session).lean();
  const counters = await ctx.models.CatalogueCodeSequence.find({}).session(session).lean();
  return { designs, options, counters };
}
function planFor({ designs, options, counters }) {
  return productionCataloguePlan(designs, options, counters);
}

try {
  ctx = await connect();
  if (!values.apply) {
    const plan = planFor(await recordsFor());
    console.log(JSON.stringify({ mode: "dry-run", ...productionCatalogueSummary(plan), next: "Run the same command with --apply after reviewing this plan." }, null, 2));
  } else {
    // Transactions may upsert sequence records, but cannot create collections.
    // Creating this empty collection does not alter any catalogue record.
    await ctx.models.CatalogueCodeSequence.createCollection();
    const result = await ctx.transaction(async session => {
      const records = await recordsFor(session);
      // Save the exact transaction snapshot before the first document write.
      // A transaction retry produces its own timestamped backup.
      const backupPath = await writeCatalogueBackup(records);
      const plan = planFor(records);
      for (const sequence of plan.sequences)
        await ctx.models.CatalogueCodeSequence.updateOne({ _id: sequence.key }, { $max: { value: sequence.value } }, { upsert: true, session });
      for (const [Model, changes] of [[ctx.models.Design, plan.designChanges], [ctx.models.DesignOption, plan.optionChanges]]) for (const change of changes) {
        const updated = await Model.updateOne({ _id: change.id, revision: change.revision }, { $set: change.fields, $inc: { revision: 1 } }, { runValidators: true, session });
        if (updated.modifiedCount !== 1) throw new Error("A catalogue record changed during migration. Retry the reviewed migration.");
      }
      const drafts = await ctx.models.Draft.updateMany({ status: "draft", "data.catalogueMigration": { $ne: "zero-based-catalogue-v1" } },
        { $unset: { "data.estimate": "", "data.priceCache": "" }, $set: { "data.catalogueMigration": "zero-based-catalogue-v1" }, $inc: { revision: 1 } }, { session });
      return { backupPath, ...productionCatalogueSummary(plan), designsUpdated: plan.designChanges.length, optionsUpdated: plan.optionChanges.length, editableDraftEstimatesInvalidated: drafts.modifiedCount, ordersChanged: 0, quotesChanged: 0 };
    });
    console.log(JSON.stringify({ mode: "applied", ...result }, null, 2));
  }
} catch (error) {
  console.error("Catalogue migration did not complete (" + error.name + "). Review configuration, database availability and the migration plan.");
  process.exitCode = 1;
} finally { if (ctx) await ctx.disconnect(); }
