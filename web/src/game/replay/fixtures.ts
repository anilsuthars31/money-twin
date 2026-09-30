import { buildRealMonth, type FriendMode, type RealMonth, type RealTxn } from "./real-month";

// Synthetic players for testing the replay engine (made-up names and amounts, August 2026).
// Three very different lives, so each should get a different story:
//  - Kavya, a hostel student on ₹8,000 a month from home
//  - Rahul, on his first ₹30,000 salary
//  - Meera, a freelancer paid irregularly by clients

interface Draft {
  day: number;
  time: string;
  amount: number;
  cp: string;
  category: string;
  type?: "DR" | "CR";
  channel?: string;
}

function month(opening: number, drafts: Draft[], nicknames: Record<string, string> = {}, friendModes: Record<string, FriendMode> = {}): RealMonth {
  let balance = opening;
  const txns: RealTxn[] = drafts
    .map((d) => ({ ...d, iso: `2026-08-${String(d.day).padStart(2, "0")}T${d.time}:00+05:30` }))
    .sort((a, b) => a.iso.localeCompare(b.iso))
    .map((d, i) => {
      const type = d.type ?? "DR";
      balance += type === "CR" ? d.amount : -d.amount;
      return {
        id: `f${i}`,
        datetime: d.iso,
        amount: d.amount,
        type,
        channel: d.channel ?? "UPI",
        counterparty: d.cp,
        category: d.category,
        confidence: "user",
        balance,
      };
    });
  return buildRealMonth("2026-08", txns, nicknames, friendModes);
}

const range = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** Kavya: hostel student, ₹8,000 pocket money, lots of chai, some delivery, lends to a friend. */
export function hostelStudent(): RealMonth {
  const d: Draft[] = [
    { day: 1, time: "09:10", amount: 8000, cp: "Ramesh Kumar", category: "Family Support", type: "CR" },
    { day: 18, time: "20:30", amount: 1500, cp: "Sunita Devi", category: "Family Support", type: "CR" },
    { day: 2, time: "10:20", amount: 299, cp: "Jio Prepaid", category: "Bills & Recharge", channel: "BILLPAY" },
    { day: 4, time: "16:10", amount: 340, cp: "Sri Sai Xerox", category: "Education" },
    { day: 6, time: "23:48", amount: 1299, cp: "AMAZON RETAIL", category: "Shopping", channel: "CARD" },
    { day: 8, time: "17:20", amount: 650, cp: "Arjun P", category: "Friend" },
    { day: 11, time: "22:05", amount: 300, cp: "Arjun P", category: "Friend", type: "CR" },
    { day: 23, time: "21:15", amount: 480, cp: "PVR Cinemas", category: "Entertainment" },
    { day: 14, time: "18:05", amount: 210, cp: "Medplus Pharmacy", category: "Health" },
  ];
  for (const day of range(1, 31)) {
    d.push({ day, time: "13:10", amount: 40 + (day % 4) * 15, cp: "Manjunath S", category: "Food" });
    if (day % 2 === 0) d.push({ day, time: "17:05", amount: 15, cp: "Nagaraj Tea Stall", category: "Food" });
  }
  for (const [day, time] of [[3, "22:40"], [5, "23:10"], [7, "22:30"], [10, "21:00"], [12, "23:20"], [15, "20:40"], [17, "22:50"], [20, "21:30"], [26, "23:05"], [29, "22:10"]] as const) {
    d.push({ day, time, amount: 180 + (day % 5) * 25, cp: day % 3 ? "Swiggy" : "Zomato", category: "Food & Dining" });
  }
  return month(900, d, { manjunaths: "Canteen uncle" }, { arjunp: "lend" });
}

/** Rahul: first job, ₹30,000 salary, PG rent, money home, a pay-later bill, gym, delivery. */
export function firstJob(): RealMonth {
  const d: Draft[] = [
    { day: 1, time: "09:02", amount: 30000, cp: "Nimbus Softech", category: "Salary/Stipend", type: "CR" },
    { day: 3, time: "10:15", amount: 9500, cp: "Shanthi Pg", category: "Rent/PG" },
    { day: 8, time: "20:10", amount: 3000, cp: "Ramesh Kumar", category: "Sent to Family" },
    { day: 12, time: "11:00", amount: 1850, cp: "LazyPay", category: "EMI & Loans" },
    { day: 4, time: "22:40", amount: 199, cp: "NETFLIX", category: "Subscriptions & Apps", channel: "CARD" },
    { day: 15, time: "09:00", amount: 119, cp: "SPOTIFY", category: "Subscriptions & Apps", channel: "CARD" },
    { day: 5, time: "10:05", amount: 349, cp: "Jio Prepaid", category: "Bills & Recharge", channel: "BILLPAY" },
    { day: 6, time: "21:30", amount: 650, cp: "Kiran M", category: "Bills & Recharge" },
    { day: 6, time: "21:40", amount: 800, cp: "Bescom", category: "Bills & Recharge", channel: "BILLPAY" },
    { day: 10, time: "07:30", amount: 1499, cp: "Cult Fit", category: "Health" },
    { day: 6, time: "23:48", amount: 1299, cp: "AMAZON RETAIL", category: "Shopping", channel: "CARD" },
    { day: 17, time: "20:34", amount: 2499, cp: "MYNTRA", category: "Shopping", channel: "CARD" },
    { day: 9, time: "21:10", amount: 1450, cp: "Meghana Foods", category: "Food & Dining" },
    { day: 16, time: "19:00", amount: 900, cp: "Rohit Sharma", category: "Entertainment" }, // "my share" friend
    { day: 23, time: "21:40", amount: 650, cp: "PVR Cinemas", category: "Entertainment" },
  ];
  for (const day of [7, 14, 21, 28]) d.push({ day, time: "19:30", amount: 640, cp: "Zepto", category: "Groceries" });
  for (const [day, time] of [[2, "21:15"], [5, "22:05"], [9, "22:50"], [11, "20:40"], [13, "23:10"], [16, "21:15"], [18, "22:05"], [20, "22:50"], [22, "20:40"], [24, "21:15"], [27, "22:05"], [30, "22:50"]] as const) {
    d.push({ day, time, amount: 250 + (day % 6) * 30, cp: day % 2 ? "Swiggy" : "Zomato", category: "Food & Dining" });
  }
  for (const day of range(3, 31)) {
    const weekday = new Date(Date.UTC(2026, 7, day)).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    d.push({ day, time: "08:50", amount: 60 + (day % 5) * 15, cp: day % 2 ? "Namma Yatri" : "Rapido", category: "Transport" });
    d.push({ day, time: "13:20", amount: 120, cp: "Office Canteen", category: "Food" });
  }
  return month(1500, d, { shanthipg: "PG owner" }, { rohitsharma: "share" });
}

/** Meera: freelancer, paid irregularly by two clients, rent, a train trip, a health bill, cash. */
export function freelancer(): RealMonth {
  const d: Draft[] = [
    { day: 3, time: "11:00", amount: 12000, cp: "Pixel Studio", category: "Other income", type: "CR", channel: "IMPS" },
    { day: 16, time: "15:30", amount: 4000, cp: "Brightline Media", category: "Other income", type: "CR", channel: "IMPS" },
    { day: 27, time: "12:10", amount: 19000, cp: "Pixel Studio", category: "Other income", type: "CR", channel: "IMPS" },
    { day: 5, time: "10:00", amount: 8000, cp: "Mehta Flats", category: "Rent" },
    { day: 6, time: "10:02", amount: 799, cp: "ACT Fibernet", category: "Bills & Recharge", channel: "BILLPAY" },
    { day: 7, time: "10:04", amount: 1200, cp: "Electricity Bill", category: "Bills & Recharge", channel: "BILLPAY" },
    { day: 9, time: "18:00", amount: 2000, cp: "ATM MG Road", category: "Cash Withdrawal", channel: "ATM" },
    { day: 12, time: "09:30", amount: 2400, cp: "IRCTC", category: "Travel" },
    { day: 14, time: "19:10", amount: 2900, cp: "Apollo Clinic", category: "Health" },
    { day: 20, time: "23:30", amount: 6999, cp: "CROMA", category: "Shopping", channel: "CARD" },
    { day: 22, time: "10:00", amount: 3500, cp: "Coursera", category: "Education", channel: "CARD" },
    { day: 25, time: "20:00", amount: 350, cp: "Brightline Media", category: "Refund", type: "CR" },
  ];
  for (const day of range(1, 31, 2)) d.push({ day, time: "11:30", amount: 180, cp: "Third Wave Coffee", category: "Food & Dining" });
  for (const day of [4, 11, 18, 25]) d.push({ day, time: "18:30", amount: 1100, cp: "BigBasket", category: "Groceries" });
  // A quiet stretch: days 28–31 have almost no spending.
  return month(3000, d, { pixelstudio: "Main client" });
}

export const PLAYERS = { hostelStudent, firstJob, freelancer };
