// Startseite "Heute": was heute und in den nächsten 7 Tagen ansteht, offene Freigaben, Bewertungen, To-dos und Ideen.
// Läuft im Zipperwalls Dashboard, nutzt dessen S, main, esc, planEntries, nlEntries, berlinParts, socialOpen,
// nlDrafts, NL_GROUPS, rvOpenCount, todoOpen, TODO_PEOPLE, ideasNew (dashboard/ideen.js).
const HEUTE_SOCIAL_DONE = ['Freigegeben', 'Gepostet', 'Gestrichen', 'Teilweise gepostet'];
const HEUTE_NL_DONE = ['Freigegeben', 'In MailPoet eingeplant', 'Versendet', 'Gestrichen'];

function heuteItems(from, to, overdue = false) {
  const items = [];
  for (const e of planEntries()) {
    if (e.liveStatus === 'Gestrichen') continue;
    const t = e.post?.scheduled_at ? berlinParts(e.post.scheduled_at) : { date: e.date, time: PLAN.rhythm?.time || '09:00' };
    if (t.date < from || t.date > to) continue;
    const open = !HEUTE_SOCIAL_DONE.includes(e.liveStatus);
    items.push({ date: t.date, time: t.time, kind: 'Post', title: e.topic, status: e.liveStatus, open, href: e.post ? '#freigabe' : '#plan',
      warn: open ? (e.post ? 'noch nicht freigegeben' : 'noch kein Entwurf') : '' });
  }
  for (const n of nlEntries()) {
    if (n.status === 'Gestrichen' || n.date < from || n.date > to) continue;
    const open = !HEUTE_NL_DONE.includes(n.status);
    items.push({ date: n.date, time: n.time, kind: 'Newsletter', title: n.subject || n.topic, status: n.status, open, href: n.doc ? '#freigabe-newsletter' : '#plan-newsletter',
      warn: open ? (n.doc ? 'noch nicht freigegeben' : 'noch kein Entwurf') : '' });
  }
  for (const t of todoOpen()) {
    if (!t.due || t.due > to || (t.due < from && !overdue)) continue;
    items.push({ date: t.due < from ? from : t.due, time: '', kind: 'To-do', title: t.text, status: TODO_NAME[t.who], open: true, href: '#todos',
      warn: t.due < from ? 'überfällig' : '' });
  }
  return items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function heuteRow(i, showDay) {
  const day = new Date(i.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `<a class="hd-row" href="${i.href}">
    <span class="hd-when">${showDay ? `<strong>${esc(day)}</strong>` : ''}${i.time ? `<span class="muted small">${esc(i.time)} Uhr</span>` : ''}</span>
    <span class="hd-kind">${esc(i.kind)}</span>
    <span class="hd-title">${esc(i.title)}${i.warn ? `<span class="badge tiny ${i.warn === 'überfällig' ? 'td-late' : ''}">${esc(i.warn)}</span>` : ''}</span>
    <span class="hd-status muted small">${esc(i.status || '')}</span></a>`;
}

function viewHeute() {
  const today = berlinParts(new Date().toISOString()).date;
  const end = new Date(Date.parse(today + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
  const todayItems = heuteItems(today, today, true);
  const week = heuteItems(new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10), end);
  const urgent = heuteItems(today, new Date(Date.parse(today + 'T12:00:00Z') + 2 * 86400000).toISOString().slice(0, 10), true).filter((i) => i.warn);
  const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }));
  const hello = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const dateLong = new Date(today + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const nlOpen = nlDrafts().filter((x) => NL_GROUPS.offen.includes(x.status)).length;
  const tiles = [
    ['Freigabe', socialOpen() + nlOpen, `${socialOpen()} Posts, ${nlOpen} Newsletter`, '#freigabe'],
    ['Bewertungen', rvOpenCount(), 'ohne veröffentlichte Antwort', '#bewertungen'],
    ['To-dos', todoOpen().length, TODO_PEOPLE.map(([w, n]) => `${n} ${todoOpen(w).length}`).join(', '), '#todos'],
    ['Ideen', ideasNew().length, 'neu, noch nicht bearbeitet', '#ideen'],
  ];
  // Zuletzt veröffentlicht, mit den Zahlen aus dem letzten Abruf
  const last = S.posts.filter((p) => p.status === 'published' || p.status === 'partial')
    .sort((a, b) => String(b.scheduled_at).localeCompare(String(a.scheduled_at)))[0];
  const lastStats = last ? Object.values(last.results || {}).reduce((s, r) => {
    const st = r?.stats || {};
    return { likes: s.likes + (st.likes || 0), comments: s.comments + (st.comments || 0), views: s.views + (st.views || st.reach || 0) };
  }, { likes: 0, comments: 0, views: 0 }) : null;

  main.innerHTML = `
    <div class="head"><span class="label">${esc(dateLong)}</span><h1>${hello}</h1><p>Alles, was heute und in den nächsten sieben Tagen ansteht. Ein Klick auf eine Zeile führt direkt dorthin.</p></div>
    ${urgent.length ? `<div class="notice"><strong>Bitte bis morgen erledigen:</strong> ${urgent.map((i) => `<a href="${i.href}">${esc(i.kind)} „${esc(i.title)}“</a> (${esc(i.warn)})`).join(', ')}</div>` : ''}
    <section class="section grid hd-tiles">${tiles.map(([label, n, sub, href]) => `
      <a class="card kpi hd-tile${n ? ' on' : ''}" href="${href}"><span class="label">${label}</span><div class="num" data-count="${n}">${n}</div><div class="muted small">${esc(sub)}</div></a>`).join('')}
    </section>
    <section class="section card"><h2>Heute</h2>
      <div class="hd-list">${todayItems.length ? todayItems.map((i) => heuteRow(i, false)).join('') : '<p class="muted" style="margin:12px 0 0">Heute steht nichts im Plan.</p>'}</div></section>
    <section class="section card"><h2>Nächste 7 Tage</h2>
      <div class="hd-list">${week.length ? week.map((i, k) => heuteRow(i, k === 0 || week[k - 1].date !== i.date)).join('') : '<p class="muted" style="margin:12px 0 0">Nichts geplant.</p>'}</div></section>
    ${last ? `<section class="section card"><h2>Zuletzt veröffentlicht</h2>
      <p style="margin:10px 0 4px"><a href="#zahlen">${esc(last.title || '')}</a></p>
      <p class="muted small">${esc(berlinParts(last.scheduled_at).day)}, ${esc(fmtDayLong(berlinParts(last.scheduled_at).date))} · ${fmtNum(lastStats.views)} Aufrufe · ${fmtNum(lastStats.likes)} Likes · ${fmtNum(lastStats.comments)} Kommentare</p></section>` : ''}`;
}
