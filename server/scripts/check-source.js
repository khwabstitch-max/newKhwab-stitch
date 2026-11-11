import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
async function scan(directory) {
  const files = await readdir(directory, { withFileTypes: true });
  for (const file of files) {
    const path = join(directory, file.name);
    if (file.isDirectory()) await scan(path);
    else if (path.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", path], {
        stdio: "inherit",
      });
      if (result.status) process.exit(result.status);
    }
  }
}
await scan("src");
await scan("scripts");
process.stdout.write(
  "JavaScript syntax checks passed. No compilation is required.\n",
);
