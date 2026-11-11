import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { planOptionRepair } from "../src/option-maintenance.js";

async function main() {
const { values } = parseArgs({ options: {
  input: { type: "string" }, execute: { type: "boolean", default: false },
  "confirm-database": { type: "string" }, "backup-confirmed": { type: "boolean", default: false },
} });
const root = fileURLToPath(new URL("../../", import.meta.url));
if (values.input && values.execute) throw Error("Choose offline preview or explicit database execution, not both.");
if (!values.execute && !values.input) {
  process.stdout.write(JSON.stringify({ mode: "offline-plan", databaseAccessed: false, next: "Use --input <reviewed-option-export.json> inside this repository for an offline preview. Execution additionally requires --execute --confirm-database <exact-name> --backup-confirmed and MONGODB_URI in the process environment; this script never loads .env files.", preserves: ["Publication decisions", "Inactive imports", "Unknown applicability and compatibility", "Customer data", "Orders and accepted quotes"] }, null, 2));
} else if (values.input) {
  const candidate = path.resolve(root, values.input);
  const resolved = await fs.realpath(candidate);
  if (!resolved.startsWith(root) || path.basename(resolved).toLowerCase().startsWith(".env")) throw Error("Preview input must be a JSON option export inside this repository.");
  const records = JSON.parse(await fs.readFile(resolved, "utf8"));
  if (!Array.isArray(records) || records.length > 10000) throw Error("Expected at most 10000 exported option records.");
  const plans = records.map(planOptionRepair);
  process.stdout.write(JSON.stringify({ mode: "offline-preview", databaseAccessed: false, scanned: plans.length, changed: plans.filter(plan => Object.keys(plan.changes).length).length, plans }, null, 2));
} else {
  if (!values["backup-confirmed"] || !/^[A-Za-z0-9_-]{1,63}$/.test(values["confirm-database"] || "") || !/^mongodb(?:\+srv)?:\/\//.test(process.env.MONGODB_URI || "")) throw Error("Execution requires reviewed process configuration, an exact database name and confirmed backup.");
  const { default: mongoose } = await import("mongoose");
  const connection = await mongoose.createConnection(process.env.MONGODB_URI, { dbName: values["confirm-database"], maxPoolSize: 2, autoIndex: false, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 20000 }).asPromise();
  try {
    if (connection.name !== values["confirm-database"]) throw Error("Database identity did not match confirmation.");
    let scanned = 0, changed = 0, conflicts = 0, reviewRequired = 0;
    const collection = connection.collection("designoptions");
    for await (const record of collection.find({})) {
      scanned++;
      const plan = planOptionRepair(record);
      if (plan.review.length) reviewRequired++;
      if (!Object.keys(plan.changes).length) continue;
      if (record.revision !== undefined && (!Number.isSafeInteger(record.revision) || record.revision < 0)) { conflicts++; continue; }
      // A concurrent admin edit wins; do not overwrite its revision or intent.
      const revision = record.revision === undefined ? { $exists: false } : record.revision;
      const result = await collection.updateOne({ _id: record._id, revision }, { $set: plan.changes, $inc: { revision: 1 } });
      if (result.modifiedCount === 1) changed++; else conflicts++;
    }
    process.stdout.write(JSON.stringify({ mode: "executed", scanned, changed, conflicts, reviewRequired, customerRecordsChanged: 0, orderRecordsChanged: 0 }, null, 2));
  } finally { await connection.close(); }
}
}
main().catch(() => {
  process.stderr.write("Option repair stopped. Check the input, reviewed database identity, backup and private connection settings; no orders were changed.\n");
  process.exitCode = 1;
});
