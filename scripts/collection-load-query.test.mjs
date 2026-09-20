import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../services/supabaseService.ts', import.meta.url), 'utf8');

const extractFunctionBody = (name) => {
  const start = source.indexOf(`export const ${name} = async`);
  assert.notEqual(start, -1, `${name} function should be present`);
  const nextExport = source.indexOf('\nexport const ', start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
};

test('getCollections does not scan knowledge_cards while loading the sidebar collection list', () => {
  const body = extractFunctionBody('getCollections');

  assert.equal(
    body.includes(".from('knowledge_cards')"),
    false,
    'collection loading should not perform a full card-table query'
  );
});

test('getCollectionItemCounts reads only lightweight collection membership fields', () => {
  const body = extractFunctionBody('getCollectionItemCounts');

  assert.equal(
    body.includes(".select('collections')"),
    true,
    'collection counts should read only the collection membership column'
  );
  assert.equal(body.includes(".select('*')"), false, 'collection counts must not select full card rows');
  assert.equal(body.includes('raw_content'), false, 'collection counts must not load raw content');
  assert.equal(body.includes('user_notes'), false, 'collection counts must not load user notes');
  assert.equal(body.includes('ai_analysis'), false, 'collection counts must not load AI analysis');
});
