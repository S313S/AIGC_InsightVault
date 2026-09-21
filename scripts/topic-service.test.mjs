import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../services/supabaseService.ts', import.meta.url), 'utf8');

const functionBody = (name) => {
  const start = source.indexOf(`export const ${name} = async`);
  assert.notEqual(start, -1, `${name} should exist`);
  const end = source.indexOf('\nexport const ', start + 1);
  return source.slice(start, end === -1 ? source.length : end);
};

test('topic reads use explicit topic, relation, and evidence fields', () => {
  const body = functionBody('getEditorialTopics');

  assert.match(source, /const TOPIC_SELECT_FIELDS = \[/);
  for (const field of [
    'owner_id', 'is_public', 'content_angles', 'durable_knowledge',
    'write_score', 'study_score', 'breaking_score', 'confidence_score',
    'preference_score', 'latest_evidence_at', 'generation_status',
    'topic_sources', 'knowledge_cards', 'topic_feedback',
  ]) {
    assert.ok(source.includes(`'${field}'`), `${field} should be selected explicitly`);
  }
  assert.equal(body.includes(".select('*')"), false);
  assert.match(body, /\.select\(TOPIC_SELECT_FIELDS\)/);
});

test('topic reads scope owners and guests in the query and forward cancellation', () => {
  const body = functionBody('getEditorialTopics');

  assert.match(body, /supabase\.auth\.getSession\(\)/);
  assert.match(body, /topicQuery = topicQuery\.eq\('owner_id', user\.id\)/);
  assert.match(body, /topicQuery = topicQuery\.eq\('topic_sources\.knowledge_cards\.owner_id', user\.id\)/);
  assert.match(body, /topicQuery = topicQuery\.eq\('is_public', true\)/);
  assert.match(body, /topicQuery = topicQuery\.eq\('topic_sources\.knowledge_cards\.is_public', true\)/);
  assert.match(body, /if \(signal\) topicQuery = topicQuery\.abortSignal\(signal\)/);
  assert.ok((body.match(/throwIfAborted\(signal\)/g) || []).length >= 2);
});

test('database topics and nested sources map to camelCase without leaking private evidence', () => {
  assert.match(source, /const dbToEditorialTopic = \(row: any, userId\?: string\): EditorialTopic =>/);
  const helperStart = source.indexOf('const dbToEditorialTopic =');
  const helperEnd = source.indexOf('\nconst ', helperStart + 1);
  const body = source.slice(helperStart, helperEnd === -1 ? source.length : helperEnd);

  for (const mapping of [
    'ownerId: row.owner_id', 'isPublic: Boolean(row.is_public)',
    'contentAngles: row.content_angles', 'durableKnowledge: row.durable_knowledge',
    'writeScore: Number(row.write_score', 'studyScore: Number(row.study_score',
    'breakingScore: Number(row.breaking_score', 'confidenceScore: Number(row.confidence_score',
    'preferenceScore: Number(row.preference_score', 'latestEvidenceAt: row.latest_evidence_at',
    'generationStatus: row.generation_status', 'generatedAt: row.generated_at',
    'sourceCount: Number(row.source_count', 'platformCount: Number(row.platform_count',
  ]) {
    assert.ok(body.includes(mapping), `${mapping} mapping should be present`);
  }
  assert.match(body, /dbToCard\(/);
  assert.match(body, /userId \? card\.ownerId === userId : card\.isPublic === true/);
  assert.match(body, /new Set/);
  assert.match(body, /TOPIC_FEEDBACK_ACTIONS\.has/);
});

test('topic reads sort valid lanes by score and latest evidence with a stable tie break', () => {
  const body = functionBody('getEditorialTopics');

  assert.match(body, /\.order\('latest_evidence_at', \{ ascending: false \}\)/);
  assert.match(body, /\.order\('id', \{ ascending: true \}\)/);
  assert.match(body, /const sortNow = Date\.now\(\)/);
  assert.match(body, /\.sort\(\(left, right\) => compareEditorialTopics\(left, right, sortNow\)\)/);
  assert.match(source, /const compareEditorialTopics = /);
  assert.match(source, /eligibleLaneScores/);
  assert.match(source, /latestEvidenceAt/);
});

test('saving feedback validates input before auth and upserts only authenticated owner fields', () => {
  const body = functionBody('saveTopicFeedback');
  const validation = body.indexOf('isValidTopicFeedbackInput');
  const auth = body.indexOf('supabase.auth.getSession()');

  assert.ok(validation >= 0 && validation < auth, 'validation must happen before auth/network work');
  assert.match(body, /if \(!user\) return false/);
  assert.match(body, /\.from\('topic_feedback'\)/);
  assert.match(body, /\.upsert\(\{ owner_id: user\.id, topic_id: topicId, action \}, \{\s*onConflict: 'owner_id,topic_id,action'/);
  assert.equal(body.includes('knowledge_cards'), false);
});

test('removing feedback validates input and deletes by authenticated owner, topic, and action', () => {
  const body = functionBody('removeTopicFeedback');
  const validation = body.indexOf('isValidTopicFeedbackInput');
  const auth = body.indexOf('supabase.auth.getSession()');

  assert.ok(validation >= 0 && validation < auth, 'validation must happen before auth/network work');
  assert.match(body, /if \(!user\) return false/);
  assert.match(body, /\.from\('topic_feedback'\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\('owner_id', user\.id\)[\s\S]*?\.eq\('topic_id', topicId\)[\s\S]*?\.eq\('action', action\)/);
  assert.equal(body.includes('knowledge_cards'), false);
});

test('topic service failures use existing safe logging conventions and read errors remain failures', () => {
  const readBody = functionBody('getEditorialTopics');
  const saveBody = functionBody('saveTopicFeedback');
  const removeBody = functionBody('removeTopicFeedback');

  assert.match(readBody, /console\.error\('Error fetching editorial topics:'/);
  assert.match(readBody, /throw error/);
  assert.match(saveBody, /logWriteError\('Error saving topic feedback:'/);
  assert.match(removeBody, /logWriteError\('Error removing topic feedback:'/);
});

test('deleteCard still uses the transactional topic-link RPC', () => {
  const body = functionBody('deleteCard');

  assert.match(body, /supabase\.rpc\(\s*'delete_knowledge_card_with_topic_links'/);
  assert.match(body, /if \(!rpcError\) return rpcDeleted === true/);
});
