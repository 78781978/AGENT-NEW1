-- Lekcja 7 / W3: Supabase Auth + prywatne dane użytkowników.
-- Uruchom ten plik w Supabase SQL Editor przed testem logowania.

alter table public.conversations
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.documents
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Stare rekordy z poprzednich lekcji nie mają właściciela.
-- Dla prywatności usuwamy je zamiast pokazywać wszystkim.
delete from public.messages
where conversation_id in (
  select id from public.conversations where user_id is null
);

delete from public.conversations where user_id is null;
delete from public.documents where user_id is null;
delete from public.user_profiles
where id not in (
  select id from auth.users
);

alter table public.conversations
  alter column user_id set not null;

alter table public.documents
  alter column user_id set not null;

alter table public.user_profiles
  alter column id drop default;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_auth_user_fk'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_auth_user_fk
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;
alter table public.user_profiles enable row level security;

drop policy if exists "Users can read own conversations" on public.conversations;
create policy "Users can read own conversations"
on public.conversations for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own conversations" on public.conversations;
create policy "Users can insert own conversations"
on public.conversations for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own conversations" on public.conversations;
create policy "Users can update own conversations"
on public.conversations for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own conversations" on public.conversations;
create policy "Users can delete own conversations"
on public.conversations for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read messages from own conversations" on public.messages;
create policy "Users can read messages from own conversations"
on public.messages for select
using (
  exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert messages into own conversations" on public.messages;
create policy "Users can insert messages into own conversations"
on public.messages for insert
with check (
  exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete messages from own conversations" on public.messages;
create policy "Users can delete messages from own conversations"
on public.messages for delete
using (
  exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
  )
);

drop policy if exists "Users can read own documents" on public.documents;
create policy "Users can read own documents"
on public.documents for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own documents" on public.documents;
create policy "Users can insert own documents"
on public.documents for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own documents" on public.documents;
create policy "Users can delete own documents"
on public.documents for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
on public.user_profiles for select
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
on public.user_profiles for insert
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
on public.user_profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.upsert_current_user_profile(
  profile_name text default null,
  profile_preferences jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  name text,
  preferences jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'User is not authenticated';
  end if;

  insert into public.user_profiles (id, name, preferences)
  values (current_user_id, profile_name, coalesce(profile_preferences, '{}'::jsonb))
  on conflict (id) do update
  set
    name = excluded.name,
    preferences = excluded.preferences;

  return query
  select user_profiles.id, user_profiles.name, user_profiles.preferences
  from public.user_profiles
  where user_profiles.id = current_user_id;
end;
$$;

grant execute on function public.upsert_current_user_profile(text, jsonb) to authenticated;

create or replace function public.match_documents_for_user(
  query_embedding vector,
  match_threshold float default 0.5,
  match_count int default 5,
  owner_id uuid default auth.uid()
)
returns table (
  id uuid,
  title text,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    documents.id,
    documents.title,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from public.documents
  where documents.user_id = owner_id
    and 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;
