import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { processStatements } from "./index";
import { maskNumbers } from "./kotak";

// Local-only: compares this TypeScript port with parser/kotak_parser.py on the real statements in
// statements/ (git-ignored, never committed). Skips when the folder or Python isn't there, e.g. in
// CI. Prints only category names and counts, never payee names.

const ROOT = join(process.cwd(), "..");
const DIR = join(ROOT, "statements");
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".csv")).sort() : [];
const python = (() => {
  for (const cmd of ["python", "python3"]) {
    try {
      execFileSync(cmd, ["--version"], { stdio: "ignore" });
      return cmd;
    } catch {}
  }
  return null;
})();

// Differences that are intentional improvements in the port (see rules.ts).
const INTENTIONAL = new Set(["Uncategorised→Bank Charges"]);

describe.skipIf(!files.length || !python)("parity with parser/kotak_parser.py on real statements", () => {
  test("same transactions, same names, same categories (apart from intentional fixes)", async () => {
    const script = `
import sys, json
sys.path.insert(0, ${JSON.stringify(join(ROOT, "parser"))})
import kotak_parser as k
txns = k.run(sys.argv[1:], config_path="__no_config__.json")  # rules only, no personal names
print(json.dumps([{"dt": t["datetime"].strftime("%Y-%m-%dT%H:%M"), "amount": t["amount"], "type": t["type"],
                   "cp": t["counterparty"], "cat": t["category"]} for t in txns]))`;
    const py = JSON.parse(
      execFileSync(python!, ["-c", script, ...files.map((f) => join(DIR, f))], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
    ) as { dt: string; amount: number; type: string; cp: string; cat: string }[];

    const ts = (
      await processStatements(files.map((f) => ({ name: f, text: readFileSync(join(DIR, f), "utf8") })))
    ).transactions;

    expect(ts.length).toBe(py.length);

    const key = (dt: string, amount: number, type: string) => `${dt}|${amount}|${type}`;
    const pyByKey = new Map<string, typeof py>();
    for (const p of py) pyByKey.set(key(p.dt, p.amount, p.type), [...(pyByKey.get(key(p.dt, p.amount, p.type)) ?? []), p]);

    let sameName = 0;
    let comparable = 0;
    let sameCat = 0;
    const diffs = new Map<string, number>();
    for (const t of ts) {
      const candidates = pyByKey.get(key(t.datetime.slice(0, 16), t.amount, t.type)) ?? [];
      // Intentional: long numbers in names are masked, and bank rows ("OTHER") get a plain label.
      const p = candidates.find((c) => maskNumbers(c.cp) === t.counterparty) ?? candidates[0];
      if (!p) continue;
      if (maskNumbers(p.cp) === t.counterparty || t.channel === "OTHER") sameName++;
      comparable++;
      if (p.cat === t.ruleCategory) sameCat++;
      else diffs.set(`${p.cat}→${t.ruleCategory}`, (diffs.get(`${p.cat}→${t.ruleCategory}`) ?? 0) + 1);
    }

    const unexplained = [...diffs].filter(([d]) => !INTENTIONAL.has(d));
    console.log(
      `parity: ${ts.length} transactions, names ${sameName}/${comparable}, categories ${sameCat}/${comparable}\n` +
        [...diffs].map(([d, n]) => `  ${INTENTIONAL.has(d) ? "intentional" : "differs"}: ${d} ×${n}`).join("\n"),
    );
    expect(comparable).toBe(ts.length);
    expect(sameName / comparable).toBeGreaterThan(0.99);
    expect(unexplained.reduce((s, [, n]) => s + n, 0) / comparable).toBeLessThan(0.02);
  });
});
