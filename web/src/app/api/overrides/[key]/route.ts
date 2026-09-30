import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUserId } from "@/lib/api";
import { payeeKey } from "@/lib/categories";
import { MerchantOverride } from "@/models/MerchantOverride";

/** DELETE /api/overrides/:key: forget one payee label (key = name, case and spaces ignored). */
export const DELETE = handle(async (_req: NextRequest, ctx: RouteContext<"/api/overrides/[key]">) => {
  const userId = await requireUserId();
  const { key } = await ctx.params;
  const { deletedCount } = await MerchantOverride.deleteOne({ userId, key: payeeKey(decodeURIComponent(key)) });
  if (!deletedCount) return NextResponse.json({ error: "No label for that payee." }, { status: 404 });
  return NextResponse.json({ deleted: 1 });
});
