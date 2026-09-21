import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const schemaPath = fileURLToPath(new URL('./topic-radar-schema.sql', import.meta.url));
const typesPath = fileURLToPath(new URL('../types.ts', import.meta.url));
const schema = existsSync(schemaPath) ? readFileSync(schemaPath, 'utf8') : '';
const types = readFileSync(typesPath, 'utf8');

const compact = (value) => value
  .replace(/--.*$/gm, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const sql = compact(schema);

const getStatement = (marker, label) => {
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `missing ${label}`);
  const end = sql.indexOf(';', start);
  assert.notEqual(end, -1, `unterminated ${label}`);
  return sql.slice(start, end + 1);
};

const getPolicy = (name) => {
  const marker = `create policy "${name}"`;
  return getStatement(marker, `${name} policy`);
};

test('topic radar migration defines the owner-scoped topic records and editorial fields', () => {
  const topicsTable = getStatement('create table if not exists public.topics', 'topics table');
  assert.match(sql, /create table if not exists public\.topics \(/);
  assert.match(sql, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(sql, /owner_id uuid not null default auth\.uid\(\) references auth\.users \(id\)/);
  assert.match(sql, /is_public boolean not null default false/);
  assert.match(sql, /fingerprint text not null/);
  assert.match(topicsTable, /content_angles jsonb not null.*?check \( ?jsonb_typeof\(content_angles\) = 'object' and content_angles \?& array\['quick', 'viewpoint', 'tutorial'\] and jsonb_typeof\(content_angles -> 'quick'\) = 'string' and jsonb_typeof\(content_angles -> 'viewpoint'\) = 'string' and jsonb_typeof\(content_angles -> 'tutorial'\) = 'string' ?\)/);
  assert.match(topicsTable, /durable_knowledge jsonb not null.*?check \( ?jsonb_typeof\(durable_knowledge\) = 'array' and not jsonb_path_exists\( ?durable_knowledge, '\$\[\*\] \? \(@\.type\(\) != "string"\)' ?\) ?\)/);
  assert.match(sql, /first_seen_at timestamptz not null/);
  assert.match(sql, /latest_evidence_at timestamptz not null/);
  assert.match(sql, /evidence_signature text not null/);
  assert.match(topicsTable, /generation_status text not null default 'fallback' check \(generation_status in \('generated', 'fallback'\)\)/);
  assert.match(sql, /generated_at timestamptz/);
  assert.match(sql, /created_at timestamptz not null default now\(\)/);
  assert.match(sql, /updated_at timestamptz not null default now\(\)/);
  assert.match(sql, /source_count integer not null default 0/);
  assert.match(sql, /platform_count integer not null default 0/);
});

test('topic radar migration constrains scores, trends, links, and feedback', () => {
  for (const score of [
    'write_score',
    'study_score',
    'breaking_score',
    'confidence_score',
    'preference_score',
  ]) {
    assert.match(sql, new RegExp(`${score} (?:smallint|integer) not null[^,]*check \\(${score} between 0 and 100\\)`));
  }

  assert.match(sql, /trend_direction text not null[^,]*check \(trend_direction in \('rising', 'steady', 'fading', 'new'\)\)/);
  assert.match(sql, /unique \(owner_id, fingerprint\)/);

  assert.match(sql, /create table if not exists public\.topic_sources \(/);
  assert.match(sql, /topic_id uuid not null references public\.topics \(id\) on delete cascade/);
  assert.match(sql, /evidence_role text not null/);
  assert.match(sql, /source_type text not null/);
  assert.match(sql, /relevance (?:smallint|integer) not null[^,]*check \(relevance between 0 and 100\)/);
  assert.match(sql, /unique \(topic_id, card_id\)/);

  assert.match(sql, /create table if not exists public\.topic_feedback \(/);
  assert.match(sql, /topic_id uuid not null references public\.topics \(id\) on delete cascade/);
  assert.match(sql, /action text not null[^,]*check \(action in \('saved', 'ignored', 'published'\)\)/);
  assert.match(sql, /unique \(owner_id, topic_id, action\)/);
});

test('deleting either parent removes only its topic-source link', () => {
  assert.match(schema, /-- Deleting a topic removes its links, never its evidence cards\./);
  assert.match(schema, /-- Deleting an evidence card removes its links, never their topics\./);
  assert.match(sql, /topic_id uuid not null references public\.topics \(id\) on delete cascade/);
  assert.match(sql, /card_id uuid not null references public\.knowledge_cards \(id\) on delete cascade/);
});

test('topic radar migration adds query indexes and enables RLS on every topic table', () => {
  for (const table of ['topics', 'topic_sources', 'topic_feedback']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(sql, /create index if not exists topics_owner_rank_idx on public\.topics \(owner_id, latest_evidence_at desc\)/);
  assert.match(sql, /create index if not exists topics_public_rank_idx on public\.topics \(is_public, latest_evidence_at desc\)/);
  assert.match(sql, /create index if not exists topic_sources_card_id_idx on public\.topic_sources \(card_id\)/);
  assert.match(sql, /create index if not exists topic_feedback_topic_id_idx on public\.topic_feedback \(topic_id\)/);
  assert.doesNotMatch(sql, /create index if not exists topic_feedback_owner_topic_idx/);
});

test('topic policies expose public or owner topics and keep writes owner-only', () => {
  assert.match(getPolicy('topics_public_or_owner_select'), /for select using \(is_public = true or auth\.uid\(\) = owner_id\)/);
  assert.match(getPolicy('topics_owner_insert'), /for insert with check \(auth\.uid\(\) = owner_id\)/);
  assert.match(getPolicy('topics_owner_update'), /for update using \(auth\.uid\(\) = owner_id\) with check \(auth\.uid\(\) = owner_id\)/);
  assert.match(getPolicy('topics_owner_delete'), /for delete using \(auth\.uid\(\) = owner_id\)/);
});

test('topic-source policies require both a visible topic and a visible evidence card', () => {
  const selectPolicy = getPolicy('topic_sources_visible_select');
  assert.match(selectPolicy, /for select using \(exists \( select 1 from public\.topics t where t\.id = topic_id and \(t\.is_public = true or auth\.uid\(\) = t\.owner_id\) \) and exists \( select 1 from public\.knowledge_cards c where c\.id = card_id and \(c\.is_public = true or auth\.uid\(\) = c\.owner_id\) \)\)/);

  const insertPolicy = getPolicy('topic_sources_owner_insert');
  assert.match(insertPolicy, /for insert with check \(exists \( select 1 from public\.topics t join public\.knowledge_cards c on c\.id = card_id where t\.id = topic_id and t\.owner_id = auth\.uid\(\) and c\.owner_id = auth\.uid\(\) \)\)/);

  const updatePolicy = getPolicy('topic_sources_owner_update');
  assert.match(updatePolicy, /for update using \( exists \( select 1 from public\.topics t join public\.knowledge_cards c on c\.id = card_id where t\.id = topic_id and t\.owner_id = auth\.uid\(\) and c\.owner_id = auth\.uid\(\) \) \) with check \( exists \( select 1 from public\.topics t join public\.knowledge_cards c on c\.id = card_id where t\.id = topic_id and t\.owner_id = auth\.uid\(\) and c\.owner_id = auth\.uid\(\) \) \)/);

  const deletePolicy = getPolicy('topic_sources_owner_delete');
  assert.match(deletePolicy, /for delete using \( exists \( select 1 from public\.topics t where t\.id = topic_id and t\.owner_id = auth\.uid\(\) \) \)/);
});

test('feedback policies permit only the feedback owner to read and write', () => {
  assert.match(getPolicy('topic_feedback_owner_select'), /for select using \(auth\.uid\(\) = owner_id\)/);

  const insertPolicy = getPolicy('topic_feedback_owner_insert');
  assert.match(insertPolicy, /for insert with check \(auth\.uid\(\) = owner_id and exists \( select 1 from public\.topics t where t\.id = topic_id and \(t\.is_public = true or t\.owner_id = auth\.uid\(\)\) \)\)/);

  const updatePolicy = getPolicy('topic_feedback_owner_update');
  assert.match(updatePolicy, /for update using \(auth\.uid\(\) = owner_id\) with check \(auth\.uid\(\) = owner_id and exists \( select 1 from public\.topics t where t\.id = topic_id and \(t\.is_public = true or t\.owner_id = auth\.uid\(\)\) \)\)/);

  assert.match(getPolicy('topic_feedback_owner_delete'), /for delete using \(auth\.uid\(\) = owner_id\)/);
});

test('TypeScript exports contracts aligned with the topic schema', () => {
  assert.match(types, /export type TopicTrendDirection = 'rising' \| 'steady' \| 'fading' \| 'new';/);
  assert.match(types, /export type TopicBriefGenerationStatus = 'generated' \| 'fallback';/);
  assert.match(types, /export type TopicFeedbackAction = 'saved' \| 'ignored' \| 'published';/);
  assert.match(types, /export interface TopicSource \{[\s\S]*topicId: string;[\s\S]*cardId: string;[\s\S]*evidenceRole: string;[\s\S]*sourceType: string;[\s\S]*relevance: number;[\s\S]*\}/);
  assert.match(types, /export interface EditorialTopic \{[\s\S]*contentAngles: \{ quick: string; viewpoint: string; tutorial: string \};[\s\S]*durableKnowledge: string\[\];[\s\S]*writeScore: number;[\s\S]*studyScore: number;[\s\S]*breakingScore: number;[\s\S]*confidenceScore: number;[\s\S]*preferenceScore: number;[\s\S]*generationStatus: TopicBriefGenerationStatus;[\s\S]*generatedAt\?: string;[\s\S]*createdAt: string;[\s\S]*updatedAt: string;[\s\S]*sourceCount: number;[\s\S]*platformCount: number;[\s\S]*sources\?: TopicSource\[\];[\s\S]*feedback\?: TopicFeedbackAction\[\];[\s\S]*\}/);
});
