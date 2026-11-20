import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultDirectory = fileURLToPath(new URL("../../artifacts/catalogue-backups/", import.meta.url));

// This deliberately accepts only catalogue collections. Customer/order data
// and runtime configuration must never be included in an operator backup.
export async function writeCatalogueBackup({ designs, options, counters }, directory = defaultDirectory) {
  const createdAt = new Date().toISOString();
  const filename = "catalogue-before-" + createdAt.replace(/[:.]/g, "-") + "-" + randomUUID() + ".json";
  const destination = path.join(directory, filename);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(destination, JSON.stringify({ schemaVersion: 1, createdAt, scope: "catalogue-only", designs, options, counters }, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (cause) {
    const error = new Error("A local catalogue backup must be saved before applying this migration.", { cause });
    error.name = "CatalogueBackupError";
    throw error;
  }
  return destination;
}
