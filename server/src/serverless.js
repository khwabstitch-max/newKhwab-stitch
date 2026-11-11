import mongoose from "mongoose";
import pino from "pino";
import { loadConfig } from "./config.js";
import { createModels, transaction } from "./models.js";
import { createApp } from "./app.js";
import { imageProvider } from "./imagekit.js";
import { databaseReady } from "./database-health.js";
import { assertCredentialIndexes } from "./index-migration.js";
import { assertEnhancementIndexes } from "./enhancement-indexes.js";
import { assertGoogleIndexes } from "./routes-google.js";
import { assertDeploymentIndexes } from "./deployment-indexes.js";
import { createApplicationLoader, createServerlessHandler, startupStep } from "./startup.js";
export { createApplicationLoader, createServerlessHandler } from "./startup.js";

// One pending connection/application per warm Node instance. Business state,
// sessions and limits remain in MongoDB, never in this cache.
export const getApplication = createApplicationLoader(async()=>{
  const config=await startupStep("configuration",()=>loadConfig());
  mongoose.set("bufferCommands",false);
  if(mongoose.connection.readyState!==1) await startupStep("database",()=>mongoose.connect(config.MONGODB_URI,{
    autoIndex:false,maxPoolSize:5,minPoolSize:0,maxIdleTimeMS:60000,
    serverSelectionTimeoutMS:8000,connectTimeoutMS:8000,socketTimeoutMS:20000,
  }));
  const models=createModels();
  await startupStep("credential_indexes",()=>assertCredentialIndexes(models));
  await startupStep("feature_indexes",()=>assertEnhancementIndexes(models));
  if(config.GOOGLE_CLIENT_ID)await startupStep("google_indexes",()=>assertGoogleIndexes(models));
  await startupStep("deployment_indexes",()=>assertDeploymentIndexes(models));
  return startupStep("application",()=>createApp({config:{...config,SERVERLESS:true},models,transaction,images:imageProvider(config),logger:pino({level:config.LOG_LEVEL}),dbReady:()=>databaseReady(mongoose.connection)}));
});
export default createServerlessHandler(getApplication);
