import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSelected, parseJapaneseDate, parseDateRange, parseCategoryTag } from '../server/import/excel-utils.js';

test('extractSelected works', () => {
  assert.equal(extractSelected('【 要介護１ 】 ・ 要介護２'), '要介護１');
  assert.equal(extractSelected('□自立 □J1 ■A1 □A2'), 'A1');
  assert.equal(extractSelected('■可 □つかまれば可 □不可'), '可');
});

test('parse dates', () => {
  const d = parseJapaneseDate('昭和27年06月21日  （73歳）');
  assert.equal(d.iso, '1952-06-21');
  assert.equal(d.age, 73);
  assert.equal(parseJapaneseDate('令和07年01月01日').iso, '2025-01-01');
  const r = parseDateRange('R7/01/01～R9/12/31');
  assert.equal(r.fromIso, '2025-01-01');
  assert.equal(r.toIso, '2027-12-31');
});

test('category tag', () => {
  const c = parseCategoryTag('★★★[食事/服薬/受診/訪問]');
  assert.equal(c.importance, 3);
  assert.deepEqual(c.categories, ['食事','服薬','受診','訪問']);
});
