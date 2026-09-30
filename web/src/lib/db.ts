import mongoose from "mongoose";

// One shared connection per server process. In dev, Next reloads modules on every change, so the
// promise lives on globalThis to avoid opening a new connection each time. If the connection has
// been closed since (the database restarted, or it dropped), a new one is opened instead of
// handing back the old promise, which would leave queries waiting until they time out.

const globalForMongoose = globalThis as unknown as { mongoose?: Promise<typeof mongoose> };

export function connectDb(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Add it to web/.env.local.");
  const state = mongoose.connection.readyState; // 0 disconnected, 1 connected, 2 connecting, 3 disconnecting
  if (state === 1 && globalForMongoose.mongoose) return globalForMongoose.mongoose;
  if (!globalForMongoose.mongoose || state === 0 || state === 3) {
    globalForMongoose.mongoose = mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 }).catch((err) => {
      globalForMongoose.mongoose = undefined; // let the next request retry
      throw err;
    });
  }
  return globalForMongoose.mongoose;
}
