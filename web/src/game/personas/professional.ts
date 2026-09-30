import type { Persona } from "../types";
import { fmt, monthInfo, rng, round500, toTransactions, type DemoMonth, type Draft } from "./build";
import { cityFlavour } from "./cities";
import { emiOffer, festival, freeTrial, gift, repair, scam, trip } from "./decisions";

// A few years into work: ₹85,000 in hand (more in pricier cities), a rented flat, a car EMI,
// money sent to parents, house help, weekend dinners, and "too good to be true" pitches.

const BASE_RENT = 24000;
const BASE_SALARY = 85000;

export function buildProfessional(cityName: string, month: DemoMonth): Persona {
  const c = cityFlavour(cityName);
  const m = monthInfo(month);
  const r = rng(85000 + month);
  const rent = round500(BASE_RENT * c.rentScale);
  const salary = BASE_SALARY + (rent - BASE_RENT);
  const tripCost = round500(12000 * c.weekendTrip.costScale);

  const drafts: Draft[] = [
    { day: 1, time: "08:45", amount: salary, type: "CR", channel: "IMPS", counterparty: "Orbit Analytics", category: "Salary" },
    { day: 2, time: "09:30", amount: rent, counterparty: "Suresh Rao", category: "Rent", lowConfidence: true },
    { day: 5, time: "06:00", amount: 11500, channel: "OTHER", counterparty: "Car Loan EMI", category: "EMI & Loans" },
    { day: 3, time: "11:10", amount: 3000, counterparty: "Lakshmi", category: "Bills & Recharge", lowConfidence: true }, // house help
    { day: 8, time: "19:45", amount: 10000, counterparty: "Ramesh Kumar", category: "Sent to Family" },
    { day: 6, time: "10:00", amount: 1850, channel: "BILLPAY", counterparty: "Electricity Bill", category: "Bills & Recharge" },
    { day: 6, time: "10:02", amount: 799, channel: "BILLPAY", counterparty: "ACT Fibernet", category: "Bills & Recharge" },
    { day: 7, time: "10:04", amount: 599, channel: "BILLPAY", counterparty: "Airtel Postpaid", category: "Bills & Recharge" },
    { day: 4, time: "23:00", amount: 649, channel: "CARD", counterparty: "NETFLIX", category: "Subscriptions & Apps" },
    { day: 10, time: "09:00", amount: 299, channel: "CARD", counterparty: "HOTSTAR", category: "Subscriptions & Apps" },
    { day: 15, time: "09:00", amount: 119, channel: "CARD", counterparty: "SPOTIFY", category: "Subscriptions & Apps" },
    { day: 9, time: "07:10", amount: 2500, counterparty: "Cult Fit", category: "Health" },
    month === 8
      ? { day: 13, time: "23:41", amount: 4999, channel: "CARD", counterparty: "AMAZON RETAIL", category: "Shopping" }
      : { day: 12, time: "23:20", amount: 3999, channel: "CARD", counterparty: "CROMA", category: "Shopping" },
    { day: 16, time: "21:30", amount: 2200, counterparty: c.eatOut, category: "Food & Dining" },
    { day: 22, time: "20:15", amount: 1100, counterparty: "PVR Cinemas", category: "Entertainment" },
    { day: 29, time: "21:00", amount: 2400, counterparty: "Barbeque Natio", category: "Food & Dining" },
  ];

  for (const day of [4, 11, 18, 25]) {
    drafts.push({ day, time: "18:30", amount: r.between(1200, 2200, 10), counterparty: r.pick(["BigBasket", "DMart", "Zepto"]), category: "Groceries" });
  }
  for (const day of [7, 21]) {
    drafts.push({ day, time: "08:20", amount: r.between(1800, 2200, 10), channel: "CARD", counterparty: "INDIAN OIL PETRO", category: "Transport" });
  }
  for (const day of [2, 6, 10, 14, 19, 24, 26, 30]) {
    drafts.push({
      day,
      time: r.pick(["20:45", "21:30", "22:10"]),
      amount: r.between(350, 650),
      counterparty: r.pick(["Swiggy", "Zomato", "Swiggy"]),
      category: "Food & Dining",
    });
  }
  for (const day of [3, 11, 19, 24, 28]) {
    drafts.push({ day, time: "18:40", amount: r.between(250, 450), counterparty: r.pick(["Uber", "Ola", "Rapido"]), category: "Transport" });
  }
  // Weekday lunch and coffee near the office.
  for (let day = 1; day <= m.days; day++) {
    if (m.isWeekend(day)) continue;
    if (r.chance(0.6)) {
      drafts.push({
        day,
        time: `13:${String(r.between(0, 55)).padStart(2, "0")}`,
        amount: r.between(90, 150),
        counterparty: r.pick(c.lunchVendors),
        category: "Food & Dining",
        lowConfidence: true,
      });
    }
    if (r.chance(0.8)) {
      drafts.push({
        day,
        time: `${r.pick(["11", "16"])}:${String(r.between(0, 55)).padStart(2, "0")}`,
        amount: r.between(40, 120),
        counterparty: r.pick([...c.chaiVendors, "Third Wave Coff"]),
        category: "Food & Dining",
        lowConfidence: true,
      });
    }
  }

  return {
    id: `professional-${c.city}-${month}`,
    type: "professional",
    title: "Working professional",
    city: c.city,
    monthLabel: m.label,
    year: 2026,
    month,
    openingBalance: 14000,
    monthlyIncome: salary,
    savingsGoal: 10000,
    knownBills: [
      { label: "Rent", amount: rent },
      { label: "Car EMI", amount: 11500 },
      { label: "Money to parents", amount: 10000 },
      { label: "House help", amount: 3000 },
      { label: "Bills & gym", amount: 5748 },
    ],
    transactions: toTransactions("wp", month, drafts),
    copy: {
      intro: {
        headline: `{name} works in ${c.city}, a few years into the job.`,
        body: `${fmt(salary)} salary, ${fmt(rent)} rent, an ₹11,500 car EMI, and money for parents every month.`,
      },
      incomeTitle: "Salary credited",
      incomeBody: "{amount} in. By day 5, rent and the car EMI will have taken a big bite.",
      deliveryEarly: "Cooking after a ten-hour day? Not happening.",
      deliveryLate: "The groceries you bought are wilting in the fridge.",
      quietWeek: "Work, home, the gym (once).",
      borrowTitle: "Put {amount} on the credit card",
    },
    choices:
      month === 8
        ? [
            gift(1, "Priya's farewell", 1000, 300),
            trip(
              2,
              `Long weekend in ${c.weekendTrip.place}?`,
              `Friends found a stay. Your share of stay, travel and food is ${fmt(tripCost)}.`,
              tripCost,
              "Neha Kapoor",
            ),
            scam(3, 20000),
            festival(4, "Raksha Bandhan this week", "Flights home and gifts come to ₹6,000. Or send gifts and join on video.", 6000, 2000, "Fly home", "Send gifts"),
          ]
        : [
            freeTrial(1, "Amazon Prime", 1499),
            repair(2, "Car AC stopped working", 6000, 2500, "Maruti Service"),
            emiOffer(3, "65-inch TV", 71988, 12, "Bajaj Finserv"),
            festival(4, "Ganesh Chaturthi at home", "Flights home and your share of the puja come to ₹7,000.", 7000, 2500, "Fly home", "Celebrate locally"),
          ],
  };
}
