import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

// Integration tests for the API routes against a real local MongoDB, in a separate test database.
// Sign-in is mocked: `auth()` returns whichever test user is "signed in".

const TEST_URI = "mongodb://localhost:27017/money-twin-test";
process.env.MONGODB_URI = TEST_URI;

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

const { User } = await import("@/models/User");
const { Transaction } = await import("@/models/Transaction");
const { MerchantOverride } = await import("@/models/MerchantOverride");
const { Twin } = await import("@/models/Twin");
const twinRoute = await import("./twin/route");
const me = await import("./me/route");
const txns = await import("./transactions/route");
const overrides = await import("./overrides/route");
const overrideByKey = await import("./overrides/[key]/route");

const mongoUp = await mongoose
  .connect(TEST_URI, { serverSelectionTimeoutMS: 1500 })
  .then(() => true)
  .catch(() => false);

const url = (path: string) => `http://localhost:3000${path}`;
const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(url(path), { method, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (key: string) => ({ params: Promise.resolve({ key }) }) as never;
const fp = (s: string) => createHash("sha256").update(s).digest("hex");

const txn = (n: number, counterparty = "Manjunath S", category = "Paid to People") => ({
  fingerprint: fp(`row-${n}`),
  datetime: `2026-08-${String(n).padStart(2, "0")}T13:10:00`,
  amount: 40 + n,
  type: "DR" as const,
  balance: 5000 - n,
  channel: "UPI" as const,
  counterparty,
  category,
  confidence: "low" as const,
});

let alice = "";
let bob = "";
const signInAs = (id: string | null) => {
  session.current = id ? { user: { id } } : null;
};

describe.skipIf(!mongoUp)("API routes (local MongoDB)", () => {
  beforeAll(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([User.init(), Transaction.init(), MerchantOverride.init(), Twin.init()]); // build unique indexes
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Transaction.deleteMany({}), MerchantOverride.deleteMany({}), Twin.deleteMany({})]);
    alice = String((await User.create({ email: "alice@example.com", name: "Alice" }))._id);
    bob = String((await User.create({ email: "bob@example.com", name: "Bob" }))._id);
    signInAs(alice);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test("every route needs a signed-in user", async () => {
    signInAs(null);
    for (const res of [
      await me.GET(),
      await me.DELETE(),
      await txns.GET(req("/api/transactions")),
      await txns.POST(req("/api/transactions", "POST", { transactions: [txn(1)] })),
      await overrides.GET(),
      await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "X", category: "Food" }] })),
    ]) {
      expect(res.status).toBe(401);
    }
    expect(await Transaction.countDocuments()).toBe(0);
  });

  test("GET /api/me returns the profile and counts", async () => {
    await txns.POST(req("/api/transactions", "POST", { transactions: [txn(1), txn(2)] }));
    const body = await (await me.GET()).json();
    expect(body.user.email).toBe("alice@example.com");
    expect(body.counts).toEqual({ transactions: 2, overrides: 0 });
    expect(body.savedRange).toEqual({ count: 2, from: expect.stringMatching(/^2026-08-01/), to: expect.stringMatching(/^2026-08-02/) });
    expect(body.twin).toBe(false);
  });

  test("saving transactions dedupes re-uploads by fingerprint", async () => {
    const first = await txns.POST(req("/api/transactions", "POST", { transactions: [txn(1), txn(2)] }));
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ received: 2, inserted: 2 });

    // An overlapping second statement: two old rows and one new one.
    const again = await txns.POST(req("/api/transactions", "POST", { transactions: [txn(1), txn(2), txn(3)] }));
    expect(await again.json()).toMatchObject({ received: 3, inserted: 1 });

    const list = await (await txns.GET(req("/api/transactions?limit=10"))).json();
    expect(list.total).toBe(3);
    expect(list.transactions.map((t: { amount: number }) => t.amount)).toEqual([43, 42, 41]); // newest first
    expect(list.transactions[0]).not.toHaveProperty("userId");
  });

  test("the raw statement description is rejected, so it can never be stored", async () => {
    const res = await txns.POST(
      req("/api/transactions", "POST", { transactions: [{ ...txn(1), description: "UPI/Manjunath S/612345678901/Paid" }] }),
    );
    expect(res.status).toBe(400);
    expect(await Transaction.countDocuments()).toBe(0);
  });

  test("invalid input gets a 400, not a crash", async () => {
    expect((await txns.POST(req("/api/transactions", "POST", { transactions: [] }))).status).toBe(400);
    expect((await txns.POST(req("/api/transactions", "POST", { transactions: [{ ...txn(1), category: "Bitcoin" }] }))).status).toBe(400);
    expect((await txns.GET(req("/api/transactions?limit=99999"))).status).toBe(400);
    const bad = new NextRequest(url("/api/transactions"), { method: "POST", body: "{not json" });
    expect((await txns.POST(bad)).status).toBe(400);
  });

  test("date filters work", async () => {
    await txns.POST(req("/api/transactions", "POST", { transactions: [txn(1), txn(10), txn(20)] }));
    const res = await (await txns.GET(req("/api/transactions?from=2026-08-05&to=2026-08-15"))).json();
    expect(res.total).toBe(1);
    expect(res.transactions[0].amount).toBe(50);
  });

  test("payee labels re-label matching transactions (case and spaces ignored)", async () => {
    await txns.POST(
      req("/api/transactions", "POST", {
        transactions: [txn(1, "Manjunath S"), txn(2, "MANJUNATH  S"), txn(3, "Ravi Kumar K")],
      }),
    );
    const res = await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "manjunath s", category: "Food" }] }));
    expect(await res.json()).toEqual({ saved: 1, relabelledTransactions: 2 });

    const list = await (await txns.GET(req("/api/transactions"))).json();
    const byName = Object.fromEntries(list.transactions.map((t: { amount: number; category: string; confidence: string }) => [t.amount, t]));
    expect(byName[41]).toMatchObject({ category: "Food", confidence: "user" });
    expect(byName[42]).toMatchObject({ category: "Food", confidence: "user" });
    expect(byName[43]).toMatchObject({ category: "Paid to People", confidence: "low" });

    // Changing a label updates it in place (one label per payee).
    await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "Manjunath S", category: "Rent/PG" }] }));
    const labels = await (await overrides.GET()).json();
    expect(labels.overrides).toHaveLength(1);
    expect(labels.overrides[0]).toMatchObject({ key: "manjunaths", category: "Rent/PG" });
  });

  test("family and self can be tagged, and land by direction", async () => {
    await txns.POST(
      req("/api/transactions", "POST", {
        transactions: [
          { ...txn(1, "Ramesh Kumar"), type: "CR" },
          { ...txn(2, "Ramesh Kumar"), type: "DR" },
          txn(3, "My Own Name"),
        ],
      }),
    );
    const res = await overrides.PUT(
      req("/api/overrides", "PUT", {
        overrides: [
          { counterparty: "Ramesh Kumar", category: "Family" },
          { counterparty: "My Own Name", category: "Self" },
        ],
      }),
    );
    expect(await res.json()).toEqual({ saved: 2, relabelledTransactions: 3 });
    const list = (await (await txns.GET(req("/api/transactions"))).json()).transactions as { amount: number; category: string }[];
    const by = Object.fromEntries(list.map((t) => [t.amount, t.category]));
    expect(by).toEqual({ 41: "Family Support", 42: "Sent to Family", 43: "Self Transfer" });
    // The label itself is stored as given.
    expect((await (await overrides.GET()).json()).overrides.map((o: { category: string }) => o.category).sort()).toEqual(["Family", "Self"]);
  });

  test("one user can never see or change another user's data", async () => {
    await txns.POST(req("/api/transactions", "POST", { transactions: [txn(1)] }));
    await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "Manjunath S", category: "Food" }] }));

    signInAs(bob);
    expect((await (await txns.GET(req("/api/transactions"))).json()).total).toBe(0);
    expect((await (await overrides.GET()).json()).overrides).toHaveLength(0);
    expect((await overrideByKey.DELETE(req("/api/overrides/manjunaths", "DELETE"), ctx("manjunaths"))).status).toBe(404);
    await me.DELETE(); // Bob deletes everything of his…

    signInAs(alice); // …and Alice's data is untouched
    expect((await (await me.GET()).json()).counts).toEqual({ transactions: 1, overrides: 1 });
  });

  test("deleting one payee label", async () => {
    await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "Manjunath S", category: "Food" }] }));
    const res = await overrideByKey.DELETE(req("/api/overrides/Manjunath%20S", "DELETE"), ctx("Manjunath%20S"));
    expect(res.status).toBe(200);
    expect(await MerchantOverride.countDocuments({ userId: alice })).toBe(0);
  });

  test("Delete all my data removes transactions, labels and the account", async () => {
    await txns.POST(req("/api/transactions", "POST", { transactions: [txn(1), txn(2)] }));
    await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "Manjunath S", category: "Food" }] }));
    await twinRoute.PUT(req("/api/twin", "PUT", { character: TWIN_CHARACTER }));
    const res = await me.DELETE();
    expect(await res.json()).toEqual({ deleted: { transactions: 2, overrides: 1, twin: true, account: true } });
    expect(await Twin.countDocuments({ userId: alice })).toBe(0);
    expect(await Transaction.countDocuments({ userId: alice })).toBe(0);
    expect(await MerchantOverride.countDocuments({ userId: alice })).toBe(0);
    expect(await User.findById(alice)).toBeNull();
    expect(await User.findById(bob)).not.toBeNull();
  });

  test("payee nicknames are saved, kept when omitted, and removed with null", async () => {
    await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "Kiran Traders", category: "Health", nickname: "Gym trainer" }] }));
    const get = async () => (await (await overrides.GET()).json()).overrides[0];
    expect(await get()).toMatchObject({ counterparty: "Kiran Traders", category: "Health", nickname: "Gym trainer" });

    await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "Kiran Traders", category: "Health" }] }));
    expect((await get()).nickname).toBe("Gym trainer"); // omitted: kept

    await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "Kiran Traders", category: "Health", nickname: null }] }));
    expect(await get()).not.toHaveProperty("nickname"); // null: removed

    const tooLong = await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "X", category: "Food", nickname: "n".repeat(41) }] }));
    expect(tooLong.status).toBe(400);
  });

  test("friends are labelled as Friend in both directions", async () => {
    await txns.POST(req("/api/transactions", "POST", { transactions: [{ ...txn(1, "Arjun P"), type: "CR" }, txn(2, "Arjun P")] }));
    await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "Arjun P", category: "Friend" }] }));
    const list = (await (await txns.GET(req("/api/transactions"))).json()).transactions as { category: string }[];
    expect(list.map((t) => t.category)).toEqual(["Friend", "Friend"]);
  });

  test("friend mode: lending stays a loan, 'my share' becomes spending (by India time and amount)", async () => {
    await txns.POST(
      req("/api/transactions", "POST", {
        transactions: [
          { ...txn(1, "Arjun P"), amount: 250, datetime: "2026-08-01T20:15:00+05:30" }, // dinner-sized → Food
          { ...txn(2, "Arjun P"), amount: 900, datetime: "2026-08-02T17:00:00+05:30" }, // outing → Entertainment
          { ...txn(3, "Arjun P"), type: "CR", amount: 300 }, // money back is never income
          { ...txn(4, "Neha S"), amount: 500 },
        ],
      }),
    );
    const res = await overrides.PUT(
      req("/api/overrides", "PUT", {
        overrides: [
          { counterparty: "Arjun P", category: "Friend", friendMode: "share" },
          { counterparty: "Neha S", category: "Friend", friendMode: "lend" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const list = (await (await txns.GET(req("/api/transactions"))).json()).transactions as { counterparty: string; amount: number; category: string }[];
    const cat = (cp: string, amount: number) => list.find((t) => t.counterparty === cp && t.amount === amount)?.category;
    expect(cat("Arjun P", 250)).toBe("Food");
    expect(cat("Arjun P", 900)).toBe("Entertainment");
    expect(cat("Arjun P", 300)).toBe("Friend");
    expect(cat("Neha S", 500)).toBe("Friend");

    const labels = (await (await overrides.GET()).json()).overrides as { counterparty: string; friendMode?: string }[];
    expect(Object.fromEntries(labels.map((l) => [l.counterparty, l.friendMode]))).toEqual({ "Arjun P": "share", "Neha S": "lend" });

    // Relabelling someone as not-a-friend drops the friend mode.
    await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "Neha S", category: "Food" }] }));
    const neha = ((await (await overrides.GET()).json()).overrides as { counterparty: string; friendMode?: string }[]).find((l) => l.counterparty === "Neha S");
    expect(neha).not.toHaveProperty("friendMode");
    expect((await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "X", category: "Friend", friendMode: "gift" }] }))).status).toBe(400);
  });

  test("income reasons are valid labels for people who pay you", async () => {
    await txns.POST(req("/api/transactions", "POST", { transactions: [{ ...txn(1, "Sunita Devi"), type: "CR", amount: 1500 }] }));
    const res = await overrides.PUT(req("/api/overrides", "PUT", { overrides: [{ counterparty: "Sunita Devi", category: "Scholarship", nickname: "Scholarship trust" }] }));
    expect(await res.json()).toEqual({ saved: 1, relabelledTransactions: 1 });
  });

  test("the twin is saved to the account and read back", async () => {
    expect(await (await twinRoute.GET()).json()).toEqual({ twin: null });
    const skills = {
      xp: 40,
      learned: { impulse: { correct: true, at: "2026-09-11T09:00:00Z" }, delivery: { correct: false, at: "2026-09-11T09:05:00Z" } },
      updatedAt: "2026-09-11T09:05:00Z",
    };
    const res = await twinRoute.PUT(req("/api/twin", "PUT", { character: TWIN_CHARACTER, skills }));
    expect(res.status).toBe(200);
    const { twin } = await (await twinRoute.GET()).json();
    expect(twin.character).toMatchObject({ name: "Kavya", city: "Pune" });
    expect(twin.skills).toMatchObject({ xp: 40, learned: skills.learned });

    // Sending only one part keeps the other.
    await twinRoute.PUT(req("/api/twin", "PUT", { character: { ...TWIN_CHARACTER, name: "Kavya R" } }));
    const again = (await (await twinRoute.GET()).json()).twin;
    expect(again.character.name).toBe("Kavya R");
    expect(again.skills.xp).toBe(40);
    expect((await (await me.GET()).json()).twin).toBe(true);
  });

  test("the twin API rejects bad input and keeps twins per user", async () => {
    expect((await twinRoute.PUT(req("/api/twin", "PUT", { character: { ...TWIN_CHARACTER, type: "wizard" } }))).status).toBe(400);
    expect((await twinRoute.PUT(req("/api/twin", "PUT", { skills: { xp: 10, learned: { hacking: { correct: true, at: "" } } } }))).status).toBe(400);
    expect((await twinRoute.PUT(req("/api/twin", "PUT", { character: TWIN_CHARACTER, password: "x" }))).status).toBe(400);

    await twinRoute.PUT(req("/api/twin", "PUT", { character: TWIN_CHARACTER }));
    signInAs(bob);
    expect(await (await twinRoute.GET()).json()).toEqual({ twin: null });
    signInAs(null);
    expect((await twinRoute.GET()).status).toBe(401);
  });
});

const TWIN_CHARACTER = {
  type: "student",
  name: "Kavya",
  city: "Pune",
  avatarSeed: "kavya-1",
  createdAt: "2026-09-10T10:00:00Z",
  updatedAt: "2026-09-10T10:00:00Z",
};
