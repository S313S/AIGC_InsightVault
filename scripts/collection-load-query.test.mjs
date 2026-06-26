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
