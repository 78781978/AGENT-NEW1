create extension if not exists "pgcrypto";

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  tokens_input integer not null default 0 check (tokens_input >= 0),
  tokens_output integer not null default 0 check (tokens_output >= 0),
  model text not null default 'unknown',
  endpoint text not null default 'unknown'
);

create index if not exists api_usage_user_created_idx
  on public.api_usage (user_id, created_at desc);

alter table public.api_usage enable row level security;

drop policy if exists "api_usage_select_own" on public.api_usage;
create policy "api_usage_select_own"
  on public.api_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "api_usage_insert_own" on public.api_usage;
create policy "api_usage_insert_own"
  on public.api_usage
  for insert
  to authenticated
  with check (auth.uid() = user_id);
