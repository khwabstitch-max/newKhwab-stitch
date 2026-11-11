import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
const modes=["server-lint","client-lint",process.argv.includes("--unit-only")?"server-unit":"server-test","client-test","server-build","client-build"];
let failed=false;
for(const mode of modes){
  const code=await new Promise(resolve=>{const child=spawn(process.execPath,["scripts/isolated.mjs",mode,"--report",`artifacts/verify-${mode}.txt`],{cwd:root,windowsHide:true,stdio:"inherit"});child.once("error",()=>resolve(1));child.once("exit",code=>resolve(code??1));});
  failed ||= code!==0;
}
process.exitCode=failed?1:0;
