import test from 'node:test';
import assert from 'node:assert/strict';

import { handleDialogKeyDown } from '../shared/dialogFocus.js';

const makeFocusable = (name, calls) => ({
  focus: () => calls.push(name),
});

test('Escape closes the dialog and prevents the background shortcut', () => {
  const calls = [];
  let prevented = false;
  handleDialogKeyDown({
    key: 'Escape',
    preventDefault: () => { prevented = true; },
  }, null, () => calls.push('close'), null);

  assert.equal(prevented, true);
  assert.deepEqual(calls, ['close']);
});

test('Tab wraps from the last dialog control to the first', () => {
  const calls = [];
  const first = makeFocusable('first', calls);
  const last = makeFocusable('last', calls);
  const container = { querySelectorAll: () => [first, last] };
  let prevented = false;

  handleDialogKeyDown({
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => { prevented = true; },
  }, container, () => {}, last);

  assert.equal(prevented, true);
  assert.deepEqual(calls, ['first']);
});

test('Shift+Tab wraps from the first dialog control to the last', () => {
  const calls = [];
  const first = makeFocusable('first', calls);
  const last = makeFocusable('last', calls);
  const container = { querySelectorAll: () => [first, last] };

  handleDialogKeyDown({
    key: 'Tab',
    shiftKey: true,
    preventDefault: () => {},
  }, container, () => {}, first);

  assert.deepEqual(calls, ['last']);
});

test('Tab from outside the dialog is redirected to its first control', () => {
  const calls = [];
  const first = makeFocusable('first', calls);
  const last = makeFocusable('last', calls);
  const outside = makeFocusable('outside', calls);
  const container = {
    querySelectorAll: () => [first, last],
    contains: (element) => element === first || element === last,
  };
  let prevented = false;

  handleDialogKeyDown({
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => { prevented = true; },
  }, container, () => {}, outside);

  assert.equal(prevented, true);
  assert.deepEqual(calls, ['first']);
});
