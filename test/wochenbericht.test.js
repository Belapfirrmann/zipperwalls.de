import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyReport } from '../src/wochenbericht.js';

const plan = { rhythm: { time: '09:00' }, entries: [
  { nr: 7, date: '2026-10-20', topic: 'Messe-Rückblick' },
  { nr: 8, date: '2026-10-27', topic: 'Pixlip Go' },
] };
const nlPlan = { entries: [{ nr: 5, date: '2026-10-29', time: '09:00', type: 'eigenständig', subject: 'Herbstmessen' }] };
const NOW = new Date('2026-10-26T05:50:00Z'); // Montag 26.10., Bericht für 19. bis 25.10.

const input = {
  plan, nlPlan, now: NOW,
  posts: [
    { id: 'plan-7', plan_nr: 7, status: 'published', title: '#7 Messe-Rückblick', scheduled_at: '2026-10-20T07:00:00.000Z',
      results: { facebook: { status: 'ok', stats: { likes: 10, comments: 2, views: 400 } }, instagram: { status: 'ok', stats: { likes: 20, views: 600 } } } },
    { id: 'plan-8', plan_nr: 8, status: 'draft', title: '#8 Pixlip Go', scheduled_at: '2026-10-27T08:00:00.000Z' },
  ],
  newsletters: [{ id: 'nl-4', status: 'Versendet', subject: 'Neue Wände', open_rate: 41.5, click_rate: 3.2, stats: { sent: 820, sent_at: '2026-10-22T07:00:00Z' } }],
  metrics: [
    { id: '2026-10-13', facebook: { day: { reach: 100, followers: 500 } } },
    { id: '2026-10-21', facebook: { day: { reach: 150, followers: 504 } }, instagram: { day: { reach: 50 }, account: { followers: 900 } } },
  ],
  reviews: [{ id: 'r1', date: '2026-10-23', stars: 5, status: 'Entwurf' }, { id: 'r0', date: '2026-10-01', stars: 4, status: 'Veröffentlicht' }],
  shop: [
    { id: '2026-10-14', orders: 1, net: 1000 },
    { id: '2026-10-21', orders: 2, net: 3000, sources: { newsletter: { orders: 1, net: 1200 } }, products: { 'Pixlip Go': { qty: 1, net: 2000 } } },
  ],
  todos: [{ id: 't1', who: 'darien', text: 'Messestand zurückschicken', due: '2026-10-23' }, { id: 't2', who: 'bela', text: 'Später', due: '2026-11-20' }],
};

test('Wochenbericht fasst die letzte Woche zusammen und zeigt die neue', () => {
  const r = weeklyReport(input);
  assert.equal(r.week, '2026-10-19');
  assert.match(r.subject, /19\.10\. bis 25\.10\.: 3\.000\s€ Umsatz, 1 Post$/);
  assert.match(r.body, /Reichweite: 200 \(\+100 % zur Vorwoche\)/);
  assert.match(r.body, /Facebook 504 \(\+4\), Instagram 900/);
  assert.match(r.body, /#7 Messe-Rückblick: 1\.000 Aufrufe, 32 Interaktionen/);
  assert.match(r.body, /Umsatz netto: 3\.000\s€ \(\+200 % zur Vorwoche\)/);
  assert.match(r.body, /Davon über Social Media und Newsletter: 1\.200\s€/);
  assert.match(r.body, /Neue Wände an 820 Empfänger: Öffnungsrate 41,5 %, Klickrate 3,2 %/);
  assert.match(r.body, /1 neue Bewertung, Ø 5,0 Sterne/);
  assert.match(r.body, /Di 27\.10\. 09:00 Uhr, Social-Media-Post: #8 Pixlip Go \(Entwurf wartet auf Freigabe\)/);
  assert.match(r.body, /Do 29\.10\. 09:00 Uhr, Newsletter: Herbstmessen/);
  assert.match(r.body, /To-do Darien \(überfällig\): Messestand zurückschicken/);
  assert.doesNotMatch(r.body, /Später/);
  assert.doesNotMatch(r.body, / - /);
});

test('Ohne Daten bleibt der Bericht lesbar', () => {
  const r = weeklyReport({ plan: { entries: [] }, nlPlan: { entries: [] }, now: NOW });
  assert.match(r.body, /noch keine Zahlen vor/);
  assert.match(r.body, /Nichts geplant/);
});
