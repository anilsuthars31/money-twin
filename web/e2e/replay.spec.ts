import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// "Replay your real past", end to end: upload the sample statement (Jul–Aug 2026, made-up names),
// open /replay, plan August, live its real weeks, get a report card, and see the grade on the
// timeline and in the account.

const SAMPLE_PATH = join(__dirname, "..", "public", "sample-kotak-statement.csv");

async function devSignIn(page: Page, email: string) {
  await page.goto("/account");
  await page.getByLabel(/Dev login/).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("What's saved")).toBeVisible();
}

async function uploadSample(page: Page) {
  await page.goto("/upload");
  await page.getByLabel(/I understand my file is read on this device/).check();
  await page.getByRole("button", { name: /Choose statement/ }).click();
  await page.locator("#statement-files").setInputFiles(SAMPLE_PATH);
  await page.getByRole("button", { name: /Teach your twin/ }).click();
  await page.getByRole("radio", { name: "Ramesh Kumar: Family" }).click();
  await page.getByRole("radio", { name: "Sunita Devi: Family" }).click();
  await page.getByRole("radio", { name: "Arjun P: Friend" }).click();
  await page.getByRole("radio", { name: "Lending to them" }).click();
  await page.getByRole("button", { name: /who are the rest/ }).click();
  await page.getByRole("button", { name: "Shanthi Pg is Rent/PG (likely)" }).click();
  await page.getByRole("button", { name: "Finish later and review" }).click();
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page.getByRole("heading", { name: "Your twin knows your real months" })).toBeVisible();
}

test("replay a real month: plan, live the weeks, report card, grade on the timeline", async ({ page }) => {
  test.setTimeout(90_000);
  await devSignIn(page, `replay-${Date.now()}@example.com`);
  await page.evaluate(() =>
    localStorage.setItem(
      "money-twin:character",
      JSON.stringify({ type: "student", name: "Kavya", city: "Pune", avatarSeed: "kavya-1", createdAt: "" }),
    ),
  );
  await uploadSample(page);

  // Home: "Continue your twin" now goes to the replay, and the demo is still there.
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Continue your twin/ })).toHaveAttribute("href", "/replay");
  await expect(page.getByRole("link", { name: "Play the demo month" })).toBeVisible();
  await page.getByRole("link", { name: /Continue your twin/ }).click();

  // The month picker: one chapter per month with data, with what was spent and what came in.
  await expect(page.getByRole("heading", { name: "Replay your real past" })).toBeVisible();
  const months = page.getByRole("list", { name: "Your months" }).getByRole("button");
  await expect(months).toHaveCount(2);
  await expect(months.nth(0)).toHaveAccessibleName(/^July 2026: spent ₹[\d,]+, came in ₹[\d,]+$/);
  await expect(page.getByText("0 of 2 replayed")).toBeVisible();
  await months.nth(1).click();

  // Plan: "If you'd planned August…" with a 50/30/20 hint on August's real income.
  await expect(page.getByRole("heading", { name: /If you.d planned August/ })).toBeVisible();
  await expect(page.getByText(/50\/30\/20 on your ₹[\d,]+/)).toBeVisible();
  await page.getByLabel("Needs").fill("60"); // a plan of your own
  await page.getByRole("button", { name: /Lock in plan/ }).click();

  // Live the weeks: a summary, then events built from real payments.
  const seen: string[] = [];
  for (let i = 0; i < 30; i++) {
    if (await page.getByText("August 2026 report card").isVisible()) break;
    const event = page.locator("article h2").first();
    if (await event.isVisible()) seen.push((await page.locator("main").innerText()).replace(/\s+/g, " "));
    await page.locator("div.fixed button").click();
  }
  await expect(page.getByText("August 2026 report card")).toBeVisible();
  expect(seen.length).toBeGreaterThan(4);
  for (const text of seen) expect(text).not.toMatch(/NaN|undefined|\[object/);
  expect(seen.some((t) => /₹[\d,]+/.test(t))).toBe(true);

  // Report card: grade, plan vs actual, real categories.
  await expect(page.getByLabel(/^Grade [ABCD]$/)).toBeVisible();
  await expect(page.getByText("Your plan vs what really happened")).toBeVisible();
  await expect(page.getByRole("list", { name: "Spending by category" })).toContainText("Rent/PG");
  const grade = (await page.getByLabel(/^Grade [ABCD]$/).innerText()).trim();

  // Lessons from real habits.
  const learn = page.getByRole("button", { name: /^Learn/ });
  if (await learn.isVisible()) {
    await learn.click();
    await expect(page.getByText(/^Skill 1 of \d$/)).toBeVisible();
    await expect(page.getByText("Money skill")).toBeVisible();
    await page.getByRole("button", { name: "Back to your months" }).click();
  } else {
    await page.getByRole("button", { name: "All months" }).click();
  }

  // The timeline shows the grade, and the result reaches the account.
  await expect(page.getByText("1 of 2 replayed")).toBeVisible();
  await expect(months.nth(1)).toHaveAccessibleName(new RegExp(`grade ${grade}$`));
  await expect
    .poll(async () => (await (await page.request.get("/api/twin")).json()).twin?.replay?.months?.["2026-08"]?.grade, { timeout: 10_000 })
    .toBe(grade);
  const twin = (await (await page.request.get("/api/twin")).json()).twin;
  expect(Object.keys(twin.replay.months["2026-08"]).sort()).toEqual(["grade", "plan", "playedAt", "savingsKept", "score", "stats"]);

  await page.request.delete("/api/me");
});

test("replay without saved months points to upload and the demo", async ({ page }) => {
  await devSignIn(page, `replay-empty-${Date.now()}@example.com`);
  await page.goto("/replay");
  await expect(page.getByRole("heading", { name: "No real months yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Add a statement/ })).toHaveAttribute("href", "/upload");
  await expect(page.getByRole("link", { name: "Play the demo month instead" })).toBeVisible();
  await page.request.delete("/api/me");
});

test("signed out, /replay asks to sign in", async ({ page }) => {
  await page.goto("/replay");
  await expect(page.getByRole("link", { name: "Sign in" }).last()).toHaveAttribute("href", "/account?callbackUrl=%2Freplay");
});
