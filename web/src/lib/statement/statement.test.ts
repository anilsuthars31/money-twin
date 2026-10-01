import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ALL_CATEGORIES, INCOME_CATEGORIES, categoryForLabel, istHour } from "@/lib/categories";
import { parseCsv } from "./csv";
import { StatementError, extractCounterparty, parseKotakCsv, type StatementRow } from "./kotak";
import {
  applyLabels,
  displayName,
  familyCandidates,
  friendBalances,
  processStatements,
  ruleCategory,
  summarise,
  toApiTransaction,
  understoodShare,
  unknownPayees,
} from "./index";

// Synthetic statement (made-up names), also offered in the app as "Try a sample statement".
const SAMPLE = readFileSync(new URL("../../../public/sample-kotak-statement.csv", import.meta.url), "utf8");
const lines = SAMPLE.split("\r\n");
const HEADER = lines.slice(0, 5);
const DATA = lines.filter((l) => /^\d+,/.test(l));

const row = (over: Partial<StatementRow>): StatementRow => ({
  datetime: "2026-08-10T13:00:00+05:30",
  description: "UPI/Someone/1/Paid",
  amount: 100,
  type: "DR",
  balance: 1000,
  channel: "UPI",
  counterparty: "Someone",
  ...over,
});

describe("CSV reading", () => {
  test("quoted fields with commas, escaped quotes, CRLF and BOM", () => {
    expect(parseCsv('﻿a,"1,234.00","say ""hi"""\r\nb,2,3\r\n')).toEqual([
      ["a", "1,234.00", 'say "hi"'],
      ["b", "2", "3"],
    ]);
  });
});

describe("Kotak parsing", () => {
  test("reads every transaction and skips header and footer junk", () => {
    const rows = parseKotakCsv(SAMPLE);
    expect(rows).toHaveLength(51);
    expect(rows[0]).toMatchObject({ amount: 8000, type: "CR", balance: 9200, channel: "UPI", counterparty: "Ramesh Kumar" });
    expect(rows[0].datetime).toBe("2026-07-01T09:10:00+05:30");
  });

  test("Excel-resaved dates (dd/mm/yyyy) still parse", () => {
    const excel = SAMPLE.replace("01-07-2026 09:10", "01/07/2026 09:10");
    expect(parseKotakCsv(excel)[0].datetime).toBe("2026-07-01T09:10:00+05:30");
  });

  test("bank-generated rows get a plain label, never their description", () => {
    for (const [desc, label] of [
      ["CHRG/SMS ALERT CHARGES QTR", "Bank charges"],
      ["811 SUPER CASHBACK/REF 55512345", "Cashback"],
      ["Int.Pd:01-06-2026 to 31-08-2026", "Interest"],
      ["Cash Deposit 123456 BRANCH MG ROAD", "Cash deposit"],
      ["Ac xfr from gl 9988776655", "Internal transfer"],
      ["NEFT/N123456789/SOME PERSON/HDFC0001234", "NEFT transfer"],
      ["NACH/TP ACH EMI/987654321", "NACH auto-debit"],
      ["99887766 SOMETHING", "Other bank transaction"],
    ]) {
      expect(extractCounterparty(desc)).toEqual({ channel: "OTHER", counterparty: label });
    }
  });

  test("phone numbers and long IDs in payee names keep only the last 4 digits", () => {
    expect(extractCounterparty("UPI/9876543210/612345678/Paid").counterparty).toBe("••••3210");
    expect(extractCounterparty("UPI/PAYTMQR2810050501/61234/Paid").counterparty).toBe("Paytmqr••••0501");
    expect(extractCounterparty("PCD/4821/AMAZON PAY 123456789/BLR").counterparty).toBe("AMAZON PAY ••••6789");
    expect(extractCounterparty("UPI/Ravi 2 Kumar/612345/Paid").counterparty).toBe("Ravi 2 Kumar"); // short numbers stay
  });

  test("counterparty extraction for each description style", () => {
    expect(extractCounterparty("UPI/MANJUNATH  S/61234/Paid")).toEqual({ channel: "UPI", counterparty: "Manjunath S" });
    expect(extractCounterparty("PCD/4821/AMAZON RETAIL/BANGALORE")).toEqual({ channel: "CARD", counterparty: "AMAZON RETAIL" });
    expect(extractCounterparty("ATL/4821/KOTAK ATM MG ROAD")).toEqual({ channel: "ATM", counterparty: "KOTAK ATM MG ROAD" });
    expect(extractCounterparty("811:BD/JIO PREPAID/9876543210")).toEqual({ channel: "BILLPAY", counterparty: "JIO PREPAID" });
  });

  test("friendly errors for the wrong kind of file", () => {
    const code = (text: string) => {
      try {
        parseKotakCsv(text);
      } catch (e) {
        return (e as StatementError).code;
      }
    };
    expect(code("")).toBe("EMPTY");
    expect(code("%PDF-1.7 ...")).toBe("PDF");
    expect(code("Date,Narration,Amount\n01/08/2026,UPI-XYZ,100")).toBe("NOT_KOTAK");
    expect(code(HEADER.join("\r\n"))).toBe("NO_ROWS");
  });
});

describe("processStatements", () => {
  test("overlapping statements are merged without duplicates", async () => {
    const first = [...HEADER, ...DATA.slice(0, 35)].join("\r\n");
    const second = [...HEADER, ...DATA.slice(25)].join("\r\n");
    const out = await processStatements([
      { name: "jul.csv", text: first },
      { name: "aug.csv", text: second },
    ]);
    expect(out.transactions).toHaveLength(51);
    expect(out.duplicatesRemoved).toBe(10);
    expect(out.files).toEqual([
      { name: "jul.csv", rows: 35 },
      { name: "aug.csv", rows: 26 },
    ]);
  });

  test("nothing returned contains the raw description", async () => {
    const out = await processStatements([{ name: "s.csv", text: SAMPLE }]);
    // No payee name may be a bank description or carry a long number (refs, account numbers).
    const descriptions = new Set(parseKotakCsv(SAMPLE).map((r) => r.description));
    for (const t of out.transactions) {
      expect(descriptions.has(t.counterparty), t.counterparty).toBe(false);
      expect(t.counterparty, t.counterparty).not.toMatch(/\d{6,}/);
    }
    const json = JSON.stringify(out.transactions.map(toApiTransaction));
    expect(json).not.toMatch(/612300000|UPI\/|PCD\/|Sl\. No/);
    expect(Object.keys(toApiTransaction(out.transactions[0])).sort()).toEqual(
      ["amount", "balance", "category", "channel", "confidence", "counterparty", "datetime", "fingerprint", "type"].sort(),
    );
    for (const t of out.transactions) expect(t.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    // Same input, same fingerprints: re-uploads dedupe on the server.
    const again = await processStatements([{ name: "s.csv", text: SAMPLE }]);
    expect(again.transactions.map((t) => t.fingerprint)).toEqual(out.transactions.map((t) => t.fingerprint));
  });

  test("errors name the file", async () => {
    await expect(processStatements([{ name: "bank.pdf", text: "%PDF-1.4" }])).rejects.toThrow("bank.pdf: That's a PDF");
  });
});

describe("rules", () => {
  const cat = (over: Partial<StatementRow>) => ruleCategory(row(over));

  test("merchant, income and bank categories", async () => {
    const { transactions } = await processStatements([{ name: "s.csv", text: SAMPLE }]);
    const by = (cp: string, type = "DR") => transactions.find((t) => t.counterparty === cp && t.type === type)!;
    expect(by("Swiggy")).toMatchObject({ category: "Food & Dining", confidence: "high" });
    expect(by("AMAZON RETAIL")).toMatchObject({ category: "Shopping", confidence: "high" });
    expect(by("KOTAK ATM MG ROAD")).toMatchObject({ category: "Cash Withdrawal" });
    expect(by("JIO PREPAID")).toMatchObject({ category: "Bills & Recharge" });
    expect(by("Hair Studio Men")).toMatchObject({ category: "Personal Care" });
    expect(by("Kiran Traders")).toMatchObject({ category: "Groceries" });
    expect(by("Swiggy", "CR")).toMatchObject({ category: "Refund" });
    expect(by("Ramesh Kumar", "CR")).toMatchObject({ category: "Received from Friends", confidence: "medium" });
    expect(transactions.find((t) => t.counterparty === "Bank charges")).toMatchObject({ category: "Bank Charges" });
    expect(transactions.find((t) => t.counterparty === "Interest")).toMatchObject({ category: "Interest" });
    expect(transactions.find((t) => t.counterparty === "Cashback")).toMatchObject({ category: "Cashback & Rewards" });
    expect(transactions.filter((t) => t.category === "Internal (ignore)")).toHaveLength(2);
    expect(by("Shanthi Pg")).toMatchObject({ category: "Paid to People", confidence: "low" });
    expect(by("Deepa Stores")).toMatchObject({ category: "Uncategorised", confidence: "low" });
  });

  test("small lunchtime payments are a low-confidence food guess", () => {
    expect(cat({ amount: 60, datetime: "2026-08-10T13:05:00+05:30", counterparty: "Manjunath S" })).toEqual({ category: "Food & Dining", confidence: "low" });
    expect(cat({ amount: 60, datetime: "2026-08-10T10:05:00+05:30", counterparty: "Manjunath S" })).toEqual({ category: "Paid to People", confidence: "low" });
  });

  test("keywords must start a word: no more 'hair' in 'chair' or 'rto' in 'porto'", () => {
    expect(cat({ counterparty: "Chair Point", description: "UPI/Chair Point/1/Paid", datetime: "2026-08-10T10:00:00+05:30", amount: 900 }).category).not.toBe("Personal Care");
    expect(cat({ counterparty: "Porto Cafe", description: "UPI/Porto Cafe/1/Paid" }).category).toBe("Food & Dining"); // "cafe", not "rto"
    expect(cat({ counterparty: "RTO Office", description: "UPI/RTO Office/1/Paid" }).category).toBe("Govt & Documents");
  });

  test("no surname guessing: family and self only come from labels", async () => {
    const { transactions } = await processStatements([{ name: "s.csv", text: SAMPLE }]);
    expect(transactions.some((t) => ["Sent to Family", "Family Support", "Self Transfer"].includes(t.category))).toBe(false);
    const labelled = applyLabels(transactions, { rameshkumar: "Family", shanthipg: "Rent/PG" });
    const ramesh = labelled.filter((t) => t.counterparty === "Ramesh Kumar");
    expect(ramesh.every((t) => t.category === "Family Support" && t.confidence === "user")).toBe(true);
    expect(labelled.find((t) => t.counterparty === "Shanthi Pg")).toMatchObject({ category: "Rent/PG", confidence: "user" });
    expect(applyLabels(labelled, {}).find((t) => t.counterparty === "Shanthi Pg")).toMatchObject({ category: "Paid to People", confidence: "low" });
  });
});

describe("Teach your twin", () => {
  test("unknown payees: biggest first, with hints and likely categories", async () => {
    const { transactions } = await processStatements([{ name: "s.csv", text: SAMPLE }]);
    const cards = unknownPayees(transactions, {});
    expect(cards[0].counterparty).toBe("Shanthi Pg");
    expect(cards[0].sameDayMonthly).toBe(true);
    expect(cards[0].suggestions[0]).toBe("Rent/PG");
    const arjun = cards.find((c) => c.counterparty === "Arjun P")!;
    expect(arjun.moneyBack).toBe(600);
    expect(arjun.suggestions.slice(0, 2)).toContain("Friend");
    const vendor = cards.find((c) => c.counterparty === "Ravi Kumar K")!;
    expect(vendor.when).toBe("usually around lunch");
    expect(vendor.suggestions[0]).toBe("Food");
    for (const c of cards) expect(new Set(c.suggestions).size).toBe(13);
    expect(cards.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 5);
  });

  test("labelled payees drop out of the queue and the twin understands more", async () => {
    const { transactions } = await processStatements([{ name: "s.csv", text: SAMPLE }]);
    const labels = { shanthipg: "Rent/PG", arjunp: "Friend" };
    expect(unknownPayees(transactions, labels).map((c) => c.key)).not.toContain("shanthipg");
    expect(understoodShare(applyLabels(transactions, labels))).toBeGreaterThan(understoodShare(transactions));
  });

  test("family candidates are people with real money back and forth, not businesses", async () => {
    const { transactions } = await processStatements([{ name: "s.csv", text: SAMPLE }]);
    const names = familyCandidates(transactions).map((c) => c.counterparty);
    expect(names[0]).toBe("Ramesh Kumar");
    expect(names).toContain("Sunita Devi");
    expect(names).not.toContain("Kiran Traders");
    expect(names).not.toContain("Swiggy");
  });

  test("summary", async () => {
    const { transactions } = await processStatements([{ name: "s.csv", text: SAMPLE }]);
    const s = summarise(transactions);
    expect(s).toMatchObject({ transactions: 51, months: 2 });
    expect(s.understood).toBeGreaterThan(0);
    expect(s.understood).toBeLessThan(1);
  });
});

describe("Who's who: friends, me, and others", () => {
  const load = async () => (await processStatements([{ name: "s.csv", text: SAMPLE }])).transactions;

  test("friends are splits and loans: netted per friend, not income or spending", async () => {
    const txns = await load();
    // In the sample: each month you pay Arjun ₹650 + ₹420 and he pays you ₹300; Sunita only sends money.
    // Arjun: lending, and he's paying you back. Sunita: you borrowed from her.
    const labelled = applyLabels(txns, { arjunp: "Friend", sunitadevi: "Friend" }, { arjunp: "lend" }, { arjunp: "payback", sunitadevi: "borrowed" });
    const { friends, owedToYou, youOwe } = friendBalances(labelled);
    expect(friends).toMatchObject([
      { key: "sunitadevi", name: "Sunita Devi", borrowed: 3000, net: -3000 },
      { key: "arjunp", name: "Arjun P", lent: 2140, paidBack: 600, net: 1540 },
    ]);
    expect(owedToYou).toBe(1540);
    expect(youOwe).toBe(3000);

    const before = summarise(txns);
    const after = summarise(labelled);
    expect(before.spent - after.spent).toBe(2 * (650 + 420)); // Arjun's payments no longer count as spending
    expect(before.received - after.received).toBe(2 * 300 + 2 * 1500); // nor money from friends as income
  });

  test("friend balances use nicknames when given", async () => {
    const labelled = applyLabels(await load(), { arjunp: "Friend" });
    expect(friendBalances(labelled, { arjunp: "Arjun (hostel)" }).friends[0].name).toBe("Arjun (hostel)");
  });

  test("transfers to your own other account aren't spending or income", async () => {
    const txns = await load();
    const me = applyLabels(txns, { rameshkumar: "Self" });
    expect(me.filter((t) => t.counterparty === "Ramesh Kumar").every((t) => t.category === "Self Transfer")).toBe(true);
    expect(summarise(txns).received - summarise(me).received).toBe(16000);
  });

  test("an 'Other' label shows the nickname instead of the UPI name", async () => {
    const txns = await load();
    const labelled = applyLabels(txns, { kirantraders: "Health" });
    expect(labelled.find((t) => t.counterparty === "Kiran Traders")).toMatchObject({ category: "Health", confidence: "user" });
    expect(displayName("Kiran Traders", { kirantraders: "Gym trainer" })).toBe("Gym trainer");
    expect(displayName("KIRAN  TRADERS", { kirantraders: "Gym trainer" })).toBe("Gym trainer"); // same payee key
    expect(displayName("Deepa Stores", { kirantraders: "Gym trainer" })).toBe("Deepa Stores");
  });

  test("people left unmarked in Who's who come first in the cards, even if they only sent money", async () => {
    const txns = await load();
    const cards = unknownPayees(txns, { arjunp: "Friend" }, 20, ["rameshkumar", "arjunp", "sunitadevi"]);
    expect(cards.slice(0, 2).map((c) => c.key)).toEqual(["rameshkumar", "sunitadevi"]); // Arjun is marked
    expect(cards[0]).toMatchObject({ total: 0, moneyBack: 16000 });
    expect(cards.map((c) => c.key)).not.toContain("arjunp");
    expect(cards.map((c) => c.key)).toContain("shanthipg"); // the usual unknown payees follow
  });
});

describe("friends: lending vs my share, and people who pay you", () => {
  const load = async () => (await processStatements([{ name: "s.csv", text: SAMPLE }])).transactions;

  test("the share rule: small lunch or dinner payments are food, the rest outings (India time)", () => {
    expect(istHour("2026-08-08T13:10:00+05:30")).toBe(13);
    expect(istHour(new Date("2026-08-08T07:40:00Z"))).toBe(13); // stored as UTC, read in IST
    expect(categoryForLabel("Friend", { type: "DR", amount: 250, datetime: "2026-08-08T20:15:00+05:30" }, "share")).toBe("Food");
    expect(categoryForLabel("Friend", { type: "DR", amount: 650, datetime: "2026-08-08T17:20:00+05:30" }, "share")).toBe("Entertainment");
    expect(categoryForLabel("Friend", { type: "DR", amount: 650, datetime: "2026-08-08T17:20:00+05:30" }, "lend")).toBe("Friend");
    expect(categoryForLabel("Friend", { type: "CR", amount: 300, datetime: "2026-08-11T22:05:00+05:30" }, "share")).toBe("Friend"); // never income
  });

  test("only lending counts as 'owes you'; my share counts as my spending", async () => {
    const txns = await load();
    const labels = { arjunp: "Friend" };
    const lend = applyLabels(txns, labels, { arjunp: "lend" });
    const share = applyLabels(txns, labels, { arjunp: "share" });

    expect(friendBalances(lend).owedToYou).toBe(1540);
    expect(friendBalances(share)).toEqual({ friends: [], owedToYou: 0, youOwe: 0 }); // his ₹300s can't make you owe him

    const arjunOut = share.filter((t) => t.counterparty === "Arjun P" && t.type === "DR");
    expect(arjunOut.map((t) => t.category)).toEqual(["Entertainment", "Entertainment", "Entertainment", "Entertainment"]);
    // As spending, Arjun's payments (₹650 + ₹420 a month) are back in "spent"; his repayments still aren't income.
    expect(summarise(share).spent - summarise(lend).spent).toBe(2 * (650 + 420));
    expect(summarise(share).received).toBe(summarise(lend).received);
  });

  test("Who's who includes people with money going both ways, like a friend you split with", async () => {
    const people = familyCandidates(await load());
    const arjun = people.find((p) => p.counterparty === "Arjun P");
    expect(arjun).toMatchObject({ sent: 2140, received: 600 });
    expect(people.map((p) => p.counterparty)).not.toContain("Kiran Traders"); // a shop, not a person
  });

  test("someone who pays you can be labelled with an income reason", async () => {
    expect(INCOME_CATEGORIES).toEqual(["Salary/Stipend", "Scholarship", "Refund", "Sold something", "Other income"]);
    for (const c of INCOME_CATEGORIES) expect(ALL_CATEGORIES).toContain(c);
    const labelled = applyLabels(await load(), { sunitadevi: "Scholarship" });
    const sunita = labelled.filter((t) => t.counterparty === "Sunita Devi");
    expect(sunita.every((t) => t.category === "Scholarship" && t.confidence === "user")).toBe(true);
    expect(summarise(labelled).received).toBe(summarise(await load()).received); // still income
  });
});
