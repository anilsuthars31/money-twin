import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// "Who's who?" (Family · Me · Friend · Other), lending vs my share, income reasons, nicknames,
// friend balances, and the home-page summary. Uses the made-up sample statement, where:
//   Ramesh Kumar and Sunita Devi only send you money; Arjun P goes both ways (you pay, he pays back).

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

const labelsOf = async (page: Page) =>
  ((await (await page.request.get("/api/overrides")).json()).overrides as { counterparty: string; category: string; nickname?: string; friendMode?: string }[])
    .map((l) => [l.counterparty, l.category, l.nickname ?? "", l.friendMode ?? ""].join(":"))
    .sort();

test("people with money both ways (like a friend) are in Who's who", async ({ page }) => {
  await signInAndUpload(page, `both-${Date.now()}@example.com`);
  const arjun = page.getByRole("radiogroup", { name: "Who is Arjun P?" });
  await expect(arjun).toBeVisible();
  await expect(page.getByText("You sent ₹2,140 · they sent ₹600")).toBeVisible();
  await page.request.delete("/api/me");
});

test("Friend asks once: lending or my share, and only lending counts as 'owes you'", async ({ page }) => {
  await signInAndUpload(page, `lend-${Date.now()}@example.com`);
  const next = page.getByRole("button", { name: /who are the rest/ });

  await page.getByRole("radio", { name: "Arjun P: Friend" }).click();
  const question = page.getByRole("radiogroup", { name: "Money you sent Arjun P was mostly" });
  await expect(question).toBeVisible();
  await expect(next).toBeDisabled(); // must answer first
  await question.getByRole("radio", { name: "Lending to them" }).click();
  await expect(next).toBeEnabled();

  // Sunita only ever sent money, so there's nothing to ask.
  await page.getByRole("radio", { name: "Sunita Devi: Friend" }).click();
  await expect(page.getByRole("radiogroup", { name: "Money you sent Sunita Devi was mostly" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Ramesh Kumar: Family" }).click();
  await next.click();
  await page.getByRole("button", { name: "Finish later and review" }).click();

  const friends = page.getByRole("region", { name: "Money with friends" });
  await expect(friends).toContainText("Friends owe you₹1,540");
  await expect(friends).toContainText("You owe friends₹3,000");
  await expect(friends).toContainText("Arjun Powes you ₹1,540");

  // Switch Arjun to "my share": his payments become my spending and he leaves the balances.
  await page.getByRole("button", { name: "Back" }).click(); // to the cards
  await page.getByRole("button", { name: "Back" }).click(); // to Who's who
  await page.getByRole("radio", { name: "My share of things we did together" }).click();
  await page.getByRole("button", { name: /who are the rest/ }).click();
  await page.getByRole("button", { name: "Finish later and review" }).click();
  await expect(friends).toContainText("Friends owe you₹0");
  await expect(friends).not.toContainText("Arjun P");

  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page.getByRole("heading", { name: "Your twin knows your real months" })).toBeVisible();
  expect(await labelsOf(page)).toEqual(["Arjun P:Friend::share", "Ramesh Kumar:Family::", "Sunita Devi:Friend::lend"]);
  const saved = (await (await page.request.get("/api/transactions?limit=5000")).json()).transactions as { counterparty: string; type: string; category: string }[];
  expect(saved.filter((t) => t.counterparty === "Arjun P" && t.type === "DR").every((t) => ["Food", "Entertainment"].includes(t.category))).toBe(true);
  expect(saved.filter((t) => t.counterparty === "Arjun P" && t.type === "CR").every((t) => t.category === "Friend")).toBe(true);
  await page.request.delete("/api/me");
});

test("Friend on a swipe card asks the same question", async ({ page }) => {
  await signInAndUpload(page, `cardfriend-${Date.now()}@example.com`);
  await page.getByRole("radio", { name: "Ramesh Kumar: Family" }).click();
  await page.getByRole("radio", { name: "Sunita Devi: Family" }).click();
  await page.getByRole("button", { name: /who are the rest/ }).click();
  const card = page.getByRole("article", { name: /Who is/ });
  await expect(card).toHaveAttribute("aria-label", "Who is Arjun P?"); // unmarked in Who's who, so first
  await card.getByRole("button", { name: /^Arjun P is Friend/ }).click();
  await card.getByRole("radio", { name: /Lending to them/ }).click();
  await expect(card).not.toHaveAttribute("aria-label", "Who is Arjun P?");
  await page.getByRole("button", { name: "Finish later and review" }).click();
  await expect(page.getByRole("region", { name: "Money with friends" })).toContainText("Arjun Powes you ₹1,540");
  await page.request.delete("/api/me");
});

test("Other: nickname + category; income reasons for someone who pays you", async ({ page }) => {
  await signInAndUpload(page, `other-${Date.now()}@example.com`);

  // Arjun mostly receives money from me: spending categories.
  await page.getByRole("radio", { name: "Arjun P: Other" }).click();
  const arjunForm = page.getByRole("form", { name: "Who is Arjun P?" });
  await expect(arjunForm.getByText("What do you pay them for?")).toBeVisible();
  await expect(arjunForm.getByRole("radio", { name: "Health" })).toBeVisible();
  await arjunForm.getByRole("button", { name: "Save" }).click();
  await expect(arjunForm.getByText("Give them a name you'll recognise.")).toBeVisible();
  await expect(arjunForm.getByText("Pick a category.")).toBeVisible();
  await expect(page.getByRole("button", { name: /who are the rest/ })).toBeDisabled(); // finish or cancel first
  await arjunForm.getByLabel("Who is it?").fill("Gym trainer");
  await arjunForm.getByRole("radio", { name: "Health" }).click();
  await arjunForm.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Gym trainer")).toBeVisible(); // nickname replaces the UPI name

  // Sunita only pays me: "Why do they pay you?" with income reasons.
  await page.getByRole("radio", { name: "Sunita Devi: Other" }).click();
  const sunitaForm = page.getByRole("form", { name: "Who is Sunita Devi?" });
  await expect(sunitaForm.getByText("Why do they pay you?")).toBeVisible();
  await expect(sunitaForm.getByRole("radio", { name: "Health" })).toHaveCount(0);
  for (const reason of ["Salary/Stipend", "Scholarship", "Refund", "Sold something", "Other income"]) {
    await expect(sunitaForm.getByRole("radio", { name: reason })).toBeVisible();
  }
  await sunitaForm.getByLabel("Who is it?").fill("Tuition parent");
  await sunitaForm.getByRole("radio", { name: "Salary/Stipend" }).click();
  await sunitaForm.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Salary/Stipend · change")).toBeVisible();

  await page.getByRole("radio", { name: "Ramesh Kumar: Family" }).click();
  await page.getByRole("button", { name: /who are the rest/ }).click();

  // Cards: add a nickname; earlier nicknames are offered as quick chips.
  await expect(page.getByRole("article", { name: "Who is Shanthi Pg?" })).toBeVisible();
  await page.getByRole("button", { name: "Add a nickname" }).click();
  await expect(page.getByRole("button", { name: "Use nickname Gym trainer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use nickname Tuition parent" })).toBeVisible();
  await page.getByLabel("Nickname", { exact: true }).fill("PG owner");
  await expect(page.getByRole("heading", { name: "PG owner" })).toBeVisible();
  await page.getByRole("button", { name: "Shanthi Pg is Rent/PG (likely)" }).click();

  await page.getByRole("button", { name: "Finish later and review" }).click();
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page.getByRole("heading", { name: "Your twin knows your real months" })).toBeVisible();
  expect(await labelsOf(page)).toEqual([
    "Arjun P:Health:Gym trainer:",
    "Ramesh Kumar:Family::",
    "Shanthi Pg:Rent/PG:PG owner:",
    "Sunita Devi:Salary/Stipend:Tuition parent:",
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
  await expect(page.getByText("2 people not marked here will come up in the next cards.")).toBeVisible();
  await page.getByRole("button", { name: /who are the rest/ }).click();
  const card = page.getByRole("article", { name: /Who is/ });
  await expect(card).toHaveAttribute("aria-label", "Who is Sunita Devi?");
  await expect(card).toContainText("They've sent you ₹3,000");
  await page.getByRole("button", { name: /^Skip / }).click();
  await expect(card).toHaveAttribute("aria-label", "Who is Arjun P?");
  await page.request.delete("/api/me");
});
