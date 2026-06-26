import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../services/supabaseService.ts', import.meta.url), 'utf8');

const extractFunctionBody = (name) => {
  const start = source.indexOf(`export const ${name} = async`);
  assert.notEqual(start, -1, `${name} function should be present`);
  const nextExport = source.indexOf('\nexport const ', start + 1);
  const body = source.slice(start, nextExport === -1 ? source.length : nextExport);
  const match = body.match(/=> \{([\s\S]*)\n\};/);
  assert.ok(match, `${name} function should be present`);
  return match[1];
};

test('knowledge card list loading avoids full-row select star', () => {
  const body = extractFunctionBody('getKnowledgeCards');

  assert.equal(body.includes(".select('*')"), false);
  assert.equal(body.includes('raw_content'), false);
  assert.equal(body.includes('user_notes'), false);
  assert.equal(body.includes('images'), false);
});

test('knowledge card list loading supports paginated ranges', () => {
  const body = extractFunctionBody('getKnowledgeCards');

  assert.equal(body.includes('offset'), true);
  assert.equal(body.includes('.range(offset, offset + limit - 1)'), true);
});

test('trending card list loading avoids full-row select star', () => {
  const body = extractFunctionBody('getTrendingCards');

  assert.equal(body.includes(".select('*')"), false);
  assert.equal(body.includes('raw_content'), false);
  assert.equal(body.includes('user_notes'), false);
  assert.equal(body.includes('images'), false);
});

test('full card detail can be loaded by id separately from the list', () => {
  const body = extractFunctionBody('getKnowledgeCardById');

  assert.equal(body.includes(".select('*')"), true);
  assert.equal(body.includes('.eq(\'id\', cardId)'), true);
  assert.equal(body.includes('.single()'), true);
});

test('database writes omit detail fields when a card detail has not been loaded', () => {
  const body = source.slice(source.indexOf('const cardToDb ='), source.indexOf('const dbToCollection ='));

  assert.equal(body.includes('card.isDetailLoaded !== false'), true);
  assert.equal(body.includes('dbRow.raw_content = card.rawContent'), true);
  assert.equal(body.includes('dbRow.ai_analysis = card.aiAnalysis'), true);
  assert.equal(body.includes('dbRow.user_notes = card.userNotes'), true);
});
