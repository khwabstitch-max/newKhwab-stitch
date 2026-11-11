import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// One-time local configuration migration. Secret values are never printed.
// Preserve every unrelated assignment verbatim, including database/image keys.
function removeAssignments(source, shouldRemove) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const result = [];
  function hasClosingQuote(value, quote, start = 0) {
    for (let index = start; index < value.length; index++) {
      if (value[index] !== quote) continue;
      let escapes = 0;
      for (
        let previous = index - 1;
        previous >= 0 && value[previous] === "\\";
        previous--
      )
        escapes++;
      if (escapes % 2 === 0) return true;
    }
    return false;
  }
  for (let index = 0; index < lines.length; index++) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      lines[index],
    );
    if (!match || !shouldRemove(match[1])) {
      result.push(lines[index]);
      continue;
    }
    const value = match[2].trimStart();
    const quote = value[0];
    if (!['"', "'", "`"].includes(quote) || hasClosingQuote(value, quote, 1))
      continue;
    let closed = false;
    while (++index < lines.length) {
      if (hasClosingQuote(lines[index], quote)) {
        closed = true;
        break;
      }
    }
    if (!closed)
      throw new Error(
        "Unclosed quoted obsolete environment value; no files updated.",
      );
  }
  return result.join("\n");
}
const serverPath = fileURLToPath(new URL("../server/.env", import.meta.url));
const clientPath = fileURLToPath(new URL("../client/.env", import.meta.url));
let serverSource = existsSync(serverPath)
  ? readFileSync(serverPath, "utf8")
  : readFileSync(new URL("../server/.env.example", import.meta.url), "utf8");
let clientSource = existsSync(clientPath)
  ? readFileSync(clientPath, "utf8")
  : readFileSync(new URL("../client/.env.example", import.meta.url), "utf8");
serverSource = removeAssignments(
  serverSource,
  (name) =>
    name.startsWith("FIREBASE_") ||
    name.startsWith("VITE_FIREBASE_") ||
    name === "GOOGLE_APPLICATION_CREDENTIALS",
);
clientSource = removeAssignments(
  clientSource,
  (name) => name.startsWith("VITE_FIREBASE_") || name.startsWith("FIREBASE_"),
);
const existing =
  /^\s*JWT_SECRET\s*=\s*["']?([A-Za-z0-9_-]{64,})["']?\s*(?:#.*)?$/m.exec(
    serverSource,
  );
if (!existing || Buffer.from(existing[1], "base64url").length < 48) {
  serverSource = removeAssignments(
    serverSource,
    (name) => name === "JWT_SECRET",
  ).trimEnd();
  serverSource +=
    "\n\n# Backend-only signing secret. Keep this value private.\nJWT_SECRET=" +
    randomBytes(64).toString("base64url") +
    "\n";
}
// Both sources have been validated before either file is changed.
writeFileSync(serverPath, serverSource, { mode: 0o600 });
writeFileSync(clientPath, clientSource, { mode: 0o600 });
process.stdout.write(
  "Local email/password JWT configuration updated. Database/image settings preserved; secret hidden.\n",
);
