import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

it("covers static UI literals and validates all semantic and legacy placeholder contracts", () => {
  // Run the Node-only audit separately from JSDOM's browser URL implementation.
  const result = JSON.parse(execFileSync(process.execPath, ["scripts/audit-translations.mjs"], { cwd: path.resolve(process.cwd(), ".."), encoding: "utf8", windowsHide: true }));
  expect(result.missing).toEqual([]);
  expect(result.invalidEntries).toEqual([]);
  expect(result.missingEnumLabels).toEqual([]);
  // Dynamic owner content, enum labels and runtime templates are explicitly
  // reported for review, rather than being misrepresented as static coverage.
  expect(result.dynamicCalls).toBeGreaterThan(0);
  expect(result.enumLabelCalls).toBeGreaterThan(0);
});
