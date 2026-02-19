import test from 'node:test';
import assert from 'node:assert/strict';

import { makeSvg } from './generate-fallback-covers.mjs';

test('makeSvg creates tech-scene fallback without generic X placeholder', () => {
  const svg = makeSvg(12);

  assert.match(svg, /data-scene="/);
  assert.match(svg, /id="workspace-desk"/);
  assert.match(svg, /id="ai-network"/);

  assert.doesNotMatch(svg, />X<\/text>/);
  assert.doesNotMatch(svg, /Fallback Cover \/ 兜底封面/);
});
