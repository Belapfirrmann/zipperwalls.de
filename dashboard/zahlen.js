// ---------- Zahlen ----------
// Daten: metrics/<YYYY-MM-DD> mit { <kanal>: { day, account, audience }, meta } (Routine "Social Zahlen")
// und results.<kanal>.stats je Post. Wird beim Bauen hinter app.js eingefuegt.

const Z = { range: 28, metric: 'reach', sort: 'interactions', dir: -1 };
try {
  Object.assign(Z, JSON.parse(localStorage.getItem('zw-zahlen') || '{}'));
} catch {
  /* ohne Speicher weiter */
}
const saveZ = () => {
  try {
    localStorage.setItem('zw-zahlen', JSON.stringify({ range: Z.range, metric: Z.metric }));
  } catch {
    /* egal */
  }
};

const RANGES = [[7, '7 Tage'], [28, '28 Tage'], [90, '90 Tage']];
const DAY_METRICS = {
  reach: ['Reichweite', 'Erreichte Personen'],
  views: ['Aufrufe', 'Wie oft Inhalte angezeigt wurden'],
  engagements: ['Interaktionen', 'Reaktionen, Kommentare, Teilen, Klicks'],
  page_views: ['Seitenbesuche', 'Besuche der Seite bzw. des Profils'],
};
const MISSING_TEXT = {
  instagram_manage_insights: 'Instagram liefert Reichweite, Aufrufe, Speichern, Profilbesuche und Zielgruppe erst mit dem Recht instagram_manage_insights. Im Graph API Explorer hinzufügen, neuen Seiten-Token erzeugen und META_PAGE_TOKEN ersetzen.',
  read_insights: 'Facebook liefert Seiten-Kennzahlen nur mit dem Recht read_insights.',
  organization: 'LinkedIn-Zahlen kommen, sobald die Community Management API freigegeben ist und die Unternehmensseite verbunden ist.',
};

const berlinDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d);
const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const shortDate = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
const fmtPct = (v) => (v == null || !Number.isFinite(v) ? 'k. A.' : `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);
const fmtCompact = (n) => Number(n).toLocaleString('de-DE', { notation: 'compact', maximumFractionDigits: 1 });
const interactions = (s = {}) => (s.likes || 0) + (s.comments || 0) + (s.shares || 0) + (s.saves || 0);
const sumBy = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const chanColor = (c) => `var(--c-${c})`;

// Tageswerte eines Kanals; Follower: Tageswert (Facebook) oder Kontostand vom Abruf
function zData() {
  const byDay = Object.fromEntries(S.metrics.map((m) => [m.id, m]));
  const day = (d, c, f) => byDay[d]?.[c]?.day?.[f];
  const followers = (d, c) => byDay[d]?.[c]?.day?.followers ?? byDay[d]?.[c]?.account?.followers;
  const latest = [...S.metrics].sort((a, b) => b.id.localeCompare(a.id));
  const meta = latest.find((m) => m.meta)?.meta || null;
  const audience = latest.find((m) => m.instagram?.audience)?.instagram.audience || null;
  const lastFollowers = (c) => {
    for (const m of latest) {
      const v = followers(m.id, c);
      if (v != null) return v;
    }
    return null;
  };
  return { byDay, day, followers, meta, audience, lastFollowers };
}

// Ein Eintrag je veroeffentlichtem Kanal eines Posts
function publishedItems() {
  const items = [];
  for (const p of S.posts) {
    const entry = PLAN.entries?.find((e) => e.nr === p.plan_nr);
    for (const [c, r] of Object.entries(p.results || {})) {
      if (r.status !== 'ok' || !r.at) continue;
      const st = r.stats || {};
      items.push({
        id: p.id, title: p.title || entry?.topic || p.id, channel: c, at: r.at, url: r.url, image: p.image,
        pillar: entry?.pillar || 'Ohne Zuordnung', format: (p.slides?.length || 0) > 1 ? 'Karussell' : 'Einzelbild',
        ...st, interactions: interactions(st),
      });
    }
  }
  return items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// Achsenwerte: 0 bis zur naechsten runden Zahl
function niceMax(v) {
  if (v <= 0) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = [1, 2, 2.5, 5, 10].find((m) => m * p >= v);
  return n * p;
}
const tipAttr = (title, rows) => `data-tip="${esc(JSON.stringify({ title, rows }))}" tabindex="0"`;

// Gestapelte Balken je Tag und Kanal
function stackedBars(dates, series, label) {
  const W = 760, H = 240, L = 44, R = 8, T = 12, B = 28;
  const totals = dates.map((_, i) => sumBy(series, (s) => s.values[i]));
  const max = niceMax(Math.max(...totals));
  const bw = (W - L - R) / dates.length;
  const barW = Math.max(2, Math.min(28, bw - (dates.length > 40 ? 1 : 3)));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  let bars = '';
  dates.forEach((d, i) => {
    const x = L + i * bw + (bw - barW) / 2;
    let base = 0;
    const visible = series.filter((s) => s.values[i] > 0);
    visible.forEach((s, k) => {
      const v = s.values[i];
      const y0 = y(base), y1 = y(base + v);
      const top = k === visible.length - 1;
      const h = Math.max(0, y0 - y1 - (k ? 2 : 0));
      const r = top ? Math.min(4, barW / 2, h) : 0;
      bars += `<path fill="${chanColor(s.key)}" d="M${x},${y0 - (k ? 2 : 0)}v${-(h - r)}${r ? `q0,${-r} ${r},${-r}h${barW - 2 * r}q${r},0 ${r},${r}` : `h${barW}`}v${h - r}z"/>`;
      base += v;
    });
    bars += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" ${tipAttr(fmtDay(d), [...series.map((s) => [s.label, s.values[i], s.key]), ['Gesamt', totals[i]]])}/>`;
  });
  const xl = [0, Math.floor(dates.length / 2), dates.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  return `<svg class="chart zc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmtCompact(t)}</text>`).join('')}
    ${bars}
    ${xl.map((i) => `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}">${shortDate(dates[i])}</text>`).join('')}
  </svg>`;
}

// Linien je Kanal (gleiche Einheit, eine Achse)
function multiLine(dates, series, label) {
  const W = 480, H = 220, L = 40, R = 52, T = 14, B = 28;
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  if (!all.length) return '<p class="muted small">Noch keine Werte im Zeitraum.</p>';
  let min = Math.min(...all), max = Math.max(...all);
  if (max - min < 4) { min = Math.max(0, min - 2); max = max + 2; }
  const x = (i) => L + (dates.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (dates.length - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min));
  const bw = (W - L - R) / Math.max(1, dates.length - 1);
  const paths = series.map((s) => {
    let d = '', pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    const li = s.values.findLastIndex((v) => v != null);
    return { s, d, li };
  });
  // Direkte Beschriftung am Linienende, bei Ueberlappung auseinanderschieben
  const ends = paths.filter((p) => p.li >= 0).map((p) => ({ p, y: y(p.s.values[p.li]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  return `<svg class="chart zc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${[min, (min + max) / 2, max].map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmtCompact(Math.round(t))}</text>`).join('')}
    ${dates.map((d, i) => `<rect class="hit band" x="${x(i) - bw / 2}" y="${T}" width="${bw}" height="${H - T - B}" ${tipAttr(fmtDay(d), series.map((s) => [s.label, s.values[i], s.key]))}/>`).join('')}
    ${paths.map(({ s, d }) => `<path class="ln" stroke="${chanColor(s.key)}" d="${d}"/>`).join('')}
    ${paths.filter((p) => p.li >= 0).map(({ s, li }) => `<circle class="end" fill="${chanColor(s.key)}" cx="${x(li)}" cy="${y(s.values[li])}" r="4.5"/>`).join('')}
    ${ends.map(({ p, y: ly }) => `<text class="lbl" x="${x(p.li) + 9}" y="${ly + 4}">${fmtNum(p.s.values[p.li])}</text>`).join('')}
    <text x="${L}" y="${H - 8}">${shortDate(dates[0])}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">${shortDate(dates.at(-1))}</text>
  </svg>`;
}

// Waagerechte Balken mit Beschriftung (Anteile, Themen, Zielgruppe)
function hBars(rows, { fmt = fmtNum, color = () => 'var(--c-bar)', pct = false } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const total = sumBy(rows, (r) => r.value) || 1;
  return `<div class="hbars">${rows.map((r) => `<div class="hb" ${tipAttr(r.label, [[r.hint || 'Wert', r.value, r.key]])}>
    <span class="hb-l">${esc(r.label)}</span>
    <span class="hb-track"><span style="width:${(r.value / max) * 100}%;background:${color(r)}"></span></span>
    <span class="hb-v">${fmt(r.value)}${pct ? ` <span class="muted">${fmtPct(r.value / total)}</span>` : ''}</span></div>`).join('')}</div>`;
}

const fmtDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const legend = (keys) => `<div class="legend">${keys.map((c) => `<span><i style="background:${chanColor(c)}"></i>${CH[c]}</span>`).join('')}</div>`;

function delta(cur, prev) {
  if (cur == null || prev == null || (!prev && !cur)) return '<span class="muted">kein Vergleich</span>';
  // Bei kleinen Zahlen (unter 20) wäre ein Prozentwert irreführend, dann die Differenz
  if (prev < 20 && Number.isInteger(prev) && Number.isInteger(cur)) {
    const diff = cur - prev;
    return `<span class="dl ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fmtNum(Math.abs(diff))}</span> <span class="muted">zum Vorzeitraum (${fmtNum(prev)})</span>`;
  }
  if (!prev) return '<span class="muted">kein Vergleich</span>';
  const d = (cur - prev) / prev;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
  return `<span class="dl ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${sign}${Math.abs(d * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} %</span> <span class="muted">zum Vorzeitraum</span>`;
}

function viewZahlen() {
  const D = zData();
  const items = publishedItems();
  const has = S.metrics.length > 0 || items.length > 0;
  if (!has) {
    main.innerHTML = `<div class="head"><h1>Zahlen</h1><p>Reichweite, Follower und Interaktionen über alle Plattformen. Claude holt die Werte jeden Morgen.</p></div>
      <div class="card empty"><h2>Noch keine Zahlen</h2><p style="margin-top:10px">Sobald die Konten verbunden und die ersten Posts veröffentlicht sind, erscheinen hier Follower, Reichweite und Interaktionen.</p></div>`;
    return;
  }
  const N = Z.range;
  const end = addDays(berlinDay(), -1); // gestern: letzter vollständiger Tag
  const dates = Array.from({ length: N }, (_, i) => addDays(end, i - N + 1));
  const prevDates = dates.map((d) => addDays(d, -N));
  const inRange = (it, ds) => { const d = berlinDay(new Date(it.at)); return d >= ds[0] && d <= ds.at(-1); };
  const cur = items.filter((it) => inRange(it, dates));
  const prev = items.filter((it) => inRange(it, prevDates));
  const sumDay = (ds, f, chans = CHANNEL_KEYS) => {
    let s = 0, any = false;
    for (const d of ds) for (const c of chans) { const v = D.day(d, c, f); if (v != null) { s += v; any = true; } }
    return any ? s : null;
  };
  // Zuwachs nur für Kanäle, die zu Beginn des Zeitraums schon gemessen wurden
  let growth = null;
  for (const c of CHANNEL_KEYS) {
    const vals = dates.map((d) => D.followers(d, c)).filter((v) => v != null);
    if (vals.length >= 2) growth = (growth || 0) + vals.at(-1) - vals[0];
  }
  const totalFollowers = sumBy(CHANNEL_KEYS, (c) => D.lastFollowers(c));
  const reachCur = sumDay(dates, 'reach'), reachPrev = sumDay(prevDates, 'reach');
  const postReach = sumBy(cur, (it) => it.reach);
  const intCur = sumBy(cur, (it) => it.interactions), intPrev = sumBy(prev, (it) => it.interactions);
  const visits = (ds) => { const a = sumDay(ds, 'page_views'), b = sumDay(ds, 'profile_views'); return a == null && b == null ? null : (a || 0) + (b || 0); };
  const rate = postReach ? intCur / postReach : null;
  const prevReach = sumBy(prev, (it) => it.reach);
  const missing = Object.entries(D.meta?.missing || {}).flatMap(([, list]) => list).filter((m, i, a) => a.indexOf(m) === i && MISSING_TEXT[m]);

  // Kanal-Reihen für das Balkendiagramm
  const metric = DAY_METRICS[Z.metric] ? Z.metric : 'reach';
  const series = CHANNEL_KEYS.map((c) => ({
    key: c, label: CH[c],
    values: dates.map((d) => (metric === 'page_views' ? (D.day(d, c, 'page_views') ?? 0) + (D.day(d, c, 'profile_views') ?? 0) : D.day(d, c, metric) ?? 0)),
  }));
  const shares = series.map((s) => ({ key: s.key, label: s.label, value: sumBy(s.values, (v) => v), hint: DAY_METRICS[metric][0] }));
  const anyMetric = shares.some((s) => s.value > 0);
  const fSeries = CHANNEL_KEYS.map((c) => ({ key: c, label: CH[c], values: dates.map((d) => D.followers(d, c) ?? null) })).filter((s) => s.values.some((v) => v != null));

  main.innerHTML = `
    <div class="head"><h1>Zahlen</h1><p>Reichweite, Follower und Interaktionen über alle Plattformen. Claude holt die Werte jeden Morgen um 6:22 Uhr${D.meta?.fetched_at ? `, zuletzt am ${fmtDate(D.meta.fetched_at)}` : ''}.</p></div>
    ${missing.length ? `<div class="notice">${missing.map((m) => `<p class="small" style="margin:0 0 4px">${esc(MISSING_TEXT[m])}</p>`).join('')}</div>` : ''}
    <div class="filters" role="group" aria-label="Zeitraum">${RANGES.map(([n, l]) => `<button class="tab ${n === N ? 'on' : ''}" data-range="${n}" type="button">${l}</button>`).join('')}
      <span class="muted small">${shortDate(dates[0])} bis ${shortDate(end)}</span></div>

    <section class="section grid zk">
      ${kpi('Reichweite', reachCur, delta(reachCur, reachPrev), 'Erreichte Personen, Summe der Tage')}
      ${kpi('Interaktionen', intCur, delta(intCur, intPrev), 'Likes, Kommentare, Teilen, Speichern')}
      ${kpi('Interaktions\u00adrate', rate, delta(rate, prevReach ? intPrev / prevReach : null), 'Interaktionen je erreichter Person', fmtPct)}
      ${kpi('Follower gesamt', totalFollowers, growth != null ? `<span class="dl ${growth > 0 ? 'up' : growth < 0 ? 'down' : ''}">${growth > 0 ? '+' : growth < 0 ? '−' : '±'}${fmtNum(Math.abs(growth))}</span> <span class="muted">im Zeitraum</span>` : '<span class="muted">Verlauf ab dem zweiten Messtag</span>', 'Alle Plattformen zusammen')}
      ${kpi('Seitenbesuche', visits(dates), delta(visits(dates), visits(prevDates)), 'Facebook-Seite und Instagram-Profil')}
      ${kpi('Posts', cur.length ? new Set(cur.map((i) => i.id)).size : 0, `<span class="muted">${cur.length} Veröffentlichungen auf allen Kanälen</span>`, 'Im Zeitraum veröffentlicht')}
    </section>

    <section class="section card">
      <div class="row spread"><div><h2>Über die Plattformen</h2><p class="muted small" style="margin-top:6px">${esc(DAY_METRICS[metric][1])}, je Tag und Plattform</p></div>
        <div class="tabs" role="group" aria-label="Kennzahl">${Object.entries(DAY_METRICS).map(([k, [l]]) => `<button class="tab ${k === metric ? 'on' : ''}" data-metric="${k}" type="button">${l}</button>`).join('')}</div></div>
      ${anyMetric ? `<div class="zsplit"><div style="min-width:0">${legend(CHANNEL_KEYS)}${stackedBars(dates, series, `${DAY_METRICS[metric][0]} je Tag nach Plattform`)}</div>
        <div><h3 style="margin-bottom:12px">Anteil je Plattform</h3>${hBars(shares, { color: (r) => chanColor(r.key), pct: true })}</div></div>`
        : `<p class="muted" style="margin-top:16px">Für ${esc(DAY_METRICS[metric][0])} liegen im Zeitraum noch keine Tageswerte vor.</p>`}
    </section>

    <section class="section grid g2">
      <div class="card"><h2>Follower</h2><p class="muted small" style="margin-top:6px">Verlauf je Plattform</p>${fSeries.length ? legend(fSeries.map((s) => s.key)) + multiLine(dates, fSeries, 'Follower je Plattform') : '<p class="muted">Noch keine Werte.</p>'}</div>
      ${timesCard(D, items)}
    </section>

    <section class="section"><h2>Plattformen im Detail</h2><div class="grid g3">${CHANNEL_KEYS.map((c) => channelCard(c, D, dates, prevDates, cur)).join('')}</div></section>

    ${topPosts(cur.length ? cur : items, cur.length ? '' : ' (alle Zeiträume)')}

    ${themesCard(items)}

    ${audienceCard(D.audience)}

    ${postTable(items)}

    <details class="card"><summary>Tageswerte als Tabelle</summary>${dayTable(D, dates)}</details>`;

  bindZahlen();
}

function kpi(label, value, deltaHtml, hint, fmt = fmtNum) {
  return `<div class="card kpi"><span class="label">${esc(label)}</span><div class="num">${value == null ? 'k. A.' : fmt(value)}</div>
    <div class="delta">${deltaHtml}</div><div class="hint">${esc(hint)}</div></div>`;
}

function channelCard(c, D, dates, prevDates, cur) {
  const sum = (ds, f) => { let s = null; for (const d of ds) { const v = D.day(d, c, f); if (v != null) s = (s || 0) + v; } return s; };
  const posts = cur.filter((i) => i.channel === c);
  const missing = D.meta?.missing?.[c] || [];
  const rows = [
    ['Follower', D.lastFollowers(c)],
    ['Neue Follower', sum(dates, 'new_follows')],
    ['Reichweite', sum(dates, 'reach')],
    ['Aufrufe', sum(dates, 'views')],
    [c === 'instagram' ? 'Profilaufrufe' : 'Seitenbesuche', sum(dates, c === 'instagram' ? 'profile_views' : 'page_views')],
    ['Klicks', c === 'instagram' ? sum(dates, 'website_clicks') : c === 'facebook' ? sumBy(posts, (p) => p.clicks) : sum(dates, 'clicks')],
    ['Interaktionen (Posts)', sumBy(posts, (p) => p.interactions)],
    ['Posts', posts.length],
    ['Ø Reichweite je Post', posts.some((p) => p.reach != null) ? Math.round(sumBy(posts, (p) => p.reach) / posts.length) : null],
  ];
  return `<div class="card zch"><h3><i style="background:${chanColor(c)}"></i>${CH[c]}</h3>
    <dl>${rows.map(([l, v]) => `<dt>${l}</dt><dd>${v == null ? '<span class="muted">k. A.</span>' : fmtNum(v)}</dd>`).join('')}</dl>
    ${missing.length ? `<p class="muted small" style="margin:10px 0 0">${missing.includes('organization') ? 'Wartet auf die Freigabe der Unternehmensseite.' : missing.includes('instagram_manage_insights') ? 'Reichweite und Aufrufe fehlen: Recht instagram_manage_insights nachreichen.' : 'Einige Werte fehlen wegen fehlender Rechte.'}</p>` : ''}</div>`;
}

// Beste Zeit: Instagram-Follower online je Stunde, sonst eigene Posts nach Uhrzeit
function timesCard(D, items) {
  const hours = D.audience?.online_hours;
  const H = Array.from({ length: 14 }, (_, i) => i + 7); // 7 bis 20 Uhr
  const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const cell = {};
  for (const it of items) {
    const d = new Date(it.at);
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }).format(d));
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(d));
    const k = `${wd}-${h}`;
    (cell[k] ||= []).push(it);
  }
  const vals = Object.values(cell).map((l) => sumBy(l, (i) => i.interactions) / l.length);
  const max = Math.max(...vals, 1);
  const grid = `<div class="heat" role="table" aria-label="Interaktionen je Post nach Wochentag und Uhrzeit">
    <div class="hrow" role="row"><span></span>${H.map((h) => `<span class="hh" role="columnheader">${h % 2 ? '' : h}</span>`).join('')}</div>
    ${DAYS.map((dn, wd) => `<div class="hrow" role="row"><span class="hd" role="rowheader">${dn}</span>${H.map((h) => {
      const l = cell[`${wd}-${h}`];
      if (!l) return '<span class="hc" role="cell"></span>';
      const avg = sumBy(l, (i) => i.interactions) / l.length;
      return `<span class="hc on" role="cell" style="--a:${Math.round(25 + (avg / max) * 75)}%" ${tipAttr(`${dn} ${h} Uhr`, [['Ø Interaktionen', Math.round(avg * 10) / 10], ['Veröffentlichungen', l.length]])}></span>`;
    }).join('')}</div>`).join('')}</div>`;
  const online = hours ? (() => {
    const mx = Math.max(...hours, 1);
    const best = hours.map((v, h) => [v, h]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, h]) => `${h} Uhr`).join(', ');
    return `<h3 style="margin:4px 0 10px">Instagram-Follower online</h3>
      <div class="hours">${hours.map((v, h) => `<span class="hbar" ${tipAttr(`${h} bis ${h + 1} Uhr`, [['Follower online', v]])}><span style="height:${(v / mx) * 100}%"></span></span>`).join('')}</div>
      <div class="hours-x"><span>0</span><span>6</span><span>12</span><span>18</span><span>23 Uhr</span></div>
      <p class="small" style="margin-top:10px">Am meisten online: <strong>${best}</strong></p>`;
  })() : '';
  return `<div class="card"><h2>Beste Zeit zum Posten</h2>
    <p class="muted small" style="margin-top:6px">${hours ? 'Wann Ihre Follower online sind und wie Ihre Posts nach Uhrzeit abschneiden.' : 'Ø Interaktionen je Post nach Wochentag und Uhrzeit (Berliner Zeit). Je dunkler, desto besser.'}</p>
    ${online}
    <h3 style="margin:${hours ? 18 : 12}px 0 10px">Ihre Posts nach Uhrzeit</h3>${grid}
    <p class="muted small" style="margin-top:10px">${items.length < 12 ? `Erst ${items.length} Veröffentlichungen: für belastbare Aussagen braucht es etwa zwei Quartale. Dann passen wir die Postingzeiten an.` : 'Geplante Anpassung der Postingzeiten nach etwa zwei Quartalen.'}</p></div>`;
}

function topPosts(items, note) {
  const byPost = {};
  for (const it of items) {
    const p = (byPost[it.id] ||= { id: it.id, title: it.title, image: it.image, at: it.at, pillar: it.pillar, format: it.format, ch: {}, interactions: 0, reach: 0 });
    p.ch[it.channel] = it;
    p.interactions += it.interactions;
    p.reach += it.reach || 0;
  }
  const list = Object.values(byPost).sort((a, b) => b.interactions - a.interactions || b.reach - a.reach).slice(0, 5);
  if (!list.length) return '';
  return `<section class="section"><h2>Top-Posts${note}</h2><div class="grid">${list.map((p, i) => `
    <div class="card top"><span class="rank">${i + 1}</span>${p.image ? `<img src="${esc(blobUrl(p.image))}" alt="" loading="lazy">` : '<div class="noimg"></div>'}
      <div style="min-width:0"><strong>${esc(p.title)}</strong><p class="muted small" style="margin:2px 0 8px">${fmtDate(p.at)} · ${esc(p.pillar)} · ${esc(p.format)}</p>
        <div class="row" style="gap:18px;flex-wrap:wrap">${Object.values(p.ch).map((it) => `<span class="small"><i class="dot" style="background:${chanColor(it.channel)}"></i>${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${CH[it.channel]}</a>` : CH[it.channel]}: <strong>${fmtNum(it.interactions)}</strong> Interaktionen${it.reach != null ? `, ${fmtNum(it.reach)} erreicht` : ''}${it.views != null ? `, ${fmtNum(it.views)} Aufrufe` : ''}</span>`).join('')}</div></div>
      <div class="topnum"><span class="num">${fmtNum(p.interactions)}</span><span class="muted small">Interaktionen</span></div></div>`).join('')}</div></section>`;
}

function themesCard(items) {
  if (!items.length) return '';
  const group = (key) => {
    const g = {};
    for (const it of items) (g[it[key]] ||= { label: it[key], n: new Set(), int: 0 }).int += it.interactions, g[it[key]].n.add(it.id);
    return Object.values(g).map((x) => ({ label: `${x.label} (${x.n.size})`, value: Math.round((x.int / x.n.size) * 10) / 10, hint: 'Ø Interaktionen je Post' })).sort((a, b) => b.value - a.value);
  };
  const fmt1 = (v) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return `<section class="section grid g2">
    <div class="card"><h2>Themen</h2><p class="muted small" style="margin:6px 0 14px">Ø Interaktionen je Post nach Themen-Säule (Anzahl Posts)</p>${hBars(group('pillar'), { fmt: fmt1 })}</div>
    <div class="card"><h2>Formate</h2><p class="muted small" style="margin:6px 0 14px">Ø Interaktionen je Post nach Format (Anzahl Posts)</p>${hBars(group('format'), { fmt: fmt1 })}</div>
  </section>`;
}

function audienceCard(a) {
  const demo = a?.demographics;
  const box = (title, rows) => `<div><h3 style="margin-bottom:10px">${title}</h3>${hBars(rows.slice(0, 6).map((r) => ({ ...r, hint: 'Follower' })), { pct: true })}</div>`;
  const GENDER = { F: 'Frauen', M: 'Männer', U: 'Ohne Angabe' };
  return `<section class="section card"><h2>Zielgruppe Instagram</h2>
    ${demo ? `<div class="grid g3" style="margin-top:16px">
      ${demo.city ? box('Städte', demo.city) : ''}${demo.age ? box('Alter', [...demo.age].sort((x, y) => x.label.localeCompare(y.label))) : ''}${demo.gender ? box('Geschlecht', demo.gender.map((g) => ({ ...g, label: GENDER[g.label] || g.label }))) : ''}${demo.country ? box('Länder', demo.country) : ''}</div>`
      : `<p class="muted" style="margin-top:10px">Städte, Alter und Geschlecht der Follower zeigt Instagram erst ab 100 Followern und mit dem Recht instagram_manage_insights.</p>`}
  </section>`;
}

const COLS = [
  ['title', 'Post', false], ['at', 'Datum', false], ['channel', 'Kanal', false], ['views', 'Aufrufe', true], ['reach', 'Reichweite', true],
  ['likes', 'Likes', true], ['comments', 'Komm.', true], ['shares', 'Geteilt', true], ['saves', 'Gesp.', true], ['clicks', 'Klicks', true],
  ['interactions', 'Interakt.', true], ['rate', 'Rate', true],
];
function postTable(items) {
  if (!items.length) return '';
  const rows = items.map((it) => ({ ...it, rate: it.reach ? it.interactions / it.reach : null }));
  const k = COLS.some((c) => c[0] === Z.sort) ? Z.sort : 'at';
  rows.sort((a, b) => {
    const x = a[k] ?? -Infinity, y = b[k] ?? -Infinity;
    return (x > y ? 1 : x < y ? -1 : 0) * Z.dir;
  });
  const more = rows.length > 12 && !Z.all;
  return `<section class="section"><h2>Alle Posts</h2><div class="card tablewrap"><table class="ztable">
    <thead><tr>${COLS.map(([key, l, n]) => `<th class="${n ? 'n' : ''}" aria-sort="${key === k ? (Z.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${key}">${l}${key === k ? (Z.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead>
    <tbody>${(more ? rows.slice(0, 12) : rows).map((r) => `<tr><td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : esc(r.title)}</td><td>${new Date(r.at).toLocaleDateString('de-DE')}</td>
      <td><i class="dot" style="background:${chanColor(r.channel)}"></i>${CH[r.channel]}</td>
      ${COLS.slice(3).map(([key]) => `<td class="n">${r[key] == null ? '<span class="muted">k. A.</span>' : key === 'rate' ? fmtPct(r[key]) : fmtNum(r[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${rows.length > 12 ? `<p style="margin:14px 0 0"><button class="btn small ghost" type="button" data-all>${more ? `Alle ${rows.length} Einträge anzeigen` : 'Weniger anzeigen'}</button></p>` : ''}</div></section>`;
}

function dayTable(D, dates) {
  const f = ['followers', 'new_follows', 'reach', 'views', 'engagements', 'page_views'];
  const L = { followers: 'Follower', new_follows: 'Neu', reach: 'Reichw.', views: 'Aufrufe', engagements: 'Interakt.', page_views: 'Besuche' };
  return `<div class="tablewrap" style="margin-top:14px"><table><thead><tr><th>Tag</th><th>Kanal</th>${f.map((k) => `<th class="n">${L[k]}</th>`).join('')}</tr></thead><tbody>
    ${[...dates].reverse().flatMap((d) => CHANNEL_KEYS.filter((c) => D.byDay[d]?.[c]?.day || D.byDay[d]?.[c]?.account).map((c) => `<tr><td>${shortDate(d)}</td><td>${CH[c]}</td>${f.map((k) => {
      const v = k === 'followers' ? D.followers(d, c) : k === 'page_views' ? D.day(d, c, 'page_views') ?? D.day(d, c, 'profile_views') : D.day(d, c, k);
      return `<td class="n">${v == null ? '' : fmtNum(v)}</td>`;
    }).join('')}</tr>`)).join('') || '<tr><td colspan="8" class="muted">Keine Tageswerte im Zeitraum.</td></tr>'}</tbody></table></div>`;
}

// Tooltip: ein Element fuer alle Diagramme, Inhalte nur ueber textContent
function zTip() {
  let t = document.getElementById('ztip');
  if (!t) {
    t = document.createElement('div');
    t.id = 'ztip';
    t.className = 'ztip';
    t.setAttribute('role', 'tooltip');
    document.body.appendChild(t);
  }
  return t;
}
function showTip(el, x, y) {
  let data;
  try { data = JSON.parse(el.dataset.tip); } catch { return; }
  const t = zTip();
  t.replaceChildren();
  const h = document.createElement('div');
  h.className = 'tt';
  h.textContent = data.title;
  t.appendChild(h);
  for (const [label, value, key] of data.rows) {
    const r = document.createElement('div');
    r.className = 'tr';
    if (key && CH[key]) { const k = document.createElement('i'); k.style.background = chanColor(key); r.appendChild(k); }
    const v = document.createElement('strong');
    v.textContent = value == null ? 'k. A.' : typeof value === 'number' ? value.toLocaleString('de-DE') : value;
    const l = document.createElement('span');
    l.textContent = label;
    r.append(v, l);
    t.appendChild(r);
  }
  t.classList.add('show');
  const w = t.offsetWidth, hh = t.offsetHeight;
  t.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 14)) + 'px';
  t.style.top = Math.max(8, y - hh - 12) + 'px';
}
const hideTip = () => document.getElementById('ztip')?.classList.remove('show');

function bindZahlen() {
  main.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => { Z.range = Number(b.dataset.range); saveZ(); viewZahlen(); }));
  main.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () => { Z.metric = b.dataset.metric; saveZ(); viewZahlen(); }));
  main.querySelector('[data-all]')?.addEventListener('click', () => { Z.all = !Z.all; viewZahlen(); });
  main.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sort;
    Z.dir = Z.sort === k ? -Z.dir : -1;
    Z.sort = k;
    viewZahlen();
  }));
  main.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('pointermove', (e) => showTip(el, e.clientX, e.clientY));
    el.addEventListener('pointerleave', hideTip);
    el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top); });
    el.addEventListener('blur', hideTip);
  });
}
