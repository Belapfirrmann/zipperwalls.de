import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsletterText, renderNewsletter } from '../src/newsletter-render.js';

const text = 'Guten Tag,\n\nEinleitung.\n\nMESSE-TIPP #01: DREI SCHRITTE\n\n1. Maße klären. Erst dann planen.\n\n2. Daten anlegen. Mit Korrektur.\n\nViele Grüße\nIhr Team von Zipperwalls\n\nTelefon +49 1\nkontakt@zipperwalls.de | www.zipperwalls.de';

test('Text wird in Absatz, Überschrift, Schritte, Gruß und Kontakt gegliedert', () => {
  const types = parseNewsletterText(text).map((b) => b.type);
  assert.deepEqual(types, ['p', 'p', 'heading', 'step', 'step', 'signature', 'contact']);
  const step = parseNewsletterText(text)[3];
  assert.equal(step.title, 'Maße klären.');
  assert.equal(step.text, 'Erst dann planen.');
});

test('Export behält MailPoet-Links, Vorschau nicht', () => {
  const n = { nr: 1, date: '2026-10-08', subject: 'Betreff', preview: 'Vorschau', text, button_text: 'Ansehen', button_link: 'https://www.zipperwalls.de/messestaende/', image_url: 'https://www.zipperwalls.de/bild.webp' };
  const out = renderNewsletter(n);
  assert.match(out, /\[link:subscription_unsubscribe_url\]/);
  assert.match(out, /src="https:\/\/www\.zipperwalls\.de\/bild\.webp"/);
  assert.match(out, /Ausgabe 01 · Oktober 2026/);
  assert.match(out, /href="https:\/\/www\.zipperwalls\.de"/);
  const prev = renderNewsletter(n, { preview: true });
  assert.doesNotMatch(prev, /\[link:/);
  assert.match(prev, /<base target="_blank">/);
  assert.match(prev, /bitte hochladen/);
});

test('Text wird maskiert', () => {
  assert.doesNotMatch(renderNewsletter({ text: '<script>x</script>' }), /<script>x/);
});
