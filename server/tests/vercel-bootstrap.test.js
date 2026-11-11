import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import deployedService, { createVercelService } from "../src/vercel.js";
import { StartupError, startupStep } from "../src/startup.js";
import { ConfigurationError, loadConfig } from "../src/config.js";
import autoDetectedService, { createApp } from "../src/app.js";

test("the actual Vercel Express entry imports without configuration and liveness does not connect",async()=>{
  const response=await request(deployedService).get("/health/live");
  assert.equal(response.status,200);assert.equal(response.body.data.status,"alive");
});
test("Vercel's auto-detected src/app entry has a default Express export and retains its injectable factory",async()=>{
  assert.equal(typeof autoDetectedService,"function");assert.equal(typeof autoDetectedService.use,"function");assert.equal(typeof createApp,"function");
  assert.equal((await request(autoDetectedService).get("/health/live")).status,200);
});
test("readiness and login return safe diagnosed503 when startup fails instead of an invocation crash",async()=>{
  const records=[];let calls=0;
  const fixtureUri=new URL("mongodb://host/database");fixtureUri.username="private-user";fixtureUri.password="private-password";
  const app=createVercelService({loadApplication:async()=>{calls++;throw new StartupError("database",new Error(fixtureUri.toString()));},logFailure:record=>records.push(record)});
  assert.equal((await request(app).get("/health/live")).status,200);assert.equal(calls,0);
  for(const response of [await request(app).get("/health/ready"),await request(app).post("/api/auth/login").send({email:"test@example.test",password:"private-password"})]){
    assert.equal(response.status,503);assert.equal(response.body.error.code,"DATABASE_CONNECTION_FAILED");assert.equal(response.headers["cache-control"],"no-store");assert.equal(response.body.error.requestId,response.headers["x-request-id"]);
    assert.ok(!JSON.stringify(response.body).includes("private-password"));
  }
  assert.equal(records.length,2);assert.ok(!JSON.stringify(records).includes("private-user"));
});
test("configuration diagnostics log only approved variable names and never their values",async()=>{
  const records=[];
  const app=createVercelService({loadApplication:()=>startupStep("configuration",()=>{throw new ConfigurationError("secret-value",["JWT_SECRET","MONGODB_URI","secret-value"]);}),logFailure:record=>records.push(record)});
  const response=await request(app).get("/api/auth/capabilities");
  assert.equal(response.status,503);assert.equal(response.body.error.code,"CONFIGURATION_INVALID");
  assert.deepEqual(records[0].configurationFields,["JWT_SECRET","MONGODB_URI"]);assert.ok(!JSON.stringify(records).includes("secret-value"));
});
test("missing migrations remain fail-closed with a precise category",async()=>{
  const app=createVercelService({loadApplication:()=>startupStep("credential_indexes",()=>{throw Error("operator migration required");}),logFailure:()=>{}});
  const response=await request(app).post("/api/auth/register").send({});
  assert.equal(response.status,503);assert.equal(response.body.error.code,"AUTH_INDEXES_REQUIRED");
});

test("an invalid optional ImageKit privacy flag does not block the actual authentication capabilities route",async()=>{
  const records=[];
  const config=loadConfig({NODE_ENV:"test",MONGODB_URI:"mongodb://localhost/isolated",CORS_ORIGINS:"https://example.test",JWT_SECRET:Buffer.alloc(48,7).toString("base64url"),IMAGEKIT_PRIVATE_POLICY_VERIFIED:"not-a-policy-status"});
  const application=createApp({config,models:{},images:{},logger:{info(){},warn(record){records.push(record);}},dbReady:()=>true});
  const app=createVercelService({loadApplication:async()=>application});
  const response=await request(app).get("/api/auth/capabilities");
  assert.equal(response.status,200);
  assert.equal(config.IMAGEKIT_PRIVATE_POLICY_VERIFIED,"false");
  assert.deepEqual(records,[{event:"private_media_disabled",field:"IMAGEKIT_PRIVATE_POLICY_VERIFIED"}]);
  assert.ok(!JSON.stringify(records).includes("not-a-policy-status"));
});
test("the Express gateway preserves JSON, multipart streams and original API paths",async()=>{
  const actual=express();actual.use(express.json());actual.post("/api/auth/login",(req,res)=>res.json({method:req.method,path:req.path,email:req.body.email}));
  actual.post("/api/media",(req,res)=>{let bytes=0;req.on("data",chunk=>bytes+=chunk.length);req.on("end",()=>res.json({bytes,type:req.headers["content-type"]}));});
  const app=createVercelService({loadApplication:async()=>actual});
  const login=await request(app).post("/api/auth/login").send({email:"test@example.test"});assert.equal(login.status,200);assert.equal(login.body.path,"/api/auth/login");assert.equal(login.body.email,"test@example.test");
  const media=await request(app).post("/api/media").attach("file",Buffer.from("fixture"),"fixture.txt");assert.equal(media.status,200);assert.ok(media.body.bytes>0);assert.ok(media.body.type.startsWith("multipart/form-data"));
});
