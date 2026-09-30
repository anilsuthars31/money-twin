import { NextResponse } from "next/server";
import { handle, requireUserId } from "@/lib/api";
import { MerchantOverride } from "@/models/MerchantOverride";
import { Transaction } from "@/models/Transaction";
import { User } from "@/models/User";

/** GET /api/me: who's signed in, and how much of their data is stored. */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const [user, transactions, overrides] = await Promise.all([
    User.findById(userId).lean(),
    Transaction.countDocuments({ userId }),
    MerchantOverride.countDocuments({ userId }),
  ]);
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json({
    user: { id: String(userId), email: user.email, name: user.name, image: user.image, createdAt: user.createdAt },
    counts: { transactions, overrides },
  });
});

/** DELETE /api/me: "Delete all my data". Removes transactions, payee labels and the account itself. */
export const DELETE = handle(async () => {
  const userId = await requireUserId();
  const [transactions, overrides, users] = await Promise.all([
    Transaction.deleteMany({ userId }),
    MerchantOverride.deleteMany({ userId }),
    User.deleteOne({ _id: userId }),
  ]);
  return NextResponse.json({
    deleted: { transactions: transactions.deletedCount, overrides: overrides.deletedCount, account: users.deletedCount === 1 },
  });
});
