import test from 'node:test';
import assert from 'node:assert/strict';
import { composeText, validate, escapeLinkedIn, normalizeHashtags, isoWeek } from '../src/text.js';

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
