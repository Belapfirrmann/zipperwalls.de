import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsletterText, renderNewsletter, checkMailpoetLinks, MAILPOET_LINKS } from '../src/newsletter-render.js';

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

test('Weitere Bilder im Text: einzeln, nebeneinander, ohne Bild entfällt der Marker', () => {
  const t = 'Einleitung.\n\n[Bild 2]\n\nMitte.\n\n[Bild 2] [Bild 3]\n\nSchluss.';
  assert.deepEqual(parseNewsletterText(t).map((b) => b.type), ['p', 'images', 'p', 'images', 'p']);
  assert.deepEqual(parseNewsletterText(t)[3].nums, [2, 3]);
  const n = { text: t, img2_url: 'https://www.zipperwalls.de/a.webp', img2_alt: 'Aufbau', img2_caption: 'Aufbau in Minuten', img3_url: 'https://www.zipperwalls.de/b.webp' };
  const out = renderNewsletter(n);
  assert.equal(out.match(/src="https:\/\/www\.zipperwalls\.de\/a\.webp"/g).length, 2);
  assert.match(out, /Aufbau in Minuten/);
  assert.match(out, /class="pimg2"/);
  assert.doesNotMatch(out, /\[Bild/);
  const none = renderNewsletter({ text: t });
  assert.doesNotMatch(none, /\[Bild|Für die Vorschau bitte hochladen/);
  const prev = renderNewsletter(n, { preview: true, extraImages: { 2: 'blob:x' } });
  assert.match(prev, /src="blob:x"/);
  assert.match(prev, /Für die Vorschau bitte hochladen/);
});

test('Export enthält genau die drei gültigen MailPoet-Links, auch „Im Browser lesen“', () => {
  const out = renderNewsletter({ nr: 1, text, subject: 'x' });
  assert.match(out, /href="\[link:newsletter_view_in_browser_url\]"/);
  assert.doesNotMatch(out, /_action\]/);
  assert.equal(checkMailpoetLinks(out), null);
  for (const l of MAILPOET_LINKS) assert.ok(out.includes(`[link:${l}]`), l);
});

test('checkMailpoetLinks meldet unbekannte und fehlende Links', () => {
  assert.match(checkMailpoetLinks('[link:newsletter_view_in_browser_action] [link:subscription_unsubscribe_url]'), /Unbekannter.*_action/);
  assert.match(checkMailpoetLinks('[link:subscription_unsubscribe_url]'), /fehlt/);
});
