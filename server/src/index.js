import mongoose from "mongoose";
import "dotenv/config";
import pino from "pino";
import { loadConfig } from "./config.js";
import { models, transaction } from "./models.js";
import { imageProvider } from "./imagekit.js";
import { databaseReady } from "./database-health.js";
import { createApp } from "./app.js";
import { assertCredentialIndexes } from "./index-migration.js";
import { assertGoogleIndexes } from "./routes-google.js";
import { assertEnhancementIndexes } from "./enhancement-indexes.js";
import { assertDeploymentIndexes } from "./deployment-indexes.js";
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
mongoose.set("bufferCommands", false);
await mongoose.connect(config.MONGODB_URI, {
  autoIndex: config.NODE_ENV !== "production",
  maxPoolSize: 10,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 20000,
});
await models.User.init();
await assertCredentialIndexes(models);
await Promise.all(Object.values(models).map((model) => model.init()));
await assertEnhancementIndexes(models);
if (config.NODE_ENV === "production") await assertDeploymentIndexes(models);
if (config.GOOGLE_CLIENT_ID) await assertGoogleIndexes(models);
const app = createApp({
  config,
  logger,
  models,
  transaction,
  images: imageProvider(config),
  dbReady: () => databaseReady(mongoose.connection),
});
let server;
if (!process.env.VERCEL) {
  server = app.listen(config.PORT, "0.0.0.0", () =>
    logger.info({ port: config.PORT }, "API listening"),
  );
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  let stopping = false;
  function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "Graceful shutdown");
    const timer = setTimeout(() => {
      logger.error("Shutdown timeout");
      process.exit(1);
    }, 20000);
    timer.unref();
    server.close(async () => {
      await mongoose.disconnect();
      clearTimeout(timer);
      process.exit(0);
    });
    server.closeIdleConnections();
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export default app;
