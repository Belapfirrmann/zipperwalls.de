import test from 'node:test';
import assert from 'node:assert/strict';
import { planActions, effectiveSendAt } from '../src/newsletter-sync.js';

const now = new Date('2026-10-05T08:00:00Z');

test('Gekoppelter Newsletter nimmt den Termin des Posts', () => {
  assert.equal(effectiveSendAt({ post_nr: 2, send_at: '2026-10-08T07:00:00Z' }, { 2: { scheduled_at: '2026-10-06T07:00:00Z' } }), '2026-10-06T07:00:00Z');
  assert.equal(effectiveSendAt({ send_at: '2026-10-08T07:00:00Z' }, {}), '2026-10-08T07:00:00Z');
});

test('Freigegeben wird eingeplant, verpasster Termin nicht', () => {
  const a = planActions([
    { id: 'nl-1', status: 'Freigegeben', send_at: '2026-10-06T07:00:00Z' },
    { id: 'nl-2', status: 'Freigegeben', send_at: '2026-10-05T06:00:00Z' },
    { id: 'nl-3', status: 'Freigegeben', send_at: '2026-10-04T07:00:00Z' },
  ], {}, now);
  assert.deepEqual(a.map((x) => x.action), ['schedule', 'schedule', 'missed']);
});

test('Eingeplant: verschobener Post plant neu, sonst Status prüfen', () => {
  const a = planActions([
    { id: 'nl-1', status: 'In MailPoet eingeplant', post_nr: 2, mailpoet_id: 16, mp_state: 'scheduled', mp_scheduled_for: '2026-10-06T07:00:00Z' },
    { id: 'nl-4', status: 'In MailPoet eingeplant', mailpoet_id: 17, mp_state: 'scheduled', send_at: '2026-10-06T07:00:00Z', mp_scheduled_for: '2026-10-06T07:00:00Z' },
  ], { 2: { scheduled_at: '2026-10-07T07:00:00Z' } }, now);
  assert.deepEqual(a.map((x) => x.action), ['schedule', 'check']);
});

test('Zurück zu Entwurf nimmt die Einplanung zurück', () => {
  const a = planActions([
    { id: 'nl-1', status: 'Entwurf', mailpoet_id: 16, mp_state: 'scheduled' },
    { id: 'nl-2', status: 'Entwurf' },
  ], {}, now);
  assert.deepEqual(a, [{ key: 'nl-1', action: 'unschedule' }]);
});
