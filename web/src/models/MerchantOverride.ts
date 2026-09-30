import { Schema, Types, model, models, type InferSchemaType, type Model } from "mongoose";
import { ALL_CATEGORIES } from "@/lib/categories";

// What the player taught their twin: "Manjunath S is Food", "Ramesh Kumar is Family", "this is me".
// Per user, keyed by the payee name without spaces or case.
const merchantOverrideSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    key: { type: String, required: true }, // payeeKey(counterparty)
    counterparty: { type: String, required: true, maxlength: 80 }, // as shown on the statement
    category: { type: String, enum: ALL_CATEGORIES, required: true },
  },
  { timestamps: true, collection: "merchantOverrides" },
);

merchantOverrideSchema.index({ userId: 1, key: 1 }, { unique: true });

export type MerchantOverrideDoc = InferSchemaType<typeof merchantOverrideSchema>;

export const MerchantOverride: Model<MerchantOverrideDoc> =
  (models.MerchantOverride as Model<MerchantOverrideDoc>) ??
  model<MerchantOverrideDoc>("MerchantOverride", merchantOverrideSchema);
