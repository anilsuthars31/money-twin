import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// One document per person who signs in. Created or updated on every sign-in (see src/auth.ts).
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    image: { type: String, default: "" },
    providers: { type: [String], default: [] }, // "google", "dev-login"
    lastSignInAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "users" },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> = (models.User as Model<UserDoc>) ?? model<UserDoc>("User", userSchema);
