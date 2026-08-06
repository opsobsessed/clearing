-- Run this once in Supabase Dashboard → SQL Editor → New query → Run.
-- Backs the new pay-before-login flow on /pricing: a payment made before someone has an account
-- gets parked here, keyed by email, and is claimed automatically the moment that email signs in.

create table public.pending_purchases (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plan text not null,
  razorpay_order_id text not null,
  razorpay_payment_id text not null,
  claimed boolean not null default false,
  claimed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index pending_purchases_email_idx on public.pending_purchases (email, claimed);

alter table public.pending_purchases enable row level security;
-- Deliberately no policies added. RLS with zero policies means nobody using the anon/public key
-- (i.e. every regular signed-in user through the browser) can read or write this table at all —
-- only server-side code using the service-role key (our API routes) can touch it. Same pattern as
-- the profiles table's premium_unlocked/trial_started_at columns.
