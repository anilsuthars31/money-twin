import { expect, test, type Page } from "@playwright/test";

// The whole demo, as a brand-new player clicks through it:
// landing → create twin → demo month → sign in → "Try a sample" → privacy → Who's who → swipe cards
// → save → dashboard → replay a month with What-ifs → report card → account.
// Set SHOTS=<folder> to save a screenshot of each stop.

const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/flow-${name}.png`, fullPage: true });
};
const bottom = (page: Page) => page.locator("div.fixed button");

test("the full demo flow for a new account", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Landing: one line, one button.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Meet the version of you/ })).toBeVisible();
  await shot(page, "01-landing");
  await page.getByRole("link", { name: /Create your twin/ }).first().click();

  // Create a twin.
  await expect(page).toHaveURL(/\/create$/);
  await page.getByLabel("Name").fill("Aarav");
  await page.getByRole("radio", { name: /Student/ }).click();
  await page.getByRole("radio", { name: "Bengaluru" }).click();
  await shot(page, "02-create");
  await page.getByRole("button", { name: /Start the demo month/ }).click();

  // Demo month: plan, four weeks with a decision each, report card.
  await expect(page).toHaveURL(/\/play\/demo$/);
  await page.getByRole("button", { name: /Plan your month/ }).click();
  await expect(page.getByRole("heading", { name: /Split ₹[\d,]+ into envelopes/ })).toBeVisible();
  await page.getByRole("button", { name: /Lock in plan/ }).click();
  for (let i = 0; i < 40; i++) {
    if (await page.getByText(/report card$/).first().isVisible()) break;
    const choices = page.getByRole("group", { name: "Choose one" });
    if (await choices.isVisible()) await choices.getByRole("button").first().click();
    await bottom(page).click();
  }
  await expect(page.locator("[data-grade]")).toBeVisible();
  await shot(page, "03-demo-report");

  // Sign in (dev login stands in for Google).
  await page.goto("/account");
  await page.getByLabel(/Dev login/).fill(`flow-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("What's saved")).toBeVisible({ timeout: 15_000 });
  // The new account has no twin: asked whether the one made before signing in becomes theirs.
  await expect(page.getByRole("dialog", { name: "Use this twin or create a new one?" })).toBeVisible();
  await shot(page, "03b-use-this-twin");
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/twin") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "Use Aarav" }).click();
  await saved;
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Upload: privacy screen first, then the bundled sample.
  await page.goto("/upload");
  await expect(page.getByText("The file is read on your device and never uploaded")).toBeVisible();
  await shot(page, "04-privacy");
  await page.getByLabel(/I understand my file is read on this device/).check();
  await page.getByRole("button", { name: /Choose statement/ }).click();
  await page.getByRole("button", { name: /Try a sample/ }).click();
  await expect(page.getByText("Read on this device. Nothing sent.")).toBeVisible();
  await page.getByRole("button", { name: /Teach your twin/ }).click();

  // Who's who: family, a friend you lend to.
  await page.getByRole("radio", { name: "Ramesh Kumar: Family" }).click();
  await page.getByRole("radio", { name: "Sunita Devi: Family" }).click();
  await page.getByRole("radio", { name: "Arjun P: Friend" }).click();
  await page.getByRole("radio", { name: "Lending to them" }).click();
  await page.getByRole("radio", { name: "Paying me back" }).click();
  await shot(page, "05-whos-who");
  await page.getByRole("button", { name: /who are the rest/ }).click();

  // Swipe cards: rent, the canteen, then finish.
  const card = page.getByRole("article", { name: /Who is/ });
  await expect(card).toHaveAttribute("aria-label", "Who is Shanthi Pg?");
  await shot(page, "06-card");
  await card.getByRole("button", { name: "Shanthi Pg is Rent/PG (likely)" }).click();
  await expect(card).not.toHaveAttribute("aria-label", "Who is Shanthi Pg?");
  await page.getByRole("button", { name: "Finish later and review" }).click();
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page.getByRole("heading", { name: "Your twin knows your real months" })).toBeVisible();
  await shot(page, "07-saved");

  // Dashboard, from the home page.
  await page.goto("/");
  await page.getByRole("link", { name: /See where your money goes/ }).click();
  await expect(page.getByRole("tablist", { name: "Month" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("list", { name: "Spending by category" })).toContainText("Rent/PG");
  await shot(page, "08-dashboard");

  // Replay August with What-ifs: take every better move.
  await page.getByRole("link", { name: /Replay August with your twin/ }).click();
  await page.getByRole("list", { name: "Your months" }).getByRole("button").nth(1).click();
  await expect(page.getByRole("heading", { name: /If you.d planned August/ })).toBeVisible();
  await shot(page, "09-plan");
  await page.getByRole("button", { name: /Lock in plan/ }).click();
  let moments = 0;
  for (let i = 0; i < 40; i++) {
    if (await page.getByText("August 2026 report card").isVisible()) break;
    const moment = page.getByRole("article", { name: /^What if:/ });
    if (await moment.isVisible()) {
      if (++moments === 1) await shot(page, "10-what-if");
      await moment.getByRole("group").getByRole("button").first().click();
    }
    await bottom(page).click();
  }
  expect(moments).toBeGreaterThanOrEqual(2);
  const compare = page.getByRole("region", { name: "Real you vs What-if you" });
  await expect(compare).toContainText(/What-if you kept ₹[\d,]+ more/);
  await shot(page, "11-report");
  await page.getByRole("button", { name: "All months" }).click();
  await expect(page.getByTestId("what-if-total")).toBeVisible();

  // Account: what's saved, and the delete button.
  await page.goto("/account");
  await expect(page.getByText("What's saved")).toBeVisible();
  await expect(page.getByText(/51/).first()).toBeVisible();
  await shot(page, "12-account");

  expect(errors, "no uncaught errors in the browser").toEqual([]);
  await page.request.delete("/api/me");
});
