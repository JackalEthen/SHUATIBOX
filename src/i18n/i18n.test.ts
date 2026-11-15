import assert from 'node:assert/strict';
import test from 'node:test';
import { en } from './en.ts';
import { translate } from './translate.ts';

function placeholders(value: string) {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

test('every English message keeps the source placeholders', () => {
  for (const [key, value] of Object.entries(en)) {
    assert.deepEqual(placeholders(value), placeholders(key), key);
  }
});

test('translate interpolates variables and falls back to the source text', () => {
  assert.equal(translate('en', '{n} 题', { n: 3 }), '3 题');
  assert.equal(translate('en', '关闭'), 'Close');
  assert.equal(translate('zh', '{n} 题', { n: 3 }), '3 题');
  assert.equal(translate('en', 'missing key'), 'missing key');
});
