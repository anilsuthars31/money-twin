import { expect, test, type Page } from "@playwright/test";

// The account and the twin are different things: the home page keeps them apart, the twin can be
// edited, and signing in never silently attaches a browser's twin to an account.

const twinIn = (name: string, extra: object = {}) => ({
  type: "student",
  name,
  city: "Pune",
  avatarSeed: `${name.toLowerCase()}-1`,
  createdAt: `2026-09-${String(([...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 28) + 1).padStart(2, "0")}T00:00:00.000Z`, // one per name
  ...extra,
});

async function setBrowserTwin(page: Page, twin: object) {
  await page.evaluate((t) => localStorage.setItem("money-twin:character", JSON.stringify(t)), twin);
}

async function signIn(page: Page, email: string) {
  await page.goto("/account?callbackUrl=%2F");
  await page.getByLabel(/Dev login/).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 15_000 });
}

const accountTwin = async (page: Page) => (await (await page.request.get("/api/twin")).json()).twin;

test("signing in with a twin in the browser asks first; 'Create a new twin' starts fresh", async ({ page }) => {
  await page.goto("/");
  await setBrowserTwin(page, twinIn("Rohan"));
  await signIn(page, `ask-${Date.now()}@example.com`);

  const dialog = page.getByRole("dialog", { name: "Use this twin or create a new one?" });
  await expect(dialog).toContainText("Rohan");
  await dialog.getByRole("button", { name: /Create a new twin/ }).click();
  await expect(page).toHaveURL(/\/create$/);
  expect(await page.evaluate(() => localStorage.getItem("money-twin:character"))).toBeNull();
  expect(await accountTwin(page)).toBeNull(); // nothing was attached

  await page.getByLabel("Name").fill("Meera");
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/twin") && r.request().method() === "PUT");
  await page.getByRole("button", { name: /Start the demo month/ }).click();
  await saved;
  expect((await accountTwin(page)).character.name).toBe("Meera");
  await page.request.delete("/api/me");
});

test("an account that already has a twin uses it, not the browser's", async ({ page }) => {
  const email = `owner-${Date.now()}@example.com`;
  await signIn(page, email);
  await page.request.put("/api/twin", { data: { character: twinIn("Kavya") } });
  // Sign out, play as someone else on this browser, then sign back in.
  await page.context().clearCookies();
  await page.goto("/");
  await setBrowserTwin(page, twinIn("Rohan", { updatedAt: new Date().toISOString() }));
  await signIn(page, email);

  await expect(page.getByRole("dialog")).toHaveCount(0);
  const card = page.getByRole("region", { name: "Your twin" });
  await expect(card).toContainText("Kavya");
  await expect(card).not.toContainText("Rohan");
  expect((await accountTwin(page)).character.name).toBe("Kavya");
  await page.request.delete("/api/me");
});

test("home keeps account and twin apart; Edit twin changes the twin and saves it to the account", async ({ page }) => {
  const email = `edit-${Date.now()}@example.com`;
  await signIn(page, email);
  await page.request.put("/api/twin", { data: { character: twinIn("Kavya") } });
  await page.reload();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Welcome back, Edit-\d+$/); // the account
  const card = page.getByRole("region", { name: "Your twin" }); // the twin, with its own name
  await expect(card).toContainText("Kavya");
  await expect(card).toContainText("Pune · Student");
  await card.getByRole("link", { name: /Edit twin/ }).click();

  await expect(page.getByRole("heading", { name: "Edit your twin" })).toBeVisible();
  const name = page.getByLabel("Name");
  await expect(name).toHaveValue("Kavya");
  const save = page.getByRole("button", { name: /Save changes/ });
  await name.fill("klsdjfj");
  await expect(page.getByText("That doesn't look like a name. Try a real one.")).toBeVisible();
  await expect(save).toBeDisabled();
  await name.fill("Kavya Rao");
  await page.getByRole("radio", { name: /First job/ }).click();
  await page.getByRole("radio", { name: "Mumbai" }).click();
  await page.getByRole("button", { name: "Shuffle look" }).click();
  const put = page.waitForResponse((r) => r.url().endsWith("/api/twin") && r.request().method() === "PUT");
  await save.click();
  await put;

  await expect(page).toHaveURL(/localhost:3000\/$/);
  await expect(card).toContainText("Kavya Rao");
  await expect(card).toContainText("Mumbai · First job");
  const saved = (await accountTwin(page)).character;
  expect(saved).toMatchObject({ name: "Kavya Rao", city: "Mumbai", type: "first-job", createdAt: twinIn("Kavya").createdAt });
  expect(saved.avatarSeed).not.toBe("kavya-1"); // a new look
  await page.request.delete("/api/me");
});

test("Create refuses empty and junk names", async ({ page }) => {
  await page.goto("/create");
  const start = page.getByRole("button", { name: /Start the demo month/ });
  await expect(start).toBeDisabled();
  for (const [junk, message] of [
    ["x", "Use at least 2 letters."],
    ["12345", "Use letters only (spaces, . ' and - are fine)."],
    ["asdfgh", "That looks like keyboard mashing. Try a real name."],
  ]) {
    await page.getByLabel("Name").fill(junk);
    await page.getByLabel("Name").blur();
    await expect(page.getByText(message)).toBeVisible();
    await expect(start).toBeDisabled();
  }
  await page.getByLabel("Name").fill("Aarav");
  await expect(start).toBeEnabled();
});
