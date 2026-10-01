import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// "Where your money goes", end to end with the sample statement (Jul–Aug 2026, made-up names).

const SAMPLE_PATH = join(__dirname, "..", "public", "sample-kotak-statement.csv");

async function devSignIn(page: Page, email: string) {
  await page.goto("/account");
  await page.getByLabel(/Dev login/).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("What's saved")).toBeVisible({ timeout: 15_000 }); // the dev server may be busy compiling
}

test("dashboard: month totals, trend, categories against last month, top payees", async ({ page }) => {
  test.setTimeout(90_000);
  await devSignIn(page, `dash-${Date.now()}@example.com`);
  await page.goto("/upload");
  await page.getByLabel(/I understand my file is read on this device/).check();
  await page.getByRole("button", { name: /Choose statement/ }).click();
  await page.locator("#statement-files").setInputFiles(SAMPLE_PATH);
  await page.getByRole("button", { name: /Teach your twin/ }).click();
  await page.getByRole("radio", { name: "Ramesh Kumar: Family" }).click();
  await page.getByRole("radio", { name: "Sunita Devi: Family" }).click();
  await page.getByRole("radio", { name: "Arjun P: Friend" }).click();
  await page.getByRole("radio", { name: "Lending to them" }).click();
  await page.getByRole("radio", { name: "Paying me back" }).click();
  await page.getByRole("button", { name: /who are the rest/ }).click();
  await page.getByRole("button", { name: "Shanthi Pg is Rent/PG (likely)" }).click();
  await page.getByRole("button", { name: "Finish later and review" }).click();
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page.getByRole("heading", { name: "Your twin knows your real months" })).toBeVisible();

  // From home: the saved summary opens the dashboard.
  await page.goto("/");
  await page.getByRole("link", { name: /See where your money goes/ }).click();
  // First visit compiles the page (and Recharts) in dev, which can take a while.
  await expect(page.getByRole("heading", { name: "Where your money goes" })).toBeVisible({ timeout: 30_000 });

  // Newest month first selected; both months as chips; the chart covers both.
  const tabs = page.getByRole("tablist", { name: "Month" }).getByRole("tab");
  await expect(tabs).toHaveText(["July 2026", "August 2026"]);
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("img", { name: /Spending per month: July 2026 ₹[\d,]+, August 2026 ₹[\d,]+/ })).toBeVisible();
  await expect(page.getByLabel("August 2026 summary")).toContainText("Spent in August");
  await expect(page.getByLabel("August 2026 summary")).toContainText(/lent to friends/);

  // Categories: real names, compared with July.
  const cats = page.getByRole("list", { name: "Spending by category" });
  await expect(cats.getByRole("listitem").first()).toContainText("Rent/PG");
  await expect(page.getByText("Arrows compare with July.")).toBeVisible();

  // Top payees: biggest first; a friend you lent to isn't a payee.
  const payees = page.getByRole("list", { name: "Top payees" });
  await expect(payees.getByRole("listitem").first()).toContainText("Shanthi Pg");
  await expect(payees).not.toContainText("Arjun P");

  // Switch to July: no earlier month, so no comparison.
  await tabs.nth(0).click();
  await expect(page.getByLabel("July 2026 summary")).toContainText("Spent in July");
  await expect(page.getByText(/Arrows compare with/)).toHaveCount(0);

  await page.request.delete("/api/me");
});

test("dashboard with nothing saved points to upload; signed out goes to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/account\?callbackUrl=%2Fdashboard/);
  await devSignIn(page, `dash-empty-${Date.now()}@example.com`);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Add a statement/ })).toHaveAttribute("href", "/upload");
  await page.request.delete("/api/me");
});
