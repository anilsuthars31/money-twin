import { expect, test, type Page } from "@playwright/test";

// The twin follows the player to another device, and buttons never swallow early clicks.

async function devSignIn(page: Page, email: string) {
  await page.goto("/account");
  await page.getByLabel(/Dev login/).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("What's saved")).toBeVisible({ timeout: 15_000 }); // the dev server may be busy compiling
}

test("a twin made on one device appears on another after signing in", async ({ browser }) => {
  const email = `twin-${Date.now()}@example.com`;

  const phone = await browser.newContext();
  const a = await phone.newPage();
  await devSignIn(a, email);
  await a.goto("/create");
  await a.getByLabel("Name").fill("Kavya");
  await a.getByRole("radio", { name: /First job/ }).click();
  await a.getByRole("radio", { name: "Pune" }).click();
  const saved = a.waitForResponse((r) => r.url().endsWith("/api/twin") && r.request().method() === "PUT");
  await a.getByRole("button", { name: /Start the demo month/ }).click();
  await saved;

  // A different browser: nothing on this device yet.
  const laptop = await browser.newContext();
  const b = await laptop.newPage();
  await b.goto("/");
  expect(await b.evaluate(() => localStorage.getItem("money-twin:character"))).toBeNull();
  await devSignIn(b, email);
  await b.goto("/");
  await expect(b.getByText("Kavya is ready for another month in Pune.")).toBeVisible();
  const local = JSON.parse((await b.evaluate(() => localStorage.getItem("money-twin:character"))) ?? "{}");
  expect(local).toMatchObject({ name: "Kavya", type: "first-job", city: "Pune" });

  await b.request.delete("/api/me");
  await phone.close();
  await laptop.close();
});

test("playing without an account keeps the twin in this browser only", async ({ page }) => {
  let twinCalls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/twin") && r.method() === "PUT") twinCalls++;
  });
  await page.goto("/create");
  await page.getByLabel("Name").fill("Guest");
  await page.getByRole("button", { name: /Start the demo month/ }).click();
  await page.waitForURL("**/play/demo");
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("money-twin:character"))) ?? "{}").name).toBe("Guest");
  expect(twinCalls).toBe(0);
});

test("buttons show as not ready until the page can respond, then work on the first click", async ({ page }) => {
  // Slow the app's JavaScript down so there's a window before the page is interactive.
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  // The upload page's consent checkbox and button are in the server HTML, before JavaScript runs.
  await page.goto("/upload", { waitUntil: "commit" });
  const consent = page.getByLabel(/I understand my file is read on this device/);
  const choose = page.getByRole("button", { name: /Choose statement/ });
  await choose.waitFor({ state: "attached" });
  expect(await page.evaluate(() => document.documentElement.dataset.hydrated)).toBeUndefined();
  // The stylesheet may still be arriving: wait for it, while scripts (and so hydration) are held back.
  await expect.poll(() => consent.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await expect.poll(() => choose.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.dataset.hydrated)).toBeUndefined();

  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  await consent.check(); // one click each is enough
  await choose.click();
  await expect(page.getByText("Choose your Kotak CSV")).toBeVisible();

  // Same on the demo: "Plan your month" responds to the very first click.
  await page.goto("/play/demo");
  await page.getByRole("button", { name: /Plan your month/ }).click();
  await expect(page.getByRole("heading", { name: /Split ₹[\d,]+ into envelopes/ })).toBeVisible();
});
