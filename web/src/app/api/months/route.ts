import { NextResponse } from "next/server";
import { handle, requireUserId } from "@/lib/api";
import { Transaction } from "@/models/Transaction";

// Neither spending nor income: internal bank moves, transfers between your own accounts, and
// money with friends (lent or paid back). Same rules as the rest of the app.
const NOT_COUNTED = ["Internal (ignore)", "Self Transfer", "Friend"];

/**
 * GET /api/months: every month with saved transactions (in India time), oldest first, with how
 * much was spent and how much came in. Used by the "Replay your real past" month picker.
 */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const rows = await Transaction.aggregate<{ _id: string; count: number; spent: number; received: number }>([
    { $match: { userId } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$datetime", timezone: "+05:30" } },
        count: { $sum: 1 },
        spent: {
          $sum: { $cond: [{ $and: [{ $eq: ["$type", "DR"] }, { $not: [{ $in: ["$category", NOT_COUNTED] }] }] }, "$amount", 0] },
        },
        received: {
          $sum: { $cond: [{ $and: [{ $eq: ["$type", "CR"] }, { $not: [{ $in: ["$category", NOT_COUNTED] }] }] }, "$amount", 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return NextResponse.json({
    months: rows.map((r) => ({ month: r._id, count: r.count, spent: Math.round(r.spent), received: Math.round(r.received) })),
  });
});
