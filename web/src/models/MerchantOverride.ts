import { Schema, Types, model, models, type InferSchemaType, type Model } from "mongoose";
import { resetModelInDev } from "@/lib/model";
import { ALL_CATEGORIES } from "@/lib/categories";

// What the player taught their twin: "Manjunath S is Food", "Ramesh Kumar is Family", "this is me",
// and optionally a nickname ("Gym trainer") to use instead of the raw UPI name.
// Per user, keyed by the payee name without spaces or case.
const merchantOverrideSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    key: { type: String, required: true }, // payeeKey(counterparty)
    counterparty: { type: String, required: true, maxlength: 80 }, // as shown on the statement
    category: { type: String, enum: ALL_CATEGORIES, required: true },
    /** What the player calls them ("Gym trainer"), shown instead of the raw UPI name. */
    nickname: { type: String, maxlength: 40 },
    /** For friends: money sent to them was mostly lending ("lend") or their share of outings ("share"). */
    friendMode: { type: String, enum: ["lend", "share"] },
  },
  { timestamps: true, collection: "merchantOverrides" },
);

merchantOverrideSchema.index({ userId: 1, key: 1 }, { unique: true });

export type MerchantOverrideDoc = InferSchemaType<typeof merchantOverrideSchema>;

resetModelInDev("MerchantOverride");
export const MerchantOverride: Model<MerchantOverrideDoc> = (models.MerchantOverride as Model<MerchantOverrideDoc>) ?? model<MerchantOverrideDoc>("MerchantOverride", merchantOverrideSchema);
