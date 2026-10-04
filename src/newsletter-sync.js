// Entscheidet für die Routine "Newsletter Versand", was mit jedem Newsletter-Dokument passieren soll.
// Reine Funktion ohne Netzwerk (gut testbar). Ausgeführt wird über scripts/newsletter.js.

// MailPoet-Listen auf zipperwalls.de (Stand 04.10.2026): 3 = "Infopost zipperwalls.de", 4 = "Infopost Testliste"
export const LIST_IDS = [3];
export const TEST_LIST_IDS = [4];
// Ist der Termin schon vorbei, wird höchstens so lange danach noch gesendet
export const LATE_LIMIT_MS = 3 * 60 * 60 * 1000;

// Versandtermin: gekoppelte Newsletter immer zum aktuellen Termin ihres Posts
export function effectiveSendAt(doc, postsByNr = {}) {
  const post = doc.post_nr != null ? postsByNr[doc.post_nr] : null;
  return post?.scheduled_at || doc.send_at || null;
}

const sameTime = (a, b) => !!a && !!b && Math.abs(new Date(a) - new Date(b)) < 60 * 1000;

// docs: Dokumente der Collection "newsletters" (mit id), postsByNr: { <plan_nr>: { scheduled_at, status } }
export function planActions(docs, postsByNr = {}, now = new Date()) {
  const actions = [];
  for (const doc of docs) {
    const key = doc.id;
    const sendAt = effectiveSendAt(doc, postsByNr);
    const planned = !!doc.mailpoet_id && doc.mp_state === 'scheduled';
    if (doc.status === 'Freigegeben') {
      if (!sendAt) {
        actions.push({ key, action: 'error', reason: 'Kein Versandtermin.' });
      } else if (new Date(sendAt) < new Date(now - LATE_LIMIT_MS)) {
        actions.push({ key, action: 'missed', send_at: sendAt, reason: 'Termin verpasst, nicht gesendet.' });
      } else {
        actions.push({ key, action: 'schedule', send_at: sendAt });
      }
    } else if (doc.status === 'In MailPoet eingeplant') {
      if (sendAt && doc.mp_scheduled_for && !sameTime(sendAt, doc.mp_scheduled_for) && new Date(sendAt) > now) {
        actions.push({ key, action: 'schedule', send_at: sendAt, reason: 'Termin des Posts hat sich geändert.' });
      } else {
        actions.push({ key, action: 'check' });
      }
    } else if (['Entwurf', 'Verschoben', 'Gestrichen'].includes(doc.status) && planned) {
      actions.push({ key, action: 'unschedule' });
    }
  }
  return actions;
}
