import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUserId, saveOverridesBody } from "@/lib/api";
import { categoryForLabel, payeeKey } from "@/lib/categories";
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
    overrides.map(({ counterparty, category, nickname }) => ({
      updateOne: {
        filter: { userId, key: payeeKey(counterparty) },
        update: {
          $set: { counterparty, category, ...(nickname && { nickname }) },
          ...(nickname === null && { $unset: { nickname: "" } }),
          $setOnInsert: { userId, key: payeeKey(counterparty) },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  // Same mapping as the browser: "Family" becomes Family Support (in) or Sent to Family (out), "Self" a transfer.
  const relabel = await Transaction.bulkWrite(
    overrides.flatMap(({ counterparty, category }) =>
      (["DR", "CR"] as const).map((type) => ({
        updateMany: {
          filter: { userId, payeeKey: payeeKey(counterparty), type },
          update: { $set: { category: categoryForLabel(category, type), confidence: "user" } },
        },
      })),
    ),
    { ordered: false },
  );
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
