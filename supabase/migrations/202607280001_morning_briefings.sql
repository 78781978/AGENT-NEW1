create extension if not exists pgcrypto;

create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content text not null,
  date date not null,
  user_id uuid references auth.users(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists briefings_date_idx on public.briefings(date desc);
create index if not exists briefings_user_id_idx on public.briefings(user_id);

alter table public.briefings enable row level security;

drop policy if exists "briefings_select_own_or_system" on public.briefings;
create policy "briefings_select_own_or_system"
on public.briefings
for select
to authenticated
using (user_id is null or user_id = auth.uid());

drop policy if exists "briefings_insert_own" on public.briefings;
create policy "briefings_insert_own"
on public.briefings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "briefings_update_own" on public.briefings;
create policy "briefings_update_own"
on public.briefings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "briefings_delete_own" on public.briefings;
create policy "briefings_delete_own"
on public.briefings
for delete
to authenticated
using (user_id = auth.uid());
