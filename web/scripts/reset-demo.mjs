// Resets the two demo accounts before a presentation (local dev only; needs `npm run dev` running
// with AUTH_DEV_LOGIN=true). Everything goes through the app's own API, like a real player.
//
//   live@moneytwin.dev  wiped: a brand-new account for the live flow (upload, Who's who, cards…)
//   demo@moneytwin.dev  wiped and re-seeded: the sample statement saved and taught, a twin, and
//                       July already replayed, so the backup path has everything ready
//
// Then every page is opened once so the dev server has compiled them before the demo.
// Usage: npm run demo:reset            (BASE_URL=http://localhost:3000 by default)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LIVE = "live@moneytwin.dev";
const DEMO = "demo@moneytwin.dev";
const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": join(web, "src") } });

/** A tiny cookie-keeping client, signed in with the dev login. */
async function session(email) {
  const jar = new Map();
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  };
  const call = async (path, init = {}) => {
    const res = await fetch(BASE + path, {
      ...init,
      redirect: "manual",
      headers: { ...init.headers, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    keep(res);
    return res;
  };
  const { csrfToken } = await (await call("/api/auth/csrf")).json();
  await call("/api/auth/callback/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, callbackUrl: `${BASE}/account` }),
  });
  const me = await call("/api/me");
  if (!me.ok) throw new Error(`Couldn't sign in as ${email} (${me.status}). Is AUTH_DEV_LOGIN=true in web/.env.local?`);
  const json = async (path, method, body) => {
    const res = await call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  };
  return { call, json };
}

async function wipe(email) {
  const s = await session(email);
  await s.call("/api/me", { method: "DELETE" }); // everything: transactions, labels, twin, the account
  return session(email); // signing in again creates a fresh, empty account
}

async function main() {
  try {
    await fetch(BASE);
  } catch {
    throw new Error(`Nothing is running at ${BASE}. Start the app first: cd web && npm run dev`);
  }

  // 1. The live account: brand new.
  await wipe(LIVE);
  console.log(`✓ ${LIVE}: empty, ready for the live flow`);

  // 2. The backup account: the sample statement, taught the way the live flow teaches it.
  const demo = await wipe(DEMO);
  const st = await jiti.import(join(web, "src/lib/statement/index.ts"));
  const text = readFileSync(join(web, "public/sample-kotak-statement.csv"), "utf8");
  const { transactions } = await st.processStatements([{ name: "sample.csv", text }]);
  const labels = { rameshkumar: "Family", sunitadevi: "Family", arjunp: "Friend", shanthipg: "Rent/PG", ravikumark: "Food" };
  const modes = { arjunp: "lend" };
  const nicknames = { shanthipg: "PG rent", ravikumark: "Canteen anna" };
  const labelled = st.applyLabels(transactions, labels, modes);
  await demo.json("/api/transactions", "POST", { transactions: labelled.map(st.toApiTransaction) });
  const names = new Map(transactions.map((t) => [t.counterparty.toLowerCase().replace(/\s+/g, ""), t.counterparty]));
  await demo.json("/api/overrides", "PUT", {
    overrides: Object.entries(labels).map(([key, category]) => ({
      counterparty: names.get(key),
      category,
      ...(nicknames[key] && { nickname: nicknames[key] }),
      ...(modes[key] && { friendMode: modes[key] }),
    })),
  });

  // July already replayed (every What-if taken), so the timeline shows a grade and What-if savings.
  const rm = await jiti.import(join(web, "src/game/replay/real-month.ts"));
  const rp = await jiti.import(join(web, "src/game/replay/replay.ts"));
  const wi = await jiti.import(join(web, "src/game/replay/what-if.ts"));
  const { DEFAULT_PLAN } = await jiti.import(join(web, "src/game/engine.ts"));
  const saved = (await (await demo.call("/api/transactions?limit=5000")).json()).transactions;
  const july = rm.buildRealMonth("2026-07", saved, { shanthipg: "PG rent", ravikumark: "Canteen anna" }, modes);
  const real = rp.simulateReplay(july, DEFAULT_PLAN, "student");
  const moments = wi.findMoments(real);
  const choices = Object.fromEntries(moments.map((x) => [x.id, "better"]));
  const whatIf = rp.replayReport(rp.simulateReplay(wi.applyChoices(july, moments, choices), DEFAULT_PLAN, "student"));
  const realReport = rp.replayReport(real);
  const now = new Date().toISOString();
  await demo.json("/api/twin", "PUT", {
    character: { type: "student", name: "Aarav", city: "Bengaluru", avatarSeed: "Aarav-demo", createdAt: now, updatedAt: now },
    replay: {
      months: {
        "2026-07": {
          grade: whatIf.grade,
          score: whatIf.score,
          savingsKept: Math.round(whatIf.savingsKept),
          stats: whatIf.finalStats,
          plan: DEFAULT_PLAN,
          playedAt: now,
          whatIfSaved: Math.max(0, Math.round(whatIf.savingsKept - realReport.savingsKept)),
          realGrade: realReport.grade,
        },
      },
      updatedAt: now,
    },
  });
  console.log(`✓ ${DEMO}: ${saved.length} transactions, 5 payees taught, twin "Aarav", July replayed (grade ${whatIf.grade})`);

  // 3. Open every page once so nothing compiles in front of the audience.
  for (const path of ["/", "/play/demo", "/create", "/upload", "/account", "/skills", "/dashboard", "/replay"]) {
    const res = await demo.call(path);
    if (res.status >= 500) throw new Error(`${path} returned ${res.status}`);
  }
  console.log("✓ pages warmed up");
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
