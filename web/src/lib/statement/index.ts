import { StatementError, fingerprint, mergeStatements, parseKotakCsv } from "./kotak";
import { applyLabels, ruleCategory, type Categorised, type Labels } from "./rules";

export { StatementError } from "./kotak";
export * from "./rules";
export * from "./teach";

export interface ProcessedStatements {
  transactions: Categorised[];
  files: { name: string; rows: number }[];
  duplicatesRemoved: number;
}

/**
 * The whole in-browser pipeline: read each file's text, parse, merge overlapping statements,
 * categorise, fingerprint, and apply any labels already saved. The raw descriptions are dropped
 * here; nothing returned contains the statement text, and nothing is sent anywhere.
 */
export async function processStatements(files: { name: string; text: string }[], labels: Labels = {}): Promise<ProcessedStatements> {
  const parsed = files.map((f) => {
    try {
      return { name: f.name, rows: parseKotakCsv(f.text) };
    } catch (err) {
      if (err instanceof StatementError) throw new StatementError(err.code, `${f.name}: ${err.message}`);
      throw err;
    }
  });
  const merged = mergeStatements(parsed.map((p) => p.rows));
  const transactions: Categorised[] = await Promise.all(
    merged.map(async (r) => {
      const rule = ruleCategory(r);
      return {
        datetime: r.datetime,
        amount: r.amount,
        type: r.type,
        balance: r.balance,
        channel: r.channel,
        counterparty: r.counterparty,
        category: rule.category,
        confidence: rule.confidence,
        ruleCategory: rule.category,
        ruleConfidence: rule.confidence,
        fingerprint: await fingerprint(r),
      };
    }),
  );
  return {
    transactions: applyLabels(transactions, labels),
    files: parsed.map((p) => ({ name: p.name, rows: p.rows.length })),
    duplicatesRemoved: parsed.reduce((s, p) => s + p.rows.length, 0) - merged.length,
  };
}

/** The API payload: only what the server stores (see transactionInput in lib/api.ts). */
export const toApiTransaction = (t: Categorised) => ({
  fingerprint: t.fingerprint,
  datetime: t.datetime,
  amount: t.amount,
  type: t.type,
  balance: t.balance,
  channel: t.channel,
  counterparty: t.counterparty.slice(0, 80),
  category: t.category,
  confidence: t.confidence,
});
