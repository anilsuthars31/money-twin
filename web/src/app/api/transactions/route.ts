import { NextResponse, type NextRequest } from "next/server";
import { handle, listTransactionsQuery, requireUserId, saveTransactionsBody } from "@/lib/api";
import { payeeKey } from "@/lib/categories";
import { Transaction } from "@/models/Transaction";

const toJson = (t: Record<string, unknown>) => ({
  id: String(t._id),
  fingerprint: t.fingerprint,
  datetime: t.datetime,
  amount: t.amount,
  type: t.type,
  balance: t.balance,
  channel: t.channel,
  counterparty: t.counterparty,
  category: t.category,
  confidence: t.confidence,
});

/** GET /api/transactions?from=&to=&limit=: the signed-in user's transactions, newest first. */
export const GET = handle(async (req: NextRequest) => {
  const userId = await requireUserId();
  const q = listTransactionsQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
  const filter: Record<string, unknown> = { userId };
  if (q.from || q.to) filter.datetime = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
  const [rows, total] = await Promise.all([
    Transaction.find(filter).sort({ datetime: -1 }).limit(q.limit).lean(),
    Transaction.countDocuments(filter),
  ]);
  return NextResponse.json({ transactions: rows.map(toJson), total });
});

/**
 * POST /api/transactions  { transactions: [...] }
 * Saves categorised transactions. Re-uploading an overlapping statement is safe: rows are matched
 * on their fingerprint, new ones are inserted and existing ones only get their category updated.
 */
export const POST = handle(async (req: NextRequest) => {
  const userId = await requireUserId();
  const { transactions } = saveTransactionsBody.parse(await req.json());
  const result = await Transaction.bulkWrite(
    transactions.map(({ fingerprint, category, confidence, ...rest }) => ({
      updateOne: {
        filter: { userId, fingerprint },
        update: {
          $set: { category, confidence },
          $setOnInsert: { userId, fingerprint, payeeKey: payeeKey(rest.counterparty), ...rest },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return NextResponse.json(
    { received: transactions.length, inserted: result.upsertedCount, updated: result.modifiedCount },
    { status: result.upsertedCount > 0 ? 201 : 200 },
  );
});

/** DELETE /api/transactions: removes all of the user's transactions (payee labels are kept). */
export const DELETE = handle(async () => {
  const userId = await requireUserId();
  const { deletedCount } = await Transaction.deleteMany({ userId });
  return NextResponse.json({ deleted: deletedCount });
});
