import test from 'node:test';
import assert from 'node:assert/strict';
import { composeText, validate, escapeLinkedIn, normalizeHashtags, isoWeek, findPlaceholder, berlinToUtc } from '../src/text.js';
import { PLAN } from '../src/plan.js';

test('Hashtags werden vereinheitlicht und dedupliziert', () => {
  assert.deepEqual(normalizeHashtags(['messe', '#Messe', '##messe', ' zipper walls ', '']), ['#messe', '#Messe', '#zipperwalls']);
});

test('Kanalvariante hat Vorrang, fehlende Hashtags werden angehaengt', () => {
  const post = { body: 'Basis', variants: { linkedin: 'LinkedIn Text #messe' }, hashtags: ['messe', 'stand'] };
  assert.equal(composeText(post, 'linkedin'), 'LinkedIn Text #messe\n\n#stand');
  assert.equal(composeText(post, 'facebook'), 'Basis\n\n#messe #stand');
});

test('Instagram ohne Bild wird abgelehnt', () => {
  assert.match(validate('instagram', 'Text', false), /Bild/);
  assert.equal(validate('facebook', 'Text', false), null);
  assert.match(validate('linkedin', 'x'.repeat(3001), false), /zu lang/);
});

test('LinkedIn Sonderzeichen werden maskiert, Hashtags bleiben', () => {
  assert.equal(escapeLinkedIn('Aufbau (5 Min) #messe C# 100%_*'), 'Aufbau \\(5 Min\\) #messe C\\# 100%\\_\\*');
});

test('ISO Kalenderwoche', () => {
  assert.equal(isoWeek(new Date('2026-10-01T12:00:00Z')), '2026-W40');
  assert.equal(isoWeek(new Date('2027-01-01T12:00:00Z')), '2026-W53');
});

test('Platzhalter werden erkannt, normale Klammern nicht', () => {
  assert.equal(findPlaceholder('Bestellschluss [DATUM], Zeiten [ZEITEN]'), '[DATUM]');
  assert.equal(findPlaceholder('Aufbau (5 Min) und [1] Fußnote'), null);
});

test('Berliner Ortszeit in UTC, Sommer und Winterzeit', () => {
  assert.equal(berlinToUtc('2026-10-06', '09:00'), '2026-10-06T07:00:00.000Z');
  assert.equal(berlinToUtc('2026-11-03', '09:00'), '2026-11-03T08:00:00.000Z');
});

test('Redaktionsplan Q4 2026 ist vollstaendig eingelesen', () => {
  assert.equal(PLAN.entries.length, 24);
  for (const e of PLAN.entries) {
    assert.ok(e.date && e.topic && e.pillar, `Eintrag ${e.nr}`);
    assert.ok(e.instagram && e.facebook && e.linkedin, `Texte ${e.nr}`);
    assert.ok(e.hashtags.length > 0, `Hashtags ${e.nr}`);
  }
  // Platzhalter stehen laut Legende in Post 20 und 23
  const withPh = PLAN.entries.filter((e) => findPlaceholder(e.facebook + e.instagram + e.linkedin)).map((e) => e.nr);
  assert.deepEqual(withPh, [20, 23]);
});
