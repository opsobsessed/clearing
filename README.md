# Clearing

A calm money-in-hand, spending, and debt-clearing tracker. Next.js + Supabase (data + sign-in)
+ Resend (a daily "payments due" email). All on free tiers.

Your data lives in your own Supabase project. It persists across devices, and the in-app
Back up button still lets you export a JSON copy any time.

### Visual redesign (new)
The UI was rebuilt against a "Zenith Finance" design system (produced in Google Stitch — see the
palette, type scale, and component notes if you have `DESIGN.md` on hand) without changing the
app's architecture: still one `Clearing.jsx` component tree, still plain inline styles + a single
CSS-in-JS template (`const S`), no Tailwind added. Two deliberate departures from the mockup:
- **The app name stays "Clearing,"** not "Zenith Finance" — that was the design tool's working
  title for the system, not a rename request.
- **Pricing stays one-time**, not the "₹300/month" subscription shown in the paywall mockup — see
  "App access: trial + one-time unlock" below, which is unchanged and takes priority.
Typography: Work Sans for headings, Inter for body text, JetBrains Mono for all numeric/currency
values, loaded via Google Fonts in `app/layout.jsx`. Colors: Primary Blue for actions/nav, Success
Green reserved for positive balances and cleared debt, Warning Orange / Danger Red for anything
needing attention. Shapes moved from the old rounder 18px/12px cards and buttons to the mockup's
16px cards / 8px buttons and inputs, with lighter, tonal shadows instead of the old heavier ones.

### Custom spending categories (new)
Spending categories are no longer a fixed list — add or remove your own on the Spending tab. Your
categories are saved per-account (in the same `user_state.data` blob), so they persist across
sessions and devices like everything else.

### Spending & debt payoff (new)
- **Category budgets** — set a monthly cap per spending category on the Spending tab; the bar
  turns red when you go over.
- **Month-over-month trend** — a badge next to "Spent this month" shows the % change vs last month.
- **Payoff plan** (Clear tab) — give each debt an APR (0 for family & friends), choose a strategy,
  and set how much extra you can throw at debt each month:
  - **Avalanche**: highest APR first — pays the least total interest.
  - **Snowball**: smallest balance first — clears debts faster for momentum.
  Shows a projected debt-free month, total interest along the way, and the order to attack debts in.
  A "Use ₹X" button suggests directing your current safe-to-spend surplus toward the top debt.
- **Debt-free target** card on Home for an at-a-glance projection.

### For multiple payday-loan apps specifically (new)
- Tag each debt as **hits CIBIL** and/or **frequent calls** so you can see at a glance which ones
  are a credit-score problem vs a harassment problem.
- Mark a debt as **one-time** or **installments**, and expand **history** on any debt to see every
  payment logged against it, paid vs remaining.
- Mark a regulated debt as a **credit card** to see a "minimum vs full payment" comparison — what
  paying only the ~5% minimum costs you in interest and years, vs clearing it in a fixed timeframe.
- A new **Support** tab: your rights against aggressive recovery calls (RBI rules + how to escalate
  a complaint), mental health helplines if it's all feeling like a lot, and a couple of community
  links for others who've dug out of the same hole.

None of this needed a schema change or a paid tier — it all lives in the same `user_state.data`
jsonb blob, and Support is static content. Everything still fits on Supabase, Vercel, and Resend
free tiers.

### Escalation Helper
Inside the Support tab: a guided, branching walkthrough for five specific situations — is this
lender even real (RBI Digital Lending Apps directory + Sachet portal), will it hit CIBIL, when
it's turned criminal (cybercrime.gov.in / 1930), how to formally escalate (RBI Ombudsman), and
whether you need a lawyer (incl. free NALSA legal aid). Everything in Support is included once
you're in the app — the RBI recovery-call rules, the mental health helplines, the community links,
and this deeper tool.

### Overdue detection (new)
A debt only used to show "due in N days," which quietly rolled forward to next month the moment
you missed a payment — so a missed payment looked identical to "not due yet." Now, if a debt's due
day has passed with no payment logged since, it shows **overdue** (with days late) on both Home
and the Clear tab, instead of silently jumping to next month's date. Overdue debts are also always
counted in "money to set aside," even if that pushes past the normal 10-day window.

### App access: trial + one-time unlock (new)
The whole app (not just one feature) is now gated after sign-in:
- **Try 7 days for ₹300** — a one-time payment that starts a 7-day clock. A small banner at the
  top shows days remaining and an "unlock forever" shortcut the whole time.
- **Unlock forever for ₹3,000** — one-time, permanent, can be bought directly (no trial needed) or
  any time during/after the trial. The ₹300 trial fee counts toward it: if the trial was already
  bought, unlocking forever costs **₹2,700** more (₹300 + ₹2,700 = ₹3,000 total), not ₹3,300.
- Both are flat one-time Razorpay payments, no subscriptions or auto-renewal involved.
- Trial can only be started once per account — paying ₹300 again after it's already been used
  won't restart the clock.
- You (the app owner) always have full access regardless of payment — set your sign-in email in
  `NEXT_PUBLIC_OWNER_EMAIL` and it bypasses the paywall automatically.
- If someone's trial or access lapses, their data is never touched — it's just waiting behind the
  paywall until they pay again.

**Setup required:**
1. Create a Razorpay account (razorpay.com) and grab your Key ID and Key Secret from Settings → API Keys.
2. In Vercel → Environment Variables, add:
   - `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (server-only, never exposed to the browser)
   - `NEXT_PUBLIC_OWNER_EMAIL` — your sign-in email, so you're never asked to pay
3. Run the two `alter table` lines at the bottom of `supabase-schema.sql` if your Supabase project
   already existed before this feature (adds `premium_unlocked` and `trial_started_at` to `profiles`).
4. Redeploy. Razorpay's checkout script loads globally from `app/layout.jsx`.

How it works: `app/api/razorpay/create-order` creates a fixed-amount order server-side per plan
(₹300 or ₹3,000 — amounts are never trusted from the browser). After checkout,
`app/api/razorpay/verify` checks Razorpay's HMAC signature server-side, then either sets
`profiles.trial_started_at` (trial) or `profiles.premium_unlocked = true` (full) via the Supabase
service-role key — a user can't unlock access by faking a "success" response in the browser. The
gating decision itself happens once, in `app/page.jsx`, before `Clearing` ever renders.

---

## What you'll set up (all free)
1. Supabase project (Postgres + email sign-in)
2. Resend account (the reminder email)
3. Vercel project (hosts the app + runs the daily cron)

> Note: these are third-party services and their free-tier limits and exact settings can change.
> If a screen looks different from these steps, follow the provider's current docs.

---

## 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor -> paste all of `supabase-schema.sql` -> Run. (Creates `user_state`, `profiles`, RLS, and the sign-up trigger.)
3. Authentication -> Providers -> make sure **Email** is on. It uses a magic link (no password).
4. Authentication -> URL Configuration -> add your Vercel URL (and http://localhost:3000 for local) to the redirect allow-list.
5. Project Settings -> API. Copy: **Project URL**, **anon key**, **service_role key**.

## 2. Resend
1. Create an account at resend.com and make an API key.
2. To send reliably, verify a domain (Domains -> Add). For a quick first test you can use
   `onboarding@resend.dev` as the from address, but it will only deliver to your own account email.
3. Set `REMINDER_FROM` to something like `Clearing <reminders@yourdomain.com>`.

## 3. Deploy on Vercel
1. Push this folder to a new GitHub repo.
2. Vercel -> New Project -> import the repo.
3. Add Environment Variables (from `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REMINDER_FROM`
   - `CRON_SECRET` (any long random string)
4. Deploy. `vercel.json` already schedules the reminder for 03:00 UTC daily (about 8:30 AM IST).
   Vercel automatically sends the `CRON_SECRET` as a Bearer token, and the route checks it.

## 4. First run
1. Open your deployed URL, enter your email, tap the magic link.
2. On the Home tab, tap **Restore** and pick the `clearing-backup.json` you exported from the
   in-chat version. Everything imports.
3. Set a due day + monthly amount on anything on the Clear tab so the email has something to remind you about.

## Run locally
```
npm install
cp .env.example .env.local   # fill in the same values
npm run dev                  # http://localhost:3000
```

## Test the reminder without waiting for the cron
```
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-APP.vercel.app/api/cron/reminders
```

## Later: phone push instead of email
Add a service worker + Web Push (VAPID keys) and a `subscriptions` table, then have the same cron
send push payloads. Email is the reliable default; push is the nice-to-have once this is running.
