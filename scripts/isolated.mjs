import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// No dotenv import and no configured database/provider access. All temporary
// files, downloads and browser profiles stay under this repository.
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = path.join(root, "artifacts", "isolated-tmp");
await fs.mkdir(temporary, { recursive: true });
const env = { ...process.env, NODE_ENV: "test", KHWAB_NO_ENV_FILES: "1", VITE_API_BASE_URL: "/api", TMP: temporary, TEMP: temporary, TMPDIR: temporary,
  MONGOMS_DOWNLOAD_DIR: path.join(root, "server/node_modules/.cache/mongodb-memory-server"), MONGOMS_PREFER_GLOBAL_PATH: "false" };
for (const key of ["MONGODB_URI", "TEST_MONGODB_URI", "ALLOW_EXTERNAL_TEST_DATABASE", "JWT_SECRET", "IMAGEKIT_PRIVATE_KEY", "IMAGEKIT_URL_ENDPOINT", "RESEND_API_KEY", "EMAIL_FROM", "PUBLIC_WEB_URL", "GOOGLE_CLIENT_ID", "MONGOMS_SYSTEM_BINARY", "KHWAB_BROWSER_AUTH", "KHWAB_BROWSER_AUTH_ONLY"]) delete env[key];
if(process.platform==="win32") {
  const runtime=path.join(root,"artifacts/isolated-runtime");
  try { await fs.access(path.join(runtime,"msvcp140.dll")); const key=Object.keys(env).find(key=>key.toLowerCase()==="path")||"PATH"; env[key]=runtime+path.delimiter+(env[key]||""); } catch { /* Standard OS runtime may already be installed. */ }
}
const [mode, ...extra] = process.argv.slice(2);
const reportIndex=extra.indexOf("--report");
let report;
if(reportIndex>=0) {
  report=path.resolve(root,extra[reportIndex+1]||"");extra.splice(reportIndex,2);
  if(!report.startsWith(path.join(root,"artifacts")+path.sep))throw Error("Reports must stay inside workspace artifacts.");
}
let cwd = root, args;
const project = mode?.startsWith("client-") ? "client" : "server";
if (mode === "client-test") { cwd = path.join(root, "client"); args = [path.join(cwd,"node_modules/vitest/vitest.mjs"), "run", ...extra]; }
else if (mode === "client-build") { env.NODE_ENV="production";cwd = path.join(root,"client"); args = [path.join(cwd,"node_modules/vite/bin/vite.js"), "build", ...extra]; }
else if (["client-lint","server-lint"].includes(mode)) { cwd = path.join(root,project); args = [path.join(cwd,"node_modules/eslint/bin/eslint.js"), ".", ...extra]; }
else if (mode === "server-build") { cwd = path.join(root,"server"); args = ["scripts/check-source.js"]; }
else if (["server-unit","server-test"].includes(mode)) {
  cwd = path.join(root,"server");
  const files = extra.length ? extra : (await fs.readdir(path.join(cwd,"tests"))).filter(name => name.endsWith(".test.js") && (mode === "server-test" || !["api.test.js","account-extensions.test.js","commerce-api.test.js"].includes(name))).map(name=>`tests/${name}`);
  args = ["--test", "--test-concurrency=1", ...files];
} else if (mode === "browser") args = ["scripts/browser-smoke.mjs", ...extra];
else if (mode === "browser-auth") { env.KHWAB_BROWSER_AUTH="1";env.KHWAB_BROWSER_AUTH_ONLY="1";args=["scripts/browser-smoke.mjs",...extra]; }
else throw Error("Use client-test, client-build, client-lint, server-unit, server-test, server-build, server-lint or browser.");
const child = spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:report?["ignore","pipe","pipe"]:"inherit"});
let output="";
if(report) { for(const stream of[child.stdout,child.stderr])stream.on("data",chunk=>{output+=chunk;}); }
child.on("error",()=>{process.stderr.write("Isolated check could not start.\n");process.exitCode=1;});
child.on("close",async code=>{process.exitCode=code??1;if(report){await fs.mkdir(path.dirname(report),{recursive:true});await fs.writeFile(report,output);process.stdout.write(JSON.stringify({mode,exitCode:code,report:path.relative(root,report)})+"\n");}});
