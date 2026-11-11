import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApplicationLoader, createServerlessHandler } from "../src/serverless.js";
import { MongoRateLimitStore } from "../src/rate-limits.js";

test("concurrent cold requests share one initialization and warm requests reuse it", async()=>{
  let calls=0;const app={};
  const load=createApplicationLoader(async()=>{calls++;await Promise.resolve();return app;});
  const results=await Promise.all(Array.from({length:40},()=>load()));
  assert.equal(calls,1);assert.ok(results.every(result=>result===app));assert.equal(await load(),app);
});
test("a failed initialization can recover on a later request without leaking secrets",async()=>{
  let calls=0;const load=createApplicationLoader(async()=>{if(++calls===1)throw Error("private-provider-value");return (_req,res)=>res.end("ok");});
  const response=()=>({headersSent:false,headers:{},setHeader(key,value){this.headers[key]=value;},end(body){this.body=body;}});
  const records=[];const first=response();await createServerlessHandler(load,record=>records.push(record))({url:"/api/me"},first);
  assert.equal(first.statusCode,503);assert.equal(first.headers["Cache-Control"],"no-store");assert.ok(!first.body.includes("private-provider-value"));
  assert.equal(records.length,1);assert.ok(!JSON.stringify(records).includes("private-provider-value"));assert.equal(records[0].requestId,first.headers["X-Request-ID"]);
  const second=response();await createServerlessHandler(load)({url:"/api/me"},second);assert.equal(second.body,"ok");
});
test("the deployment routes API and health before SPA, and missing assets never return HTML",()=>{
  const config=JSON.parse(readFileSync(new URL("../../vercel.json",import.meta.url),"utf8"));
  const route=url=>config.routes.find(rule=>rule.src&&new RegExp(`^(?:${rule.src})$`).test(url));
  assert.equal(route("/api/orders/123").dest,"/api/index.js");assert.equal(route("/health/ready").dest,"/api/index.js");
  assert.equal(route("/account/drafts").dest,"/index.html");assert.equal(route("/assets/missing.js").status,404);
  assert.equal(config.outputDirectory,"client/dist");assert.equal(config.functions["api/index.js"].maxDuration,60);
});
test("rate buckets share atomic counts across store instances, hash IPs, and reset by time",async()=>{
  const records=new Map();
  const Model={async findOneAndUpdate(query,update){const id=`${query.key}:${query.bucket}`;let value=records.get(id)||{...update.$setOnInsert,hits:0};value.hits+=update.$inc.hits;records.set(id,value);return {...value};}};
  let now=1000;const a=new MongoRateLimitStore(Model,"login",()=>now),b=new MongoRateLimitStore(Model,"login",()=>now),other=new MongoRateLimitStore(Model,"orders",()=>now);
  for(const store of[a,b,other])store.init({windowMs:10000});
  const hits=await Promise.all(Array.from({length:60},(_,index)=>(index%2?a:b).increment("192.0.2.2")));
  assert.equal(Math.max(...hits.map(hit=>hit.totalHits)),60);assert.equal((await other.increment("192.0.2.2")).totalHits,1);
  assert.ok([...records.keys()].every(key=>!key.includes("192.0.2.2")));
  now=10001;assert.equal((await a.increment("192.0.2.2")).totalHits,1);
});
