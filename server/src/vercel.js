import express from "express";
import { createApplicationLoader, createServerlessHandler, startupStep } from "./startup.js";

// Vercel Services imports an Express application. Configuration, database and
// optional SDK loading must happen inside a request error boundary, not during
// module evaluation; otherwise Vercel returns FUNCTION_INVOCATION_FAILED.
export function createVercelService({ loadApplication, logFailure }={}) {
  const load=loadApplication||createApplicationLoader(async()=>{
    const runtime=await startupStep("runtime_import",()=>import("./serverless.js"));
    return runtime.getApplication();
  });
  const app=express();app.disable("x-powered-by");
  app.get("/health/live",(_req,res)=>res.set("Cache-Control","no-store").json({data:{status:"alive"}}));
  app.use(createServerlessHandler(load,logFailure));
  return app;
}
export default createVercelService();
