import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUserId, saveOverridesBody } from "@/lib/api";
import { payeeKey } from "@/lib/categories";
import { MerchantOverride } from "@/models/MerchantOverride";
import { Transaction } from "@/models/Transaction";

/** GET /api/overrides: every payee the user has labelled. */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const rows = await MerchantOverride.find({ userId }).sort({ counterparty: 1 }).lean();
  return NextResponse.json({
    overrides: rows.map((o) => ({ key: o.key, counterparty: o.counterparty, category: o.category, updatedAt: o.updatedAt })),
  });
});

/**
 * PUT /api/overrides  { overrides: [{ counterparty, category }] }
 * Saves payee labels ("Manjunath S" → Food, "Ramesh Kumar" → Family, your own name → Self) and
 * re-labels the user's saved transactions from those payees with confidence "user".
 */
export const PUT = handle(async (req: NextRequest) => {
  const userId = await requireUserId();
  const { overrides } = saveOverridesBody.parse(await req.json());
  const saved = await MerchantOverride.bulkWrite(
    overrides.map(({ counterparty, category }) => ({
      updateOne: {
        filter: { userId, key: payeeKey(counterparty) },
        update: { $set: { counterparty, category }, $setOnInsert: { userId, key: payeeKey(counterparty) } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  const relabel = await Transaction.bulkWrite(
    overrides.map(({ counterparty, category }) => ({
      updateMany: {
        filter: { userId, payeeKey: payeeKey(counterparty) },
        update: { $set: { category, confidence: "user" } },
      },
    })),
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
