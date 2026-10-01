import { describe, expect, test } from "vitest";
import { BORROWED_FROM_FRIEND, FRIEND_THEIR_SHARE, categoryForLabel } from "./categories";
import { netFriends } from "./friends";

const t = (counterparty: string, type: "DR" | "CR", amount: number, category: string) => ({ counterparty, type, amount, category });
const at = { amount: 500, datetime: "2026-08-10T12:00:00+05:30" };

describe("what money with a friend was, by direction", () => {
  test("labels: money you sent (lend / my share), money they sent (payback / their share / borrowed)", () => {
    expect(categoryForLabel("Friend", { ...at, type: "DR" }, "lend")).toBe("Friend");
    expect(categoryForLabel("Friend", { ...at, amount: 250, type: "DR" }, "share")).toBe("Food"); // lunch-sized: food
    expect(categoryForLabel("Friend", { ...at, type: "CR" }, "lend", "payback")).toBe("Friend");
    expect(categoryForLabel("Friend", { ...at, type: "CR" }, "lend", "their-share")).toBe(FRIEND_THEIR_SHARE);
    expect(categoryForLabel("Friend", { ...at, type: "CR" }, undefined, "borrowed")).toBe(BORROWED_FROM_FRIEND);
    expect(categoryForLabel("Friend", { ...at, type: "CR" })).toBe("Friend"); // no answer: paying back
    expect(categoryForLabel("Friend", { ...at, type: "DR" }, "lend", "borrowed")).toBe("Friend"); // the answer is per direction
  });
});

describe("Friends owe you / You owe friends", () => {
  test("you only sent, lending: they owe you all of it", () => {
    expect(netFriends([t("Arjun P", "DR", 650, "Friend"), t("Arjun P", "DR", 420, "Friend")])).toMatchObject({ owedToYou: 1070, youOwe: 0 });
  });

  test("lending, partly paid back", () => {
    const r = netFriends([t("Arjun P", "DR", 1000, "Friend"), t("Arjun P", "CR", 300, "Friend")]);
    expect(r.friends).toMatchObject([{ name: "Arjun P", lent: 1000, paidBack: 300, net: 700 }]);
  });

  test("they only sent, paying you back (an older loan): nobody owes anybody", () => {
    expect(netFriends([t("Arjun P", "CR", 300, "Friend")])).toEqual({ friends: [], owedToYou: 0, youOwe: 0 });
  });

  test("they only sent, you borrowed: you owe them", () => {
    const r = netFriends([t("Rahul Sharma", "CR", 2000, BORROWED_FROM_FRIEND)], (c) => (c === "Rahul Sharma" ? "Rahul" : c));
    expect(r).toMatchObject({ owedToYou: 0, youOwe: 2000, friends: [{ name: "Rahul", borrowed: 2000, net: -2000 }] });
  });

  test("their share of something you paid for isn't a loan either way", () => {
    expect(netFriends([t("Meera", "CR", 400, FRIEND_THEIR_SHARE)])).toEqual({ friends: [], owedToYou: 0, youOwe: 0 });
  });

  test("both ways: what they owe you, minus what you borrowed", () => {
    const r = netFriends([
      t("Kiran", "DR", 1000, "Friend"),
      t("Kiran", "CR", 300, "Friend"),
      t("Kiran", "CR", 500, BORROWED_FROM_FRIEND),
      t("Rahul", "CR", 2000, BORROWED_FROM_FRIEND),
      t("Arjun", "DR", 400, "Food"), // "my share": your own spending, not here
    ]);
    expect(r.friends.map((f) => [f.name, f.net])).toEqual([
      ["Rahul", -2000],
      ["Kiran", 200],
    ]);
    expect(r).toMatchObject({ owedToYou: 200, youOwe: 2000 });
  });
});
