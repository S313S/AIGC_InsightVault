-- Supabase Auth + owner-aware RLS migration
-- This migration assumes the existing business tables already exist.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

alter table if exists public.knowledge_cards
  add column if not exists owner_id uuid references auth.users (id) default auth.uid(),
  add column if not exists is_public boolean not null default false;

alter table if exists public.collections
  add column if not exists owner_id uuid references auth.users (id) default auth.uid(),
  add column if not exists is_public boolean not null default false;

alter table if exists public.tracking_tasks
  add column if not exists owner_id uuid references auth.users (id) default auth.uid();

alter table if exists public.trusted_accounts
  add column if not exists owner_id uuid references auth.users (id) default auth.uid();

alter table if exists public.quality_keywords
  add column if not exists owner_id uuid references auth.users (id) default auth.uid();

alter table if exists public.monitor_settings
  add column if not exists owner_id uuid references auth.users (id) default auth.uid();

alter table if exists public.cron_run_logs
  add column if not exists owner_id uuid references auth.users (id) default auth.uid();

drop index if exists trusted_accounts_platform_handle_key;
alter table if exists public.trusted_accounts drop constraint if exists trusted_accounts_platform_handle_key;
create unique index if not exists trusted_accounts_owner_platform_handle_key
  on public.trusted_accounts (owner_id, platform, handle);

drop index if exists quality_keywords_keyword_type_key;
alter table if exists public.quality_keywords drop constraint if exists quality_keywords_keyword_type_key;
create unique index if not exists quality_keywords_owner_keyword_type_key
  on public.quality_keywords (owner_id, keyword, type);

drop index if exists monitor_settings_key_key;
alter table if exists public.monitor_settings drop constraint if exists monitor_settings_key_key;
create unique index if not exists monitor_settings_owner_key_key
  on public.monitor_settings (owner_id, key);

do $$
declare
  xiaoci_email constant text := 'xiaoci@insightvault.local';
  xiaoci_password constant text := '78456.+/#';
  xiaoci_user_id uuid;
begin
  select id into xiaoci_user_id
  from auth.users
  where email = xiaoci_email
  limit 1;

  if xiaoci_user_id is null then
    xiaoci_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      xiaoci_user_id,
      'authenticated',
      'authenticated',
      xiaoci_email,
      crypt(xiaoci_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('username', 'xiaoci', 'display_name', 'xiaoci'),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid()::text,
      xiaoci_user_id,
      jsonb_build_object('sub', xiaoci_user_id::text, 'email', xiaoci_email),
      'email',
      xiaoci_user_id::text,
      now(),
      now(),
      now()
    )
    on conflict (provider, provider_id) do nothing;
  end if;

  insert into public.profiles (id, username, display_name)
  values (xiaoci_user_id, 'xiaoci', 'xiaoci')
  on conflict (id) do update
  set username = excluded.username,
      display_name = excluded.display_name;

  update public.knowledge_cards
  set owner_id = coalesce(owner_id, xiaoci_user_id),
      is_public = true
  where owner_id is null or is_public is distinct from true;

  update public.collections
  set owner_id = coalesce(owner_id, xiaoci_user_id),
      is_public = true
  where owner_id is null or is_public is distinct from true;

  update public.tracking_tasks
  set owner_id = coalesce(owner_id, xiaoci_user_id)
  where owner_id is null;

  update public.trusted_accounts
  set owner_id = coalesce(owner_id, xiaoci_user_id)
  where owner_id is null;

  update public.quality_keywords
  set owner_id = coalesce(owner_id, xiaoci_user_id)
  where owner_id is null;

  update public.monitor_settings
  set owner_id = coalesce(owner_id, xiaoci_user_id)
  where owner_id is null;

  update public.cron_run_logs
  set owner_id = coalesce(owner_id, xiaoci_user_id)
  where owner_id is null;
end
$$;

alter table if exists public.knowledge_cards alter column owner_id set not null;
alter table if exists public.collections alter column owner_id set not null;
alter table if exists public.tracking_tasks alter column owner_id set not null;
alter table if exists public.trusted_accounts alter column owner_id set not null;
alter table if exists public.quality_keywords alter column owner_id set not null;
alter table if exists public.monitor_settings alter column owner_id set not null;
alter table if exists public.cron_run_logs alter column owner_id set not null;

create index if not exists knowledge_cards_owner_id_idx on public.knowledge_cards (owner_id, is_public, is_trending);
create index if not exists collections_owner_id_idx on public.collections (owner_id, is_public);
create index if not exists tracking_tasks_owner_id_idx on public.tracking_tasks (owner_id);
create index if not exists trusted_accounts_owner_id_idx on public.trusted_accounts (owner_id);
create index if not exists quality_keywords_owner_id_idx on public.quality_keywords (owner_id);
create index if not exists monitor_settings_owner_id_idx on public.monitor_settings (owner_id);
create index if not exists cron_run_logs_owner_id_idx on public.cron_run_logs (owner_id, created_at desc);

alter table if exists public.knowledge_cards enable row level security;
alter table if exists public.collections enable row level security;
alter table if exists public.tracking_tasks enable row level security;
alter table if exists public.trusted_accounts enable row level security;
alter table if exists public.quality_keywords enable row level security;
alter table if exists public.monitor_settings enable row level security;
alter table if exists public.cron_run_logs enable row level security;

drop policy if exists "knowledge_cards_public_or_owner_select" on public.knowledge_cards;
create policy "knowledge_cards_public_or_owner_select"
  on public.knowledge_cards
  for select
  using (is_public = true or auth.uid() = owner_id);

drop policy if exists "knowledge_cards_owner_insert" on public.knowledge_cards;
create policy "knowledge_cards_owner_insert"
  on public.knowledge_cards
  for insert
  with check (auth.uid() = owner_id);

drop policy if exists "knowledge_cards_owner_update" on public.knowledge_cards;
create policy "knowledge_cards_owner_update"
  on public.knowledge_cards
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "knowledge_cards_owner_delete" on public.knowledge_cards;
create policy "knowledge_cards_owner_delete"
  on public.knowledge_cards
  for delete
  using (auth.uid() = owner_id);

drop policy if exists "collections_public_or_owner_select" on public.collections;
create policy "collections_public_or_owner_select"
  on public.collections
  for select
  using (is_public = true or auth.uid() = owner_id);

drop policy if exists "collections_owner_insert" on public.collections;
create policy "collections_owner_insert"
  on public.collections
  for insert
  with check (auth.uid() = owner_id);

drop policy if exists "collections_owner_update" on public.collections;
create policy "collections_owner_update"
  on public.collections
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "collections_owner_delete" on public.collections;
create policy "collections_owner_delete"
  on public.collections
  for delete
  using (auth.uid() = owner_id);

drop policy if exists "tracking_tasks_owner_all" on public.tracking_tasks;
create policy "tracking_tasks_owner_all"
  on public.tracking_tasks
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "trusted_accounts_owner_all" on public.trusted_accounts;
create policy "trusted_accounts_owner_all"
  on public.trusted_accounts
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "quality_keywords_owner_all" on public.quality_keywords;
create policy "quality_keywords_owner_all"
  on public.quality_keywords
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "monitor_settings_owner_all" on public.monitor_settings;
create policy "monitor_settings_owner_all"
  on public.monitor_settings
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "cron_run_logs_owner_all" on public.cron_run_logs;
create policy "cron_run_logs_owner_all"
  on public.cron_run_logs
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
