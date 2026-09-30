import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { LESSON_ORDER } from "@/game/lessons";
import { ALL_CATEGORIES } from "@/lib/categories";
import { connectDb } from "@/lib/db";

// Shared bits for API route handlers: who's asking, input validation, consistent errors.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The signed-in user's MongoDB id, or a 401. Also makes sure the DB is connected. */
export async function requireUserId(): Promise<Types.ObjectId> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !Types.ObjectId.isValid(id)) throw new HttpError(401, "Sign in first.");
  await connectDb();
  return new Types.ObjectId(id);
}

/** Wraps a handler so thrown errors become JSON responses instead of HTML 500 pages. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request.", issues: z.flattenError(err) }, { status: 400 });
      }
      if (err instanceof SyntaxError) return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
      const name = (err as Error)?.name ?? "";
      if (name.startsWith("MongooseServerSelection") || name === "MongoNetworkError") {
        return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

// ---------------------------------------------------------------- request schemas

const category = z.enum(ALL_CATEGORIES as [string, ...string[]]);

/**
 * A categorised transaction from the browser parser. `.strict()` rejects unknown fields, so the raw
 * statement description (UPI refs, other people's handles) can never be stored by accident.
 */
export const transactionInput = z
  .object({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/, "SHA-256 hex"),
    datetime: z.coerce.date(),
    amount: z.number().nonnegative().max(1e9),
    type: z.enum(["DR", "CR"]),
    balance: z.number().optional(),
    channel: z.enum(["UPI", "REV-UPI", "CARD", "ATM", "BILLPAY", "IMPS", "OTHER"]),
    counterparty: z.string().trim().min(1).max(80),
    category,
    confidence: z.enum(["high", "medium", "low", "user"]),
  })
  .strict();

export const saveTransactionsBody = z.object({ transactions: z.array(transactionInput).min(1).max(5000) }).strict();

export const saveOverridesBody = z
  .object({
    overrides: z
      .array(
        z
          .object({
            counterparty: z.string().trim().min(1).max(80),
            category,
            // A nickname to show instead of the UPI name. Omit to keep the current one, null to remove it.
            nickname: z.string().trim().min(1).max(40).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

const isoish = z.string().max(40);

/** The twin as the browser stores it (see src/game/character.ts and src/game/skills.ts). */
export const twinBody = z
  .object({
    character: z
      .object({
        type: z.enum(["student", "first-job", "professional"]),
        name: z.string().trim().min(1).max(20),
        city: z.string().trim().min(1).max(40),
        avatarSeed: z.string().min(1).max(80),
        createdAt: isoish.default(""),
        updatedAt: isoish.default(""),
      })
      .strict()
      .nullable()
      .optional(),
    skills: z
      .object({
        xp: z.number().int().min(0).max(100_000),
        learned: z.partialRecord(z.enum(LESSON_ORDER as [string, ...string[]]), z.object({ correct: z.boolean(), at: isoish }).strict()),
        context: z
          .object({
            monthName: z.string().max(20),
            income: z.number().nonnegative().max(1e8),
            microPerDay: z.number().nonnegative().max(1e7),
            deliveryOrders: z.number().int().nonnegative().max(10_000),
            deliveryAvg: z.number().nonnegative().max(1e7),
            week1Spent: z.number().nonnegative().max(1e9),
            fixedCosts: z.number().nonnegative().max(1e9),
            biggestBuy: z.object({ amount: z.number().nonnegative(), counterparty: z.string().max(80) }).strict().optional(),
          })
          .strict()
          .optional(),
        updatedAt: isoish.default(""),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

export const listTransactionsQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});
