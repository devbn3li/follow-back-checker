'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../extension/i18n.js');

const placeholders = (s) => (s.match(/\{(\w+)\}/g) || []).sort().join(',');

test('both languages define exactly the same keys', () => {
  const en = Object.keys(i18n.en).sort(), ar = Object.keys(i18n.ar).sort();
  assert.deepEqual(ar, en);
  assert.ok(en.length > 60);
});

test('string entries keep the same placeholders in both languages', () => {
  for (const key of Object.keys(i18n.en)) {
    const a = i18n.en[key], b = i18n.ar[key];
    assert.equal(typeof a, typeof b, key + ' has the same kind of entry');
    if (typeof a === 'string') assert.equal(placeholders(a), placeholders(b), key + ' placeholders');
  }
});

test('function entries render with the same inputs', () => {
  const vars = { nf: '182', nfRaw: 182, nw: '37', nwRaw: 37, n: '1', nRaw: 1, date: 'Oct 24', g: '3', l: '1' };
  for (const key of Object.keys(i18n.en)) {
    if (typeof i18n.en[key] !== 'function') continue;
    for (const lang of ['en', 'ar']) {
      const out = i18n[lang][key](vars);
      assert.equal(typeof out, 'string', key + ' ' + lang);
      assert.ok(out.length > 0, key + ' ' + lang + ' not empty');
    }
  }
  assert.equal(i18n.en.titleNotback({ n: '1', nRaw: 1 }), '1 account you follow that doesn’t follow you back');
  assert.equal(i18n.en.titleNotback({ n: '2', nRaw: 2 }), '2 accounts you follow that don’t follow you back');
});

test('arabic strings are actually arabic', () => {
  const arabicLetters = /[؀-ۿ]/;
  const latinOnly = new Set(['title', 'langToggle']);
  for (const key of Object.keys(i18n.ar)) {
    const v = i18n.ar[key];
    if (typeof v !== 'string' || latinOnly.has(key)) continue;
    assert.ok(arabicLetters.test(v), key + ' should contain Arabic letters');
  }
});
