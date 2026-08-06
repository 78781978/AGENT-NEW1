create extension if not exists "pgcrypto";

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'accepted_message',
      'blocked_input',
      'filtered_output',
      'rate_limited',
      'token_limited'
    )
  ),
  created_at timestamptz not null default now()
);

create index if not exists security_events_user_created_idx
  on public.security_events (user_id, created_at desc);

alter table public.security_events enable row level security;

drop policy if exists "security_events_select_own" on public.security_events;
create policy "security_events_select_own"
  on public.security_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "security_events_insert_own" on public.security_events;
create policy "security_events_insert_own"
  on public.security_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);
