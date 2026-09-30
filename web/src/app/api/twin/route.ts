import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUserId, twinBody } from "@/lib/api";
import { Twin, type TwinDoc } from "@/models/Twin";

const shape = (doc: TwinDoc | null) =>
  doc ? { character: doc.character ?? null, skills: doc.skills ?? null, replay: doc.replay ?? null, updatedAt: doc.updatedAt } : null;

/** GET /api/twin: the character, Money Skills book and replay progress saved in the account (null if none yet). */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const doc = await Twin.findOne({ userId }).lean();
  return NextResponse.json({ twin: shape(doc) });
});

/**
 * PUT /api/twin  { character?, skills?, replay? }
 * Saves the twin to the account. Parts left out are kept; null clears a part.
 */
export const PUT = handle(async (req: NextRequest) => {
  const userId = await requireUserId();
  const body = twinBody.parse(await req.json());
  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  for (const part of ["character", "skills", "replay"] as const) {
    if (body[part] === null) unset[part] = "";
    else if (body[part] !== undefined) set[part] = body[part];
  }
  const doc = await Twin.findOneAndUpdate(
    { userId },
    { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }), $setOnInsert: { userId } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return NextResponse.json({ twin: shape(doc) });
});
