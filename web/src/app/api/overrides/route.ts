import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUserId, saveOverridesBody } from "@/lib/api";
import { categoryForLabel, payeeKey, type FriendMode, type FriendReceived } from "@/lib/categories";
import { MerchantOverride } from "@/models/MerchantOverride";
import { Transaction } from "@/models/Transaction";

/** GET /api/overrides: every payee the user has labelled. */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const rows = await MerchantOverride.find({ userId }).sort({ counterparty: 1 }).lean();
  return NextResponse.json({
    overrides: rows.map((o) => ({
      key: o.key,
      counterparty: o.counterparty,
      category: o.category,
      ...(o.nickname && { nickname: o.nickname }),
      ...(o.friendMode && { friendMode: o.friendMode }),
      ...(o.friendReceived && { friendReceived: o.friendReceived }),
      updatedAt: o.updatedAt,
    })),
  });
});

/**
 * PUT /api/overrides  { overrides: [{ counterparty, category }] }
 * Saves payee labels ("Manjunath S" → Food, "Ramesh Kumar" → Family, your own name → Self, a friend
 * → Friend), optionally with a nickname ("Gym trainer"), and
 * re-labels the user's saved transactions from those payees with confidence "user".
 */
export const PUT = handle(async (req: NextRequest) => {
  const userId = await requireUserId();
  const { overrides } = saveOverridesBody.parse(await req.json());
  const saved = await MerchantOverride.bulkWrite(
    overrides.map(({ counterparty, category, nickname, friendMode, friendReceived }) => ({
      updateOne: {
        filter: { userId, key: payeeKey(counterparty) },
        update: {
          $set: {
            counterparty,
            category,
            ...(nickname && { nickname }),
            ...(category === "Friend" && friendMode && { friendMode: friendMode as FriendMode }),
            ...(category === "Friend" && friendReceived && { friendReceived: friendReceived as FriendReceived }),
          },
          ...((nickname === null || category !== "Friend") && {
            $unset: { ...(nickname === null && { nickname: "" }), ...(category !== "Friend" && { friendMode: "", friendReceived: "" }) },
          }),
          $setOnInsert: { userId, key: payeeKey(counterparty) },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  // Re-label saved transactions with the same rule the browser uses (categoryForLabel): Family by
  // direction, Self as a transfer, Friend by what the money was in each direction.
  const keys = overrides.map((o) => payeeKey(o.counterparty));
  const labels = new Map(
    (await MerchantOverride.find({ userId, key: { $in: keys } }).lean()).map((o) => [
      o.key,
      {
        category: o.category,
        mode: (o.friendMode ?? undefined) as FriendMode | undefined,
        received: (o.friendReceived ?? undefined) as FriendReceived | undefined,
      },
    ]),
  );
  const affected = await Transaction.find({ userId, payeeKey: { $in: keys } }, { type: 1, amount: 1, datetime: 1, payeeKey: 1 }).lean();
  const relabel = affected.length
    ? await Transaction.bulkWrite(
        affected.map((t) => {
          const label = labels.get(t.payeeKey)!;
          return {
            updateOne: {
              filter: { _id: t._id },
              update: { $set: { category: categoryForLabel(label.category, t as never, label.mode, label.received), confidence: "user" } },
            },
          };
        }),
        { ordered: false },
      )
    : { modifiedCount: 0 };
  return NextResponse.json({
    saved: saved.upsertedCount + saved.modifiedCount,
    relabelledTransactions: relabel.modifiedCount,
  });
});

/** DELETE /api/overrides: removes all payee labels. */
export const DELETE = handle(async () => {
  const userId = await requireUserId();
  const { deletedCount } = await MerchantOverride.deleteMany({ userId });
  return NextResponse.json({ deleted: deletedCount });
});
