import type { Persona } from "../types";
import { fmt, monthInfo, rng, round500, toTransactions, type DemoMonth, type Draft } from "./build";
import { cityFlavour } from "./cities";
import { emiOffer, festival, freeTrial, gift, repair, trip } from "./decisions";

// First job, first salary: ₹32,000 in hand (more in pricier cities), a PG room, money sent home,
// a pay-later app bill, weekday office lunches and a lot of delivery.

const BASE_RENT = 9500;
const BASE_SALARY = 32000;

export function buildFirstJob(cityName: string, month: DemoMonth): Persona {
  const c = cityFlavour(cityName);
  const m = monthInfo(month);
  const r = rng(32000 + month);
  const rent = round500(BASE_RENT * c.rentScale);
  // Pricier cities pay more; what's left after rent stays about the same.
  const salary = BASE_SALARY + (rent - BASE_RENT);
  const tripCost = round500(4500 * c.weekendTrip.costScale);

  const drafts: Draft[] = [
    { day: 1, time: "09:02", amount: salary, type: "CR", channel: "IMPS", counterparty: "Nimbus Softech", category: "Salary" },
    { day: 3, time: "10:15", amount: rent, counterparty: "Shanthi PG", category: "Rent", lowConfidence: true },
    { day: 8, time: "20:10", amount: 3000, counterparty: "Ramesh Kumar", category: "Sent to Family" },
    { day: 4, time: "22:40", amount: 199, channel: "CARD", counterparty: "NETFLIX", category: "Subscriptions & Apps" },
    { day: 5, time: "10:05", amount: 349, channel: "BILLPAY", counterparty: "Jio Prepaid", category: "Bills & Recharge" },
    { day: 6, time: "21:30", amount: 650, counterparty: "Kiran M", category: "Bills & Recharge", lowConfidence: true }, // electricity share
    { day: 10, time: "07:30", amount: 1499, counterparty: "Cult Fit", category: "Health" },
    { day: 12, time: "11:00", amount: 1850, counterparty: "LazyPay", category: "EMI & Loans" },
    { day: 15, time: "09:00", amount: 119, channel: "CARD", counterparty: "SPOTIFY", category: "Subscriptions & Apps" },
    month === 8
      ? { day: 17, time: "23:34", amount: 1999, channel: "CARD", counterparty: "MYNTRA", category: "Shopping" }
      : { day: 18, time: "23:10", amount: 1799, channel: "CARD", counterparty: "AMAZON RETAIL", category: "Shopping" },
    { day: 9, time: "21:10", amount: 1100, counterparty: c.eatOut, category: "Food & Dining" },
    { day: 23, time: "21:40", amount: 650, counterparty: "PVR Cinemas", category: "Entertainment" },
    { day: 20, time: "19:00", amount: 400, type: "CR", counterparty: "Kiran M", category: "Received from Friends" },
  ];

  for (const day of [7, 14, 21, 28]) {
    drafts.push({ day, time: "19:30", amount: r.between(400, 900, 10), counterparty: r.pick(["Blinkit", "Zepto", "DMart"]), category: "Groceries" });
  }
  for (const day of [2, 9, 13, 16, 20, 22, 24, 27, 30]) {
    drafts.push({
      day,
      time: r.pick(["21:15", "22:05", "22:50", "20:40"]),
      amount: r.between(220, 420),
      counterparty: r.pick(["Swiggy", "Zomato", "Swiggy"]),
      category: "Food & Dining",
    });
  }
  // Weekdays: commute and office-area lunch. Every day: evening chai.
  for (let day = 1; day <= m.days; day++) {
    if (!m.isWeekend(day)) {
      drafts.push({ day, time: "08:50", amount: r.between(40, 120), counterparty: r.pick(c.transport), category: "Transport" });
      if (r.chance(0.7)) {
        drafts.push({
          day,
          time: `13:${String(r.between(0, 55)).padStart(2, "0")}`,
          amount: r.between(60, 150),
          counterparty: r.pick(c.lunchVendors),
          category: "Food & Dining",
          lowConfidence: true,
        });
      }
    }
    if (r.chance(0.6)) {
      drafts.push({
        day,
        time: `${r.pick(["16", "17"])}:${String(r.between(0, 55)).padStart(2, "0")}`,
        amount: r.between(15, 30),
        counterparty: r.pick(c.chaiVendors),
        category: "Food & Dining",
        lowConfidence: true,
      });
    }
  }

  return {
    id: `first-job-${c.city}-${month}`,
    type: "first-job",
    title: "First job",
    city: c.city,
    monthLabel: m.label,
    year: 2026,
    month,
    openingBalance: 2500,
    monthlyIncome: salary,
    savingsGoal: 4000,
    knownBills: [
      { label: "PG rent", amount: rent },
      { label: "Money home", amount: 3000 },
      { label: "LazyPay bill", amount: 1850 },
      { label: "Gym", amount: 1499 },
      { label: "Phone & electricity", amount: 999 },
    ],
    transactions: toTransactions("fj", month, drafts),
    copy: {
      intro: {
        headline: `{name} just started a first job in ${c.city}.`,
        body: `${fmt(salary)} salary on the 1st, ${fmt(rent)} PG rent, and parents who'd love some help.`,
      },
      incomeTitle: "Salary day",
      incomeBody: "{amount} from Nimbus Softech. A real salary, and for a few hours you feel rich.",
      deliveryEarly: "PG dinner comes with the rent, but it's dal again.",
      deliveryLate: "The PG dinner you pay for in rent keeps getting skipped.",
      quietWeek: "Office, PG, repeat.",
      borrowTitle: "Borrowed {amount} from a colleague",
    },
    choices:
      month === 8
        ? [
            gift(1, "Kiran", 500, 200),
            trip(
              2,
              `Office gang's ${c.weekendTrip.place} weekend?`,
              `Everyone from your team is going. Stay, travel and food come to ${fmt(tripCost)} each.`,
              tripCost,
              "Rohit Sharma",
            ),
            emiOffer(3, "New phone", 35988, 12, "Bajaj Finserv"),
            festival(4, "Raksha Bandhan this week", "A train home and gifts come to ₹1,800. Or send a gift and video call.", 1800, 500, "Go home", "Send a gift"),
          ]
        : [
            freeTrial(1, "Netflix Premium", 649),
            repair(2, "Laptop screen flickering", 2500, 900, "Dell Service"),
            emiOffer(3, "Gaming laptop", 59988, 12, "Bajaj Finserv"),
            festival(4, "Ganesh Chaturthi at home", "Travel home and your share of the puja come to ₹2,000.", 2000, 600, "Go home", "Office celebration"),
          ],
  };
}
