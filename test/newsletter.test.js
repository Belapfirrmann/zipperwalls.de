import test from 'node:test';
import assert from 'node:assert/strict';
import { NEWSLETTERPLAN } from '../src/newsletterplan.js';

test('Newsletter-Plan: jede Ausgabe hat Datum, Betreff, Vorschautext und Text', () => {
  assert.ok(NEWSLETTERPLAN.entries.length > 0);
  for (const e of NEWSLETTERPLAN.entries) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/, `Nr. ${e.nr}`);
    assert.match(e.time, /^\d{2}:\d{2}$/, `Nr. ${e.nr}`);
    assert.ok(e.subject && e.subject.length <= 60, `Betreff Nr. ${e.nr}`);
    assert.ok(e.preview && e.preview.length <= 120, `Vorschautext Nr. ${e.nr}`);
    assert.ok(e.text, `Text Nr. ${e.nr}`);
  }
});

test('Newsletter-Plan: Nummern eindeutig', () => {
  const nrs = NEWSLETTERPLAN.entries.map((e) => e.nr);
  assert.equal(new Set(nrs).size, nrs.length);
});
