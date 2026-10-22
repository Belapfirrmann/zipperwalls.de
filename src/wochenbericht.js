// Wochenbericht für Bela und Darien: Rückblick auf die letzte Woche (Montag bis Sonntag) und was diese Woche ansteht.
// Reine Funktion ohne Netzwerk. Ausgeführt von der Routine "Wochenbericht" über scripts/wochenbericht.js.
import { DASHBOARD_URL, berlin, scheduledItems } from './erinnerung.js';
import { REDAKTIONSPLAN } from './redaktionsplan.js';
import { NEWSLETTERPLAN } from './newsletterplan.js';

const CHANNELS = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn']];
const DAY_FIELDS = [['reach', 'Reichweite'], ['views', 'Aufrufe'], ['engagements', 'Interaktionen'], ['page_views', 'Seitenbesuche']];

const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const weekday = (day) => (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7; // Montag = 0
const short = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
const dayName = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'short', timeZone: 'UTC' });
const fmtNum = (n) => Math.round(n).toLocaleString('de-DE');
const fmtEur = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const inRange = (day, from, to) => !!day && day >= from && day <= to;
const interactions = (s = {}) => (s.likes || 0) + (s.comments || 0) + (s.shares || 0) + (s.saves || 0);

// Veränderung zur Vorwoche als kurzer Zusatz, z. B. "(+12 % zur Vorwoche)"
function trend(cur, prev) {
  if (!prev) return '';
  const pct = Math.round(((cur - prev) / prev) * 100);
  return ` (${pct > 0 ? '+' : ''}${pct} % zur Vorwoche)`;
}

/**
 * Eingabe: Dokumente (mit id) der Collections posts, newsletters, metrics, reviews, shop, todos und now.
 * Liefert { week: <Montag der Berichtswoche>, subject, body, summary }.
 */
export function weeklyReport({ posts = [], newsletters = [], metrics = [], reviews = [], shop = [], todos = [], now = new Date(),
  plan = REDAKTIONSPLAN, nlPlan = NEWSLETTERPLAN }) {
  const today = berlin(now).date;
  const thisMon = addDays(today, -weekday(today));
  const from = addDays(thisMon, -7), to = addDays(thisMon, -1);
  const prevFrom = addDays(thisMon, -14), prevTo = addDays(thisMon, -8);
  const nextTo = addDays(thisMon, 6);
  const out = [];
  const summary = {};

  // Social Media: Tageswerte je Kanal summiert
  const sumField = (f, a, b) => metrics.filter((m) => inRange(m.id, a, b))
    .reduce((s, m) => s + CHANNELS.reduce((t, [c]) => t + (Number(m[c]?.day?.[f]) || 0), 0), 0);
  const social = DAY_FIELDS.map(([f, label]) => ({ f, label, cur: sumField(f, from, to), prev: sumField(f, prevFrom, prevTo) })).filter((x) => x.cur || x.prev);
  const latest = [...metrics].sort((a, b) => b.id.localeCompare(a.id));
  const followersAt = (c, day) => {
    for (const m of latest) {
      if (m.id > day) continue;
      const v = m[c]?.day?.followers ?? m[c]?.account?.followers;
      if (v != null) return Number(v);
    }
    return null;
  };
  const followers = CHANNELS.map(([c, label]) => ({ label, cur: followersAt(c, to), prev: followersAt(c, prevTo) })).filter((x) => x.cur != null);
  out.push('SOCIAL MEDIA');
  if (social.length) for (const x of social) out.push(`• ${x.label}: ${fmtNum(x.cur)}${trend(x.cur, x.prev)}`);
  if (followers.length) out.push(`• Follower: ${followers.map((x) => `${x.label} ${fmtNum(x.cur)}${x.prev != null && x.cur !== x.prev ? ` (${x.cur > x.prev ? '+' : ''}${x.cur - x.prev})` : ''}`).join(', ')}`);
  if (!social.length && !followers.length) out.push('• Für letzte Woche liegen noch keine Zahlen vor.');
  summary.social = Object.fromEntries(social.map((x) => [x.f, x.cur]));

  // Veröffentlichte Posts der Woche mit Interaktionen
  const published = posts.filter((p) => ['published', 'partial'].includes(p.status) && p.scheduled_at && inRange(berlin(p.scheduled_at).date, from, to))
    .map((p) => {
      const res = Object.values(p.results || {}).filter((r) => r?.stats);
      return { title: p.title || p.id, day: berlin(p.scheduled_at).date, inter: res.reduce((s, r) => s + interactions(r.stats), 0),
        views: res.reduce((s, r) => s + (r.stats.views || r.stats.reach || 0), 0) };
    })
    .sort((a, b) => b.inter - a.inter || b.views - a.views);
  out.push('', published.length ? `Veröffentlicht (${published.length}):` : 'Letzte Woche wurde kein Post veröffentlicht.');
  for (const p of published) out.push(`• ${dayName(p.day)} ${short(p.day)} ${p.title}: ${fmtNum(p.views)} Aufrufe, ${fmtNum(p.inter)} Interaktionen`);
  summary.posts = published.length;

  // Shop
  const shopSum = (a, b) => shop.filter((d) => inRange(d.id, a, b)).reduce((s, d) => {
    s.net += Number(d.net) || 0;
    s.orders += Number(d.orders) || 0;
    for (const [k, v] of Object.entries(d.sources || {})) if (['newsletter', 'instagram', 'facebook', 'linkedin', 'bio'].includes(k)) s.marketing += Number(v.net) || 0;
    for (const [k, v] of Object.entries(d.products || {})) s.products[k] = (s.products[k] || 0) + (Number(v.net) || 0);
    return s;
  }, { net: 0, orders: 0, marketing: 0, products: {} });
  const sc = shopSum(from, to), sp = shopSum(prevFrom, prevTo);
  out.push('', 'SHOP');
  if (shop.length) {
    out.push(`• Umsatz netto: ${fmtEur(sc.net)}${trend(sc.net, sp.net)}`);
    out.push(`• Bestellungen: ${sc.orders}${sc.orders ? `, Ø ${fmtEur(sc.net / sc.orders)}` : ''}`);
    if (sc.marketing) out.push(`• Davon über Social Media und Newsletter: ${fmtEur(sc.marketing)}`);
    const top = Object.entries(sc.products).sort((a, b) => b[1] - a[1])[0];
    if (top) out.push(`• Stärkstes Produkt: ${top[0]} (${fmtEur(top[1])})`);
  } else out.push('• Noch keine Shop-Zahlen im Dashboard.');
  summary.shop = { net: Math.round(sc.net), orders: sc.orders };

  // Newsletter, die letzte Woche verschickt wurden
  const sent = newsletters.filter((n) => n.status === 'Versendet' && inRange(String(n.stats?.sent_at || n.sent_at || '').slice(0, 10), from, to));
  if (sent.length) {
    out.push('', 'NEWSLETTER');
    for (const n of sent) {
      const rates = [n.open_rate != null && `Öffnungsrate ${String(n.open_rate).replace('.', ',')} %`, n.click_rate != null && `Klickrate ${String(n.click_rate).replace('.', ',')} %`].filter(Boolean);
      out.push(`• ${n.subject || n.id}${n.stats?.sent ? ` an ${fmtNum(n.stats.sent)} Empfänger` : ''}${rates.length ? `: ${rates.join(', ')}` : ''}`);
    }
  }
  summary.newsletters = sent.length;

  // Bewertungen
  const newReviews = reviews.filter((r) => inRange(r.date, from, to));
  const open = reviews.filter((r) => ['neu', 'Entwurf', 'Fehler'].includes(r.status)); // wie rvIsOpen im Dashboard
  out.push('', 'BEWERTUNGEN');
  out.push(newReviews.length
    ? `• ${newReviews.length} neue Bewertung${newReviews.length === 1 ? '' : 'en'}, Ø ${(newReviews.reduce((s, r) => s + r.stars, 0) / newReviews.length).toFixed(1).replace('.', ',')} Sterne${newReviews.some((r) => r.stars <= 3) ? ' (darunter mindestens eine mit 3 Sternen oder weniger)' : ''}`
    : '• Keine neuen Bewertungen.');
  if (open.length) out.push(`• ${open.length} warten auf eure Freigabe der Antwort`);
  summary.reviews = newReviews.length;

  // Diese Woche
  const week = scheduledItems({ posts, newsletters, plan, nlPlan }).filter((i) => !i.cancelled && inRange(i.date, thisMon, nextTo))
    .sort((a, b) => a.iso.localeCompare(b.iso));
  const dueTodos = todos.filter((t) => !t.done_at && t.due && t.due <= nextTo).sort((a, b) => a.due.localeCompare(b.due));
  const NAME = { bela: 'Bela', darien: 'Darien' };
  out.push('', 'DIESE WOCHE');
  if (!week.length && !dueTodos.length) out.push('• Nichts geplant.');
  for (const i of week) out.push(`• ${dayName(i.date)} ${short(i.date)} ${i.time} Uhr, ${i.kind}: ${i.title}${i.done ? '' : ` (${i.state})`}`);
  for (const t of dueTodos) out.push(`• To-do ${NAME[t.who] || t.who}${t.due < thisMon ? ' (überfällig)' : ` bis ${dayName(t.due)} ${short(t.due)}`}: ${t.text}`);
  summary.week = week.length;
  summary.todos = dueTodos.length;
  const openApproval = week.filter((i) => !i.done).length;

  const body = [
    'Hallo Bela, hallo Darien,',
    '',
    `hier der Wochenbericht für ${short(from)} bis ${short(to)}${to.slice(0, 4)}.`,
    '',
    ...out,
    '',
    openApproval ? `${openApproval} Termin${openApproval === 1 ? '' : 'e'} diese Woche ${openApproval === 1 ? 'ist' : 'sind'} noch nicht freigegeben.` : '',
    `Alle Details im Dashboard: ${DASHBOARD_URL}`,
    '',
    'Dieser Bericht kommt automatisch jeden Montag.',
  ].filter((l, k, a) => !(l === '' && a[k - 1] === '')).join('\n');
  const subject = `Wochenbericht ${short(from)} bis ${short(to)}: ${fmtEur(sc.net)} Umsatz, ${published.length} Post${published.length === 1 ? '' : 's'}`;
  return { week: from, subject, body, summary };
}
