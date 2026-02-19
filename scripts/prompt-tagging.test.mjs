import test from 'node:test';
import assert from 'node:assert/strict';

import { hasPromptEvidence, resolveContentTypeByPrompts } from '../shared/promptTagging.js';

test('hasPromptEvidence is false when extractedPrompts is empty', () => {
  assert.equal(hasPromptEvidence([]), false);
  assert.equal(hasPromptEvidence(['', '   ']), false);
});

test('hasPromptEvidence is true when extractedPrompts has non-empty prompt', () => {
  assert.equal(hasPromptEvidence(['Use this prompt']), true);
});

test('resolveContentTypeByPrompts maps to ToolReview when no prompts', () => {
  assert.equal(resolveContentTypeByPrompts([]), 'ToolReview');
});

test('resolveContentTypeByPrompts maps to PromptShare when prompts exist', () => {
  assert.equal(resolveContentTypeByPrompts(['/imagine ...']), 'PromptShare');
});
