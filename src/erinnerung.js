// Erinnerung an Darien: einen Tag vor einem Social-Post oder Newsletter, solange er noch nicht freigegeben ist.
// Reine Funktion ohne Netzwerk. Ausgeführt von der Routine "Freigabe-Erinnerung" über scripts/erinnerung.js.
import { REDAKTIONSPLAN } from './redaktionsplan.js';
import { NEWSLETTERPLAN } from './newsletterplan.js';
import { berlinToUtc } from './text.js';

export const DASHBOARD_URL = 'https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6';
// Freigegeben oder erledigt: dann keine Erinnerung. Gestrichen zählt ebenfalls als erledigt.
const SOCIAL_DONE = ['approved', 'scheduled', 'publishing', 'published', 'partial', 'rejected'];
const NL_DONE = ['Freigegeben', 'In MailPoet eingeplant', 'Versendet', 'Gestrichen'];

export const berlin = (iso) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const addDay = (date) => new Date(Date.parse(date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
const fmtDate = (date) => new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

// Alle Termine aus Redaktions- und Newsletterplan sowie Posts ohne Plan-Nummer, mit Stand (auch für den Wochenbericht).
// Liefert [{ kind, nr, title, iso, date, time, done, cancelled, state }]
export function scheduledItems({ posts = [], newsletters = [], plan = REDAKTIONSPLAN, nlPlan = NEWSLETTERPLAN }) {
  const items = [];
  const postFor = (nr) => posts.find((p) => p.plan_nr === nr && p.status !== 'rejected') || posts.find((p) => p.plan_nr === nr) || null;
  const push = (o, iso) => items.push({ ...o, iso, ...berlin(iso) });

  // Social: Termin aus dem Dokument, sonst aus dem Plan
  for (const e of plan.entries) {
    const post = postFor(e.nr);
    const iso = post?.scheduled_at || (e.date ? berlinToUtc(e.date, plan.rhythm?.time || '09:00') : null);
    if (!iso) continue;
    push({ kind: 'Social-Media-Post', nr: e.nr, title: post?.title || `#${e.nr} ${e.topic}`, done: !!post && SOCIAL_DONE.includes(post.status),
      cancelled: post?.status === 'rejected', state: post ? 'Entwurf wartet auf Freigabe' : 'noch kein Entwurf im Dashboard' }, iso);
  }

  // Posts ohne Plan-Nummer (z. B. aus dem Reiter Ideen): Termin aus dem Dokument
  for (const p of posts) {
    if (p.plan_nr != null || !p.scheduled_at) continue;
    push({ kind: 'Social-Media-Post', nr: null, title: p.title || p.id, done: SOCIAL_DONE.includes(p.status), cancelled: p.status === 'rejected',
      state: 'Entwurf wartet auf Freigabe' }, p.scheduled_at);
  }

  // Newsletter: gekoppelte zum Termin ihres Posts, eigenständige zum (ggf. verschobenen) eigenen Termin
  for (const e of nlPlan.entries) {
    const doc = newsletters.find((n) => n.id === `nl-${e.nr}`) || null;
    const m = e.type === 'gekoppelt' ? /Post\s*0*(\d+)/i.exec(e.social || '') : null;
    const planPost = m ? plan.entries.find((x) => x.nr === Number(m[1])) : null;
    const post = planPost ? postFor(planPost.nr) : null;
    const iso = (post && post.status !== 'rejected' && post.scheduled_at) || (planPost?.date ? berlinToUtc(planPost.date, plan.rhythm?.time || '09:00') : null)
      || doc?.send_at_override || berlinToUtc(e.date, e.time || '09:00');
    push({ kind: 'Newsletter', nr: e.nr, title: doc?.subject || e.subject || e.topic, done: !!doc && NL_DONE.includes(doc.status),
      cancelled: doc?.status === 'Gestrichen', state: doc ? 'Entwurf wartet auf Freigabe' : 'noch kein Entwurf im Dashboard' }, iso);
  }
  return items;
}

/**
 * posts: Dokumente der Collection "posts" (mit id), newsletters: Dokumente der Collection "newsletters" (mit id).
 * Liefert die offenen Punkte für morgen (Berliner Zeit) und den fertigen Mailtext, oder items = [] wenn nichts offen ist.
 */
export function dueReminders({ posts = [], newsletters = [], now = new Date(), plan = REDAKTIONSPLAN, nlPlan = NEWSLETTERPLAN }) {
  const tomorrow = addDay(berlin(now).date);
  const items = scheduledItems({ posts, newsletters, plan, nlPlan }).filter((i) => i.date === tomorrow && !i.done)
    .map(({ kind, nr, title, time, state }) => ({ kind, nr, title, time, state }));

  if (!items.length) return { date: tomorrow, items };
  const subject = `Bitte freigeben: ${items.length === 1 ? items[0].kind : `${items.length} Beiträge`} für ${fmtDate(tomorrow)}`;
  const lines = items.map((i) => `${i.kind} um ${i.time} Uhr: ${i.title} (${i.state})`);
  const body = [
    'Hallo Darien,',
    '',
    `für morgen, ${fmtDate(tomorrow)}, ist noch nicht alles freigegeben:`,
    '',
    ...lines.map((l) => `• ${l}`),
    '',
    'Ohne Freigabe wird nichts veröffentlicht. Bitte im Dashboard unter „Freigabe“ prüfen und auf „Freigeben“ klicken:',
    DASHBOARD_URL,
    '',
    'Diese Erinnerung kommt automatisch einen Tag vorher, nur wenn noch etwas offen ist.',
  ].join('\n');
  return { date: tomorrow, items, subject, body };
}
