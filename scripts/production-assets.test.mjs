import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
const tailwindSource = readFileSync(new URL('../tailwind.config.js', import.meta.url), 'utf8');

test('production html does not compile styles or dependencies in the browser', () => {
  assert.doesNotMatch(htmlSource, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(htmlSource, /esm\.sh/);
  assert.doesNotMatch(htmlSource, /type=["']importmap["']/);
  assert.doesNotMatch(htmlSource, /fonts\.googleapis\.com/);
});

test('vite entry imports the build-time stylesheet', () => {
  assert.match(entrySource, /import ['"]\.\/styles\.css['"]/);
});

test('tailwind scans application sources without traversing dependencies', () => {
  assert.doesNotMatch(tailwindSource, /\.\/\*\*\//);
  assert.match(tailwindSource, /\.\/components\/\*\*\//);
  assert.match(tailwindSource, /\.\/App\.tsx/);
});
