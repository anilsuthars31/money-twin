import { parseCsv } from "./csv";

// Kotak net-banking CSV exports, parsed entirely in the browser (TypeScript port of
// parser/kotak_parser.py). The raw text never leaves this module: callers get structured rows.
//
// Format: a header row starting "Sl. No.", then rows with a numeric first column:
//   Sl No, Transaction Date (dd-mm-yyyy HH:MM), Value Date, Description, Chq/Ref No, Amount,
//   Dr/Cr, Balance, Dr/Cr. Amounts have commas; ref numbers may be mangled by Excel (5.10715E+11);
//   the footer holds bank notes. Several statements can overlap, so rows are deduped.

export type Channel = "UPI" | "REV-UPI" | "CARD" | "ATM" | "BILLPAY" | "IMPS" | "OTHER";

export interface StatementRow {
  datetime: string; // "2026-08-03T13:10:00+05:30" (Kotak times are IST)
  description: string; // raw bank text: used for rules only, never saved or sent anywhere
  amount: number;
  type: "DR" | "CR";
  balance: number;
  channel: Channel;
  counterparty: string;
}

export type StatementErrorCode = "EMPTY" | "PDF" | "NOT_KOTAK" | "NO_ROWS";

export class StatementError extends Error {
  constructor(
    public code: StatementErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const toAmount = (s: string) => Number((s ?? "").replace(/,/g, "").trim() || 0);

/** "03-08-2026 13:10" or Excel's "03/08/2026 13:10" → ISO with the IST offset. */
function toIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0"] = m;
  const pad = (v: string) => v.padStart(2, "0");
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00+05:30`;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** Like Python's str.title(): capitalise every letter that follows a non-letter ("ab1cd" → "Ab1Cd"). */
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase());

/**
 * Long digit runs in a payee name are usually someone's mobile number (UPI to a phone number) or a
 * merchant/terminal ID. Keep only the last 4 digits: still recognisable, and stable across uploads
 * so labels keep working, but never a full phone number.
 */
export const maskNumbers = (name: string) => name.replace(/\d{6,}/g, (m) => `••••${m.slice(-4)}`);

/** Channel and a clean counterparty name from the description. */
export function extractCounterparty(description: string): { channel: Channel; counterparty: string } {
  const out = extractRaw(description);
  return { ...out, counterparty: maskNumbers(out.counterparty) };
}

function extractRaw(description: string): { channel: Channel; counterparty: string } {
  const parts = description.split("/").map((p) => p.trim());
  const head = parts[0].toUpperCase();
  if ((head === "UPI" || head === "REV-UPI") && parts.length > 1) {
    return { channel: head, counterparty: titleCase(squash(parts[1])) };
  }
  if (head === "PCD" || head === "ATL") {
    return { channel: head === "ATL" ? "ATM" : "CARD", counterparty: squash(parts[2] ?? description) };
  }
  if (head.startsWith("811:BD")) {
    // Bill pay: the biller's name, not the phone/consumer number that follows it.
    const biller = parts.slice(1).find((p) => p && !/^\d+$/.test(p));
    return { channel: "BILLPAY", counterparty: squash(biller ?? parts.at(-1) ?? description) };
  }
  if (head.startsWith("RECD:IMPS")) return { channel: "IMPS", counterparty: squash(parts[2] ?? description) };
  return { channel: "OTHER", counterparty: bankLabel(description) };
}

/**
 * Bank-generated rows (charges, cashback, interest, deposits, transfers) have no payee, and their
 * descriptions can hold reference or account numbers. The Python parser used the whole description
 * as the name; here they get a plain label instead, so that text is never saved.
 */
export function bankLabel(description: string): string {
  const d = description.trim().toLowerCase();
  if (d.startsWith("chrg")) return "Bank charges";
  if (d.includes("cashback")) return "Cashback";
  if (d.startsWith("int.pd")) return "Interest";
  if (d.startsWith("cash deposit")) return "Cash deposit";
  if (d.startsWith("ac xfr from gl")) return "Internal transfer";
  const rail = d.match(/^(neft|rtgs|imps|nach|ecs|ach)\b/);
  if (rail) return `${rail[1].toUpperCase()} ${rail[1] === "nach" || rail[1] === "ecs" || rail[1] === "ach" ? "auto-debit" : "transfer"}`;
  const word = d.match(/^[a-z][a-z .&-]{2,24}/)?.[0].trim();
  return word ? titleCase(word.split(/\s+/).slice(0, 3).join(" ")) : "Other bank transaction";
}

/** Parses one Kotak CSV export. Throws StatementError with a friendly message if it isn't one. */
export function parseKotakCsv(text: string): StatementRow[] {
  if (!text.trim()) throw new StatementError("EMPTY", "That file is empty.");
  if (text.startsWith("%PDF")) {
    throw new StatementError("PDF", "That's a PDF. Download the statement as CSV from Kotak net banking instead.");
  }
  const table = parseCsv(text);
  if (!table.some((r) => r[0]?.trim().toLowerCase().startsWith("sl. no"))) {
    throw new StatementError("NOT_KOTAK", "This doesn't look like a Kotak statement CSV. Other banks are coming later.");
  }

  const rows: StatementRow[] = [];
  for (const r of table) {
    if (r.length < 9 || !/^\d+$/.test(r[0].trim())) continue; // header, blank lines, footer notes
    const datetime = toIso(r[1]);
    if (!datetime) continue;
    const description = r[3].trim();
    const { channel, counterparty } = extractCounterparty(description);
    rows.push({
      datetime,
      description,
      amount: toAmount(r[5]),
      type: r[6].trim().toUpperCase() === "CR" ? "CR" : "DR",
      balance: toAmount(r[7]) * (r[8].trim().toUpperCase() === "DR" ? -1 : 1),
      channel,
      counterparty,
    });
  }
  if (!rows.length) throw new StatementError("NO_ROWS", "No transactions found in that file.");
  return rows;
}

/** The same transaction in two overlapping statements has the same key (ref numbers can't be trusted). */
export const dedupeKey = (r: StatementRow) => [r.datetime, r.description, r.amount, r.type, r.balance].join("|");

/** Combines several statements, keeping each transaction once, oldest first. */
export function mergeStatements(statements: StatementRow[][]): StatementRow[] {
  const seen = new Set<string>();
  const out: StatementRow[] = [];
  for (const rows of statements) {
    for (const r of rows) {
      const k = dedupeKey(r);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(r);
      }
    }
  }
  return out.sort((a, b) => a.datetime.localeCompare(b.datetime));
}

/** SHA-256 of the dedupe key: lets the server dedupe re-uploads without ever seeing the description. */
export async function fingerprint(r: StatementRow): Promise<string> {
  const bytes = new TextEncoder().encode(dedupeKey(r));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
