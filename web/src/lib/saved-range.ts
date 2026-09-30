import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { Transaction } from "@/models/Transaction";

/** How many transactions a user has saved, and the dates they cover (null if none). */
export async function savedRange(userId: Types.ObjectId | string) {
  await connectDb();
  const id = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  const [row] = await Transaction.aggregate<{ count: number; from: Date; to: Date }>([
    { $match: { userId: id } },
    { $group: { _id: null, count: { $sum: 1 }, from: { $min: "$datetime" }, to: { $max: "$datetime" } } },
  ]);
  return row ? { count: row.count, from: row.from.toISOString(), to: row.to.toISOString() } : null;
}
