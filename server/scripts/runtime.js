import mongoose from "mongoose";
import "dotenv/config";
import { loadConfig } from "../src/config.js";
import { models, transaction } from "../src/models.js";
import { imageProvider } from "../src/imagekit.js";

export async function connect() {
  const config = loadConfig();
  mongoose.set("bufferCommands", false);
  await mongoose.connect(config.MONGODB_URI, {
    autoIndex: false,
    maxPoolSize: 3,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 20000,
  });
  return {
    config,
    models,
    transaction,
    images: imageProvider(config),
    disconnect: () => mongoose.disconnect(),
  };
}
