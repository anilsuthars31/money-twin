import { Schema, Types, model, models, type InferSchemaType, type Model } from "mongoose";
import { resetModelInDev } from "@/lib/model";

// The player's twin in their account, so it follows them across devices: the character they made,
// and their Money Skills book (XP, learned lessons, and the numbers lessons use). One per user.
// Playing without an account keeps a copy in the browser only.
const twinSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, unique: true },
    character: {
      type: new Schema(
        {
          type: { type: String, enum: ["student", "first-job", "professional"], required: true },
          name: { type: String, required: true, maxlength: 20 },
          city: { type: String, required: true, maxlength: 40 },
          avatarSeed: { type: String, required: true, maxlength: 80 },
          createdAt: { type: String, default: "" },
          updatedAt: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: undefined,
    },
    skills: {
      type: new Schema(
        {
          xp: { type: Number, default: 0, min: 0 },
          learned: { type: Schema.Types.Mixed, default: {} }, // lessonId → { correct, at }
          context: { type: Schema.Types.Mixed }, // the player's own numbers for lessons
          updatedAt: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true, collection: "twins" },
);

export type TwinDoc = InferSchemaType<typeof twinSchema>;

resetModelInDev("Twin");
export const Twin: Model<TwinDoc> = (models.Twin as Model<TwinDoc>) ?? model<TwinDoc>("Twin", twinSchema);
