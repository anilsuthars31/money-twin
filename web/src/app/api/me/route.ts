import { NextResponse } from "next/server";
import { handle, requireUserId } from "@/lib/api";
import { savedRange } from "@/lib/saved-range";
import { MerchantOverride } from "@/models/MerchantOverride";
import { Transaction } from "@/models/Transaction";
import { Twin } from "@/models/Twin";
import { User } from "@/models/User";

/** GET /api/me: who's signed in, and how much of their data is stored. */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const [user, transactions, overrides, twin, range] = await Promise.all([
    User.findById(userId).lean(),
    Transaction.countDocuments({ userId }),
    MerchantOverride.countDocuments({ userId }),
    Twin.exists({ userId }),
    savedRange(userId),
  ]);
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json({
    user: { id: String(userId), email: user.email, name: user.name, image: user.image, createdAt: user.createdAt },
    counts: { transactions, overrides },
    twin: Boolean(twin),
    savedRange: range,
  });
});

/** DELETE /api/me: "Delete all my data". Removes transactions, payee labels, the twin and the account. */
export const DELETE = handle(async () => {
  const userId = await requireUserId();
  const [transactions, overrides, twin, users] = await Promise.all([
    Transaction.deleteMany({ userId }),
    MerchantOverride.deleteMany({ userId }),
    Twin.deleteOne({ userId }),
    User.deleteOne({ _id: userId }),
  ]);
  return NextResponse.json({
    deleted: {
      transactions: transactions.deletedCount,
      overrides: overrides.deletedCount,
      twin: twin.deletedCount === 1,
      account: users.deletedCount === 1,
    },
  });
});
