-- Run this in Supabase -> SQL Editor.

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
create policy "own state - select" on public.user_state for select using (auth.uid() = user_id);
create policy "own state - insert" on public.user_state for insert with check (auth.uid() = user_id);
create policy "own state - update" on public.user_state for update using (auth.uid() = user_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  premium_unlocked boolean not null default false,
  trial_started_at timestamptz
);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
-- If this project already existed before these columns were added, run these once too:
-- alter table public.profiles add column if not exists premium_unlocked boolean not null default false;
-- alter table public.profiles add column if not exists trial_started_at timestamptz;
-- Both columns are only ever written by the Razorpay verify route using the service_role key
-- (which bypasses RLS), so there's no insert/update policy for regular users here on purpose.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
