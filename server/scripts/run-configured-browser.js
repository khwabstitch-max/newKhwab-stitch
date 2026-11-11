import { spawn } from "node:child_process";
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";

// Run from server/ so dotenv loads the same local development configuration.
// The URI stays in the child environment; it is never placed in argv or logs.
const config = loadConfig();
if (config.NODE_ENV === "production")
  throw new Error("Configured browser checks are disabled in production mode. Use a separate development environment.");
if (process.cwd() !== fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, ""))
  throw new Error("Run configured browser checks from the server directory.");
const root = fileURLToPath(new URL("../../", import.meta.url));
const child = spawn(process.execPath, [fileURLToPath(new URL("../../scripts/browser-smoke.mjs", import.meta.url))], {
  cwd: root, windowsHide: true, stdio: "inherit",
  env: { ...process.env, NODE_ENV: "test", TEST_MONGODB_URI: config.MONGODB_URI,
    ALLOW_EXTERNAL_TEST_DATABASE: "true", KHWAB_BROWSER_AUTH: "1", KHWAB_BROWSER_AUTH_ONLY: "1" },
});
child.on("error", () => { process.stderr.write("Configured browser process could not start.\n"); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
