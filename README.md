# Clearing

A calm money-in-hand, spending, and debt-clearing tracker. Next.js + Supabase (data + sign-in)
+ Resend (a daily "payments due" email). All on free tiers.

Your data lives in your own Supabase project. It persists across devices, and the in-app
Back up button still lets you export a JSON copy any time.

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
