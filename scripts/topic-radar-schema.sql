-- Owner-scoped storage for editorial topics, evidence links, and user feedback.
-- This migration defines schema only; apply it through the normal reviewed
-- Supabase migration process after the application changes are ready.

create extension if not exists pgcrypto;

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
  -- Deleting an evidence card removes its links, never their topics.
  card_id uuid not null references public.knowledge_cards (id) on delete cascade,
  evidence_role text not null check (btrim(evidence_role) <> ''),
  source_type text not null check (btrim(source_type) <> ''),
  relevance smallint not null default 0 check (relevance between 0 and 100),
  created_at timestamptz not null default now(),
  unique (topic_id, card_id)
);

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
