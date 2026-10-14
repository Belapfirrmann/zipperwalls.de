import test from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders } from '../src/erinnerung.js';

const plan = { rhythm: { time: '09:00' }, entries: [
  { nr: 4, date: '2026-10-15', topic: 'Kundenstimme' },
  { nr: 5, date: '2026-10-20', topic: 'Motten-Effekt' },
] };
const nlPlan = { entries: [
  { nr: 2, date: '2026-10-13', time: '09:00', type: 'eigenständig', subject: 'Fernwirkung' },
  { nr: 3, date: '2026-10-20', time: '09:00', type: 'gekoppelt', social: 'Post 05: Motten-Effekt', subject: 'Licht' },
] };
const NOW = new Date('2026-10-14T15:00:00Z'); // Mittwoch, morgen ist Do 15.10.

test('Offener Post und verschobener Newsletter für morgen ergeben eine Mail', () => {
  const r = dueReminders({
    plan, nlPlan, now: NOW,
    posts: [{ id: 'plan-4', plan_nr: 4, status: 'draft', title: '#4 Kundenstimme', scheduled_at: '2026-10-15T07:00:00.000Z' }],
    newsletters: [{ id: 'nl-2', status: 'Entwurf', subject: 'Fernwirkung', send_at_override: '2026-10-15T07:00:00.000Z' }],
  });
  assert.equal(r.date, '2026-10-15');
  assert.deepEqual(r.items.map((i) => i.kind), ['Social-Media-Post', 'Newsletter']);
  assert.match(r.subject, /2 Beiträge/);
  assert.match(r.body, /09:00 Uhr: #4 Kundenstimme/);
});

test('Alles freigegeben: keine Mail', () => {
  const r = dueReminders({
    plan, nlPlan, now: NOW,
    posts: [{ id: 'plan-4', plan_nr: 4, status: 'scheduled', scheduled_at: '2026-10-15T07:00:00.000Z' }],
    newsletters: [{ id: 'nl-2', status: 'Freigegeben', send_at_override: '2026-10-15T07:00:00.000Z' }],
  });
  assert.equal(r.items.length, 0);
  assert.equal(r.subject, undefined);
});

test('Fehlender Entwurf wird gemeldet, gestrichener nicht', () => {
  const missing = dueReminders({ plan, nlPlan, now: NOW, posts: [], newsletters: [] });
  assert.equal(missing.items[0].state, 'noch kein Entwurf im Dashboard');
  const rejected = dueReminders({ plan, nlPlan, now: NOW, posts: [{ id: 'plan-4', plan_nr: 4, status: 'rejected' }], newsletters: [] });
  assert.equal(rejected.items.filter((i) => i.kind === 'Social-Media-Post').length, 0);
});

test('Gekoppelter Newsletter folgt dem Termin seines Posts', () => {
  const r = dueReminders({
    plan, nlPlan, now: new Date('2026-10-19T15:00:00Z'),
    posts: [{ id: 'plan-5', plan_nr: 5, status: 'scheduled', scheduled_at: '2026-10-20T07:00:00.000Z' }],
    newsletters: [{ id: 'nl-3', status: 'Entwurf', subject: 'Licht' }],
  });
  assert.deepEqual(r.items.map((i) => [i.kind, i.nr]), [['Newsletter', 3]]);
});
