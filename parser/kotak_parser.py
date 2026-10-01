"""
Money Twin - Kotak statement parser + rules-based categoriser.

Usage:
    python kotak_parser.py statement1.csv [statement2.csv ...] --out transactions.json [--config path.json]

Your own name and family names come from parser/config.json (git-ignored, never committed).
Copy parser/config.example.json to parser/config.json and fill it in.

What it does:
  1. Reads Kotak net-banking CSV exports (skips header/footer junk).
  2. Merges multiple statements and removes duplicates from overlapping periods.
  3. Pulls a clean counterparty name out of each description.
  4. Categorises every transaction with plain rules (no AI), with a confidence level.
  5. Lets the user teach it: merchant_overrides.json maps a counterparty -> category.
"""
import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
OVERRIDES_FILE = HERE / "merchant_overrides.json"
CONFIG_FILE = HERE / "config.json"  # personal names: git-ignored, see config.example.json

# ---------------------------------------------------------------- rules
# (category, [keywords]) - checked in order, first match wins. Lowercase.
MERCHANT_RULES = [
    ("Food & Dining", ["swiggy", "zomato", "domino", "pizza", "kfc", "mcdonald", "mc donald", "burger",
                        "hotel", "cafe", "coffee", "bakery", "sweets", "restaurant", "chats",
                        "canteen", "juice", "tea ", "dhaba", "biryani", "food", "lassi", "dosa",
                        "catering", "catring", "uengage"]),
    ("Groceries", ["zepto", "blinkit", "instamart", "bigbasket", "bbnow", "dmart", "mart",
                   "kirana", "provision", "super market", "supermarket", "traders", "general store",
                   "farm fresh"]),
    ("Travel", ["indigo", "airline", "airindia", "ibibo", "makemytrip", "irctc", "indian railways", "railway",
                "redbus", "cleartrip", "goibibo"]),
    ("Transport", ["rapido", "uber", "ola ", "bmtc", "metro", "petrol", "fuel", "fastag",
                   "garage", "auto", "namma yatri", "scooter"]),
    ("Shopping", ["amazon", "flipkart", "myntra", "meesho", "ajio", "lenskart", "jewell",
                  "style union", "styling", "life style", "lifestyle", "delhivery", "fashion", "trends", "bbiege", "footwear", "decathlon"]),
    ("Subscriptions & Apps", ["google india di", "googleindiadigi", "openai", "netflix", "spotify",
                              "hotstar", "prime", "youtube", "apple"]),
    ("Bills & Recharge", ["jio", "airtel", "vi prepaid", "vodafone", "bescom", "electricity",
                          "broadband", "billpay", "recharge"]),
    ("Education", ["institute", "college", "university", "school", "the secretary", "exam", "coaching", "tutedude"]),
    ("Health", ["health", "pharma", "medical", "clinic", "hospital", "apollo", "medplus", "1mg"]),
    ("Personal Care", ["salon", "saloon", "parlour", "barber", "hair"]),
    ("Govt & Documents", ["unique identifi", "uidai", "passport", "rto"]),
]

INCOME_RULES = [
    ("Cashback & Rewards", ["cashback", "supermoney", "reward"]),
    ("Interest", ["int.pd"]),
    ("Refund", ["rev-upi", "refund", "amazon sel"]),
    ("Cash Deposit", ["cash deposit"]),
]

# Words that suggest a business rather than a person (prefixes: UPI names are cut at 15 characters)
BUSINESS_HINTS = ["enterpr", "privat", "sewing", "steel", "brand", "store", "shop", "traders", "mart", "pvt", "ltd", "llp",
                  "services", "agency", "centre", "center", "paytmq", "ibkpos", "@ybl", "q52", "bharatpe"]

# Things that are not real income/spend (internal bank moves)
IGNORE_PATTERNS = ["ac xfr from gl"]


def _keyword_re(kws):
    """Short keywords (under 5 letters) must be a whole word (plural "s" allowed): "hair" matches
    "Hair Studio" but not "Chair", "mart" not "Martin". Longer brand names match anywhere, because
    UPI names are run together and cut at 15 characters. Same rule as web/src/lib/statement/rules.ts."""
    short = [re.escape(k) for k in kws if len(k.strip()) < 5]
    long = [re.escape(k) for k in kws if len(k.strip()) >= 5]
    parts = ([rf"(?:^|[^a-z0-9])(?:{'|'.join(short)})s?(?![a-z])"] if short else []) + ([f"(?:{'|'.join(long)})"] if long else [])
    return re.compile("|".join(parts))


MERCHANT_RE = [(cat, _keyword_re(kws)) for cat, kws in MERCHANT_RULES]
INCOME_RE = [(cat, _keyword_re(kws)) for cat, kws in INCOME_RULES]


def is_known_merchant(name):
    """A payee the merchant rules know ("Google India Di", "Dominos Pizza"): a business, never a person."""
    n = name.lower()
    return any(r.search(n) for _, r in MERCHANT_RE)


# ---------------------------------------------------------------- helpers
def to_amount(text):
    return float(text.replace(",", "").strip() or 0)


def _names(values):
    """Lowercase, no spaces: matches how counterparties are compared ("Ramesh Kumar" -> "rameshkumar")."""
    return tuple(v.lower().replace(" ", "") for v in values if v.strip())


def load_config(path=CONFIG_FILE):
    """Return (self_names, family_names) from the config file. Missing file = no names (with a warning)."""
    path = Path(path)
    if not path.exists():
        print(f"note: {path.name} not found; self transfers and family payments won't be recognised. "
              f"Copy config.example.json to config.json.", file=sys.stderr)
        return (), ()
    cfg = json.loads(path.read_text(encoding="utf-8"))
    return _names(cfg.get("self_names", [])), _names(cfg.get("family_names", []))


def load_overrides():
    if OVERRIDES_FILE.exists():
        return {k.lower(): v for k, v in json.loads(OVERRIDES_FILE.read_text()).items()}
    return {}


def extract_counterparty(desc):
    """Return (channel, counterparty name)."""
    parts = [p.strip() for p in desc.split("/")]
    head = parts[0].upper()
    if head in ("UPI", "REV-UPI") and len(parts) > 1:
        return head, re.sub(r"\s+", " ", parts[1]).strip().title()
    if head in ("PCD", "ATL"):          # debit card purchase / ATM
        name = parts[2] if len(parts) > 2 else desc
        return ("ATM" if head == "ATL" else "CARD"), re.sub(r"\s+", " ", name).strip()
    if head.startswith("811:BD"):       # Kotak bill pay
        return "BILLPAY", parts[-1].strip()
    if head.startswith("RECD:IMPS"):
        return "IMPS", parts[2].strip() if len(parts) > 2 else desc
    return "OTHER", desc.strip()


# Word hints start a word ("enterpr" for a cut-off "Enterprises"); short ones (mart, shop, pvt, ltd)
# are whole words, so "mart" matches "Grace Mart" but not "Martin". Others (@ybl, q52) match anywhere.
def _hint_re(h):
    if not h.isalpha():
        return re.escape(h)
    return rf"(?:^|[^a-z0-9]){h}s?(?![a-z])" if len(h) < 5 else rf"(?:^|[^a-z0-9]){h}"


BUSINESS_RE = re.compile("|".join(_hint_re(h) for h in BUSINESS_HINTS))


def looks_like_person(name):
    n = name.lower()
    if BUSINESS_RE.search(n) or is_known_merchant(n):
        return False
    return bool(re.fullmatch(r"(mr |mrs |ms )?[a-z .]+", n))   # letters/spaces only


def categorise(txn, overrides, self_names, family_names):
    desc = txn["description"].lower()
    cp = txn["counterparty"].lower()

    if any(p in desc for p in IGNORE_PATTERNS):
        return "Internal (ignore)", "high"
    if cp in overrides:
        return overrides[cp], "user"

    if txn["type"] == "CR":
        for cat, r in INCOME_RE:
            if r.search(desc):
                return cat, "high"
        if any(s in cp.replace(" ", "") for s in self_names):
            return "Self Transfer", "high"
        if any(f in cp.replace(" ", "") for f in family_names):
            return "Family Support", "medium"
        if is_known_merchant(cp):  # money back from a shop or app is a refund, not a friend
            return "Refund", "medium"
        if looks_like_person(cp):
            return "Received from Friends", "medium"
        return "Other Income", "low"

    # ---- debits
    if txn["channel"] == "ATM":
        return "Cash Withdrawal", "high"
    for cat, r in MERCHANT_RE:
        if r.search(cp) or r.search(desc):
            return cat, "high"
    if any(s in cp.replace(" ", "") for s in self_names):
        return "Self Transfer", "high"
    if any(f in cp.replace(" ", "") for f in family_names):
        return "Sent to Family", "medium"

    # Behavioural guess: small payment around lunch/dinner to a local vendor = food
    hour = txn["datetime"].hour
    if txn["amount"] <= 150 and (12 <= hour <= 15 or 18 <= hour <= 22):
        return "Food & Dining", "low"
    if looks_like_person(cp):
        return "Paid to People", "low"
    return "Uncategorised", "low"


# ---------------------------------------------------------------- parsing
def parse_kotak_csv(path):
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.reader(f):
            if len(r) < 9 or not r[0].strip().isdigit():
                continue    # header, blank lines, footer notes
            channel, cp = extract_counterparty(r[3])
            rows.append({
                "datetime": datetime.strptime(r[1].strip(), "%d-%m-%Y %H:%M"),
                "description": r[3].strip(),
                "ref": r[4].strip(),
                "amount": to_amount(r[5]),
                "type": r[6].strip().upper(),          # DR = spent, CR = received
                "balance": to_amount(r[7]) * (-1 if r[8].strip().upper() == "DR" else 1),
                "channel": channel,
                "counterparty": cp,
            })
    return rows


def merge(statements):
    """Combine statements; the same txn in two overlapping files is kept once."""
    seen, out = set(), []
    for rows in statements:
        for t in rows:
            key = (t["datetime"], t["description"], t["amount"], t["type"], t["balance"])
            if key not in seen:
                seen.add(key)
                out.append(t)
    return sorted(out, key=lambda t: t["datetime"])


def run(paths, self_names=None, family_names=None, config_path=CONFIG_FILE):
    """Names passed in win; otherwise they come from the config file (never hardcoded here)."""
    if self_names is None or family_names is None:
        cfg_self, cfg_family = load_config(config_path)
        self_names = cfg_self if self_names is None else _names(self_names)
        family_names = cfg_family if family_names is None else _names(family_names)
    overrides = load_overrides()
    txns = merge(parse_kotak_csv(p) for p in paths)
    for t in txns:
        t["category"], t["confidence"] = categorise(t, overrides, self_names, family_names)
    return txns


def unknown_payees(txns, top=20):
    """Top payees the rules could not place - ask the user to label these once."""
    totals = {}
    for t in txns:
        if t["type"] == "DR" and t["confidence"] == "low":
            totals[t["counterparty"]] = totals.get(t["counterparty"], 0) + t["amount"]
    return sorted(totals.items(), key=lambda kv: -kv[1])[:top]


if __name__ == "__main__":
    args = sys.argv[1:]
    out = "transactions.json"
    config = CONFIG_FILE
    if "--out" in args:
        i = args.index("--out"); out = args[i + 1]; args = args[:i] + args[i + 2:]
    if "--config" in args:
        i = args.index("--config"); config = args[i + 1]; args = args[:i] + args[i + 2:]
    txns = run(args, config_path=config)
    Path(out).write_text(json.dumps(txns, default=str, indent=1))
    print(f"{len(txns)} transactions -> {out}")
