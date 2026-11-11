import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
const excluded=new Set([".git","node_modules","dist","artifacts","coverage",".vercel","backups","uploads"]);
const patterns=[[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,"embedded private key"],[/mongodb(?:\+srv)?:\/\/[^\s/:'"<>]+:[^\s/'"<>]+@/,"embedded database credentials"]];
let scanned=0;const findings=[];
async function walk(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){
 if(entry.name.startsWith(".env")||excluded.has(entry.name)||entry.isSymbolicLink())continue;
 const file=path.join(directory,entry.name);
 if(entry.isDirectory()){await walk(file);continue;}
 if(!/\.(?:[cm]?js|jsx|json|md|ya?ml|html|css)$/.test(entry.name)||entry.name.endsWith("lock.json"))continue;
 const source=await fs.readFile(file,"utf8");scanned++;
 for(const[pattern,rule]of patterns)if(pattern.test(source)&&!file.endsWith("source-check.mjs"))findings.push({file:path.relative(root,file),rule});
}}
await walk(root);
process.stdout.write(JSON.stringify({mode:"source-only credential-pattern check",scanned,findings,environmentFilesRead:0,limits:"Not an exhaustive secret audit; ignored environment files and external Git history were not inspected."},null,2));if(findings.length)process.exitCode=1;
