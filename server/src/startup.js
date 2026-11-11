import { randomUUID } from "node:crypto";

const codes = {
  configuration: "CONFIGURATION_INVALID",
  database: "DATABASE_CONNECTION_FAILED",
  credential_indexes: "AUTH_INDEXES_REQUIRED",
  feature_indexes: "FEATURE_INDEXES_REQUIRED",
  deployment_indexes: "DEPLOYMENT_INDEXES_REQUIRED",
  google_indexes: "GOOGLE_INDEXES_REQUIRED",
  runtime_import: "RUNTIME_IMPORT_FAILED",
  application: "APPLICATION_STARTUP_FAILED",
};
const configNames = new Set(["NODE_ENV","PORT","MONGODB_URI","CORS_ORIGINS","TRUST_PROXY_HOPS","JWT_SECRET","RESEND_API_KEY","EMAIL_FROM","PUBLIC_WEB_URL","GOOGLE_CLIENT_ID","IMAGEKIT_PRIVATE_KEY","IMAGEKIT_URL_ENDPOINT","IMAGEKIT_PRIVATE_POLICY_VERIFIED","LOG_LEVEL"]);
export class StartupError extends Error {
  constructor(stage, cause) { super("The application could not initialize.",{cause});this.name="StartupError";this.stage=stage;this.code=codes[stage]||"SERVICE_UNAVAILABLE";this.fields=cause?.name==="ConfigurationError"?(cause.fields||[]).filter(field=>configNames.has(field)):[]; }
}
export async function startupStep(stage, work) { try{return await work();}catch(error){throw new StartupError(stage,error);} }
export function createApplicationLoader(initialize) {
  let pending;
  return async()=>{if(!pending)pending=Promise.resolve().then(initialize).catch(error=>{pending=undefined;throw error;});return pending;};
}
export function createServerlessHandler(loadApplication, logFailure=record=>console.error(JSON.stringify(record))) {
  return async(req,res)=>{
    try{const app=await loadApplication();return app(req,res);}
    catch(error){
      const requestId=randomUUID(),known=error instanceof StartupError;
      const code=known?error.code:"SERVICE_UNAVAILABLE",stage=known?error.stage:"initialization";
      logFailure({event:"bootstrap_failed",requestId,code,stage,...(known&&error.fields.length?{configurationFields:error.fields}:{})});
      if(!res.headersSent){res.statusCode=503;res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.setHeader("X-Request-ID",requestId);res.end(JSON.stringify({error:{code,stage,requestId,message:"The atelier is temporarily unavailable. Please try again."}}));}
    }
  };
}
