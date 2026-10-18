import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReview, extractReviews, newReviews, tone, upsertEntry, obsidianPath, styleProblems } from '../src/bewertungen.js';

const raw = { mark: 5, comment: 'Top Service.', creationDate: '2026-10-12T10:00:00+02:00', orderDate: '2026-10-01' };

test('normalizeReview: Felder und stabile ID', () => {
  const a = normalizeReview(raw);
  assert.equal(a.stars, 5);
  assert.equal(a.date, '2026-10-12');
  assert.equal(a.id, normalizeReview({ ...raw }).id);
  assert.notEqual(a.id, normalizeReview({ ...raw, comment: 'Anders.' }).id);
});

test('normalizeReview: ohne Note verworfen, uid bevorzugt', () => {
  assert.equal(normalizeReview({ comment: 'x' }), null);
  assert.equal(normalizeReview({ ...raw, uid: 'abc' }).id, 'abc');
});

test('extractReviews: verschachtelt und flach', () => {
  assert.equal(extractReviews({ response: { data: { shop: { reviews: [raw] } } } }).length, 1);
  assert.equal(extractReviews({ reviews: [raw, {}] }).length, 1);
  assert.deepEqual(extractReviews({}), []);
});

test('newReviews und tone', () => {
  const r = extractReviews({ reviews: [raw] });
  assert.equal(newReviews(r, [r[0].id]).length, 0);
  assert.equal(newReviews(r, []).length, 1);
  assert.deepEqual([5, 4, 3, 2, 1].map(tone), ['positiv', 'positiv', 'gemischt', 'kritisch', 'kritisch']);
});

test('upsertEntry: legt an und ersetzt ohne Doppel', () => {
  const r = { ...normalizeReview(raw), status: 'neu' };
  let note = upsertEntry('', r);
  assert.match(note, /^# Bewertungen 2026-10/);
  note = upsertEntry(note, { ...r, status: 'Freigegeben', reply: 'Danke!' });
  assert.equal(note.match(/## 2026-10-12/g).length, 1);
  assert.match(note, /Status: Freigegeben/);
  note = upsertEntry(note, { ...r, id: 'zweite', date: '2026-10-14' });
  assert.equal(note.match(/^## /gm).length, 2);
  assert.equal(obsidianPath('2026-10-12'), 'Claude/Bewertungen/2026-10.md');
});

test('styleProblems: Gedankenstrich und Länge', () => {
  assert.deepEqual(styleProblems('Danke für Ihre Bewertung.'), []);
  assert.ok(styleProblems('Danke – gern').length);
  assert.ok(styleProblems('Danke - gern').length);
  assert.ok(styleProblems('a'.repeat(701)).length);
});
