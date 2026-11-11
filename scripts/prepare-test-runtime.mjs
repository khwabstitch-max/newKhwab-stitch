import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

// Explicit Windows test prerequisite; never installs a system package, reads
// .env files, changes global PATH, or copies from outside this repository.
const download = "https://download.microsoft.com/download/4/7/c/47c6134b-d61f-4024-83bd-b9c9ea951c25/Microsoft.VCLibs.x64.14.00.Desktop.appx";
const expectedHash = "b56a9101f706f9d95f815f5b7fa6efbac972e86573d378b96a07cff5540c5961";
const officialManifest = "https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/m/Microsoft/VCLibs/Desktop/14/14.0.33321.0/Microsoft.VCLibs.Desktop.14.installer.yaml";
const officialDocumentation = "https://learn.microsoft.com/en-us/troubleshoot/developer/visualstudio/cpp/libraries/c-runtime-packages-desktop-bridge";
const allowed = new Set(["concrt140.dll", "msvcp140.dll", "msvcp140_1.dll", "msvcp140_2.dll", "msvcp140_atomic_wait.dll", "msvcp140_codecvt_ids.dll", "vccorlib140.dll", "vcruntime140.dll", "vcruntime140_1.dll"]);
const required = ["msvcp140.dll", "msvcp140_1.dll", "vcruntime140.dll", "vcruntime140_1.dll"];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

function extractRuntime(archive, target, root) {
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  // Use Windows' existing ZIP implementation, including Appx ZIP64 support.
  // The child receives only a fixed allowlist and verified local package.
  const source = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead(${quote(archive)})
$target = ${quote(target)}
$allowed = @(${[...allowed].map(quote).join(",")})
$required = @(${required.map(quote).join(",")})
$found = @()
$created = 0
$reused = 0
try {
  foreach ($entry in $archive.Entries) {
    $name = $entry.FullName.ToLowerInvariant()
    if ($allowed -notcontains $name) { continue }
    if ($found -contains $name -or $entry.Length -gt 16777216) { throw 'Unexpected runtime entry' }
    $found += $name
    $destination = [System.IO.Path]::Combine($target, $name)
    $digest = [System.Security.Cryptography.SHA256]::Create()
    $stream = $entry.Open()
    try { $expected = [System.BitConverter]::ToString($digest.ComputeHash($stream)).Replace('-','') }
    finally { $stream.Dispose(); $digest.Dispose() }
    if (Test-Path -LiteralPath $destination) {
      if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $expected) { throw 'Existing runtime DLL differs; refusing overwrite' }
      $reused++
    } else {
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $false)
      $created++
    }
  }
  if (@($required | Where-Object { $found -notcontains $_ }).Count) { throw 'Required runtime files missing' }
  @{created=$created;reused=$reused} | ConvertTo-Json -Compress
} finally { $archive.Dispose() }
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", Buffer.from(source, "utf16le").toString("base64")], {
    cwd: root, windowsHide: true, encoding: "utf8", timeout: 30000,
    env: { ...process.env, TEMP: path.join(root, "artifacts/isolated-tmp"), TMP: path.join(root, "artifacts/isolated-tmp") },
  });
  if (result.status !== 0) throw Error("Local Microsoft runtime extraction failed; existing different files are never overwritten.");
  return JSON.parse(result.stdout.trim());
}

async function main() {
  if (process.platform !== "win32") {
    process.stdout.write(JSON.stringify({ status: "not-needed", reason: "Windows-only prerequisite; no download or file changes." }));
    return;
  }
  const root = await fs.realpath(fileURLToPath(new URL("../", import.meta.url)));
  const inside = candidate => candidate === root || candidate.startsWith(root + path.sep);
  const target = path.join(root, "artifacts", "isolated-runtime");
  // Check existing ancestors before mkdir and the resulting real path afterward.
  let ancestor = target;
  while (true) {
    try { if (!inside(await fs.realpath(ancestor))) throw Error("Runtime directory resolves outside the repository."); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; ancestor = path.dirname(ancestor); }
  }
  await fs.mkdir(target, { recursive: true });
  if (!inside(await fs.realpath(target))) throw Error("Runtime directory resolves outside the repository.");
  const archive = path.join(target, "Microsoft.VCLibs.x64.14.00.Desktop.appx");
  let bytes, downloaded = false;
  try {
    if (!inside(await fs.realpath(archive))) throw Error("Runtime archive resolves outside the repository.");
    bytes = await fs.readFile(archive);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch(download, { signal: AbortSignal.timeout(30000) });
    if (!response.ok || Number(response.headers.get("content-length")) > 20 * 1024 * 1024) throw Error("Official Microsoft runtime download failed.");
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024 || hash(bytes) !== expectedHash) throw Error("Microsoft runtime checksum verification failed.");
    await fs.writeFile(archive, bytes, { flag: "wx" });
    downloaded = true;
  }
  if (hash(bytes) !== expectedHash) throw Error("Existing runtime archive differs from the pinned official checksum.");
  for (const name of allowed) {
    const destination = path.join(target, name);
    try {
      if (!inside(await fs.realpath(destination))) throw Error("Runtime DLL resolves outside the repository.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const temporary = path.join(root, "artifacts/isolated-tmp");
  try { if (!inside(await fs.realpath(temporary))) throw Error("Test temp directory resolves outside the repository."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.mkdir(temporary, { recursive: true });
  if (!inside(await fs.realpath(temporary))) throw Error("Test temp directory resolves outside the repository.");
  const { created, reused } = extractRuntime(archive, target, root);
  const report = { status: "prepared", source: download, officialManifest, officialDocumentation, sha256: expectedHash, downloaded, created, reused, systemInstalled: false, globalPathChanged: false, envFilesRead: false, deploymentAsset: false };
  const binary = path.join(root, "server/node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe");
  try {
    if (!inside(await fs.realpath(binary))) throw Error("Cached test binary resolves outside the repository.");
    const probe = spawnSync(binary, ["--version"], { cwd: root, windowsHide: true, timeout: 10000, encoding: "utf8", env: { ...process.env, PATH: target + path.delimiter + process.env.PATH } });
    report.probe = { exitCode: probe.status, version: probe.stdout?.match(/db version v([\d.]+)/)?.[1] || null };
    if (probe.status !== 0) throw Error("Runtime prepared but cached MongoDB version probe failed.");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.writeFile(path.join(target, "preparation.json"), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report, null, 2));
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
