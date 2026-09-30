import { expect, test, type Page } from "@playwright/test";

// Where sign-in sends you, and what the landing page and header show signed in vs out.

async function devSignInFrom(page: Page, accountUrl: string, email: string) {
  await page.goto(accountUrl);
  await page.getByLabel(/Dev login/).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function cleanUp(page: Page) {
  await page.request.delete("/api/me");
}

test("sign-in returns you to the page you started from", async ({ page }) => {
  await devSignInFrom(page, "/account?callbackUrl=%2Fskills", `return-${Date.now()}@example.com`);
  await expect(page).toHaveURL(/\/skills$/);
  await cleanUp(page);
});

test("with no starting page, sign-in lands on /account (not the landing page)", async ({ page }) => {
  await devSignInFrom(page, "/account", `default-${Date.now()}@example.com`);
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("What's saved")).toBeVisible();
  await cleanUp(page);
});

test("an off-site callbackUrl is ignored", async ({ page }) => {
  await devSignInFrom(page, "/account?callbackUrl=https%3A%2F%2Fevil.example%2Fsteal", `redirect-${Date.now()}@example.com`);
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/account$/);
  await cleanUp(page);
});

test("signed out: marketing hero and a Sign in button that comes back here", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Meet the version of you");
  const signIn = page.getByRole("link", { name: "Sign in" });
  await expect(signIn).toHaveAttribute("href", "/account?callbackUrl=%2F");
  await expect(page.getByText(/Welcome back/)).toHaveCount(0);
});

test("signed in: Welcome back, Continue your twin, and an avatar in the header", async ({ page }) => {
  const email = `welcome-${Date.now()}@example.com`;
  // Start from the landing page's own Sign in button: it should bring us back to "/".
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel(/Dev login/).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/localhost:3000\/$/);

  const firstName = email.split("@")[0];
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Welcome back, ${firstName}`);
  await expect(page.getByText("Meet the version of you")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Continue your twin/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);

  const avatar = page.getByRole("link", { name: `Your account (${firstName})` });
  await expect(avatar).toHaveAttribute("href", "/account");
  await avatar.click();
  await expect(page).toHaveURL(/\/account$/);
  await cleanUp(page);
});

test("Continue your twin goes to the demo when a twin exists, to create otherwise", async ({ page }) => {
  await devSignInFrom(page, "/account?callbackUrl=%2F", `twin-${Date.now()}@example.com`);
  await expect(page.getByRole("link", { name: /Continue your twin/ })).toHaveAttribute("href", "/create");
  await page.evaluate(() =>
    localStorage.setItem(
      "money-twin:character",
      JSON.stringify({ type: "student", name: "Kavya", city: "Pune", avatarSeed: "kavya-1", createdAt: "" }),
    ),
  );
  await page.reload();
  await expect(page.getByText("Kavya is ready for another month in Pune.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Continue your twin/ })).toHaveAttribute("href", "/play/demo");
  await cleanUp(page);
});
