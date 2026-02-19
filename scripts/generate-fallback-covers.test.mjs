import test from 'node:test';
import assert from 'node:assert/strict';

import { makeSvg } from './generate-fallback-covers.mjs';

test('makeSvg creates text-free tech scene fallback', () => {
  const svg = makeSvg(12);

  assert.match(svg, /data-scene="scene-/);
  assert.match(svg, /id="scene-sparkles"/);
  assert.doesNotMatch(svg, /<text\b/i);
  assert.doesNotMatch(svg, />X<\/text>/);
  assert.doesNotMatch(svg, /Fallback Cover \/ 兜底封面/);
});

test('first 100 fallback covers are unique and use multiple scene templates', () => {
  const svgs = Array.from({ length: 100 }, (_, i) => makeSvg(i + 1));
  const unique = new Set(svgs);
  assert.equal(unique.size, 100);

  const sceneKinds = new Set(
    svgs.map((svg) => {
      const m = svg.match(/data-scene="([^"]+)"/);
      return m ? m[1] : '';
    })
  );
  assert.ok(sceneKinds.size >= 10);
});
