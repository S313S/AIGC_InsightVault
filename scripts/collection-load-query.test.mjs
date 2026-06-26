import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../services/supabaseService.ts', import.meta.url), 'utf8');

test('getCollections does not scan knowledge_cards while loading the sidebar collection list', () => {
  const match = source.match(/export const getCollections = async \(\): Promise<Collection\[]> => \{([\s\S]*?)\n\};/);
  assert.ok(match, 'getCollections function should be present');

  assert.equal(
    match[1].includes(".from('knowledge_cards')"),
    false,
    'collection loading should not perform a full card-table query'
  );
});

test('getCollectionItemCounts reads only lightweight collection membership fields', () => {
  const match = source.match(/export const getCollectionItemCounts = async \(\): Promise<Record<string, number>> => \{([\s\S]*?)\n\};/);
  assert.ok(match, 'getCollectionItemCounts function should be present');

  assert.equal(
    match[1].includes(".select('collections')"),
    true,
    'collection counts should read only the collection membership column'
  );
  assert.equal(match[1].includes(".select('*')"), false, 'collection counts must not select full card rows');
  assert.equal(match[1].includes('raw_content'), false, 'collection counts must not load raw content');
  assert.equal(match[1].includes('user_notes'), false, 'collection counts must not load user notes');
  assert.equal(match[1].includes('ai_analysis'), false, 'collection counts must not load AI analysis');
});
