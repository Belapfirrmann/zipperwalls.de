import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReview, extractReviews, matchKey, etrustedId, newReviews, tone, upsertEntry, obsidianPath, styleProblems } from '../src/bewertungen.js';

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
  assert.equal(etrustedId('91e858c069ef4ed29b153cf00dd1006c'), 'rev-91e858c0-69ef-4ed2-9b15-3cf00dd1006c');
  assert.equal(etrustedId('rev-91e858c0-69ef-4ed2-9b15-3cf00dd1006c'), 'rev-91e858c0-69ef-4ed2-9b15-3cf00dd1006c');
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

test('upsertEntry: Jahresnotiz, ersetzt ohne Doppel, nach Datum sortiert, eigener Kopf bleibt', () => {
  const r = { ...normalizeReview(raw), status: 'Entwurf', reply: 'Danke!' };
  let note = upsertEntry('', r);
  assert.match(note, /^---\ntags:/);
  assert.match(note, /# Trusted Shops Bewertungen 2026/);
  assert.match(note, /Antwort \(Entwurf\)/);
  note = note.replace('# Trusted Shops Bewertungen 2026', '# Trusted Shops Bewertungen 2026\n\nEigene Notiz.');
  note = upsertEntry(note, { ...r, status: 'Veröffentlicht', published_at: '2026-10-21T21:00:00Z' });
  assert.equal(note.match(/^## /gm).length, 1);
  assert.match(note, /Status: Veröffentlicht am 21\.10\.2026/);
  assert.match(note, /Eigene Notiz\./);
  note = upsertEntry(note, { ...r, id: 'zweite', date: '2026-10-14' });
  note = upsertEntry(note, { ...r, id: 'dritte', date: '2026-01-02' });
  assert.deepEqual(note.match(/^## \S+/gm), ['## 14.10.2026', '## 12.10.2026', '## 02.01.2026']);
  assert.equal(obsidianPath('2026-10-12'), 'Themen/Trusted Shops Bewertungen/Bewertungen 2026.md');
  assert.doesNotMatch(note, /[–—]/);
});

test('styleProblems: Gedankenstrich und Länge', () => {
  assert.deepEqual(styleProblems('Danke für Ihre Bewertung.'), []);
  assert.ok(styleProblems('Danke – gern').length);
  assert.ok(styleProblems('Danke - gern').length);
  assert.ok(styleProblems('a'.repeat(701)).length);
});
