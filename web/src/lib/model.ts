import mongoose from "mongoose";

/**
 * In development, modules reload on every edit but Mongoose keeps the model compiled from the old
 * schema, silently dropping fields added since (e.g. a new `nickname`). Call this before defining a
 * model so it's rebuilt from the current schema. Does nothing in production.
 */
export function resetModelInDev(name: string) {
  if (process.env.NODE_ENV === "development" && mongoose.models[name]) mongoose.deleteModel(name);
}
