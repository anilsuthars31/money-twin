import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type Request } from "@playwright/test";

// Statement upload + Teach your twin, end to end. The key promise under test: the raw statement
// never leaves the browser. Every request made during the flow is recorded and checked.

const SAMPLE_PATH = join(__dirname, "..", "public", "sample-kotak-statement.csv");
const STATEMENTS = join(__dirname, "..", "..", "statements");
const realFiles = existsSync(STATEMENTS) ? readdirSync(STATEMENTS).filter((f) => f.endsWith(".csv")).sort() : [];

/** Distinctive pieces of the raw file that must never appear in any request. */
function rawMarkers(text: string): string[] {
  const rows = text.split(/\r?\n/).filter((l) => /^\d+,/.test(l));
  const markers = new Set<string>(["Sl. No.", "Chq / Ref No", "Dr / Cr"]);
  for (const line of rows) {
    const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "")) ?? [];
    const [, , , description, ref] = cols;
    if (description && description.trim().length >= 10) markers.add(description.trim()); // every bank description
    if (ref && /^\d{9,}$/.test(ref)) markers.add(ref); // bank reference numbers
  }
  return [...markers];
}

function recordRequests(page: Page) {
  const seen: { method: string; url: string; body: string }[] = [];
  page.on("request", (r: Request) => seen.push({ method: r.method(), url: r.url(), body: r.postData() ?? "" }));
  return seen;
}

function expectNoRawContent(requests: { url: string; body: string }[], markers: string[], wholeFile: string) {
  for (const r of requests) {
    const haystack = decodeURIComponent(r.url) + "\n" + r.body;
    expect(haystack.includes(wholeFile.slice(0, 200)), `request ${r.url} contains the start of the file`).toBe(false);
    const leaked = markers.filter((m) => haystack.includes(m));
    expect(leaked, `request ${r.url} contains raw statement text`).toEqual([]);
  }
}

async function devSignIn(page: Page, email: string) {
  await page.goto("/account");
  await page.getByLabel(/Dev login/).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("What's saved")).toBeVisible({ timeout: 15_000 }); // the dev server may be busy compiling // wait until the session exists
}

async function throughPrivacy(page: Page) {
  await page.goto("/upload");
  await expect(page.getByText("The file is read on your device and never uploaded")).toBeVisible();
  const next = page.getByRole("button", { name: /Choose statement/ });
  await expect(next).toBeDisabled();
  await page.getByLabel(/I understand my file is read on this device/).check();
  await next.click();
}

test("sample statement: read on the device, taught, saved, and the raw file is never sent", async ({ page }) => {
  const email = `upload-${Date.now()}@example.com`;
  await devSignIn(page, email);
  const text = readFileSync(SAMPLE_PATH, "utf8");
  const requests = recordRequests(page);

  await throughPrivacy(page);
  const beforeFile = requests.length;
  await page.locator("#statement-files").setInputFiles(SAMPLE_PATH);
  await expect(page.getByText("Read on this device. Nothing sent.")).toBeVisible();
  // While reading the file, the only request allowed is fetching labels you saved before.
  const duringParse = requests.slice(beforeFile).filter((r) => !r.url.includes("/_next/") && !r.url.includes("__nextjs"));
  expect(duringParse.filter((r) => r.method !== "GET")).toEqual([]);
  const apiCalls = duringParse.map((r) => new URL(r.url).pathname).filter((p) => p.startsWith("/api/"));
  expect(apiCalls.every((p) => p === "/api/overrides")).toBe(true);
  await expect(page.getByText("Transactions").locator("..")).toContainText("51");

  await page.getByRole("button", { name: /Teach your twin/ }).click();
  // Family: mark the parent who sends pocket money.
  await page.getByRole("radio", { name: "Ramesh Kumar: Family" }).click();
  await page.getByRole("radio", { name: "Sunita Devi: Family" }).click(); // unmarked people would come first in the cards
  await page.getByRole("radio", { name: "Arjun P: Friend" }).click();
  await page.getByRole("radio", { name: "Lending to them" }).click();
  await page.getByRole("radio", { name: "Paying me back" }).click();
  await page.getByRole("button", { name: /who are the rest/ }).click();

  // Cards: six category buttons, the rest under "More".
  const card = page.getByRole("article", { name: /Who is/ });
  await expect(card.getByRole("button", { name: /\(likely\)$/ })).toHaveCount(1);
  await expect(card.getByRole("button", { name: / is / })).toHaveCount(6);
  await card.getByRole("button", { name: "More categories" }).click();
  await expect(card.getByRole("button", { name: / is / })).toHaveCount(13);
  await expect(card).toHaveAttribute("aria-label", "Who is Shanthi Pg?");
  await card.getByRole("button", { name: "Shanthi Pg is Rent/PG (likely)" }).click();
  await expect(page.getByRole("article", { name: /Who is/ })).not.toHaveAttribute("aria-label", "Who is Shanthi Pg?");
  const second = await page.getByRole("article", { name: /Who is/ }).getAttribute("aria-label");
  await page.keyboard.press("ArrowLeft"); // skip one with the keyboard
  await expect(page.getByRole("article", { name: /Who is/ })).not.toHaveAttribute("aria-label", second!);
  await page.getByRole("button", { name: "Undo" }).click(); // …and undo the skip, not the answer before it
  await expect(page.getByRole("article", { name: /Who is/ })).toHaveAttribute("aria-label", second!);
  await page.getByRole("button", { name: "Finish later and review" }).click();

  await expect(page.getByRole("heading", { name: "Ready to save your real months" })).toBeVisible();
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page.getByRole("heading", { name: "Your twin knows your real months" })).toBeVisible();

  expectNoRawContent(requests, rawMarkers(text), text);

  // What the server actually stored.
  const saved = await (await page.request.get("/api/transactions?limit=5000")).json();
  expect(saved.total).toBe(51);
  expect(Object.keys(saved.transactions[0])).not.toContain("description");
  expect(saved.transactions.filter((t: { counterparty: string; category: string }) => t.counterparty === "Ramesh Kumar").every((t: { category: string }) => t.category === "Family Support")).toBe(true);
  expect(saved.transactions.find((t: { counterparty: string }) => t.counterparty === "Shanthi Pg").category).toBe("Rent/PG");
  const labels = (await (await page.request.get("/api/overrides")).json()).overrides;
  expect(labels.map((l: { counterparty: string; category: string }) => `${l.counterparty}:${l.category}`).sort()).toEqual([
    "Arjun P:Friend",
    "Ramesh Kumar:Family",
    "Shanthi Pg:Rent/PG",
    "Sunita Devi:Family",
  ]);

  // Uploading the same statement again adds nothing new.
  await page.goto("/upload");
  await page.getByLabel(/I understand/).check();
  await page.getByRole("button", { name: /Choose statement/ }).click();
  await page.locator("#statement-files").setInputFiles(SAMPLE_PATH);
  await expect(page.getByText("4 payees you taught before")).toBeVisible();
  await page.getByRole("button", { name: "Skip teaching for now" }).click();
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page.getByText("0 new transactions saved (51 were already there)")).toBeVisible();

  await page.request.delete("/api/me");
});

test("signed out: asks to sign in right before saving, then carries on", async ({ page }) => {
  const email = `gate-${Date.now()}@example.com`;
  await throughPrivacy(page);
  await page.locator("#statement-files").setInputFiles(SAMPLE_PATH);
  await page.getByRole("button", { name: /Teach your twin/ }).click();
  await page.getByRole("radio", { name: "Ramesh Kumar: Family" }).click();
  await page.getByRole("radio", { name: "Sunita Devi: Family" }).click(); // unmarked people would come first in the cards
  await page.getByRole("radio", { name: "Arjun P: Friend" }).click();
  await page.getByRole("radio", { name: "Lending to them" }).click();
  await page.getByRole("radio", { name: "Paying me back" }).click();
  await page.getByRole("button", { name: /who are the rest/ }).click();
  await page.getByRole("button", { name: "Shanthi Pg is Rent/PG (likely)" }).click();
  await page.getByRole("button", { name: "Finish later and review" }).click();

  await expect(page.getByRole("heading", { name: "Sign in to save your real months" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in to save" }).click();

  // What waits in the tab during sign-in: categorised transactions only, never raw text.
  const pending = await page.evaluate(() => sessionStorage.getItem("money-twin:pending-upload") ?? "");
  const text = readFileSync(SAMPLE_PATH, "utf8");
  expect(rawMarkers(text).filter((m) => pending.includes(m))).toEqual([]);

  await expect(page).toHaveURL(/\/account\?callbackUrl=%2Fupload/);
  await page.getByLabel(/Dev login/).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/upload$/);
  await expect(page.getByRole("status")).toContainText("Your statement is ready to save");
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page.getByRole("heading", { name: "Your twin knows your real months" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("money-twin:pending-upload"))).toBeNull();

  const labels = (await (await page.request.get("/api/overrides")).json()).overrides;
  expect(labels).toHaveLength(4); // the answers given before signing in survived
  await page.request.delete("/api/me");
});

test("the wrong kind of file gets a clear message", async ({ page }) => {
  await throughPrivacy(page);
  await page.locator("#statement-files").setInputFiles({ name: "statement.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 fake") });
  // (Next.js also renders an empty role="alert" route announcer, so match the message itself.)
  await expect(page.getByRole("alert").filter({ hasText: "statement.pdf" })).toContainText("statement.pdf: That's a PDF");
  await page.locator("#statement-files").setInputFiles({ name: "hdfc.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Narration,Amount\n01/08/2026,UPI-XYZ,100\n") });
  await expect(page.getByRole("alert").filter({ hasText: "hdfc.csv" })).toContainText("doesn't look like a Kotak statement");
});

test.describe("real statements (local only)", () => {
  test.skip(!realFiles.length, "no CSVs in statements/");

  test("your Kotak CSVs: parsed on the device, saved, raw content never sent", async ({ page }) => {
    test.setTimeout(120_000);
    const email = `real-${Date.now()}@example.com`;
    await devSignIn(page, email);
    const requests = recordRequests(page);
    await throughPrivacy(page);
    await page.locator("#statement-files").setInputFiles(realFiles.map((f) => join(STATEMENTS, f)));
    await expect(page.getByText("Read on this device. Nothing sent.")).toBeVisible();
    await expect(page.getByText(/overlapping rows merged/)).toBeVisible();

    await page.getByRole("button", { name: /Teach your twin/ }).click();
    if (await page.getByRole("button", { name: /who are the rest/ }).isVisible()) {
      await page.getByRole("button", { name: /who are the rest/ }).click();
    }
    // Answer five cards with their "Likely" category (and, for friends, what the money was each way).
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: /\(likely\)$/ }).click();
      const lend = page.getByRole("radio", { name: /Lending to them/ });
      if (await lend.isVisible()) await lend.click();
      const back = page.getByRole("radio", { name: /Paying me back/ });
      if (await back.isVisible()) await back.click();
      await page.waitForTimeout(250);
    }
    await page.getByRole("button", { name: "Finish later and review" }).click();
    await page.getByRole("button", { name: "Save to my account" }).click();
    await expect(page.getByRole("heading", { name: "Your twin knows your real months" })).toBeVisible({ timeout: 30_000 });

    for (const f of realFiles) {
      const text = readFileSync(join(STATEMENTS, f), "utf8");
      expectNoRawContent(requests, rawMarkers(text), text);
    }
    const saved = await (await page.request.get("/api/transactions?limit=1")).json();
    expect(saved.total).toBe(1016);
    await page.request.delete("/api/me"); // remove the test account and its copy of your data
  });
});
