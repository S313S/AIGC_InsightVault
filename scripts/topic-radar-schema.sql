-- Owner-scoped storage for editorial topics, evidence links, and user feedback.
-- This migration defines schema only; apply it through the normal reviewed
-- Supabase migration process after the application changes are ready.

create extension if not exists pgcrypto;

-- Fact-source evidence shares the existing knowledge-card store. Expand the
-- legacy social-only platform constraint before those rows are persisted.
alter table public.knowledge_cards
  drop constraint if exists knowledge_cards_platform_check;
alter table public.knowledge_cards
  add constraint knowledge_cards_platform_check
  check (platform in ('Twitter', 'Xiaohongshu', 'Manual', 'Official', 'GitHub'));

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  is_public boolean not null default false,
  fingerprint text not null check (btrim(fingerprint) <> ''),
  title text not null check (btrim(title) <> ''),
  summary text not null default '',
  why_now text not null default '',
  content_angles jsonb not null default '{"quick":"","viewpoint":"","tutorial":""}'::jsonb
    check (
      jsonb_typeof(content_angles) = 'object'
      and content_angles ?& array['quick', 'viewpoint', 'tutorial']
      and jsonb_typeof(content_angles -> 'quick') = 'string'
      and jsonb_typeof(content_angles -> 'viewpoint') = 'string'
      and jsonb_typeof(content_angles -> 'tutorial') = 'string'
    ),
  durable_knowledge jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(durable_knowledge) = 'array'
      and not jsonb_path_exists(
        durable_knowledge,
        '$[*] ? (@.type() != "string")'
      )
    ),
  write_score smallint not null default 0 check (write_score between 0 and 100),
  study_score smallint not null default 0 check (study_score between 0 and 100),
  breaking_score smallint not null default 0 check (breaking_score between 0 and 100),
  confidence_score smallint not null default 0 check (confidence_score between 0 and 100),
  preference_score smallint not null default 0 check (preference_score between 0 and 100),
  first_seen_at timestamptz not null,
  latest_evidence_at timestamptz not null,
  trend_direction text not null default 'new'
    check (trend_direction in ('rising', 'steady', 'fading', 'new')),
  evidence_signature text not null default '',
  -- New rows are retryable unless the pipeline explicitly records a successful
  -- model generation. Runtime objects without this field remain legacy-compatible.
  generation_status text not null default 'fallback'
    check (generation_status in ('generated', 'fallback')),
  source_count integer not null default 0 check (source_count >= 0),
  platform_count integer not null default 0 check (platform_count >= 0 and platform_count <= source_count),
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, fingerprint),
  check (first_seen_at <= latest_evidence_at)
);

create table if not exists public.topic_sources (
  id uuid primary key default gen_random_uuid(),
  -- Deleting a topic removes its links, never its evidence cards.
  topic_id uuid not null references public.topics (id) on delete cascade,
  -- Evidence cards referenced by a topic cannot be deleted.
  card_id uuid not null references public.knowledge_cards (id) on delete restrict,
  evidence_role text not null check (btrim(evidence_role) <> ''),
  source_type text not null check (btrim(source_type) <> ''),
  relevance smallint not null default 0 check (relevance between 0 and 100),
  created_at timestamptz not null default now(),
  unique (topic_id, card_id)
);

-- Upgrade an existing Task 4 installation from CASCADE to the same race-safe
-- behavior used by fresh installations.
alter table public.topic_sources
  drop constraint if exists topic_sources_card_id_fkey;
alter table public.topic_sources
  add constraint topic_sources_card_id_fkey
  foreign key (card_id) references public.knowledge_cards (id) on delete restrict;

create or replace function public.delete_knowledge_card_with_topic_links(p_card_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_topic_ids uuid[] := '{}'::uuid[];
  v_deleted_count integer := 0;
begin
  -- Lock and authorize before changing links. SECURITY INVOKER keeps the
  -- surrounding RLS policies active for every statement in this transaction.
  perform 1
    from public.knowledge_cards
   where id = p_card_id
     and owner_id = auth.uid()
   for update;

  if not found then
    return false;
  end if;

  select coalesce(array_agg(distinct topic_id), '{}'::uuid[])
    into v_topic_ids
    from public.topic_sources
   where card_id = p_card_id;

  delete from public.topic_sources
   where card_id = p_card_id;

  delete from public.knowledge_cards
   where id = p_card_id
     and owner_id = auth.uid();

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 1 then
    raise exception 'Authorized knowledge card could not be deleted';
  end if;

  update public.topics t
     set source_count = (
           select count(*)
             from public.topic_sources ts
            where ts.topic_id = t.id
         ),
         platform_count = (
           select count(distinct lower(c.platform))
             from public.topic_sources ts
             join public.knowledge_cards c on c.id = ts.card_id
            where ts.topic_id = t.id
              and btrim(coalesce(c.platform, '')) <> ''
         ),
         updated_at = now()
   where t.id = any(v_topic_ids)
     and t.owner_id = auth.uid();

  return true;
end;
$$;

revoke all on function public.delete_knowledge_card_with_topic_links(uuid) from public;
grant execute on function public.delete_knowledge_card_with_topic_links(uuid) to authenticated;

create table if not exists public.topic_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  topic_id uuid not null references public.topics (id) on delete cascade,
  action text not null check (action in ('saved', 'ignored', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, topic_id, action)
);

create index if not exists topics_owner_rank_idx
  on public.topics (owner_id, latest_evidence_at desc);

create index if not exists topics_public_rank_idx
  on public.topics (is_public, latest_evidence_at desc);

create index if not exists topic_sources_card_id_idx
  on public.topic_sources (card_id);

drop index if exists public.topic_feedback_owner_topic_idx;

create index if not exists topic_feedback_topic_id_idx
  on public.topic_feedback (topic_id);

alter table public.topics enable row level security;
alter table public.topic_sources enable row level security;
alter table public.topic_feedback enable row level security;

drop policy if exists "topics_public_or_owner_select" on public.topics;
create policy "topics_public_or_owner_select"
  on public.topics
  for select
  using (is_public = true or auth.uid() = owner_id);

drop policy if exists "topics_owner_insert" on public.topics;
create policy "topics_owner_insert"
  on public.topics
  for insert
  with check (auth.uid() = owner_id);

drop policy if exists "topics_owner_update" on public.topics;
create policy "topics_owner_update"
  on public.topics
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "topics_owner_delete" on public.topics;
create policy "topics_owner_delete"
  on public.topics
  for delete
  using (auth.uid() = owner_id);

drop policy if exists "topic_sources_visible_select" on public.topic_sources;
create policy "topic_sources_visible_select"
  on public.topic_sources
  for select
  using (exists (
      select 1
      from public.topics t
      where t.id = topic_id
        and (t.is_public = true or auth.uid() = t.owner_id)
    )
    and exists (
      select 1
      from public.knowledge_cards c
      where c.id = card_id
        and (c.is_public = true or auth.uid() = c.owner_id)
    ));

drop policy if exists "topic_sources_owner_insert" on public.topic_sources;
create policy "topic_sources_owner_insert"
  on public.topic_sources
  for insert
  with check (exists (
      select 1
      from public.topics t
      join public.knowledge_cards c on c.id = card_id
      where t.id = topic_id
        and t.owner_id = auth.uid()
        and c.owner_id = auth.uid()
    ));

drop policy if exists "topic_sources_owner_update" on public.topic_sources;
create policy "topic_sources_owner_update"
  on public.topic_sources
  for update
  using (
    exists (
      select 1
      from public.topics t
      join public.knowledge_cards c on c.id = card_id
      where t.id = topic_id
        and t.owner_id = auth.uid()
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.topics t
      join public.knowledge_cards c on c.id = card_id
      where t.id = topic_id
        and t.owner_id = auth.uid()
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists "topic_sources_owner_delete" on public.topic_sources;
create policy "topic_sources_owner_delete"
  on public.topic_sources
  for delete
  using (
    exists (
      select 1
      from public.topics t
      where t.id = topic_id
        and t.owner_id = auth.uid()
    )
  );

drop policy if exists "topic_feedback_owner_select" on public.topic_feedback;
create policy "topic_feedback_owner_select"
  on public.topic_feedback
  for select
  using (auth.uid() = owner_id);

drop policy if exists "topic_feedback_owner_insert" on public.topic_feedback;
create policy "topic_feedback_owner_insert"
  on public.topic_feedback
  for insert
  with check (auth.uid() = owner_id
    and exists (
      select 1
      from public.topics t
      where t.id = topic_id
        and (t.is_public = true or t.owner_id = auth.uid())
    ));

drop policy if exists "topic_feedback_owner_update" on public.topic_feedback;
create policy "topic_feedback_owner_update"
  on public.topic_feedback
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id
    and exists (
      select 1
      from public.topics t
      where t.id = topic_id
        and (t.is_public = true or t.owner_id = auth.uid())
    ));

drop policy if exists "topic_feedback_owner_delete" on public.topic_feedback;
create policy "topic_feedback_owner_delete"
  on public.topic_feedback
  for delete
  using (auth.uid() = owner_id);
