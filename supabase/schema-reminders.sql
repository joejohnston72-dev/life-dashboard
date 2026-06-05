-- ── Reminders + push subscriptions ──────────────────────────────────────────
create table if not exists public.reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  text          text not null,
  title         text not null default 'Reminder',
  type          text not null default 'daily',   -- once | daily | weekly | monthly
  time          text not null default '09:00',   -- HH:MM, Europe/London
  days_of_week  int[]  not null default '{}',     -- 0=Sun..6=Sat (weekly)
  day_of_month  int    not null default 0,        -- 1-31 (monthly)
  on_date       date,                             -- (once)
  summary       text   not null default '',
  original      text   not null default '',
  active        boolean not null default true,
  last_fired    date,                             -- guard: once per day
  created_at    timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Row level security
alter table public.reminders          enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "own_reminders"     on public.reminders;
drop policy if exists "own_subscriptions" on public.push_subscriptions;

create policy "own_reminders" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists reminders_active_idx on public.reminders (active);
