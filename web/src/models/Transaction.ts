import { Schema, Types, model, models, type InferSchemaType, type Model } from "mongoose";
import { ALL_CATEGORIES } from "@/lib/categories";

// A categorised transaction, parsed in the browser. Never the raw statement: no description text
// (it holds UPI refs and other people's handles), only what the game needs.
const transactionSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    /** Hash of (datetime, description, amount, type, balance), computed in the browser. Dedupes re-uploads. */
    fingerprint: { type: String, required: true },
    datetime: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ["DR", "CR"], required: true },
    balance: { type: Number },
    channel: { type: String, enum: ["UPI", "REV-UPI", "CARD", "ATM", "BILLPAY", "IMPS", "OTHER"], required: true },
    counterparty: { type: String, required: true, maxlength: 80 },
    payeeKey: { type: String, required: true }, // payeeKey(counterparty): how labels find their transactions
    category: { type: String, enum: ALL_CATEGORIES, required: true },
    confidence: { type: String, enum: ["high", "medium", "low", "user"], required: true },
  },
  { timestamps: true, collection: "transactions" },
);

transactionSchema.index({ userId: 1, fingerprint: 1 }, { unique: true });
transactionSchema.index({ userId: 1, datetime: -1 });
transactionSchema.index({ userId: 1, payeeKey: 1 });

export type TransactionDoc = InferSchemaType<typeof transactionSchema>;

export const Transaction: Model<TransactionDoc> =
  (models.Transaction as Model<TransactionDoc>) ?? model<TransactionDoc>("Transaction", transactionSchema);
