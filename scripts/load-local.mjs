import { performance } from "node:perf_hooks";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCustomizationFixture } from "./customization-browser-fixture.mjs";

// Deliberately no external target option: this measures an isolated loopback
// fixture with the real schema/pricing engine, not Atlas/ImageKit or production.
const args=process.argv.slice(2), amount=Number(args[0]||1000), concurrency=Number(args[1]||20);
if(!Number.isInteger(amount)||amount<50||amount>10000||!Number.isInteger(concurrency)||concurrency<1||concurrency>100)throw Error("Use 50..10000 requests and 1..100 concurrent clients.");
const fixture=await startCustomizationFixture();
const origin=new URL(fixture.url);if(origin.hostname!=="127.0.0.1")throw Error("Only a local fixture is permitted.");
const input={garment:"kurti",quantity:1,designId:fixture.ids.design,configuration:{source:"catalogue",mode:"custom",components:{sleeve:{source:"option",optionId:fixture.ids.puff},sleeveLength:{source:"option",optionId:fixture.ids.full},neck:{source:"option",optionId:fixture.ids.v},back:{source:"option",optionId:fixture.ids.square}},addonIds:[fixture.ids.lace]}};
let cursor=0,errors=0;const latency=[],counts={catalogue:0,options:0,estimate:0};
const started=performance.now();
try {
  await Promise.all(Array.from({length:concurrency},async()=>{
    while(cursor<amount){const index=cursor++,kind=index%10<4?"catalogue":index%10<7?"options":"estimate";counts[kind]++;
      const time=performance.now();try{
        const response=await fetch(fixture.url+({catalogue:"/api/designs?limit=12",options:"/api/options?garment=kurti&kind=sleeve&limit=20",estimate:"/api/pricing/estimate"}[kind]),kind==="estimate"?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(10000)}:{signal:AbortSignal.timeout(10000)});
        const body=await response.json();if(!response.ok||!body.data)errors++;
      }catch{errors++;}latency.push(performance.now()-time);
    }
  }));
  const seconds=(performance.now()-started)/1000;latency.sort((a,b)=>a-b);
  const percentile=value=>Number(latency[Math.min(latency.length-1,Math.floor(latency.length*value))].toFixed(2));
  const result={checkedAt:new Date().toISOString(),runtime:process.version,platform:process.platform,arch:process.arch,environment:"single local Node fixture, loopback, no database/providers",requests:amount,concurrency,workload:counts,durationSeconds:Number(seconds.toFixed(3)),requestsPerSecond:Number((amount/seconds).toFixed(2)),latencyMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99)},errors,limitations:["Does not measure database, authentication, durable limits, uploads, bandwidth or deployment cold starts.","Registered users and concurrent users are different; these measurements do not establish100000simultaneous users."]};
  const root=fileURLToPath(new URL("../",import.meta.url));await fs.mkdir(path.join(root,"artifacts"),{recursive:true});await fs.writeFile(path.join(root,"artifacts/load-local.json"),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result,null,2));if(errors)process.exitCode=1;
}finally{await fixture.close();}
