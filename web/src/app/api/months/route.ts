import { NextResponse } from "next/server";
import { handle, requireUserId } from "@/lib/api";
import { Transaction } from "@/models/Transaction";

// Same rules as the replay and the dashboard (src/game/replay/real-month.ts):
// - spent: everything out except internal bank moves, your own accounts, and money lent to friends;
// - came in: everything in except internal bank moves and your own accounts. That's income plus
//   refunds/cashback/interest plus friends paying you back.
const NOT_SPENT = ["Internal (ignore)", "Self Transfer", "Friend"];
const NOT_RECEIVED = ["Internal (ignore)", "Self Transfer"];

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
          $sum: { $cond: [{ $and: [{ $eq: ["$type", "DR"] }, { $not: [{ $in: ["$category", NOT_SPENT] }] }] }, "$amount", 0] },
        },
        received: {
          $sum: { $cond: [{ $and: [{ $eq: ["$type", "CR"] }, { $not: [{ $in: ["$category", NOT_RECEIVED] }] }] }, "$amount", 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return NextResponse.json({
    months: rows.map((r) => ({ month: r._id, count: r.count, spent: Math.round(r.spent), received: Math.round(r.received) })),
  });
});
