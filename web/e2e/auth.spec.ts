import { expect, test, type Page } from "@playwright/test";

// Sign-in, sign-out and "Delete all my data", end to end in a real browser against the dev server.
// Uses the dev-only email login (AUTH_DEV_LOGIN=true); Google itself can't be automated.

const sessionCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name.includes("authjs.session-token"));

async function devSignIn(page: Page, email: string) {
  await page.goto("/account");
  await page.getByLabel(/Dev login/).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("What's saved")).toBeVisible();
}

/** Removes the test user so runs don't pile up accounts in the dev database. */
async function cleanUp(page: Page, email: string) {
  if (!(await sessionCookie(page))) await devSignIn(page, email);
  await page.request.delete("/api/me");
}

test("sign out ends the session, even after a reload", async ({ page }) => {
  const email = `signout-${Date.now()}@example.com`;
  await devSignIn(page, email);
  expect(await sessionCookie(page)).toBeDefined();

  await page.getByRole("button", { name: "Sign out" }).click();

  // Clear feedback on the account page, not a silent jump to the landing page.
  await expect(page).toHaveURL(/\/account\?signedOut=1$/);
  await expect(page.getByRole("status")).toContainText("You're signed out");
  expect(await sessionCookie(page)).toBeUndefined();

  // Still signed out after a reload: sign-in shown, no session, API refuses.
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("What's saved")).toHaveCount(0);
  expect(await (await page.request.get("/api/auth/session")).json()).toBeNull();
  expect((await page.request.get("/api/me")).status()).toBe(401);

  await cleanUp(page, email);
});

test("Google sign-in always asks which account to use", async ({ page }) => {
  test.skip(
    !(await (await page.request.get("/api/auth/providers")).json()).google,
    "Google isn't configured in .env.local",
  );
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  const res = await page.request.post("/api/auth/signin/google", {
    form: { csrfToken, callbackUrl: "/account" },
    maxRedirects: 0,
  });
  const to = new URL(res.headers().location);
  expect(to.hostname).toBe("accounts.google.com");
  expect(to.searchParams.get("prompt")).toBe("select_account");
  expect(to.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback/google");
});

test("Delete all my data removes everything and signs out", async ({ page }) => {
  const email = `delete-${Date.now()}@example.com`;
  await devSignIn(page, email);

  // Save something so there's data to delete.
  const fp = (n: number) => n.toString(16).padStart(64, "0");
  const save = await page.request.post("/api/transactions", {
    data: {
      transactions: [1, 2].map((n) => ({
        fingerprint: fp(n),
        datetime: `2026-08-0${n}T12:00:00`,
        amount: 50 * n,
        type: "DR",
        channel: "UPI",
        counterparty: "Manjunath S",
        category: "Paid to People",
        confidence: "low",
      })),
    },
  });
  expect(save.status()).toBe(201);
  await page.reload();
  await expect(page.locator("dl")).toContainText("2");

  await expect(page.getByText(/your twin \(character,\s+XP and skills\), and the account itself/)).toBeVisible();
  await expect(page.getByText(/A copy of your twin also lives in this browser/)).toBeVisible();
  await page.getByRole("button", { name: "Delete all my data" }).click();
  const confirm = page.getByRole("button", { name: "Delete forever" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Type DELETE to confirm/).fill("delete");
  await expect(confirm).toBeDisabled(); // must match exactly
  await page.getByLabel(/Type DELETE to confirm/).fill("DELETE");
  await confirm.click();

  await expect(page).toHaveURL(/\/account\?signedOut=1$/);
  expect(await sessionCookie(page)).toBeUndefined();

  // Signing in again with the same email starts from nothing.
  await devSignIn(page, email);
  const me = await (await page.request.get("/api/me")).json();
  expect(me.counts).toEqual({ transactions: 0, overrides: 0 });
  await cleanUp(page, email);
});
