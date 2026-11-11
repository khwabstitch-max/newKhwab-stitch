import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import pino from "pino";
import { loadConfig } from "./config.js";
import { createModels, transaction } from "./models.js";
import { createApp } from "./app.js";
import { imageProvider } from "./imagekit.js";
import { assertCredentialIndexes } from "./index-migration.js";
import { assertEnhancementIndexes } from "./enhancement-indexes.js";
import { assertGoogleIndexes } from "./routes-google.js";
import { assertDeploymentIndexes } from "./deployment-indexes.js";

// One pending connection/application per warm Node instance. Business state,
// sessions and limits remain in MongoDB, never in this cache.
export function createApplicationLoader(initialize) {
  let pending;
  return async () => {
    if(!pending)pending=Promise.resolve().then(initialize).catch(error=>{pending=undefined;throw error;});
    return pending;
  };
}
export const getApplication = createApplicationLoader(async()=>{
  const config=loadConfig(); // Hosting environment only; no dotenv side effect.
  mongoose.set("bufferCommands",false);
  if(mongoose.connection.readyState!==1) await mongoose.connect(config.MONGODB_URI,{
    autoIndex:false,maxPoolSize:5,minPoolSize:0,maxIdleTimeMS:60000,
    serverSelectionTimeoutMS:8000,connectTimeoutMS:8000,socketTimeoutMS:20000,
  });
  const models=createModels();
  await assertCredentialIndexes(models);
  await assertEnhancementIndexes(models);
  if(config.GOOGLE_CLIENT_ID)await assertGoogleIndexes(models);
  await assertDeploymentIndexes(models);
  return createApp({config:{...config,SERVERLESS:true},models,transaction,images:imageProvider(config),logger:pino({level:config.LOG_LEVEL}),dbReady:()=>mongoose.connection.readyState===1});
});
export function createServerlessHandler(loadApplication=getApplication, logFailure=record=>console.error(JSON.stringify(record))) {
  return async(req,res)=>{
    try { const app=await loadApplication(); return app(req,res); }
    catch(error) { const requestId=randomUUID();logFailure({event:"bootstrap_failed",requestId,errorName:["Error","MongoServerError","MongoServerSelectionError","MongooseError"].includes(error?.name)?error.name:"InitializationError"});if(!res.headersSent){res.statusCode=503;res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.setHeader("X-Request-ID",requestId);res.end(JSON.stringify({error:{code:"SERVICE_UNAVAILABLE",requestId,message:"The atelier is temporarily unavailable. Please try again."}}));} }
  };
}
export default createServerlessHandler();
