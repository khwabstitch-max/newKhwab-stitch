import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
const target=new URL(process.argv[2]||"https://newkhwab-stitch.vercel.app");
if(target.username||target.password||!(["https:"].includes(target.protocol)||(target.protocol==="http:"&&["localhost","127.0.0.1"].includes(target.hostname))))throw Error("Use an HTTPS site URL without credentials.");
const paths=["/","/login","/health/live","/health/ready","/api/auth/capabilities"];
const checks=await Promise.all(paths.map(async path=>{
  try{const response=await fetch(new URL(path,target.origin),{redirect:"manual",signal:AbortSignal.timeout(15000)});const type=response.headers.get("content-type")||"",body=await response.text();let error=null,status=null;
    if(type.includes("application/json")){try{const data=JSON.parse(body);error=data.error?{code:data.error.code,stage:data.error.stage,requestId:data.error.requestId}:null;status=data.data?.status||null;}catch{error={code:"INVALID_JSON"};}}
    else if(response.status>=400)error={code:body.includes("FUNCTION_INVOCATION_FAILED")?"FUNCTION_INVOCATION_FAILED":body.includes("NOT_FOUND")?"NOT_FOUND":"HTTP_ERROR"};
    return {path,httpStatus:response.status,contentType:type,requestId:response.headers.get("x-request-id"),platformId:response.headers.get("x-vercel-id"),status,error};
  }catch(error){return {path,networkError:error.cause?.code||error.name};}
}));
const report={checkedAt:new Date().toISOString(),origin:target.origin,readOnly:true,authenticatedRequests:0,checks};
await fs.mkdir(fileURLToPath(new URL("../artifacts",import.meta.url)),{recursive:true});await fs.writeFile(fileURLToPath(new URL("../artifacts/live-auth-probe.json",import.meta.url)),JSON.stringify(report,null,2));process.stdout.write(JSON.stringify(report,null,2));
if(checks.some(check=>check.httpStatus!==200))process.exitCode=1;
