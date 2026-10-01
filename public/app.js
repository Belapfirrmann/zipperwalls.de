// Zipperwalls Social Media Dashboard (ohne Build-Schritt, reines ES-Modul)
const main = document.getElementById('main');
const CH = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };
const LIMITS = { facebook: 63000, instagram: 2200, linkedin: 3000 };
const STATUS = {
  draft: ['Entwurf', ''],
  approved: ['Freigegeben', 'dark'],
  scheduled: ['Geplant', 'dark'],
  publishing: ['Wird gepostet', 'dark'],
  published: ['Veröffentlicht', 'grey'],
  partial: ['Teilweise', ''],
  failed: ['Fehlgeschlagen', ''],
  rejected: ['Abgelehnt', 'grey'],
};
const PILLAR_COLORS = ['#FFCC20', '#1F2725', '#808285', '#EFB800', '#4B4F58', '#C9CCD0'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const fmtNum = (n) => Number(n || 0).toLocaleString('de-DE');
const toLocalInput = (iso) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 4500);
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...(opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

// ---------- Plan ----------
async function viewPlan() {
  const plan = await api('/api/plan');
  const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const on = new Set(plan.rhythm?.days || []);
  const pillars = plan.pillars || [];
  const total = pillars.reduce((s, p) => s + (p.share || 0), 0) || 1;
  main.innerHTML = `
    <div class="head"><span class="label">Stand ${esc(plan.stand || '')}</span><h1>${esc(plan.title)}</h1></div>
    ${plan.placeholder ? `<div class="notice"><strong>Platzhalter.</strong> Das ist eine Beispielstruktur. Sobald Sie Ihren Social Media Plan im Chat einfügen, wird er hier eingesetzt.</div>` : ''}
    <section class="section"><h2>Ziele</h2>
      <div class="grid g3">${(plan.goals || []).map((g, i) => `<div class="card">${i === 0 ? '<span class="badge">Hauptziel</span>' : '<span class="label">Ziel ' + (i + 1) + '</span>'}<h3 style="margin:12px 0 8px">${esc(g.title)}</h3><p>${esc(g.text)}</p></div>`).join('')}</div>
    </section>
    <section class="section grid g2">
      <div class="card"><h2>Rhythmus</h2>
        <p style="margin-top:10px"><strong>${esc(plan.rhythm?.postsPerWeek)} Posts pro Woche</strong>, jeweils ${esc(plan.rhythm?.time || '')} Uhr</p>
        <div class="week">${days.map((d) => `<div class="${on.has(d) ? 'on' : ''}" title="${d}">${d.slice(0, 2)}</div>`).join('')}</div>
        <p style="margin-top:14px;color:var(--grau)">${esc(plan.rhythm?.approval || '')}</p>
      </div>
      <div class="card"><h2>Content Säulen</h2>
        <div class="pillars" role="img" aria-label="Anteile der Content Säulen">${pillars.map((p, i) => `<div style="width:${(p.share / total) * 100}%;background:${PILLAR_COLORS[i % 6]};color:${i % 6 === 0 || i % 6 === 3 || i % 6 === 5 ? '#1D1D1B' : '#fff'}">${p.share}%</div>`).join('')}</div>
        <div class="pillar-legend">${pillars.map((p, i) => `<div><span class="swatch" style="background:${PILLAR_COLORS[i % 6]}"></span><span><strong>${esc(p.name)}</strong> ${esc(p.text || '')}</span></div>`).join('')}</div>
      </div>
    </section>
    <section class="section"><h2>Kanäle</h2>
      <div class="grid g3">${(plan.channels || []).map((c) => `<div class="card"><h3>${esc(c.name)}</h3><p style="margin-top:8px">${esc(c.role)}</p><span class="label">${esc(c.frequency || '')}</span></div>`).join('')}</div>
    </section>
    <section class="section"><h2>Fahrplan</h2>
      <div class="card"><div class="timeline">${(plan.phases || []).map((ph) => `<div class="phase"><span class="label">${esc(ph.period)}</span><h3 style="margin-top:6px">${esc(ph.name)}</h3><ul>${(ph.items || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div></div>
    </section>
    <section class="section"><h2>Zielwerte</h2>
      <div class="card tablewrap"><table><thead><tr><th>Kennzahl</th><th class="n">Ziel</th></tr></thead><tbody>${(plan.kpis || []).map((k) => `<tr><td>${esc(k.name)}</td><td class="n"><strong>${esc(k.target)}</strong></td></tr>`).join('')}</tbody></table></div>
    </section>`;
}

// ---------- Freigabe ----------
let filter = 'offen';
async function viewFreigabe() {
  const [posts, conn] = await Promise.all([api('/api/posts'), api('/api/connections')]);
  const connected = new Set(conn.connections.filter((c) => c.connected).map((c) => c.channel));
  const groups = {
    offen: posts.filter((p) => ['draft', 'failed', 'partial'].includes(p.status)),
    geplant: posts.filter((p) => ['approved', 'scheduled', 'publishing'].includes(p.status)),
    erledigt: posts.filter((p) => ['published', 'rejected'].includes(p.status)),
  };
  updateCount(groups.offen.length);
  const list = groups[filter];
  main.innerHTML = `
    <div class="head"><h1>Freigabe</h1><p>Der Agent liefert zweimal pro Woche einen Entwurf. Prüfen, bei Bedarf anpassen und mit „Jetzt posten“ veröffentlichen oder für später planen.</p></div>
    ${connected.size === 0 ? `<div class="notice">Noch kein Kanal verbunden. Posten ist erst möglich, wenn unter <a href="#verbindungen">Verbindungen</a> mindestens ein Netzwerk verbunden ist.</div>` : ''}
    <div class="row" style="margin-bottom:22px">
      ${['offen', 'geplant', 'erledigt'].map((k) => `<button class="btn small ${filter === k ? 'dark' : 'ghost'}" data-filter="${k}">${k[0].toUpperCase() + k.slice(1)} (${groups[k].length})</button>`).join('')}
    </div>
    <div id="posts">${list.length ? list.map((p) => postCard(p, connected)).join('') : `<div class="card empty">${filter === 'offen' ? 'Keine offenen Entwürfe. Der nächste kommt vom Agent.' : 'Nichts vorhanden.'}</div>`}</div>`;
  main.querySelectorAll('[data-filter]').forEach((b) => (b.onclick = () => { filter = b.dataset.filter; viewFreigabe(); }));
  main.querySelectorAll('.post').forEach((el) => bindPost(el, posts.find((p) => p.id === el.dataset.id)));
}

function updateCount(n) {
  const c = document.getElementById('count-freigabe');
  c.hidden = !n;
  c.textContent = n;
}

function postCard(p, connected) {
  const [label, cls] = STATUS[p.status] || [p.status, ''];
  const editable = ['draft', 'failed', 'partial', 'scheduled', 'rejected'].includes(p.status);
  const resultFor = (c) => p.results.find((r) => r.channel === c);
  return `
  <article class="card post" data-id="${p.id}">
    <div>
      ${p.image ? `<img class="img" src="${esc(p.image)}" alt="Bild zum Post">` : `<div class="img">Kein Bild</div>`}
      ${editable ? `<label class="btn ghost small" style="margin-top:10px">Bild tauschen<input type="file" accept="image/jpeg,image/png" data-act="image" hidden></label>` : ''}
      <p style="margin-top:12px;font-size:14px;color:var(--grau)">Erstellt ${fmtDate(p.created_at)}${p.approved_by ? `<br>Freigegeben von ${esc(p.approved_by)}` : ''}${p.scheduled_at && p.status !== 'draft' ? `<br>Termin ${fmtDate(p.scheduled_at)}` : ''}</p>
    </div>
    <div>
      <div class="row" style="justify-content:space-between;margin-bottom:12px"><span class="badge ${cls}">${label}</span></div>
      ${p.notes ? `<p style="color:var(--grau);font-size:15px"><strong>Hinweis vom Agent:</strong> ${esc(p.notes)}</p>` : ''}
      <div class="field"><span class="label">Titel (intern)</span><input type="text" data-f="title" value="${esc(p.title)}" ${editable ? '' : 'disabled'}></div>
      <div class="field"><span class="label">Text</span><textarea data-f="body" ${editable ? '' : 'disabled'}>${esc(p.body)}</textarea></div>
      <div class="field"><span class="label">Hashtags (mit Leerzeichen getrennt)</span><input type="text" data-f="hashtags" value="${esc(p.hashtags.join(' '))}" ${editable ? '' : 'disabled'}></div>
      <details><summary>Vorschau je Kanal</summary>
        ${Object.keys(CH).map((c) => `<div style="margin-top:12px"><span class="label">${CH[c]}</span><div class="counter ${p.preview[c].length > LIMITS[c] ? 'over' : ''}">${p.preview[c].length} / ${LIMITS[c]} Zeichen</div><div style="white-space:pre-wrap;background:var(--hg-blau);padding:12px;font-size:15px">${esc(p.preview[c])}</div></div>`).join('')}
      </details>
      <div class="row" style="margin-bottom:14px">
        ${Object.keys(CH).map((c) => {
          const r = resultFor(c);
          const ok = r?.status === 'ok';
          return `<label class="chan"><input type="checkbox" data-ch="${c}" ${p.channels.includes(c) ? 'checked' : ''} ${editable && !ok ? '' : 'disabled'}> ${CH[c]}${!connected.has(c) ? ' <span class="badge grey" style="font-size:10px">nicht verbunden</span>' : ''}</label>`;
        }).join('')}
      </div>
      ${p.results.length ? `<div class="results">${p.results.map((r) => r.status === 'ok' ? `<div>✓ ${CH[r.channel]}: veröffentlicht ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">ansehen</a>` : ''}</div>` : `<div class="err"><strong>${CH[r.channel]}:</strong> ${esc(r.error)}</div>`).join('')}</div>` : ''}
      ${editable ? `
      <div class="row" style="margin-top:16px">
        <button class="btn" data-act="now">${['failed', 'partial'].includes(p.status) ? 'Erneut posten' : 'Jetzt posten'}</button>
        <input type="datetime-local" data-f="when" value="${toLocalInput(p.scheduled_at)}" style="width:auto">
        <button class="btn dark" data-act="schedule">Planen</button>
        <button class="btn ghost" data-act="save">Speichern</button>
        ${['draft', 'scheduled'].includes(p.status) ? `<button class="btn ghost" data-act="reject">Ablehnen</button>` : ''}
      </div>` : ''}
    </div>
  </article>`;
}

function bindPost(el, p) {
  const val = (f) => el.querySelector(`[data-f="${f}"]`)?.value;
  const collect = () => ({
    title: val('title'),
    body: val('body'),
    hashtags: (val('hashtags') || '').split(/[\s,]+/).filter(Boolean),
    channels: [...el.querySelectorAll('[data-ch]:checked')].map((x) => x.dataset.ch),
  });
  const run = async (btn, fn) => {
    el.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await fn();
    } catch (e) {
      toast(e.message);
    }
    viewFreigabe();
  };
  el.querySelectorAll('[data-act]').forEach((btn) => {
    const act = btn.dataset.act;
    if (act === 'image') {
      btn.onchange = () => run(btn, async () => {
        const file = btn.files[0];
        if (!file) return;
        await api(`/api/posts/${p.id}/image`, { method: 'POST', body: file, headers: { 'Content-Type': file.type } });
        toast('Bild gespeichert.');
      });
      return;
    }
    btn.onclick = () => run(btn, async () => {
      if (act === 'reject') {
        if (!confirm('Diesen Entwurf ablehnen?')) return;
        await api(`/api/posts/${p.id}/reject`, { method: 'POST' });
        return toast('Entwurf abgelehnt.');
      }
      const data = collect();
      if (!data.channels.length && act !== 'save') throw new Error('Bitte mindestens einen Kanal wählen.');
      await api(`/api/posts/${p.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      if (act === 'save') return toast('Gespeichert.');
      if (act === 'now') {
        const names = data.channels.map((c) => CH[c]).join(', ');
        if (!confirm(`Jetzt auf ${names} veröffentlichen?`)) return;
        await api(`/api/posts/${p.id}/approve`, { method: 'POST', body: JSON.stringify({ mode: 'now' }) });
        toast('Wird veröffentlicht. Status aktualisiert sich gleich.');
        setTimeout(() => location.hash === '#freigabe' && viewFreigabe(), 6000);
      }
      if (act === 'schedule') {
        const when = new Date(val('when'));
        if (Number.isNaN(when.getTime()) || when < new Date()) throw new Error('Bitte einen Zeitpunkt in der Zukunft wählen.');
        await api(`/api/posts/${p.id}/approve`, { method: 'POST', body: JSON.stringify({ mode: 'schedule', scheduled_at: when.toISOString() }) });
        toast(`Geplant für ${fmtDate(when.toISOString())}.`);
      }
    });
  });
}

// ---------- Abhakeliste ----------
let week = null;
function shiftWeek(w, d) {
  const [y, n] = w.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (n - 1 + d) * 7 * 86400000);
  const t = new Date(monday.getTime() + 3 * 86400000);
  const ys = Date.UTC(t.getUTCFullYear(), 0, 1);
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - ys) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
async function viewCheckliste() {
  const data = await api('/api/checklist' + (week ? `?week=${week}` : ''));
  week = data.week;
  const weekly = data.items.filter((i) => i.kind === 'weekly');
  const setup = data.items.filter((i) => i.kind === 'setup');
  const block = (items) => items.map((i) => `
    <label class="check ${i.done ? 'done' : ''}"><input type="checkbox" data-id="${i.id}" ${i.done ? 'checked' : ''}><span class="box"></span>
    <span><span class="t">${esc(i.label)}</span>${i.done ? `<small>erledigt von ${esc(i.done_by)} · ${fmtDate(i.done_at)}</small>` : ''}</span></label>`).join('');
  const pct = (items) => Math.round((items.filter((i) => i.done).length / (items.length || 1)) * 100);
  main.innerHTML = `
    <div class="head"><h1>Abhakeliste</h1><p>Wöchentliche Aufgaben und die einmalige Einrichtung. Häkchen sind für Bela und Darien gemeinsam sichtbar.</p></div>
    <div class="grid g2">
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2>Woche ${esc(week.split('-W')[1])}</h2>
          <div class="row"><button class="btn ghost small" data-w="-1" aria-label="Vorige Woche">‹</button>${week !== data.currentWeek ? `<button class="btn ghost small" data-w="0">Heute</button>` : ''}<button class="btn ghost small" data-w="1" aria-label="Nächste Woche">›</button></div></div>
        <div class="progress"><div style="width:${pct(weekly)}%"></div></div><span class="label">${pct(weekly)} % erledigt</span>
        <div style="margin-top:8px">${block(weekly)}</div>
      </section>
      <section class="card">
        <h2>Einrichtung</h2>
        <div class="progress"><div style="width:${pct(setup)}%"></div></div><span class="label">${pct(setup)} % erledigt</span>
        <div style="margin-top:8px">${block(setup)}</div>
      </section>
    </div>`;
  main.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { week = b.dataset.w === '0' ? data.currentWeek : shiftWeek(week, Number(b.dataset.w)); viewCheckliste(); }));
  main.querySelectorAll('.check input').forEach((cb) => (cb.onchange = async () => {
    try { await api(`/api/checklist/${cb.dataset.id}/toggle`, { method: 'POST' }); } catch (e) { toast(e.message); }
    viewCheckliste();
  }));
}

// ---------- Zahlen ----------
function lineChart(points) {
  if (points.length < 2) return `<p style="color:var(--grau)">Verlauf erscheint ab dem zweiten Messtag.</p>`;
  const W = 520, H = 160, P = 28;
  const ys = points.map((p) => p.value);
  const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v) => H - P - ((v - min) / span) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Follower Verlauf">
    <line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" stroke="#d5d8db"/>
    <path d="${d}" fill="none" stroke="#1D1D1B" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="${x(points.length - 1)}" cy="${y(last.value)}" r="5" fill="#FFCC20" stroke="#1D1D1B" stroke-width="2"/>
    <text x="${P}" y="${H - 8}">${esc(points[0].date)}</text><text x="${W - P}" y="${H - 8}" text-anchor="end">${esc(last.date)}</text>
  </svg>`;
}
async function viewZahlen() {
  const data = await api('/api/metrics');
  const byCh = {};
  for (const r of data.series) ((byCh[r.channel] ??= {})[r.metric] ??= []).push({ date: r.date, value: r.value });
  const has = data.series.length > 0;
  const latest = (c, m) => byCh[c]?.[m]?.at(-1)?.value;
  const first30 = (c, m) => {
    const s = byCh[c]?.[m] || [];
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    return s.find((p) => p.date >= cutoff)?.value;
  };
  const sumStats = (k) => data.posts.reduce((s, p) => s + (p.stats?.[k] || 0), 0);
  main.innerHTML = `
    <div class="head row" style="justify-content:space-between"><div><h1>Zahlen</h1><p>Follower und Interaktionen je Kanal. Werte werden täglich automatisch abgerufen.</p></div>
      <button class="btn ghost" id="refresh">Jetzt aktualisieren</button></div>
    ${!has ? `<div class="card empty"><h2>Noch keine Zahlen</h2><p style="margin-top:10px">Sobald Kanäle verbunden und die ersten Posts veröffentlicht sind, erscheinen hier Follower, Reichweite und Interaktionen.</p></div>` : `
    <section class="section grid g3">
      <div class="card kpi"><span class="label">Veröffentlichte Posts</span><div class="num">${fmtNum(new Set(data.posts.map((p) => p.id)).size)}</div></div>
      <div class="card kpi"><span class="label">Interaktionen (30 Tage)</span><div class="num">${fmtNum(sumStats('likes') + sumStats('comments') + sumStats('shares'))}</div><div class="delta">Likes, Kommentare, Teilen</div></div>
      <div class="card kpi"><span class="label">Reichweite (30 Tage)</span><div class="num">${fmtNum(sumStats('reach'))}</div><div class="delta">Instagram und LinkedIn Seite</div></div>
    </section>
    <section class="section grid g3">${Object.keys(CH).map((c) => {
      const v = latest(c, 'followers');
      const base = first30(c, 'followers');
      const delta = v != null && base != null ? v - base : null;
      return `<div class="card kpi"><span class="label">${CH[c]} Follower</span><div class="num">${v != null ? fmtNum(v) : 'k. A.'}</div>
        <div class="delta">${delta != null ? `${delta >= 0 ? '+' : ''}${fmtNum(delta)} in 30 Tagen` : c === 'linkedin' ? 'Nur mit Unternehmensseite verfügbar' : 'noch keine Daten'}</div>
        ${byCh[c]?.followers ? lineChart(byCh[c].followers) : ''}</div>`;
    }).join('')}</section>
    <section class="section"><h2>Posts</h2><div class="card tablewrap"><table>
      <thead><tr><th>Post</th><th>Kanal</th><th>Datum</th><th class="n">Reichweite</th><th class="n">Likes</th><th class="n">Komm.</th><th class="n">Geteilt</th></tr></thead>
      <tbody>${data.posts.map((p) => `<tr><td>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}</td><td>${CH[p.channel]}</td><td>${fmtDate(p.published_at)}</td>
        ${['reach', 'likes', 'comments', 'shares'].map((k) => `<td class="n">${p.stats?.[k] != null ? fmtNum(p.stats[k]) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`}`;
  document.getElementById('refresh').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await api('/api/metrics/refresh', { method: 'POST' });
      const errs = Object.entries(r).filter(([, v]) => v !== 'ok');
      toast(errs.length ? errs.map(([k, v]) => `${CH[k]}: ${v}`).join(' · ') : 'Zahlen aktualisiert.');
    } catch (err) { toast(err.message); }
    viewZahlen();
  };
}

// ---------- Verbindungen ----------
async function viewVerbindungen(params) {
  if (params?.get('ok')) toast(params.get('ok'));
  if (params?.get('fehler')) toast(params.get('fehler'));
  const { connections, providers } = await api('/api/connections');
  const info = {
    facebook: 'Postet auf Ihre Facebook Unternehmensseite.',
    instagram: 'Wird zusammen mit Facebook verbunden. Voraussetzung: Instagram Business oder Creator Konto, verknüpft mit der Facebook Seite.',
    linkedin: providers.linkedinOrg ? 'Postet auf die LinkedIn Unternehmensseite.' : 'Postet auf ein persönliches LinkedIn Profil. Für die Unternehmensseite ist eine Freigabe von LinkedIn nötig.',
  };
  main.innerHTML = `
    <div class="head"><h1>Verbindungen</h1><p>Einmalig verbinden, danach postet das Dashboard automatisch. LinkedIn muss etwa alle 60 Tage neu verbunden werden.</p></div>
    <div class="grid" style="gap:16px">${connections.map((c) => {
      const provider = c.channel === 'linkedin' ? 'linkedin' : 'meta';
      const ready = providers[provider];
      const warn = c.daysLeft != null && c.daysLeft < 10;
      return `<div class="card conn"><div><h2>${CH[c.channel]}</h2>
        <p style="margin:6px 0">${c.connected ? `<span class="badge">Verbunden</span> ${esc(c.label || '')}` : c.expired ? '<span class="badge dark">Abgelaufen</span>' : '<span class="badge grey">Nicht verbunden</span>'}</p>
        <p style="color:var(--grau);font-size:15px;max-width:60ch">${info[c.channel]}${c.daysLeft != null ? `<br>${warn ? '<strong>' : ''}Gültig noch ${c.daysLeft} Tage${warn ? '</strong>' : ''}` : ''}${!ready ? '<br><strong>App Zugangsdaten fehlen noch (siehe Einrichtung in der Abhakeliste).</strong>' : ''}</p></div>
        <div class="row">${ready ? `<a class="btn ${c.connected ? 'ghost' : ''}" href="/oauth/${provider}/start">${c.connected ? 'Neu verbinden' : 'Verbinden'}</a>` : ''}
        ${c.connected || c.expired ? `<button class="btn ghost" data-disc="${c.channel}">Trennen</button>` : ''}</div></div>`;
    }).join('')}</div>`;
  main.querySelectorAll('[data-disc]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`${CH[b.dataset.disc]} wirklich trennen?`)) return;
    await api(`/api/connections/${b.dataset.disc}/disconnect`, { method: 'POST' }).catch((e) => toast(e.message));
    viewVerbindungen();
  }));
}

// ---------- Router ----------
const views = { plan: viewPlan, freigabe: viewFreigabe, checkliste: viewCheckliste, zahlen: viewZahlen, verbindungen: viewVerbindungen };
async function route() {
  const [name, query] = location.hash.slice(1).split('?');
  const view = views[name] ? name : 'freigabe';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  main.innerHTML = '<p style="color:var(--grau)">Lädt …</p>';
  try {
    await views[view](new URLSearchParams(query || ''));
    if (query) history.replaceState(null, '', '#' + view);
  } catch (e) {
    main.innerHTML = `<div class="card empty"><h2>Fehler</h2><p style="margin-top:10px">${esc(e.message)}</p></div>`;
  }
}
window.addEventListener('hashchange', route);
api('/api/me').then((me) => (document.getElementById('who').textContent = me.email)).catch(() => {});
api('/api/posts?status=draft').then((p) => updateCount(p.length)).catch(() => {});
route();
