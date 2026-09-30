import type { Persona } from "../types";
import { monthInfo, rng, toTransactions, type DemoMonth, type Draft } from "./build";
import { cityFlavour } from "./cities";
import { festival, freeTrial, gift, repair, sale, trip } from "./decisions";

// A hostel student living on ₹8,000/month pocket money (mess fees paid by parents).
// Patterns from real student statements: lots of ₹10–90 lunchtime/chai UPI payments to vendors
// that show up as person names, money from family, food delivery creeping up, a big one-off buy,
// and a mid-month top-up from home.

export function buildStudent(cityName: string, month: DemoMonth): Persona {
  const c = cityFlavour(cityName);
  const m = monthInfo(month);
  const r = rng(8000 + month);
  const [ride, ride2] = c.transport;

  const drafts: Draft[] = [
    { day: 1, time: "09:12", amount: 8000, type: "CR", counterparty: "Ramesh Kumar", category: "Family Support" },
    { day: 18, time: "20:40", amount: 1500, type: "CR", counterparty: "Sunita Devi", category: "Family Support" },
    { day: 11, time: "22:05", amount: 300, type: "CR", counterparty: "Arjun P", category: "Received from Friends" },
    { day: 25, time: "13:30", amount: 250, type: "CR", counterparty: "Neha S", category: "Received from Friends" },

    { day: 2, time: "10:20", amount: 299, channel: "BILLPAY", counterparty: "Jio Prepaid", category: "Bills & Recharge" },
    { day: 4, time: "16:10", amount: 340, counterparty: "Sri Sai Xerox", category: "Education" },
    { day: 21, time: "15:45", amount: 180, counterparty: "Sri Sai Xerox", category: "Education" },
    { day: 9, time: "11:30", amount: 150, counterparty: "Hair Studio Men", category: "Personal Care" },
    { day: 14, time: "18:05", amount: 210, counterparty: "Medplus Pharmac", category: "Health" },

    month === 8
      ? { day: 6, time: "23:48", amount: 1299, channel: "CARD", counterparty: "AMAZON RETAIL", category: "Shopping" }
      : { day: 5, time: "23:15", amount: 999, channel: "CARD", counterparty: "MYNTRA", category: "Shopping" },
    { day: 16, time: "19:30", amount: 780, counterparty: c.eatOut, category: "Food & Dining" },
    { day: 23, time: "21:15", amount: 480, counterparty: "PVR Cinemas", category: "Entertainment" },
    { day: 12, time: "17:20", amount: 420, counterparty: "Rahul Verma", category: "Paid to People", lowConfidence: true },

    { day: 3, time: "21:40", amount: 265, counterparty: "Blinkit", category: "Groceries" },
    { day: 13, time: "22:30", amount: 189, counterparty: "Zepto", category: "Groceries" },
    { day: 27, time: "20:10", amount: 232, counterparty: "Blinkit", category: "Groceries" },
  ];

  for (const day of [5, 8, 10, 12, 15, 17, 20, 22, 26, 29]) {
    drafts.push({
      day,
      time: r.pick(["21:30", "22:15", "23:05", "20:50"]),
      amount: r.between(150, 300),
      counterparty: r.pick(["Swiggy", "Swiggy", "Zomato"]),
      category: "Food & Dining",
    });
  }
  for (const day of [3, 7, 9, 14, 16, 21, 24, 28, 30]) {
    drafts.push({
      day,
      time: r.pick(["08:40", "18:20", "19:10"]),
      amount: r.between(40, 110),
      counterparty: r.pick([ride, ride2, ride]),
      category: "Transport",
    });
  }
  // The big one: tiny lunchtime and chai payments almost every day.
  for (let day = 1; day <= m.days; day++) {
    if (r.chance(0.8)) {
      drafts.push({
        day,
        time: `${r.pick(["12", "13", "14"])}:${String(r.between(0, 55)).padStart(2, "0")}`,
        amount: r.between(30, 90),
        counterparty: r.pick(c.lunchVendors),
        category: "Food & Dining",
        lowConfidence: true,
      });
    }
    if (r.chance(0.65)) {
      drafts.push({
        day,
        time: `${r.pick(["16", "17", "19"])}:${String(r.between(0, 55)).padStart(2, "0")}`,
        amount: r.between(10, 25),
        counterparty: r.pick(c.chaiVendors),
        category: "Food & Dining",
        lowConfidence: true,
      });
    }
  }

  const t = c.studentTrip;
  return {
    id: `student-${c.city}-${month}`,
    type: "student",
    title: "Hostel student",
    city: c.city,
    monthLabel: m.label,
    year: 2026,
    month,
    openingBalance: 900,
    monthlyIncome: 8000,
    savingsGoal: 1200,
    knownBills: [
      { label: "Phone recharge", amount: 299 },
      { label: "Printouts & notes", amount: 520 },
    ],
    transactions: toTransactions("st", month, drafts),
    copy: {
      intro: {
        headline: `{name} is a hostel student in ${c.city}.`,
        body: "₹8,000 pocket money arrives on the 1st. Mess fees are paid, so it's all for chai, food, travel and fun.",
      },
      incomeTitle: "Pocket money landed",
      incomeBody: "{amount} from home. It feels like a lot on day {day}.",
      deliveryEarly: "Mess food just isn't hitting after 10pm.",
      deliveryLate: "The mess dinner you've already paid for keeps getting skipped.",
      quietWeek: "Classes, mess food, the usual.",
      borrowTitle: "Borrowed {amount} from your roommate",
    },
    choices:
      month === 8
        ? [
            gift(1, "Neha", 300, 100),
            trip(2, t.title, t.body, t.cost, "Arjun P"),
            sale(3, "sneakers", 1799, 2999, "FLIPKART"),
            festival(4, "Raksha Bandhan this week", "A bus home and a small gift come to ₹700. Or a courier and a long video call.", 700, 250, "Go home", "Courier a gift"),
          ]
        : [
            freeTrial(1, "Prime Video", 299),
            repair(2, "Cracked phone screen", 1800, 700, "Samsung Service"),
            sale(3, "headphones", 1499, 2999, "AMAZON"),
            festival(4, "Ganesh festival night out", "Pandal hopping, modaks and an auto back at midnight: about ₹600.", 600, 150, "Go all out", "Hostel aarti only"),
          ],
  };
}
