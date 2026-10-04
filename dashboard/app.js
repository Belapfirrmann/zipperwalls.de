// Zipperwalls Social Media Dashboard als Claude Artefakt.
// Daten liegen in der Artefakt-Datenbank (db), Bilder in den Artefakt-Assets.
// Veroeffentlicht wird nicht von hier, sondern von der Claude Routine (scripts/social.js).
// PLAN sowie composeText, findPlaceholder, normalizeHashtags, isoWeek, berlinToUtc, LIMITS
// werden beim Bauen aus src/ eingefuegt (scripts/build-dashboard.js).

const main = document.getElementById('main');
const CH = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };
const CHANNEL_KEYS = Object.keys(CH);
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
const PLAN_STATUS = { draft: 'Im Dashboard', approved: 'Freigegeben', scheduled: 'Freigegeben', publishing: 'Freigegeben', partial: 'Teilweise gepostet', failed: 'Fehler', published: 'Gepostet', rejected: 'Gestrichen' };
const PLAN_BADGE = { 'Im Dashboard': '', Entwurf: 'grey', Freigegeben: 'dark', Gepostet: 'dark', 'Teilweise gepostet': '', Fehler: '', Gestrichen: 'grey' };

const S = { db: null, assets: null, comments: null, posts: [], metrics: [], status: {}, checklist: {}, loaded: false, dirty: new Set(), pending: false, offline: false };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const fmtNum = (n) => Number(n || 0).toLocaleString('de-DE');
const nowIso = () => new Date().toISOString();
const toLocalInput = (iso) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const blobUrl = (id) => (id ? '/_blob/' + id : null);
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 4500);
}

function hydrate(p) {
  const post = { variants: {}, hashtags: [], channels: CHANNEL_KEYS, results: {}, ...p };
  post.preview = Object.fromEntries(CHANNEL_KEYS.map((c) => [c, composeText(post, c)]));
  post.placeholder = post.channels.map((c) => findPlaceholder(post.preview[c])).find(Boolean) || null;
  return post;
}

// Zweistufige Bestaetigung im Button selbst (confirm() ist im Artefakt nicht verfuegbar)
function confirmClick(btn, question, action) {
  if (btn.dataset.armed) return action();
  const label = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = question;
  btn.classList.add('armed');
  setTimeout(() => {
    if (!btn.isConnected) return;
    delete btn.dataset.armed;
    btn.textContent = label;
    btn.classList.remove('armed');
  }, 4000);
}

async function write(fn) {
  if (!S.db) throw new Error('Speichern ist in dieser Ansicht nicht möglich. Bitte das Artefakt auf claude.ai öffnen und anmelden.');
  try {
    return await fn(S.db);
  } catch (e) {
    throw new Error(e?.code === 'not_granted' ? 'Keine Schreibrechte für dieses Dashboard.' : e?.message || 'Speichern fehlgeschlagen.');
  }
}
const postRef = (id) => S.db.collection('posts').doc(id);

// ---------- Plan ----------
let planFilter = 'alle';
function planEntries() {
  const byNr = {};
  for (const p of S.posts) if (p.plan_nr != null && (!byNr[p.plan_nr] || byNr[p.plan_nr].status === 'rejected')) byNr[p.plan_nr] = p;
  return PLAN.entries.map((e) => {
    const post = byNr[e.nr];
    return { ...e, post, liveStatus: post ? PLAN_STATUS[post.status] || post.status : e.status };
  });
}

function viewPlan() {
  const entriesAll = planEntries();
  const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const on = new Set(PLAN.rhythm?.days || []);
  const pillars = PLAN.pillars || [];
  const total = pillars.reduce((s, p) => s + p.count, 0) || 1;
  const pillarIdx = (name) => Math.max(0, pillars.findIndex((p) => p.name === name)) % 7;
  const today = new Date().toISOString().slice(0, 10);
  const entries = entriesAll.filter((e) => planFilter === 'alle' || (planFilter === 'offen' ? !!e.note : e.date >= today));
  const counts = {};
  for (const e of entriesAll) counts[e.liveStatus] = (counts[e.liveStatus] || 0) + 1;
  const next = entriesAll.find((e) => e.date >= today && !['Gepostet', 'Gestrichen'].includes(e.liveStatus));
  const byKw = {};
  for (const e of entries) (byKw[e.kw] ??= []).push(e);
  const fmtDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

  main.innerHTML = `
    <div class="head"><span class="label">Quelle ${esc(PLAN.source)} · ${PLAN.entries.length} Posts</span><h1>${esc(PLAN.title)}</h1><p>${esc(PLAN.intro || '')}</p></div>
    <section class="section grid g3">
      <div class="card kpi"><span class="label">Nächster Post</span>${next ? `<div class="num" style="font-size:34px">${esc(next.day)} ${fmtDay(next.date)}</div><p style="margin-top:8px">${esc(next.topic)}</p>` : '<p>Kein offener Termin.</p>'}</div>
      <div class="card kpi"><span class="label">Status</span>
        <div class="statlist">${Object.entries(counts).map(([k, v]) => `<div class="row" style="justify-content:space-between"><span>${esc(k)}</span><strong>${v}</strong></div>`).join('')}</div></div>
      <div class="card"><span class="label">Rhythmus</span>
        <div class="week">${days.map((d) => `<div class="${on.has(d) ? 'on' : ''}" title="${d}">${d.slice(0, 2)}</div>`).join('')}</div>
        <p class="muted small" style="margin-top:12px">Geplant ${esc(PLAN.rhythm?.time)} Uhr. ${esc(PLAN.rhythm?.window || '')}</p></div>
    </section>
    <section class="section card">
      <h2>Pillars</h2>
      <div class="pillars" role="img" aria-label="Verteilung der Posts nach Pillar">${pillars.map((p) => `<div class="p${pillarIdx(p.name)}" style="width:${(p.count / total) * 100}%" title="${esc(p.name)}: ${p.count}">${p.count}</div>`).join('')}</div>
      <div class="row" style="gap:18px">${pillars.map((p) => `<span class="row" style="gap:8px"><span class="swatch p${pillarIdx(p.name)}"></span>${esc(p.name)} <strong>${Math.round((p.count / total) * 100)} %</strong></span>`).join('')}</div>
      <p class="muted small" style="margin-top:14px">${esc(PLAN.formats || '')}</p>
    </section>
    <section class="section">
      <div class="row" style="justify-content:space-between;margin-bottom:14px"><h2>Redaktionskalender</h2>
        <div class="row">${['alle', 'kommend', 'offen'].map((k) => `<button class="btn small ${planFilter === k ? 'dark' : 'ghost'}" data-pf="${k}">${{ alle: 'Alle', kommend: 'Kommend', offen: 'Mit offenen Punkten' }[k]}</button>`).join('')}</div></div>
      ${Object.keys(byKw).length ? Object.entries(byKw).map(([kw, list]) => `
        <div class="kw"><div class="kw-label"><span class="label">KW</span><strong>${esc(kw)}</strong></div>
          <div class="grid" style="gap:12px">${list.map((e) => `
            <article class="card entry ${e.date < today && !e.post ? 'past' : ''}">
              <div class="entry-date"><strong>${esc(e.day)}</strong> ${fmtDay(e.date)}</div>
              <div style="min-width:0">
                <div class="row" style="gap:8px;margin-bottom:6px"><span class="pill-tag b${pillarIdx(e.pillar)}">${esc(e.pillar)}</span><span class="badge ${PLAN_BADGE[e.liveStatus] ?? 'grey'}">${esc(e.liveStatus)}</span></div>
                <h3>${esc(e.topic)}</h3>
                <p class="muted small" style="margin:4px 0 0">${esc(e.format)}${e.headline ? ` · Bildtext: „${esc(e.headline)}“` : ''}</p>
                ${e.note ? `<p class="open-point"><strong>Offen:</strong> ${esc(e.note)}</p>` : ''}
                <details><summary>Texte ansehen</summary>${CHANNEL_KEYS.map((c) => (e[c] ? `<div style="margin-top:10px"><span class="label">${CH[c]}</span><div class="pre">${esc(e[c])}</div></div>` : '')).join('')}
                  <p class="muted small" style="margin-top:8px">${esc(e.hashtags.join(' '))}</p></details>
              </div>
              <div class="entry-act">${e.post && e.post.status !== 'rejected' ? `<a class="btn ghost small" href="#freigabe">Zum Post</a>` : `<button class="btn small" data-draft="${e.nr}" ${S.db ? '' : 'disabled'}>Als Entwurf anlegen</button>`}</div>
            </article>`).join('')}</div></div>`).join('') : '<div class="card empty">Keine Einträge für diesen Filter.</div>'}
    </section>`;
  main.querySelectorAll('[data-pf]').forEach((b) => (b.onclick = () => { planFilter = b.dataset.pf; render(); }));
  main.querySelectorAll('[data-draft]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      await draftFromPlan(Number(b.dataset.draft));
      toast('Entwurf angelegt. Bitte unter „Freigabe“ die Grafiken hochladen.');
    } catch (e) {
      toast(e.message);
      b.disabled = false;
    }
  }));
}

// Plan Eintrag als Entwurf uebernehmen: Texte je Kanal, Hashtags, Termin 09:00 Berliner Zeit
async function draftFromPlan(nr) {
  const e = PLAN.entries.find((x) => x.nr === nr);
  const existing = S.posts.find((p) => p.plan_nr === nr && p.status !== 'rejected');
  if (existing) throw new Error('Zu diesem Eintrag gibt es schon einen Post.');
  const notes = [
    `Plan Nr. ${e.nr}, KW ${e.kw}, ${e.pillar}. Format: ${e.format}.`,
    e.headline ? `Bildtext: ${e.headline}` : null,
    e.files?.length ? `Grafiken: ${e.files.join(', ')}` : null,
    e.note ? `Offen: ${e.note}` : null,
  ].filter(Boolean).join('\n');
  await write((db) => db.collection('posts').doc(`plan-${nr}`).set({
    title: `#${e.nr} ${e.topic}`,
    plan_nr: e.nr,
    status: 'draft',
    body: e.facebook || e.instagram || e.linkedin,
    variants: { instagram: e.instagram, facebook: e.facebook, linkedin: e.linkedin },
    hashtags: normalizeHashtags(e.hashtags),
    channels: CHANNEL_KEYS,
    image: null,
    image_linkedin: null,
    notes,
    scheduled_at: e.date ? berlinToUtc(e.date, PLAN.rhythm.time) : null,
    results: {},
    source: 'plan',
    created_at: nowIso(),
    updated_at: nowIso(),
  }));
}

// ---------- Freigabe ----------
let filter = 'offen';
const EDITABLE = ['draft', 'failed', 'partial', 'rejected'];
function viewFreigabe() {
  const posts = S.posts.map(hydrate);
  const connected = new Set(CHANNEL_KEYS.filter((c) => S.status.connections?.[c]?.ok));
  const byDate = (a, b) => String(a.scheduled_at || a.created_at).localeCompare(String(b.scheduled_at || b.created_at));
  const groups = {
    offen: posts.filter((p) => ['draft', 'failed', 'partial'].includes(p.status)).sort(byDate),
    geplant: posts.filter((p) => ['approved', 'scheduled', 'publishing'].includes(p.status)).sort(byDate),
    erledigt: posts.filter((p) => ['published', 'rejected'].includes(p.status)).sort(byDate).reverse(),
  };
  const list = groups[filter];
  main.innerHTML = `
    <div class="head"><h1>Freigabe</h1><p>Zweimal pro Woche kommt ein Entwurf. Prüfen, bei Bedarf anpassen, dann „Jetzt posten“ oder „Planen“. Claude veröffentlicht beim nächsten stündlichen Lauf.</p></div>
    ${connected.size === 0 ? `<div class="notice">Noch kein Kanal verbunden. Gepostet werden kann erst, wenn die Zugangsdaten eingetragen sind (siehe <a href="#verbindungen">Verbindungen</a>).</div>` : ''}
    <div class="row" style="margin-bottom:22px">
      ${['offen', 'geplant', 'erledigt'].map((k) => `<button class="btn small ${filter === k ? 'dark' : 'ghost'}" data-filter="${k}">${k[0].toUpperCase() + k.slice(1)} (${groups[k].length})</button>`).join('')}
    </div>
    <div id="posts">${list.length ? list.map((p) => postCard(p, connected)).join('') : `<div class="card empty">${filter === 'offen' ? 'Keine offenen Entwürfe. Neue kommen von Claude oder über „Als Entwurf anlegen“ im Plan.' : 'Nichts vorhanden.'}</div>`}</div>`;
  main.querySelectorAll('[data-filter]').forEach((b) => (b.onclick = () => { filter = b.dataset.filter; render(); }));
  main.querySelectorAll('.post').forEach((el) => bindPost(el, posts.find((p) => p.id === el.dataset.id)));
}

function postCard(p, connected) {
  const [label, cls] = STATUS[p.status] || [p.status, ''];
  const editable = EDITABLE.includes(p.status);
  const canUpload = editable && !!S.assets;
  const results = Object.entries(p.results || {});
  const dis = editable ? '' : 'disabled';
  return `
  <article class="card post" data-id="${esc(p.id)}">
    <div>
      <span class="label">Instagram und Facebook (4:5)</span>
      ${p.image ? `<img class="img" src="${blobUrl(p.image)}" alt="Bild für Instagram und Facebook">` : `<div class="img">Kein Bild</div>`}
      ${canUpload ? `<label class="btn ghost small" style="margin-top:8px">Bild hochladen<input type="file" accept="image/jpeg,image/png" data-act="image" data-field="image" hidden></label>` : ''}
      <span class="label" style="display:block;margin-top:16px">LinkedIn (1:1)</span>
      ${p.image_linkedin ? `<img class="img sq" src="${blobUrl(p.image_linkedin)}" alt="Bild für LinkedIn">` : `<p class="muted small" style="margin:4px 0">Nutzt das Bild oben.</p>`}
      ${canUpload ? `<label class="btn ghost small" style="margin-top:8px">LinkedIn Bild hochladen<input type="file" accept="image/jpeg,image/png" data-act="image" data-field="image_linkedin" hidden></label>` : ''}
      <p class="muted small" style="margin-top:12px">Erstellt ${fmtDate(p.created_at)}${p.approved_at ? `<br>Freigegeben ${fmtDate(p.approved_at)}` : ''}${p.scheduled_at ? `<br>Termin ${fmtDate(p.scheduled_at)}` : ''}</p>
    </div>
    <div style="min-width:0">
      <div class="row" style="justify-content:space-between;margin-bottom:12px"><span class="badge ${cls}">${label}</span>
        ${['approved', 'scheduled'].includes(p.status) ? `<span class="muted small">${p.status === 'approved' ? 'Wird beim nächsten Lauf gepostet (spätestens etwa 60 Minuten).' : `Wird am ${fmtDate(p.scheduled_at)} gepostet.`}</span>` : ''}</div>
      ${p.notes ? `<p class="muted small" style="white-space:pre-line"><strong>${p.source === 'plan' ? 'Aus dem Redaktionsplan' : 'Hinweis von Claude'}:</strong>\n${esc(p.notes)}</p>` : ''}
      <div class="field"><label class="label" for="t-${esc(p.id)}">Titel (intern)</label><input id="t-${esc(p.id)}" type="text" data-f="title" value="${esc(p.title)}" ${dis}></div>
      ${p.placeholder ? `<p class="open-point"><strong>Platzhalter ${esc(p.placeholder)}</strong> im Text ersetzen, sonst ist keine Freigabe möglich.</p>` : ''}
      <div class="tabs" role="tablist">${CHANNEL_KEYS.map((c, i) => `<button type="button" role="tab" class="tab ${i === 0 ? 'on' : ''}" data-tab="${c}">${CH[c]}</button>`).join('')}</div>
      ${CHANNEL_KEYS.map((c, i) => `<div class="field" data-pane="${c}" ${i ? 'hidden' : ''}>
        <textarea id="v-${esc(p.id)}-${c}" data-v="${c}" aria-label="Text ${CH[c]}" ${dis}>${esc(p.variants[c] || p.body || '')}</textarea>
        <div class="counter ${p.preview[c].length > LIMITS[c] ? 'over' : ''}">mit Hashtags ${p.preview[c].length} / ${LIMITS[c]} Zeichen</div></div>`).join('')}
      <div class="field"><label class="label" for="h-${esc(p.id)}">Hashtags (mit Leerzeichen getrennt, werden angehängt)</label><input id="h-${esc(p.id)}" type="text" data-f="hashtags" value="${esc(p.hashtags.join(' '))}" ${dis}></div>
      <div class="row" style="margin-bottom:14px">
        ${CHANNEL_KEYS.map((c) => {
          const ok = p.results?.[c]?.status === 'ok';
          return `<label class="chan"><input type="checkbox" id="c-${esc(p.id)}-${c}" data-ch="${c}" ${p.channels.includes(c) ? 'checked' : ''} ${editable && !ok ? '' : 'disabled'}> ${CH[c]}${!connected.has(c) ? ' <span class="badge grey tiny">nicht verbunden</span>' : ''}</label>`;
        }).join('')}
      </div>
      ${results.length ? `<div class="results">${results.map(([c, r]) => (r.status === 'ok' ? `<div>✓ ${CH[c]}: veröffentlicht ${fmtDate(r.at)} ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">ansehen</a>` : ''}</div>` : `<div class="err"><strong>${CH[c]}:</strong> ${esc(r.error || r.status)}</div>`)).join('')}</div>` : ''}
      ${editable ? `
      <div class="row" style="margin-top:16px">
        <button class="btn" data-act="now">${['failed', 'partial'].includes(p.status) ? 'Erneut posten' : 'Jetzt posten'}</button>
        <input type="datetime-local" id="w-${esc(p.id)}" data-f="when" value="${toLocalInput(p.scheduled_at)}" aria-label="Termin" style="width:auto">
        <button class="btn dark" data-act="schedule">Planen</button>
        <button class="btn ghost" data-act="save">Speichern</button>
        ${p.status === 'draft' ? `<button class="btn ghost" data-act="reject">Ablehnen</button>` : ''}
      </div>` : ''}
      ${['approved', 'scheduled'].includes(p.status) ? `<div class="row" style="margin-top:16px"><button class="btn ghost" data-act="withdraw">Zurückziehen</button></div>` : ''}
      ${p.status !== 'published' ? `
      <div class="improve">
        <label class="label" for="imp-${esc(p.id)}">Mit Claude verbessern</label>
        <div class="improve-row">
          <textarea id="imp-${esc(p.id)}" data-imp rows="2" maxlength="3000" placeholder="Was soll anders werden? Zum Beispiel: Text kürzer, anderes Foto, Bild heller, LinkedIn sachlicher …"></textarea>
          <button class="btn dark" data-act="improve">An Claude senden</button>
        </div>
        <p class="muted small" data-imp-hint>Geht direkt an Claude im Chat. Claude passt den Entwurf an und antwortet als Kommentar.</p>
      </div>` : ''}
    </div>
  </article>`;
}

function bindPost(el, p) {
  el.querySelectorAll('[data-tab]').forEach((t) => (t.onclick = () => {
    el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === t));
    el.querySelectorAll('[data-pane]').forEach((x) => (x.hidden = x.dataset.pane !== t.dataset.tab));
  }));
  // Solange hier getippt wird, keine Live-Aktualisierung dieser Ansicht (sonst gingen Eingaben verloren)
  el.querySelectorAll('input, textarea').forEach((i) => i.addEventListener('input', () => S.dirty.add(p.id)));
  const val = (f) => el.querySelector(`[data-f="${f}"]`)?.value;
  const collect = () => {
    const variants = Object.fromEntries([...el.querySelectorAll('[data-v]')].map((t) => [t.dataset.v, t.value]));
    return {
      title: val('title'),
      variants,
      body: variants.facebook,
      hashtags: normalizeHashtags((val('hashtags') || '').split(/[\s,]+/)),
      channels: [...el.querySelectorAll('[data-ch]:checked')].map((x) => x.dataset.ch),
      updated_at: nowIso(),
    };
  };
  const done = (msg) => {
    S.dirty.delete(p.id);
    if (msg) toast(msg);
    render();
  };
  const fail = (e) => {
    toast(e.message);
    el.querySelectorAll('button').forEach((b) => (b.disabled = false));
  };
  // Pruefung vor der Freigabe: gleiche Regeln wie im Veroeffentlichungs-Skript
  const check = (data) => {
    if (!data.channels.length) throw new Error('Bitte mindestens einen Kanal wählen.');
    const draft = hydrate({ ...p, ...data });
    if (draft.placeholder) throw new Error(`Platzhalter ${draft.placeholder} im Text noch ersetzen.`);
    for (const c of data.channels) {
      if (draft.results?.[c]?.status === 'ok') continue;
      const problem = validate(c, draft.preview[c], c === 'linkedin' ? !!(p.image_linkedin || p.image) : !!p.image);
      if (problem) throw new Error(`${CH[c]}: ${problem}`);
    }
  };

  el.querySelectorAll('[data-act]').forEach((btn) => {
    const act = btn.dataset.act;
    if (act === 'improve') {
      btn.onclick = async () => {
        const box = el.querySelector('[data-imp]');
        const hint = el.querySelector('[data-imp-hint]');
        const wish = box.value.trim();
        if (!wish) return toast('Bitte erst beschreiben, was Claude ändern soll.');
        if (!S.comments) return toast('Senden an Claude ist in dieser Ansicht nicht verfügbar. Bitte das Dashboard auf claude.ai öffnen.');
        btn.disabled = true;
        try {
          const state = await S.comments.canSendToClaude();
          if (state !== 'available') {
            const why = {
              no_session: 'Gerade hört keine Claude-Sitzung zu. Öffnen Sie die Claude-Sitzung zum Dashboard und versuchen Sie es erneut.',
              writers_only: 'Senden an Claude ist nur für Bearbeiter dieses Dashboards möglich.',
              off: 'Senden an Claude ist hier ausgeschaltet.',
            };
            throw new Error(why[state] || 'Senden an Claude ist gerade nicht möglich.');
          }
          const anchor = await S.comments.anchorFor(el);
          const text = `Wunsch aus dem Dashboard zu Post „${p.title}“ (ID ${p.id}, Status ${p.status}):\n${wish}`.slice(0, 3900);
          await S.comments.sendToClaude({ anchor, text });
          box.value = '';
          S.dirty.delete(p.id);
          hint.textContent = 'Gesendet. Claude kümmert sich darum, die Änderung erscheint hier automatisch.';
          toast('An Claude gesendet.');
        } catch (e) {
          const msg = { consent_required: 'Bitte erlauben Sie dem Dashboard einmalig, Kommentare zu schreiben, und senden Sie erneut.', forbidden: 'Kommentieren aus dem Dashboard ist hier ausgeschaltet.', rate_limited: 'Kurz warten, dann erneut senden.', claude_unavailable: 'Claude ist gerade nicht erreichbar. Ihr Text ist noch da, bitte später erneut senden.' }[e?.code];
          toast(msg || e?.message || 'Senden fehlgeschlagen.');
        }
        btn.disabled = false;
      };
      return;
    }
    if (act === 'image') {
      btn.onchange = async () => {
        const file = btn.files[0];
        if (!file) return;
        try {
          if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Bitte JPEG oder PNG hochladen.');
          if (file.size > 8 * 1024 * 1024) throw new Error('Bild größer als 8 MB.');
          toast('Bild wird hochgeladen …');
          const up = await S.assets.upload(file);
          await write(() => postRef(p.id).update({ [btn.dataset.field]: up.id, updated_at: nowIso() }));
          toast('Bild gespeichert.');
        } catch (e) {
          toast(e?.code === 'too_large' ? 'Bild zu groß.' : e.message || 'Hochladen fehlgeschlagen.');
        }
      };
      return;
    }
    btn.onclick = async () => {
      try {
        if (act === 'save') {
          await write(() => postRef(p.id).update(collect()));
          return done('Gespeichert.');
        }
        if (act === 'reject') {
          return confirmClick(btn, 'Wirklich ablehnen?', async () => {
            await write(() => postRef(p.id).update({ status: 'rejected', updated_at: nowIso() }));
            done('Entwurf abgelehnt.');
          });
        }
        if (act === 'withdraw') {
          await write(() => postRef(p.id).update({ status: 'draft', approved_at: null, updated_at: nowIso() }));
          return done('Zurückgezogen. Der Post ist wieder ein Entwurf.');
        }
        const data = collect();
        check(data);
        if (act === 'now') {
          return confirmClick(btn, `Auf ${data.channels.map((c) => CH[c]).join(', ')} posten?`, async () => {
            await write(() => postRef(p.id).update({ ...data, status: 'approved', scheduled_at: nowIso(), approved_at: nowIso() }));
            done('Freigegeben. Claude veröffentlicht beim nächsten Lauf.');
          });
        }
        if (act === 'schedule') {
          const when = new Date(val('when'));
          if (Number.isNaN(when.getTime()) || when < new Date()) throw new Error('Bitte einen Zeitpunkt in der Zukunft wählen.');
          await write(() => postRef(p.id).update({ ...data, status: 'scheduled', scheduled_at: when.toISOString(), approved_at: nowIso() }));
          return done(`Geplant für ${fmtDate(when.toISOString())}.`);
        }
      } catch (e) {
        fail(e);
      }
    };
  });
}

// ---------- Abhakeliste ----------
let week = null;
function shiftWeek(w, d) {
  const [y, n] = w.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (n - 1 + d) * 7 * 86400000);
  return isoWeek(new Date(monday.getTime() + 3 * 86400000));
}
function viewCheckliste() {
  const current = isoWeek();
  week ??= current;
  const block = (docId, labels) => {
    const items = S.checklist[docId]?.items || {};
    const list = labels.map((label) => ({ label, key: slug(label), at: items[slug(label)] || null }));
    const pct = Math.round((list.filter((i) => i.at).length / (list.length || 1)) * 100);
    return `<div class="progress"><div style="width:${pct}%"></div></div><span class="label">${pct} % erledigt</span>
      <div style="margin-top:8px">${list.map((i) => `
        <label class="check ${i.at ? 'done' : ''}"><input type="checkbox" id="k-${docId}-${i.key}" data-doc="${docId}" data-key="${i.key}" ${i.at ? 'checked' : ''} ${S.db ? '' : 'disabled'}><span class="box"></span>
        <span><span class="t">${esc(i.label)}</span>${i.at ? `<small>erledigt ${fmtDate(i.at)}</small>` : ''}</span></label>`).join('')}</div>`;
  };
  main.innerHTML = `
    <div class="head"><h1>Abhakeliste</h1><p>Wöchentliche Aufgaben und die einmalige Einrichtung. Die Häkchen sehen Bela und Darien gemeinsam.</p></div>
    <div class="grid g2">
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2>Woche ${esc(week.split('-W')[1])}</h2>
          <div class="row"><button class="btn ghost small" data-w="-1" aria-label="Vorige Woche">‹</button>${week !== current ? `<button class="btn ghost small" data-w="0">Heute</button>` : ''}<button class="btn ghost small" data-w="1" aria-label="Nächste Woche">›</button></div></div>
        ${block(week, WEEKLY_TEMPLATE)}
      </section>
      <section class="card"><h2>Einrichtung</h2>${block('setup', SETUP_TEMPLATE)}</section>
    </div>`;
  main.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { week = b.dataset.w === '0' ? current : shiftWeek(week, Number(b.dataset.w)); render(); }));
  main.querySelectorAll('.check input').forEach((cb) => (cb.onchange = async () => {
    const { doc, key } = cb.dataset;
    const items = { ...(S.checklist[doc]?.items || {}) };
    if (cb.checked) items[key] = nowIso();
    else delete items[key];
    try {
      await write((db) => db.collection('checklist').doc(doc).set({ items }));
    } catch (e) {
      toast(e.message);
      cb.checked = !cb.checked;
    }
  }));
}

// ---------- Zahlen ----------
function lineChart(points) {
  if (points.length < 2) return `<p class="muted small">Verlauf erscheint ab dem zweiten Messtag.</p>`;
  const W = 520, H = 160, P = 28;
  const ys = points.map((p) => p.value);
  const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v) => H - P - ((v - min) / span) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Follower Verlauf">
    <line class="axis" x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}"/>
    <path class="line" d="${d}"/>
    <circle class="dot" cx="${x(points.length - 1)}" cy="${y(last.value)}" r="5"/>
    <text x="${P}" y="${H - 8}">${esc(points[0].date)}</text><text x="${W - P}" y="${H - 8}" text-anchor="end">${esc(last.date)}</text>
  </svg>`;
}
function viewZahlen() {
  const series = [...S.metrics].sort((a, b) => a.id.localeCompare(b.id));
  const published = [];
  for (const p of S.posts) for (const [c, r] of Object.entries(p.results || {})) if (r.status === 'ok') published.push({ title: p.title, channel: c, ...r });
  published.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = published.filter((p) => p.at >= cutoff);
  const sum = (k) => recent.reduce((s, p) => s + (p.stats?.[k] || 0), 0);
  const followers = (c) => series.filter((m) => m[c]?.account?.followers != null).map((m) => ({ date: m.id, value: m[c].account.followers }));
  const has = series.length > 0 || published.length > 0;
  main.innerHTML = `
    <div class="head"><h1>Zahlen</h1><p>Follower und Interaktionen je Kanal. Claude holt die Werte jeden Morgen.</p></div>
    ${!has ? `<div class="card empty"><h2>Noch keine Zahlen</h2><p style="margin-top:10px">Sobald die Konten verbunden und die ersten Posts veröffentlicht sind, erscheinen hier Follower, Reichweite und Interaktionen.</p></div>` : `
    <section class="section grid g3">
      <div class="card kpi"><span class="label">Veröffentlichte Posts</span><div class="num">${fmtNum(S.posts.filter((p) => ['published', 'partial'].includes(p.status)).length)}</div></div>
      <div class="card kpi"><span class="label">Interaktionen (30 Tage)</span><div class="num">${fmtNum(sum('likes') + sum('comments') + sum('shares'))}</div><div class="delta">Likes, Kommentare, Teilen</div></div>
      <div class="card kpi"><span class="label">Reichweite (30 Tage)</span><div class="num">${fmtNum(sum('reach'))}</div><div class="delta">Instagram und LinkedIn Unternehmensseite</div></div>
    </section>
    <section class="section grid g3">${CHANNEL_KEYS.map((c) => {
      const pts = followers(c);
      const v = pts.at(-1)?.value;
      const base = pts.find((p) => p.date >= cutoff.slice(0, 10))?.value;
      const delta = v != null && base != null ? v - base : null;
      return `<div class="card kpi"><span class="label">${CH[c]} Follower</span><div class="num">${v != null ? fmtNum(v) : 'k. A.'}</div>
        <div class="delta">${delta != null ? `${delta >= 0 ? '+' : ''}${fmtNum(delta)} in 30 Tagen` : c === 'linkedin' ? 'Nur mit Unternehmensseite verfügbar' : 'noch keine Daten'}</div>
        ${pts.length ? lineChart(pts) : ''}</div>`;
    }).join('')}</section>
    <section class="section"><h2>Posts</h2><div class="card tablewrap"><table>
      <thead><tr><th>Post</th><th>Kanal</th><th>Datum</th><th class="n">Reichweite</th><th class="n">Likes</th><th class="n">Komm.</th><th class="n">Geteilt</th></tr></thead>
      <tbody>${published.map((p) => `<tr><td>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}</td><td>${CH[p.channel]}</td><td>${fmtDate(p.at)}</td>
        ${['reach', 'likes', 'comments', 'shares'].map((k) => `<td class="n">${p.stats?.[k] != null ? fmtNum(p.stats[k]) : 'k. A.'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`}`;
}

// ---------- Verbindungen ----------
function viewVerbindungen() {
  const conn = S.status.connections || {};
  const runner = S.status.runner;
  const info = {
    facebook: ['Postet auf die Zipperwalls Facebook Seite.', 'META_PAGE_TOKEN, META_PAGE_ID'],
    instagram: ['Voraussetzung: Instagram Business oder Creator Konto, verknüpft mit der Facebook Seite.', 'IG_USER_ID (nutzt dasselbe Seiten-Token)'],
    linkedin: ['Postet über das LinkedIn Profil, dem das Token gehört. Für die Unternehmensseite braucht es eine Freigabe von LinkedIn.', 'LINKEDIN_TOKEN, LINKEDIN_TOKEN_EXPIRES'],
  };
  main.innerHTML = `
    <div class="head"><h1>Verbindungen</h1><p>Die Zugangsdaten liegen nicht im Dashboard, sondern geschützt in der Claude Umgebung. Claude prüft sie bei jedem Lauf und meldet hier den Stand.</p></div>
    <div class="card" style="margin-bottom:16px"><span class="label">Letzter Lauf von Claude</span>
      <p style="margin:6px 0 0">${runner?.last_run ? `${fmtDate(runner.last_run)}. ${esc(runner.summary || '')}` : 'Noch kein Lauf. Sobald die Routine eingerichtet ist, steht hier der letzte Lauf.'}</p></div>
    <div class="grid" style="gap:16px">${CHANNEL_KEYS.map((c) => {
      const s = conn[c];
      const warn = s?.days_left != null && s.days_left < 10;
      return `<div class="card conn"><div style="min-width:0"><h2>${CH[c]}</h2>
        <p style="margin:6px 0">${s?.ok ? `<span class="badge">Verbunden</span> ${esc(s.label || '')}` : s ? `<span class="badge dark">Fehler</span> ${esc(s.error || '')}` : '<span class="badge grey">Nicht eingerichtet</span>'}</p>
        <p class="muted small" style="max-width:60ch">${info[c][0]}${s?.days_left != null ? `<br>${warn ? '<strong>' : ''}Token gültig noch ${s.days_left} Tage${warn ? '. Bitte erneuern.</strong>' : ''}` : ''}${s?.checked_at ? `<br>Geprüft ${fmtDate(s.checked_at)}` : ''}</p>
        <p class="muted small">Umgebungsvariablen: <code>${info[c][1]}</code></p></div></div>`;
    }).join('')}</div>
    <details class="card setup" ${CHANNEL_KEYS.some((c) => conn[c]?.ok) ? '' : 'open'}>
      <summary><h2>So richten Sie die Zugänge ein</h2></summary>
      <p class="muted small" style="margin-top:12px">Einmalig, etwa 30 bis 60 Minuten. Ausführlich in docs/SETUP.md im Repository.</p>
      ${SETUP_STEPS.map((g) => `<h3 style="margin-top:22px">${esc(g.title)}</h3><ol>${g.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`).join('')}
    </details>`;
}

// ---------- Rahmen ----------
const views = { plan: viewPlan, freigabe: viewFreigabe, checkliste: viewCheckliste, zahlen: viewZahlen, verbindungen: viewVerbindungen };
const currentView = () => (views[location.hash.slice(1)] ? location.hash.slice(1) : 'freigabe');

function render() {
  // Waehrend in der Freigabe getippt wird, nicht neu zeichnen
  if (currentView() === 'freigabe' && S.dirty.size && main.querySelector('.post')) {
    S.pending = true;
    document.getElementById('pending').hidden = false;
    return;
  }
  S.pending = false;
  document.getElementById('pending').hidden = true;
  const view = currentView();
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  const open = S.posts.filter((p) => ['draft', 'failed', 'partial'].includes(p.status)).length;
  const c = document.getElementById('count-freigabe');
  c.hidden = !open;
  c.textContent = open;
  const runner = S.status.runner;
  document.getElementById('runner').textContent = runner?.last_run ? `Letzter Lauf ${fmtDate(runner.last_run)}` : '';
  if (!S.loaded && view !== 'plan' && view !== 'checkliste') {
    main.innerHTML = `<div class="card empty"><h2>Daten werden geladen</h2><p style="margin-top:10px">${S.offline ? 'Die Datenbank ist in dieser Ansicht nicht erreichbar. Öffnen Sie das Dashboard angemeldet auf claude.ai.' : 'Einen Moment bitte.'}</p></div>`;
    return;
  }
  views[view]();
}

window.addEventListener('hashchange', () => { S.dirty.clear(); render(); });
document.getElementById('pending-btn').onclick = () => { S.dirty.clear(); render(); };

async function start() {
  render();
  const claude = window.claude;
  const db = claude ? await claude.use('db') : null;
  if (!db) {
    S.offline = true;
    render();
    return;
  }
  S.db = db;
  S.assets = await claude.use('assets').catch(() => null);
  S.comments = await claude.use('comments').catch(() => null);
  const onErr = (e) => toast('Datenbank: ' + (e?.message || 'nicht erreichbar'));
  let first = 4;
  const ready = () => { if (--first <= 0) S.loaded = true; render(); };
  db.collection('posts').onSnapshot((snap) => { S.posts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); ready(); }, onErr);
  db.collection('metrics').onSnapshot((snap) => { S.metrics = snap.docs.map((d) => ({ id: d.id, ...d.data() })); ready(); }, onErr);
  db.collection('status').onSnapshot((snap) => { S.status = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])); ready(); }, onErr);
  db.collection('checklist').onSnapshot((snap) => { S.checklist = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])); ready(); }, onErr);
}
start();
