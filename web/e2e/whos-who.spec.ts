import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// "Who's who?" (Family · Me · Friend · Other), nicknames, friend balances, and the home-page summary.
// Uses the made-up sample statement.

const SAMPLE = join(__dirname, "..", "public", "sample-kotak-statement.csv");

async function signInAndUpload(page: Page, email: string) {
  await page.goto("/account");
  await page.getByLabel(/Dev login/).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("What's saved")).toBeVisible();
  await page.goto("/upload");
  await page.getByLabel(/I understand my file is read on this device/).check();
  await page.getByRole("button", { name: /Choose statement/ }).click();
  await page.locator("#statement-files").setInputFiles(SAMPLE);
  await page.getByRole("button", { name: /Teach your twin/ }).click();
  await expect(page.getByRole("heading", { name: "Who's who?" })).toBeVisible();
}

test("Other: a required nickname and category, saved with the label and shown instead of the UPI name", async ({ page }) => {
  await signInAndUpload(page, `other-${Date.now()}@example.com`);
  await expect(page.getByRole("radio", { name: "Sunita Devi: Me (my other account)" })).toBeVisible();

  await page.getByRole("radio", { name: "Sunita Devi: Other" }).click();
  const form = page.getByRole("form", { name: "Who is Sunita Devi?" });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Give them a name you'll recognise.")).toBeVisible();
  await expect(form.getByText("Pick a category.")).toBeVisible();
  await expect(page.getByRole("button", { name: /who are the rest/ })).toBeDisabled(); // finish or cancel the form first

  await form.getByLabel("Who is it?").fill("Hostel warden");
  await form.getByRole("radio", { name: "Rent/PG" }).click();
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Hostel warden")).toBeVisible(); // nickname replaces the UPI name
  await expect(page.getByText("Rent/PG · change")).toBeVisible();

  await page.getByRole("radio", { name: "Ramesh Kumar: Family" }).click();
  await page.getByRole("button", { name: /who are the rest/ }).click();

  // Cards: add a nickname; earlier nicknames are offered as quick chips.
  await expect(page.getByRole("article", { name: "Who is Shanthi Pg?" })).toBeVisible();
  await page.getByRole("button", { name: "Add a nickname" }).click();
  await expect(page.getByRole("button", { name: "Use nickname Hostel warden" })).toBeVisible();
  await page.getByLabel("Nickname", { exact: true }).fill("PG owner");
  await expect(page.getByRole("heading", { name: "PG owner" })).toBeVisible();
  await page.getByRole("button", { name: "Shanthi Pg is Rent/PG (likely)" }).click();

  // The next card offers both nicknames used so far.
  await page.getByRole("button", { name: "Add a nickname" }).click();
  await expect(page.getByRole("button", { name: "Use nickname PG owner" })).toBeVisible();
  await page.getByRole("button", { name: "Use nickname PG owner" }).click();
  await expect(page.getByLabel("Nickname", { exact: true })).toHaveValue("PG owner");
  await page.getByLabel("Nickname", { exact: true }).fill("");

  await page.getByRole("button", { name: "Finish later and review" }).click();
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page.getByRole("heading", { name: "Your twin knows your real months" })).toBeVisible();

  const labels = (await (await page.request.get("/api/overrides")).json()).overrides as { counterparty: string; category: string; nickname?: string }[];
  expect(labels.map((l) => `${l.counterparty}:${l.category}:${l.nickname ?? ""}`).sort()).toEqual([
    "Ramesh Kumar:Family:",
    "Shanthi Pg:Rent/PG:PG owner",
    "Sunita Devi:Rent/PG:Hostel warden",
  ]);

  // Home page: what's saved, instead of "Bring your twin to life".
  await page.goto("/");
  await expect(page.getByText("51 transactions saved, Jul–Aug 2026")).toBeVisible();
  await expect(page.getByText("Bring your twin to life with your statement")).toHaveCount(0);
  await page.request.delete("/api/me");
});

test("people not marked in Who's who come up first in the swipe cards", async ({ page }) => {
  await signInAndUpload(page, `unmarked-${Date.now()}@example.com`);
  await page.getByRole("radio", { name: "Ramesh Kumar: Family" }).click();
  await expect(page.getByText("1 person not marked here will come up in the next cards.")).toBeVisible();
  await page.getByRole("button", { name: /who are the rest/ }).click();
  const card = page.getByRole("article", { name: /Who is/ });
  await expect(card).toHaveAttribute("aria-label", "Who is Sunita Devi?");
  await expect(card).toContainText("They've sent you ₹3,000");
  await page.request.delete("/api/me");
});

test("friends: splits and loans netted per friend on the review screen", async ({ page }) => {
  await signInAndUpload(page, `friends-${Date.now()}@example.com`);
  await page.getByRole("radio", { name: "Sunita Devi: Friend" }).click();
  await page.getByRole("button", { name: /who are the rest/ }).click();
  // Arjun P isn't in Who's who (not enough money back and forth), so label him on his card.
  for (let i = 0; i < 10; i++) {
    const card = page.getByRole("article", { name: /Who is/ });
    if ((await card.getAttribute("aria-label")) === "Who is Arjun P?") break;
    await page.getByRole("button", { name: /^Skip / }).click();
    await expect(card).not.toHaveAttribute("aria-label", "");
    await page.waitForTimeout(250);
  }
  await page.getByRole("button", { name: "Arjun P is Friend", exact: false }).first().click();
  await page.getByRole("button", { name: "Finish later and review" }).click();

  const friends = page.getByRole("region", { name: "Money with friends" });
  await expect(friends).toContainText("Friends owe you₹1,540");
  await expect(friends).toContainText("You owe friends₹3,000");
  await expect(friends).toContainText("Arjun Powes you ₹1,540");
  await expect(friends).toContainText("Sunita Deviyou owe ₹3,000");
  await page.request.delete("/api/me");
});
