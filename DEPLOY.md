# Deploying Money Twin

Step-by-step guide to putting Money Twin online with **Vercel** (the app), **MongoDB Atlas** (the database)
and **Google sign-in**. It takes about 30–45 minutes the first time.

> **Secrets never go in the code, the repo, screenshots or chat.** Every secret below is pasted directly
> into the Vercel or Google dashboard. Where this guide shows `<something>`, replace it with your own value
> in the dashboard, not in this file.

---

## 0. What you need

- The GitHub repo `anilsuthars31/money-twin` (everything is already pushed to `main`).
- A [Vercel](https://vercel.com) account (sign in with GitHub).
- A [MongoDB Atlas](https://cloud.mongodb.com) account (free tier is enough).
- Access to the Google Cloud project you already use for local Google sign-in.
- Node.js on your laptop (only to generate the auth secret in step 2).

The app lives in the **`web/`** folder of the repo, so Vercel must use `web` as the root directory.

---

## 1. MongoDB Atlas: the database

1. **Create a cluster** (skip if you already have one): Atlas → **Create** → **M0 Free** →
   provider AWS, region **Mumbai (ap-south-1)** (closest to India) → **Create Deployment**.
2. **Create a database user**: **Database Access** → **Add New Database User** →
   - Authentication: **Password**. Pick a username (e.g. `moneytwin-app`) and click **Autogenerate Secure Password**.
     Copy the password somewhere safe (a password manager), **not** into the repo or chat.
   - Privileges: **Read and write to any database** → **Add User**.
3. **Allow Vercel to connect**: **Network Access** → **Add IP Address** → **Allow access from anywhere**
   (`0.0.0.0/0`) → **Confirm**. Vercel has no fixed IP addresses; the database is still protected by the
   user's password.
4. **Get the connection string**: **Database** → your cluster → **Connect** → **Drivers** → copy the string.
   It looks like:

   ```
   mongodb+srv://<username>:<password>@<cluster>.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=<cluster>
   ```

   Edit it before using it:
   - put your real password in place of `<password>`;
   - **add the database name `money-twin` right before the `?`**:

   ```
   mongodb+srv://<username>:<password>@<cluster>.xxxxx.mongodb.net/money-twin?retryWrites=true&w=majority&appName=<cluster>
   ```

   (Without `/money-twin`, the data ends up in a database called `test`.)
   Keep this string for step 3: it is the `MONGODB_URI` secret.

---

## 2. Generate the auth secret

`AUTH_SECRET` signs and encrypts the session cookies. Production needs a **new, long** one (the local
one in `web/.env.local` is too short). In a terminal on your laptop:

```
npx auth secret
```

It prints a long random value (if it offers to write it to a file, you can ignore that). Copy the value for
step 3. Don't commit it, don't paste it anywhere else.

---

## 3. Vercel: the app

1. Vercel → **Add New… → Project** → **Import** the `money-twin` GitHub repo.
2. On the configure screen:
   - **Root Directory**: click **Edit** → choose **`web`**.
   - **Framework Preset**: **Next.js** (detected automatically).
   - Build / Output / Install commands: leave the defaults.
3. Open **Environment Variables** and add these four (Environment: **Production**, and **Preview** too if you
   want preview deployments to work):

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | the Atlas connection string from step 1.4 (with `/money-twin`) |
   | `AUTH_SECRET` | the value from step 2 |
   | `AUTH_GOOGLE_ID` | Google Auth Platform → **Clients** → your Web client → **Client ID** |
   | `AUTH_GOOGLE_SECRET` | same client → **Client secret** (use **Add secret** if you can't see the old one) |

   **Do not add:**
   - `AUTH_TRUST_HOST`: already `trustHost: true` in `web/src/auth.ts`.
   - `AUTH_URL`: Auth.js works it out from the request on Vercel; setting it can break preview URLs.
   - `AUTH_DEV_LOGIN`: the email-only test login. It is ignored in production builds anyway; leave it out.

4. Click **Deploy** and wait for "Congratulations". Note your production URL, e.g.
   `https://money-twin.vercel.app` (shown on the project page under **Domains**).
5. *(Optional, faster)* **Settings → Functions → Function Region** → **Mumbai (bom1)**, so the app runs close
   to the Atlas cluster. Redeploy afterwards.

> Changed an environment variable later? It only applies to new deployments:
> **Deployments** → latest → **⋯** → **Redeploy**.

---

## 4. Google sign-in for the Vercel URL

Google Cloud console → **Google Auth Platform** → **Clients** → your **Web application** client.

1. **Authorised JavaScript origins**: keep the localhost one, add your Vercel URL:

   ```
   http://localhost:3000
   https://<your-project>.vercel.app
   ```

2. **Authorised redirect URIs**: keep the localhost one, add the Vercel one:

   ```
   http://localhost:3000/api/auth/callback/google
   https://<your-project>.vercel.app/api/auth/callback/google
   ```

   Exactly as shown: `https`, no trailing slash. **Save.** Changes can take a few minutes.

3. **Audience** (Google Auth Platform → **Audience**):
   - **User type: External** lets any Google account sign in (Gmail and your college account).
     *Internal* would allow only accounts from your college's Google Workspace.
   - **Publishing status**:
     - **Testing**: only the **test users** you list can sign in (up to 100). Everyone else sees
       "Access blocked: app has not completed the Google verification process". Good for the demo.
       To add people: **Audience → Test users → + Add users** → enter their emails (yours, your college
       account, examiners, teammates) → **Save**.
     - **In production** (**Publish app**): any Google account can sign in. Money Twin only asks for name,
       email and profile picture (basic permissions), so Google doesn't need to review it. Users may see a
       "Google hasn't verified this app" notice until the app is verified.

> Preview deployments get different URLs. Google sign-in only works on URLs listed in step 4.1–4.2, so test
> sign-in on the production URL.

---

## 5. Check that it works

Use an **Incognito** window on the production URL. Keep Atlas → **Browse Collections** → `money-twin` open in
another tab.

- [ ] **Landing page loads**: the 3D coin hero, "Meet the version of you that lives on your real spending",
      **Create your twin**, and **Sign in** in the top corner.
- [ ] **Google sign-in works**: **Sign in → Continue with Google** → the account chooser appears → pick a test
      user → you come back to the app with your avatar in the corner and "Welcome back, <name>".
      Atlas: `users` has your email.
- [ ] **No test login in production**: the account page shows only **Continue with Google** (no "Dev login").
- [ ] **Twin**: **Create your twin** → name, life stage, city → the demo month starts. If you made a twin
      before signing in, you're asked "Use this twin or create a new one?".
- [ ] **Sample upload saves to Atlas**: home → **Bring your twin to life with your statement** → tick the
      privacy box → **Choose statement** → **No statement handy? Try a sample** → **Teach your twin** →
      answer Who's who (e.g. Ramesh Kumar → Family, Arjun P → Friend → Lending to them / Paying me back) →
      a few cards → **Finish later and review** → **Save to my account** → "Your twin knows your real months".
      Atlas: `transactions` has 51 documents for your user, `merchantOverrides` has your labels.
- [ ] **Dashboard**: home → **51 transactions saved, Jul–Aug 2026 · See where your money goes** → July and
      August chips, the month-by-month chart, categories and top payees load.
- [ ] **Replay**: home → **Continue your twin** → **August 2026** → **Lock in plan · replay August** → take a
      better move on the What-if cards → **See report card** → "Real you vs What-if you" is shown →
      **All months** shows the grade. Atlas: your `twins` document has `replay.months`.
- [ ] **Delete all my data**: avatar → **Your account** → **Delete all my data** → type `DELETE` → confirm →
      you're signed out. Atlas: your user, transactions, labels and twin are gone. Signing in again shows
      "What's saved" with 0 transactions.

---

## 6. If something goes wrong

Vercel → **Deployments** → the latest one → **Logs** shows server errors.

| What you see | Likely cause → fix |
|---|---|
| Build fails with "No Next.js version detected" | Root Directory isn't `web` → Settings → General → Root Directory → `web` → redeploy |
| `MONGODB_URI is not set` in the logs | Variable missing or added after the deploy → add it → **Redeploy** |
| Pages load but saving or sign-in hangs, logs show `MongoServerSelectionError` | Atlas **Network Access** doesn't allow `0.0.0.0/0`, or the password in the URI is wrong (special characters must be URL-encoded, or regenerate a letters-and-digits password) |
| Data appears in a database called `test` | `/money-twin` missing before the `?` in `MONGODB_URI` |
| Google says `Error 400: redirect_uri_mismatch` | The redirect URI in step 4.2 doesn't exactly match your URL (https, no trailing slash, correct project name) |
| Google says "Access blocked … has not completed the verification process" | The app is in **Testing** and that account isn't a test user → add it in step 4.3, or publish the app |
| Sign-in loops back to the account page, logs mention `MissingSecret` or `JWTSessionError` | `AUTH_SECRET` missing or changed → set it, redeploy, then sign in again (old cookies are invalid) |
| Account page says "Google sign-in isn't set up yet" | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` missing in Vercel → add → redeploy |

---

## 7. Later

- **Updating the app**: push to `main` on GitHub. Vercel deploys automatically.
- **Local development is unchanged**: `cd web` → `npm run dev` with `web/.env.local` (local MongoDB, dev login).
  Before a local demo, run `npm run demo:reset` (see CLAUDE.md). That script needs the dev server and the dev
  login, so it doesn't run against the Vercel site.
- **Rotating a secret**: generate a new value (Atlas password, `npx auth secret`, or a new Google client secret),
  update it in Vercel → **Redeploy**. A new `AUTH_SECRET` signs everyone out once.
