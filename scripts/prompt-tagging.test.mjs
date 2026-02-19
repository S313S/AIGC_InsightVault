import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasPromptEvidence,
  resolveContentTypeByPrompts,
  isLikelyCompletePrompt,
  filterCompletePromptsLocal
} from '../shared/promptTagging.js';

test('hasPromptEvidence is false when extractedPrompts is empty', () => {
  assert.equal(hasPromptEvidence([]), false);
  assert.equal(hasPromptEvidence(['', '   ']), false);
});

test('hasPromptEvidence is true when extractedPrompts has non-empty prompt', () => {
  assert.equal(
    hasPromptEvidence(['You are a senior recruiter. Write a concise JD with role scope, responsibilities, and must-have skills.']),
    true
  );
});

test('isLikelyCompletePrompt rejects topic tags and short keywords', () => {
  assert.equal(isLikelyCompletePrompt('#AI[话题]#'), false);
  assert.equal(isLikelyCompletePrompt('#skills[话题]#'), false);
  assert.equal(isLikelyCompletePrompt('agent skills'), false);
});

test('isLikelyCompletePrompt accepts reusable instruction prompts', () => {
  assert.equal(
    isLikelyCompletePrompt('You are a senior product manager. Generate a PRD with goals, scope, constraints, and milestones.'),
    true
  );
  assert.equal(
    isLikelyCompletePrompt('/imagine prompt: cyberpunk city, rain, neon reflections, cinematic lighting --ar 16:9 --v 6'),
    true
  );
});

test('filterCompletePromptsLocal removes non-prompt fragments', () => {
  const filtered = filterCompletePromptsLocal([
    '#AI[话题]#',
    'skills',
    'You are a principal engineer. Review this code for security and performance.'
  ]);

  assert.deepEqual(filtered, ['You are a principal engineer. Review this code for security and performance.']);
});

test('resolveContentTypeByPrompts maps to ToolReview when no prompts', () => {
  assert.equal(resolveContentTypeByPrompts([]), 'ToolReview');
});

test('resolveContentTypeByPrompts maps to PromptShare when prompts exist', () => {
  assert.equal(
    resolveContentTypeByPrompts(['/imagine prompt: portrait of a fox in cinematic lighting, ultra detailed --ar 3:4 --v 6']),
    'PromptShare'
  );
});
