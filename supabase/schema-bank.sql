-- ── Bank connections + transactions (GoCardless Bank Account Data) ───────────
create table if not exists public.bank_connections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  requisition_id  text not null,
  institution_id  text not null,
  institution_name text,
  reference       text,
  status          text not null default 'pending',
  accounts        jsonb not null default '[]',
  created_at      timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id          text primary key,                  -- GoCardless transactionId (dedupe)
  user_id     uuid not null references auth.users(id) on delete cascade,
  account_id  text not null,
  date        date,
  amount      numeric not null default 0,        -- negative = money out
  currency    text not null default 'GBP',
  description text,
  category    text,
  created_at  timestamptz not null default now()
);

alter table public.bank_connections  enable row level security;
alter table public.bank_transactions enable row level security;

drop policy if exists "own_bank_connections"  on public.bank_connections;
drop policy if exists "own_bank_transactions" on public.bank_transactions;

-- Users can read their own rows. Writes happen server-side via the service role
-- (which bypasses RLS), so no insert/update policy is needed for clients.
create policy "own_bank_connections" on public.bank_connections
  for select using (auth.uid() = user_id);

create policy "own_bank_transactions" on public.bank_transactions
  for select using (auth.uid() = user_id);

create index if not exists bank_tx_user_date_idx on public.bank_transactions (user_id, date desc);
