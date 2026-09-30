import mongoose from "mongoose";

// One shared connection per server process. In dev, Next reloads modules on every change, so the
// promise lives on globalThis to avoid opening a new connection each time.

const globalForMongoose = globalThis as unknown as { mongoose?: Promise<typeof mongoose> };

export function connectDb(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Add it to web/.env.local.");
  globalForMongoose.mongoose ??= mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 }).catch((err) => {
    globalForMongoose.mongoose = undefined; // let the next request retry
    throw err;
  });
  return globalForMongoose.mongoose;
}
