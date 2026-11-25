import test from 'node:test';
import assert from 'node:assert/strict';
import { STR, SRV } from '../public/i18n.js';

test('English and Arabic tables carry the same keys', () => {
  const en = Object.keys(STR.en).sort(), ar = Object.keys(STR.ar).sort();
  assert.deepEqual(ar, en);
});

test('no string is empty or leaks template braces oddly', () => {
  for (const lang of ['en', 'ar']) for (const [k, v] of Object.entries(STR[lang])) {
    assert.ok(v.trim().length > 0, k);
    const open = (v.match(/{/g) || []).length, close = (v.match(/}/g) || []).length;
    assert.equal(open, close, k);
  }
});

test('placeholders match across languages', () => {
  for (const k of Object.keys(STR.en)) {
    const ph = (s) => (s.match(/{[a-z]}/g) || []).sort().join('');
    assert.equal(ph(STR.ar[k]), ph(STR.en[k]), k);
  }
});

test('server translations only map real English messages', () => {
  for (const k of Object.keys(SRV.ar)) assert.ok(!k.includes('{'), k);
});
