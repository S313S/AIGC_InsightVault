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

test('deleteCard uses the transactional topic-link RPC and returns its boolean result', () => {
  const body = functionBody('deleteCard');

  assert.match(body, /supabase\.rpc\(\s*'delete_knowledge_card_with_topic_links',\s*\{\s*p_card_id:\s*cardId\s*\}\s*\)/);
  assert.match(body, /if \(!rpcError\) return rpcDeleted === true/);
  assert.ok(body.indexOf(".rpc('delete_knowledge_card_with_topic_links'") < body.indexOf(".from('knowledge_cards')"));
});

test('deleteCard falls back to legacy direct delete only for an explicitly missing RPC', () => {
  const body = functionBody('deleteCard');

  assert.match(source, /const isMissingDeleteCardRpc = \(error: any\): boolean =>[\s\S]*?\['PGRST202', '42883'\]\.includes\(String\(error\?\.code \|\| ''\)\)/);
  assert.match(body, /if \(!isMissingDeleteCardRpc\(rpcError\)\) \{[\s\S]*?return false;[\s\S]*?\}/);
  const guardedFailure = body.indexOf('if (!isMissingDeleteCardRpc(rpcError))');
  const fallbackDelete = body.indexOf(".from('knowledge_cards')");
  assert.ok(guardedFailure >= 0 && fallbackDelete > guardedFailure, 'legacy delete must stay behind the missing-function guard');
  assert.doesNotMatch(body, /PGRST\d\d\d|42\d\d\d/);
});
