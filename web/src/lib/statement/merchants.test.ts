import { describe, expect, test } from "vitest";
import { familyCandidates, isKnownMerchant, looksLikePerson, ruleCategory, type Categorised } from "./index";
import type { StatementRow } from "./kotak";

// Merchants are never people: they're categorised by the rules and kept out of "Who's who?".
// (Payee names below are the kind found on real Kotak statements; amounts are made up.)

const row = (counterparty: string, over: Partial<StatementRow> = {}): StatementRow => ({
  datetime: "2026-08-10T10:00:00+05:30",
  description: `UPI/${counterparty}/612300000001/Paid`,
  amount: 500,
  type: "DR",
  balance: 5000,
  channel: "UPI",
  counterparty,
  ...over,
});
const cat = (counterparty: string, over: Partial<StatementRow> = {}) => ruleCategory(row(counterparty, over)).category;

const categorised = (r: StatementRow): Categorised => {
  const rc = ruleCategory(r);
  return {
    datetime: r.datetime,
    amount: r.amount,
    type: r.type,
    balance: r.balance,
    channel: r.channel,
    counterparty: r.counterparty,
    category: rc.category,
    confidence: rc.confidence,
    ruleCategory: rc.category,
    ruleConfidence: rc.confidence,
    fingerprint: `${r.counterparty}-${r.datetime}-${r.type}`,
  };
};

describe("merchants vs people", () => {
  test("names the merchant rules know are never people", () => {
    for (const name of ["Google India Di", "Googleindiadigi", "Dominos Pizza", "Mc Donalds", "Swiggy", "Zepto", "Indian Railways", "Punjabi Lassi"]) {
      expect(isKnownMerchant(name), name).toBe(true);
      expect(looksLikePerson(name), name).toBe(false);
    }
    for (const name of ["Ramesh Kumar", "Sunita Devi", "Arjun P", "Martin Joseph", "Rahul Uberoi", "Kiran S"]) {
      expect(looksLikePerson(name), name).toBe(true);
    }
  });

  test("names cut at 15 characters still read as businesses", () => {
    for (const name of ["Lakshmi Enterpr", "Tutedude Privat", "Brother Sewing", "Sri Steel House", "The Brand Studi"]) {
      expect(looksLikePerson(name), name).toBe(false);
    }
  });

  test("money back from a merchant is a refund, not a friend", () => {
    expect(cat("Google India Di", { type: "CR" })).toBe("Refund");
    expect(cat("Dominos Pizza", { type: "CR" })).toBe("Refund");
    expect(cat("Ramesh Kumar", { type: "CR" })).toBe("Received from Friends");
  });

  test("Who's who only asks about people, even when money goes both ways with a merchant", () => {
    const rows = [
      row("Google India Di", { amount: 149 }),
      row("Google India Di", { type: "CR", amount: 51, datetime: "2026-08-12T10:00:00+05:30" }),
      row("Google India Di", { amount: 149, datetime: "2026-08-20T10:00:00+05:30" }),
      row("Dominos Pizza", { amount: 420, datetime: "2026-08-14T20:00:00+05:30" }),
      row("Dominos Pizza", { type: "CR", amount: 420, datetime: "2026-08-15T20:00:00+05:30" }),
      row("Arjun P", { amount: 650 }),
      row("Arjun P", { type: "CR", amount: 300, datetime: "2026-08-11T22:00:00+05:30" }),
    ].map(categorised);
    expect(familyCandidates(rows).map((c) => c.counterparty)).toEqual(["Arjun P"]);
    expect(rows.find((t) => t.counterparty === "Google India Di" && t.type === "DR")?.category).toBe("Subscriptions & Apps");
  });
});

describe("merchant keywords", () => {
  test("obvious merchants from real statements are categorised", () => {
    expect(cat("Indian Railways")).toBe("Travel");
    expect(cat("Mc Donalds")).toBe("Food & Dining");
    expect(cat("Punjabi Lassi")).toBe("Food & Dining");
    expect(cat("Sri Dosa Corner")).toBe("Food & Dining");
    expect(cat("Brew Coffee Hou")).toBe("Food & Dining");
    expect(cat("Annapurna Catring")).toBe("Food & Dining"); // misspelt on real statements
    expect(cat("Uengage")).toBe("Food & Dining");
    expect(cat("Green Farm Fresh")).toBe("Groceries");
    expect(cat("Bbnow.Shop@Bank")).toBe("Groceries");
    expect(cat("City Scooterman")).toBe("Transport");
    expect(cat("Tutedude Privat")).toBe("Education");
  });

  test("short keywords are whole words (a plural is fine), brand names match anywhere", () => {
    expect(cat("Shakti Foods")).toBe("Food & Dining"); // "food" + s
    expect(cat("Zeptonow")).toBe("Groceries"); // brand run together
    expect(cat("Hair Studio Men")).toBe("Personal Care");
    expect(cat("Chair Point")).not.toBe("Personal Care");
    expect(cat("Martin Joseph")).not.toBe("Groceries"); // "mart" isn't in "Martin"
    expect(cat("Rahul Uberoi")).not.toBe("Transport"); // nor "uber" in "Uberoi"
  });
});
