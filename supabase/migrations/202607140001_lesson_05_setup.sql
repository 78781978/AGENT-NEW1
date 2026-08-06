-- Lekcja 5 / W1: trwała pamięć agenta w Supabase.
-- Warsztat wymaga wyłączonego RLS; zostanie ono włączone w lekcji 7.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text,
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  role text,
  content text
);

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  preferences jsonb not null default '{}'::jsonb
);

alter table public.conversations disable row level security;
alter table public.messages disable row level security;
alter table public.user_profiles disable row level security;
