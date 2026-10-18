import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReview, extractReviews, matchKey, newReviews, tone, upsertEntry, obsidianPath, styleProblems } from '../src/bewertungen.js';

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

test('normalizeReview: Format der Trusted Shops API (UID, mark als Text)', () => {
  const r = normalizeReview({ UID: 'u1', mark: '4.00', comment: '', creationDate: '2026-10-03T19:00:06+02:00', criteria: [] });
  assert.equal(r.id, 'u1');
  assert.equal(r.stars, 4);
  assert.equal(r.text, '');
  assert.equal(r.date, '2026-10-03');
});

test('eTrusted Format: items, rev-ID, bestehende Antwort, abgelehnte verworfen', () => {
  const list = extractReviews({ items: [
    { id: 'rev-1', rating: 5, comment: 'Gut', submittedAt: '2026-10-03T17:00:06.000Z', reply: { comment: 'Danke' } },
    { id: 'rev-2', rating: 1, comment: 'x', submittedAt: '2026-10-04T10:00:00Z', status: 'REJECTED' },
  ] });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'rev-1');
  assert.equal(list[0].reply_existing, 'Danke');
  const pub = normalizeReview({ UID: 'abc', mark: '5.00', comment: 'Gut', creationDate: '2026-10-03T19:00:06+02:00' });
  assert.equal(matchKey(pub), matchKey(list[0]));
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
