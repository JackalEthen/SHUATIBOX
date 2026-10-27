import assert from 'node:assert/strict';
import test from 'node:test';
import { grade, sortLetters } from './grade.ts';

test('single answer grades exactly', () => {
  assert.equal(grade(['B'], ['B']).correct, true);
  assert.equal(grade(['A'], ['B']).correct, false);
});

test('multi answer ignores order and duplicates', () => {
  assert.deepEqual(sortLetters(['D', 'B', 'C', 'B']), ['B', 'C', 'D']);
  assert.equal(grade(['D', 'B', 'C'], ['B', 'C', 'D']).correct, true);
  assert.equal(grade(['B', 'C'], ['B', 'C', 'D']).correct, false);
});

test('missing answer cannot grade', () => {
  assert.equal(grade(['A'], []).canGrade, false);
  assert.equal(grade(['A'], []).correct, false);
});
