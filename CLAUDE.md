# Money Twin — project brief for Claude Code

## What this is
BTech (Digital Transformation, 3rd year) project by Anil. It's a web app plus a web game that teaches
budgeting and personal finance using the user's **real bank statement**.

**USP:** the only finance game where your character's life is shaped by your *actual* spending, and every
lesson comes from your own mistakes. Existing finance apps (INDmoney, ET Money) use real data but don't teach.
Life-sim games (BitLife) teach but use fake money.

## Hard rules
- **No AI/LLM features.** Categorisation and insights come from a plain rules engine.
- **No personalised trading/investment advice.** That needs SEBI registration. General market news is fine,
  but never "buy/sell" suggestions.
- **Privacy:** never store bank passwords, delete raw statements after parsing, and never commit real statement
  files or `transactions.json` to git (see .gitignore).
- **No custom art.** Use DiceBear avatars, Lucide/Twemoji icons, and cards/stat bars in React.

## Core features (build in this order)
1. **Statement parsing.** Kotak CSV works (`parser/kotak_parser.py`). PDF and other banks come later.
2. **"Teach your Money Twin" onboarding.** On real data, about 37% of spending goes to UPI payees with
   person names (local shops, PGs, friends) that no rule can categorise. But the top ~20 payees cover
   ~80% of that unknown spending. So onboarding asks the user to label their top 15–20 unknown payees
   ("Who is Manjunath S? Food / Rent / Friend…"). Answers are saved as merchant overrides.
   The user also tags family members here (don't hardcode surnames).
3. **"Where your money goes" dashboard:** category totals, month-on-month trend, top payees.
4. **Alerts:** category overspend, unusually large transactions, recurring subscriptions.
5. **Goals:** "₹X by date", time-to-goal, and which expenses to cut to get there faster.
6. **Game layer ("Money Twin"):**
   - Create a character (student / first job / working professional), name, city, and a DiceBear avatar.
   - Stats: Savings, Happiness, Stress, Goal Progress.
   - Real spending triggers life events ("18 Swiggy orders → skipped gym, Health −10").
   - Each month is a new chapter in the character's life, with a report card at the end.
   - **Lessons triggered by behaviour:** 50/30/20 rule, emergency fund, EMI/BNPL trap, compounding, inflation.
   - "Replay your month" with different choices; "Future you" projection for 5/10/20 years.
   - India-specific scenarios: UPI micro-spends, festivals, first salary, hostel life.
7. **Next-month budget planner.**
8. **Bonus:** Account Aggregator sandbox (Setu/Finvu) for consent-based bank data, with no uploads.

## Game flow (how a new user starts)
Don't ask for a bank statement first; users won't trust a new app with money data yet. Let them play, then ask.
1. **Landing:** one line ("Meet the version of you that lives on your real spending") and one button, "Create your twin".
2. **Create character (no data needed):** type (student / first job / working professional), name, city,
   DiceBear avatar. The character appears with full stat bars.
3. **Demo month:** the twin lives through one month using a **sample persona** (e.g. hostel student,
   ₹8,000/month). Event cards pop up, stats move, and it ends with a report card. This is the hook.
4. **"Bring your twin to life" → upload statement.** Show a privacy screen first. **Parse the CSV in the
   browser**; the raw file is never uploaded or stored. Only categorised transactions are kept.
5. **Teach your twin:** swipe cards for the top 15–20 unknown payees ("Manjunath S, ₹12,000:
   Food / Rent / Friend / Family?"). Also tag family members here.
6. **Replay your real past:** the twin lives through the last 6 months as chapters (one per month) with real
   events and report cards. Then the user sets a goal.
7. **Ongoing:** each new monthly statement is a new chapter (Account Aggregator can replace uploads later).
- Always keep a **"play without upload" mode** with sample personas, for users who won't upload and for examiners.

## Design
- **Look:** dark, cozy, game-like. It should feel like a mobile game, not a banking app. Deep navy/charcoal
  background, one bright accent for money and one warm colour for alerts, big rounded cards, large numbers,
  the character always centred. **Mobile-first.**
- **Use the taste skill** (already installed in Claude Code) for every UI task to avoid generic AI-looking design.
- **Components:** Tailwind + shadcn/ui; pull cards, bento grids, progress bars and toasts from 21st.dev
  (shadcn-compatible) instead of mixing styles from many sources.
- **Motion:** GSAP (`@gsap/react`, `useGSAP`) everywhere but subtle: stat bars filling, numbers counting up,
  event cards sliding in, chapter transitions. Lenis smooth scroll on the landing page only.
- **3D (react-three-fiber / ThreeUI-style WebGL): ONLY** on the landing hero and milestone celebrations
  (goal reached, level up). Never on the dashboard; it hurts readability and speed on cheap phones.
- Charts: Recharts, styled to match the theme.
- Inspiration: threeui.com, 21st.dev, tasteskill.dev, demos.gsap.com. Pick one coherent style; don't copy all of them.

## Tech stack
- Next.js (React, TypeScript) frontend
- Backend: Next.js API routes (no separate server)
- Database: **MongoDB** via Mongoose. Atlas free tier for deployment, local MongoDB for dev.
  Connection string in `.env.local` as `MONGODB_URI` (never commit it). Developer inspects data with MongoDB Compass.
- Auth: Auth.js (NextAuth v5) with Google sign-in. Config in `web/.env.local` (git-ignored): `AUTH_SECRET`,
  `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `MONGODB_URI`. Google redirect URI: `http://localhost:3000/api/auth/callback/google`.
- **Dev login is never available in production.** `AUTH_DEV_LOGIN=true` adds an email-only sign-in for Postman and tests,
  but `isDevLoginEnabled()` (`web/src/lib/dev-login.ts`) also requires NODE_ENV ≠ production, so `next build`/`next start`
  ignore the flag (verified: prod server offers only Google and refuses dev-login callbacks). Unit-tested. Leave
  `AUTH_DEV_LOGIN` out of production env vars anyway.
- Suggested collections: `users`, `characters` (stats, level, type), `transactions` (categorised only, never raw
  files), `merchantOverrides` (per-user payee → category), `chapters` (monthly events + report card), `goals`
- Buttons and form controls show as disabled until the page has hydrated (`HydrationMarker` + CSS), so early clicks
  are never swallowed.
- In dev, models call `resetModelInDev()` so schema changes apply without restarting `npm run dev`.
- API testing: Postman. When you add or change an API route, also update `postman/money-twin.postman_collection.json`
  so every endpoint can be tested there.
- Python parser service (current: `parser/kotak_parser.py`; pdfplumber for PDFs later), or port it to TypeScript
- Game UI in React first; Phaser/PixiJS only if needed later
- Tailwind + shadcn/ui, GSAP, react-three-fiber (hero/celebrations only), Lenis, Recharts, DiceBear
- The statement parser must also run **in the browser** (port `kotak_parser.py` logic to TypeScript) for privacy

## Kotak CSV notes
- Header row starts with `Sl. No.`; data rows have a numeric first column; the footer has bank notes, so skip those.
- Columns: Sl No, Transaction Date (`dd-mm-yyyy HH:MM`), Value Date, Description, Chq/Ref No, Amount,
  Dr/Cr, Balance, Dr/Cr.
- Amounts have commas ("2,500.00"). Ref numbers are sometimes mangled by Excel (`5.10715E+11`),
  so dedupe on (datetime, description, amount, type, balance), not on ref.
- Description prefixes: `UPI/<name>/…`, `REV-UPI` (refund), `PCD/<card>/<merchant>` (card purchase),
  `ATL` (ATM), `811:BD` (bill pay), `CASHBACK EARNED`, `811 SUPER CASHBACK`, `Int.Pd` (interest),
  `Cash Deposit`, `Ac xfr from gl` (internal, ignore).
- UPI names are truncated to 15 characters.
- Privacy rules in the TypeScript port: bank-generated rows (charges, cashback, interest, deposits, transfers) get a
  plain label instead of their description, and digit runs of 6+ in payee names are masked to the last 4
  (phone numbers used as UPI names, merchant IDs). Short keywords (< 6 letters) must start a word; longer brand
  keywords match anywhere because UPI names are run together.

## Current status
- [x] Kotak CSV parser + rules categoriser with confidence levels (high / medium / low / user)
- [x] Landing page + character creation (`web/`, 3D coin hero with low-end/reduced-motion fallback)
- [x] Demo month loop: Plan (envelope budget) → Live (4 weeks, 1 decision/week) → Review (plan vs actual report)
      → Learn (interactive skill cards, XP, Money Skills book at `/skills`) → Play better (abilities in September).
      Personas per life stage (student / first job / professional) × city in `web/src/game/personas/`;
      Months carry over (closing balance becomes next opening balance, debt repaid first, mood continues,
      plan suggested halfway from last month's spending toward 50/30/20);
      lessons use the player's own numbers. Engine in `web/src/game/engine.ts`; tests via `npm test`
- [x] Accounts + storage: Auth.js v5 (Google; dev-only email login via AUTH_DEV_LOGIN=true for Postman/tests),
      Mongoose models `users` / `transactions` (no raw descriptions, deduped by fingerprint) / `merchantOverrides`,
      API routes `/api/me` (GET, DELETE = delete all my data), `/api/transactions`, `/api/overrides`,
      account page at `/account`. Postman collection in `postman/`; API tests use the `money-twin-test` DB.
      Verified: real Google sign-in (college Workspace account) creates the `users` document; dev login is off in production.
      Sign-in UX: returns to `?callbackUrl=` (same-site paths only, default `/account`); Google always shows its account
      chooser; signed-in landing shows "Welcome back" instead of the hero; header shows Sign in / avatar.
      E2E tests: `npm run test:e2e` (Playwright, installed Chrome, dev server).
- [x] In-browser statement upload + privacy screen at `/upload`: TypeScript port in `web/src/lib/statement/`
      (parity with the Python parser checked on real statements by a local-only test). The file is read with
      File.text() and never sent; e2e test checks no request contains raw statement text. Sign-in is asked for only
      at "Save" (categorised data waits in sessionStorage during sign-in, cleared after saving).
- [x] Teach-your-twin: "Who's who?" (Family · Me (my other account) · Friend · Other, no surname rules; Other needs a
      nickname + category), swipe cards (unmarked people first, then top 20 unknown payees; 6 likeliest categories +
      "More"; optional nickname with quick chips), understanding meter. Labels + nicknames saved as merchant overrides.
      Friend questions depend on direction (`FriendQuestions`, also on the swipe cards): money you sent →
      "Lending to them / My share of things we did together" (`friendMode`); money they sent → "Paying me back /
      Their share of things I paid for / I borrowed from them (I owe them)" (`friendReceived`); both ways → both,
      labelled "What you sent" / "What they sent". Answers become categories (Friend, "Friend's share", "Borrowed from
      friend") and `src/lib/friends.ts` nets per friend: lent − paid back (never below zero) − borrowed. "My share"
      payments are spending (Food for small lunch/dinner payments, else Entertainment). Money from friends is never
      income; borrowed money is owed in the replay ("You borrowed ₹2,000 from Rahul… you owe Rahul ₹2,000").
      Who's who includes only person-like payees with money going both ways or real money one way: known merchants
      (Google India Digital, Domino's…) are never people, and money back from them is a Refund. Merchant keywords were
      checked against real statements (short keywords and business hints are whole words: "mart" ≠ "Martin"); the
      Python parser has the same rules, and the local parity test checks both on `statements/`. "Other" for someone who mostly pays you asks "Why do they pay you?" with income reasons
      (Salary/Stipend, Scholarship, Refund, Sold something, Other income). An open, unsaved Other form stays open
      with a warning if another person is picked.
- [x] Twin in the account: `twins` collection + `/api/twin`; `TwinSync` merges browser and account copies
      (newest character, union of learned lessons, XP recalculated). Browser-only when signed out.
      Home page shows saved transactions ("51 transactions saved, Jul–Aug 2026").
- [x] Replay your real past at `/replay` (signed in): every month with saved data is a chapter (`GET /api/months`:
      spent / came in, India time; grade once played). Plan "If you'd planned this month…" over the real opening
      balance + income, with a 50/30/20 hint on that month's real income and how it really split. Weeks (1–7, 8–14,
      15–21, 22–end) replay real payments through the same envelope ledger and grading as the demo, then 1–3 events
      from a rules library (`web/src/game/replay/templates.ts`, 58 templates + quiet-week fallback; thresholds are
      fractions of the month's income with a floor, small UPI stays ≤ ₹150; nicknames from Teach your twin).
      Report card: plan vs actual, spending by real category, friends who owe you, lessons from real habits using
      real numbers (`lessonContext`). Results only (grade, score, savings kept, end stats, plan) are saved in
      `money-twin:replay` and the `twins.replay` field (merged across devices: latest result per month); mood
      carries from the latest earlier month.
      "What if?" moments (`replay/what-if.ts`): 2–3 per month at real key events (big impulse buy, delivery streak,
      month-end crunch, cash withdrawal; one of each at most, payments never counted by two moments). "Same as real" or
      a better move linked to a skill (24-hour rule, cook twice, pause wants, UPI instead of cash) that changes the
      month's transactions; the report shows "Real you vs What-if you" with the difference in ₹, and the timeline
      totals What-if savings (`whatIfSaved`, `realGrade` in replay progress).
      Each week: money coming in (refunds, friends paying back) lands before that week's payments; events are picked
      by priority, then shown in date order. "Came in" is one definition everywhere (month list, planner, report,
      dashboard): income + refunds/cashback/interest + friends paying back, with a breakdown under it.
      Home "Continue your twin" → `/replay` when real months are saved, demo otherwise.
      The sample statement's July (calm) and August (delivery streak, late-night Amazon, cash) differ on purpose.
      Dev login keeps a typed email as a draft in sessionStorage, so a dev-server reload never clears it.
      Twin vs account: home shows "Welcome back, <account>" and a separate "Your twin" card with Edit twin (`/edit-twin`,
      the Create screen in edit mode; keeps progress and look unless shuffled). Signing in: an account with a twin uses
      it; an account without one asks "Use this twin or create a new one?" (`planSignIn`, the layout passes the user id
      to TwinSync). Twin names: 2+ letters, no junk (`game/twin-name.ts`, checked on screen and in PUT /api/twin).
      Demo prep: `npm run demo:reset` (dev server running) wipes `live@moneytwin.dev` and re-seeds `demo@moneytwin.dev`
      (sample statement taught, twin Aarav, July replayed), then warms every page. `e2e/demo-flow.spec.ts` clicks the
      whole demo (landing → demo month → sign in → sample → Who's who → cards → save → dashboard → replay with What-ifs).
      Tests: 3 synthetic players in `replay/fixtures.ts` (₹8k student, ₹30k first job, irregular freelancer) must
      get different stories; e2e `e2e/replay.spec.ts` uploads the sample statement and replays August.
- [x] Dashboard "Where your money goes" at `/dashboard` (signed in; signed out → sign-in): month chips, spent vs last
      month, Needs / Wants / came in, money lent to friends shown apart (not spending), a Recharts month-by-month
      stacked bar (tap a bar to pick the month), categories with change vs last month, top payees (nicknames; friends
      you lent to aren't payees), a "teach your twin" nudge when payees are untaught. Pure, unit-tested data in
      `web/src/lib/dashboard.ts`, computed in the browser from `/api/transactions` + `/api/overrides` with the same
      rules as the replay, so the numbers match the report cards. Reached from the home summary and the replay timeline.
- [ ] Goals, alerts, lessons, budget planner
- [ ] Account Aggregator sandbox (bonus)

## Working rules for Claude Code
- One feature per session; build it with sample data first, then real data.
- After a feature works, tick it off in "Current status" above.
