import test from 'node:test';
import assert from 'node:assert/strict';

import { makeSvg } from './generate-fallback-covers.mjs';

test('makeSvg creates text-free natural landscape fallback', () => {
  const svg = makeSvg(7);

  assert.match(svg, /data-scene="landscape-/);
  assert.match(svg, /id="scene-sparkles"/);
  assert.doesNotMatch(svg, /<text\b/i);
});

test('first 10 fallback covers are unique and landscape-themed', () => {
  const svgs = Array.from({ length: 10 }, (_, i) => makeSvg(i + 1));
  const unique = new Set(svgs);
  assert.equal(unique.size, 10);

  const sceneKinds = new Set(
    svgs.map((svg) => {
      const m = svg.match(/data-scene="([^"]+)"/);
      return m ? m[1] : '';
    })
  );
  assert.ok(sceneKinds.size >= 6);
});
