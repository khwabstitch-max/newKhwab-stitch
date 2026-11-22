import http from "node:http";
import mongoose from "mongoose";
import { connectDatabase } from "./database-connect.js";
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
import { initChatSocket } from "./chat-socket.js";
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
mongoose.set("bufferCommands", false);
await connectDatabase(mongoose, config, {
  autoIndex: config.NODE_ENV !== "production",
  maxPoolSize: 10,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 20000,
}, { logger });
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
let io;
if (!process.env.VERCEL) {
  const httpServer = http.createServer(app);
  io = initChatSocket(httpServer, { config, models, logger });
  server = httpServer.listen(config.PORT, "0.0.0.0", () =>
    logger.info({ port: config.PORT }, "API listening with Socket.IO"),
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
    if (io) {
      try {
        io.close();
      } catch (err) {
        logger.warn({ err }, "Error closing socket server");
      }
    }
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
