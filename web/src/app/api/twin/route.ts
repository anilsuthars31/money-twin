import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUserId, twinBody } from "@/lib/api";
import { Twin } from "@/models/Twin";

/** GET /api/twin: the character and Money Skills book saved in the account (null if none yet). */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const doc = await Twin.findOne({ userId }).lean();
  return NextResponse.json({
    twin: doc ? { character: doc.character ?? null, skills: doc.skills ?? null, updatedAt: doc.updatedAt } : null,
  });
});

/**
 * PUT /api/twin  { character?, skills? }
 * Saves the twin to the account. Parts left out are kept; null clears a part.
 */
export const PUT = handle(async (req: NextRequest) => {
  const userId = await requireUserId();
  const body = twinBody.parse(await req.json());
  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  for (const part of ["character", "skills"] as const) {
    if (body[part] === null) unset[part] = "";
    else if (body[part] !== undefined) set[part] = body[part];
  }
  const doc = await Twin.findOneAndUpdate(
    { userId },
    { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }), $setOnInsert: { userId } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return NextResponse.json({ twin: { character: doc?.character ?? null, skills: doc?.skills ?? null, updatedAt: doc?.updatedAt } });
});
