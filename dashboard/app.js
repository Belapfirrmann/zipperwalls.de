// Zipperwalls Social Media Dashboard als Claude Artefakt.
// Daten liegen in der Artefakt-Datenbank (db), Bilder in den Artefakt-Assets.
// Veroeffentlicht wird nicht von hier, sondern von der Claude Routine (scripts/social.js).
// PLAN, NL (Newsletter-Plan) sowie composeText, findPlaceholder, normalizeHashtags, isoWeek, berlinToUtc, LIMITS
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

const S = { db: null, assets: null, comments: null, posts: [], newsletters: [], metrics: [], status: {}, checklist: {}, loaded: false, dirty: new Set(), pending: false, offline: false };

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
  if (location.hash === '#freigabe-newsletter') return viewFreigabeNewsletter();
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
    <div class="head"><h1>Freigabe</h1>${freigabeParts('social')}<p>Zweimal pro Woche kommt ein Entwurf. Prüfen, bei Bedarf anpassen oder Claude unten um Änderungen bitten, dann „Freigeben“. Den Termin übernimmt Claude nach Redaktionsplan.</p></div>
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
      ${p.slides?.length >= 2 ? `<span class="label">Karussell: ${p.slides.length} Bilder (alle Kanäle)</span>
      <div class="slides" tabindex="0" aria-label="Karussell-Bilder, seitlich scrollen">${p.slides.map((id, i) => `<img src="${blobUrl(id)}" alt="Bild ${i + 1} von ${p.slides.length}">`).join('')}</div>
      <p class="muted small" style="margin:6px 0 0">Seitlich wischen, um alle Bilder zu sehen.</p>` : `
      <span class="label">Instagram und Facebook (4:5)</span>
      ${p.image ? `<img class="img" src="${blobUrl(p.image)}" alt="Bild für Instagram und Facebook">` : `<div class="img">Kein Bild</div>`}
      ${canUpload ? `<label class="btn ghost small" style="margin-top:8px">Bild hochladen<input type="file" accept="image/jpeg,image/png" data-act="image" data-field="image" hidden></label>` : ''}
      <span class="label" style="display:block;margin-top:16px">LinkedIn (1:1)</span>
      ${p.image_linkedin ? `<img class="img sq" src="${blobUrl(p.image_linkedin)}" alt="Bild für LinkedIn">` : `<p class="muted small" style="margin:4px 0">Nutzt das Bild oben.</p>`}
      ${canUpload ? `<label class="btn ghost small" style="margin-top:8px">LinkedIn Bild hochladen<input type="file" accept="image/jpeg,image/png" data-act="image" data-field="image_linkedin" hidden></label>` : ''}`}
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
      ${results.length ? `<div class="results">${results.map(([c, r]) => (r.status === 'ok' ? `<div>✓ ${CH[c]}: veröffentlicht ${fmtDate(r.at)} ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">ansehen</a>` : ''}</div>` : (r.status === 'skipped' ? `<div class="muted">${CH[c]}: ${esc(r.error || 'übersprungen')}</div>` : `<div class="err"><strong>${CH[c]}:</strong> ${esc(r.error || r.status)}</div>`))).join('')}</div>` : ''}
      ${editable ? `
      <div class="row" style="margin-top:16px">
        <button class="btn" data-act="approve">${['failed', 'partial'].includes(p.status) ? 'Erneut freigeben' : 'Freigeben'}</button>
        <span class="muted small">${p.scheduled_at && new Date(p.scheduled_at) > new Date() ? `Geht am ${fmtDate(p.scheduled_at)} raus.` : 'Geht beim nächsten Lauf raus.'} Textänderungen werden beim Freigeben gespeichert.</span>
      </div>` : ''}
      ${p.status !== 'published' ? improveBlock(p.id, 'Was soll anders werden? Zum Beispiel: Text kürzer, anderes Foto, Bild heller, LinkedIn sachlicher …') : ''}
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
      const hasSlides = p.slides?.length >= 2;
      const problem = validate(c, draft.preview[c], hasSlides || (c === 'linkedin' ? !!(p.image_linkedin || p.image) : !!p.image));
      if (problem) throw new Error(`${CH[c]}: ${problem}`);
    }
  };

  el.querySelectorAll('[data-act]').forEach((btn) => {
    const act = btn.dataset.act;
    if (act === 'improve') {
      btn.onclick = () => sendImprove(btn, el, `Wunsch aus dem Dashboard zu Post „${p.title}“ (ID ${p.id}, Status ${p.status})`, p.id);
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
        if (act === 'approve') {
          const data = collect();
          check(data);
          const planned = p.scheduled_at && new Date(p.scheduled_at) > new Date();
          return confirmClick(btn, planned ? `Für ${fmtDate(p.scheduled_at)} freigeben?` : 'Jetzt freigeben?', async () => {
            await write(() => postRef(p.id).update({
              ...data,
              status: planned ? 'scheduled' : 'approved',
              scheduled_at: planned ? p.scheduled_at : nowIso(),
              approved_at: nowIso(),
            }));
            done(planned ? `Freigegeben für ${fmtDate(p.scheduled_at)}.` : 'Freigegeben. Claude veröffentlicht beim nächsten Lauf.');
          });
        }
      } catch (e) {
        fail(e);
      }
    };
  });
}

// Wunsch an Claude als Kommentar am Element (Post oder Newsletter)
async function sendImprove(btn, el, intro, id) {
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
    const text = `${intro}:\n${wish}`.slice(0, 3900);
    await S.comments.sendToClaude({ anchor, text });
    box.value = '';
    S.dirty.delete(id);
    hint.textContent = 'Gesendet. Claude kümmert sich darum, die Änderung erscheint hier automatisch.';
    toast('An Claude gesendet.');
  } catch (e) {
    const msg = { consent_required: 'Bitte erlauben Sie dem Dashboard einmalig, Kommentare zu schreiben, und senden Sie erneut.', forbidden: 'Kommentieren aus dem Dashboard ist hier ausgeschaltet.', rate_limited: 'Kurz warten, dann erneut senden.', claude_unavailable: 'Claude ist gerade nicht erreichbar. Ihr Text ist noch da, bitte später erneut senden.' }[e?.code];
    toast(msg || e?.message || 'Senden fehlgeschlagen.');
  }
  btn.disabled = false;
}

const improveBlock = (id, placeholder) => `
      <div class="improve">
        <label class="label" for="imp-${esc(id)}">Mit Claude verbessern</label>
        <div class="improve-row">
          <textarea id="imp-${esc(id)}" data-imp rows="2" maxlength="3000" placeholder="${esc(placeholder)}"></textarea>
          <button class="btn dark" data-act="improve">An Claude senden</button>
        </div>
        <p class="muted small" data-imp-hint>Geht direkt an Claude im Chat. Claude passt den Entwurf an und antwortet als Kommentar.</p>
      </div>`;

// ---------- Newsletter ----------
// Plan kommt aus dem Newsletter-Plan (xlsx, scripts/import_newsletter.py). Entwürfe liegen in Collection "newsletters"
// (Dokument nl-<Nr>) und werden einzeln angelegt (Claude, siehe docs/routinen/newsletter-entwuerfe.md). Nur sie erscheinen in der Freigabe.
// Gestaltet wird mit renderNewsletter aus src/newsletter-render.js (beim Bauen eingefügt), Name des Newsletters: NL_NAME.
const NL_STATUS = ['Entwurf', 'Verschoben', 'Freigegeben', 'In MailPoet eingeplant', 'Versendet', 'Gestrichen'];
const NL_BADGE = { Entwurf: '', Verschoben: '', Freigegeben: 'dark', 'In MailPoet eingeplant': 'dark', Versendet: 'grey', Gestrichen: 'grey' };
const NL_GROUPS = { offen: ['Entwurf', 'Verschoben'], geplant: ['Freigegeben', 'In MailPoet eingeplant'], erledigt: ['Versendet', 'Gestrichen'] };
// [Feld, Beschriftung, max. Zeichen, Art]
const NL_SECTIONS = [
  ['Betreff und Vorschautext', [['subject', 'Betreff', 60], ['subject_alt', 'Betreff Alternative (A/B-Test)', 60], ['preview', 'Vorschautext', 120]], true],
  ['Kopf', [['badge', 'Badge (gelb)'], ['headline', 'Überschrift (Zeilenumbruch erlaubt)', 0, 'short']]],
  ['Bild', [['image_url', 'Bild-Adresse für MailPoet (zipperwalls.de)'], ['image_alt', 'Bildbeschreibung (Alt-Text)'], ['image_link', 'Bild verlinkt auf']]],
  ['Text', [['text', 'Text (Leerzeile = neuer Absatz, VERSALIEN = Zwischenüberschrift, „1. Titel. Text“ = Schritt)', 0, 'long']], true],
  ['Button', [['button_text', 'Button-Text'], ['button_link', 'Button-Link']]],
  ['Angebot', [['offer_label', 'Angebot Kennzeile'], ['offer_title', 'Angebot Überschrift'], ['offer_text', 'Angebot Text', 0, 'short'], ['offer_button_text', 'Angebot Button-Text'], ['offer_button_link', 'Angebot Button-Link']]],
  ['Zusatzblock', [['extra_title', 'Zusatzblock Titel'], ['extra_text', 'Zusatzblock Text', 0, 'short'], ['extra_link', 'Zusatzblock Link']]],
  ['Produktempfehlungen (gelber Block)', [['products_label', 'Kennzeile'], ['products_title', 'Überschrift (Zeilenumbruch erlaubt)', 0, 'short'],
    ...[1, 2, 3].flatMap((i) => [[`p${i}_name`, `Produkt ${i}: Name`], [`p${i}_text`, `Produkt ${i}: Kurztext`, 0, 'short'], [`p${i}_link`, `Produkt ${i}: Link`], [`p${i}_image_url`, `Produkt ${i}: Bild-Adresse (zipperwalls.de)`]])]],
];
const NL_FIELDS = NL_SECTIONS.flatMap(([, fields]) => fields);
const NL_KPI = [['open_rate', 'Öffnungsrate %'], ['click_rate', 'Klickrate %'], ['unsubscribes', 'Abmeldungen']];
const nlId = (nr) => `nl-${nr}`;
const fmtDayLong = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// Plan-Einträge mit ihrem Entwurf (falls vorhanden)
function nlEntries() {
  const docs = Object.fromEntries(S.newsletters.map(({ id, ...d }) => [id, d]));
  return NL.entries.map((e) => {
    const doc = docs[nlId(e.nr)] || null;
    return { ...e, ...(doc || {}), id: nlId(e.nr), doc, status: doc?.status || e.status || 'Entwurf' };
  });
}
// Nur angelegte Entwürfe (für die Freigabe)
const nlDrafts = () => nlEntries().filter((n) => n.doc);
const nlDue = () => nlDrafts().filter((n) => NL_GROUPS.offen.includes(n.status) && n.date <= inDays(14)).length;
const socialOpen = () => S.posts.filter((p) => ['draft', 'failed', 'partial'].includes(p.status)).length;

// Blockiert die Freigabe: Platzhalter, Längen, Links nicht auf zipperwalls.de, Pflichtfelder
function nlProblem(n) {
  for (const [f, label, max] of NL_FIELDS) {
    const v = n[f] || '';
    const ph = findPlaceholder(v);
    if (ph) return `${label}: Platzhalter ${ph} noch ersetzen.`;
    if (max && v.length > max) return `${label} zu lang (${v.length} von ${max} Zeichen).`;
    if ((f.endsWith('_link') || f.endsWith('image_url')) && v && !/^https:\/\/www\.zipperwalls\.de\//.test(v)) return `${label} muss auf https://www.zipperwalls.de/ zeigen.`;
  }
  for (const [f, label] of [['subject', 'Betreff'], ['preview', 'Vorschautext'], ['text', 'Text']]) if (!n[f]) return `${label} fehlt.`;
  return null;
}
// Nur Hinweis, blockiert nicht: Ortsnamen und Herkunftsangaben sind bei Social Media verboten
function nlWarning(n) {
  for (const [f, label] of NL_FIELDS) {
    const bad = findForbidden(n[f] || '');
    if (bad) return `${label} enthält „${bad}“. In Social-Media-Posts ist das nicht erlaubt, bitte prüfen.`;
  }
  if (!n.image_url && !n.image_asset) return 'Noch kein Bild.';
  return null;
}

// Alles, was in MailPoet in den Textblock gehört
const nlMailText = (n) => [
  n.text,
  n.button_text ? `Button: ${n.button_text}\n${n.button_link || ''}` : null,
  n.offer_title ? `${n.offer_title}\n${n.offer_text || ''}${n.offer_button_text ? `\nButton: ${n.offer_button_text}\n${n.offer_button_link || ''}` : ''}` : null,
  n.extra_title ? `${n.extra_title}\n${n.extra_text || ''}${n.extra_link ? `\n${n.extra_link}` : ''}` : null,
].filter(Boolean).join('\n\n');

// Vorschau: Bild aus den Dashboard-Assets (fremde Adressen sind im Artefakt gesperrt), Logo eingebettet
const nlPreviewHtml = (n) => renderNewsletter(n, {
  preview: true, logo: LOGO_FARBIG, logoLight: LOGO_WEISS,
  imageSrc: n.image_asset ? blobUrl(n.image_asset) : null,
  productImages: [1, 2, 3].map((i) => (n[`p${i}_image_asset`] ? blobUrl(n[`p${i}_image_asset`]) : null)),
});

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} kopiert.`);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    toast(ok ? `${label} kopiert.` : 'Kopieren ist hier nicht möglich. Bitte den Text im Feld markieren und kopieren.');
  }
}

async function saveNl(n, patch) {
  const base = Object.fromEntries(NL_FIELDS.map(([f]) => [f, n[f] ?? null]));
  await write((db) => db.collection('newsletters').doc(n.id).set({
    ...(n.doc || {}), ...base, image_asset: n.image_asset ?? null, nr: n.nr, kw: n.kw, date: n.date, time: n.time, status: n.status,
    created_at: n.doc?.created_at || nowIso(), ...patch, updated_at: nowIso(),
  }));
}

// iframe mit der gestalteten E-Mail; Höhe passt sich an, außer im Rahmen mit fester Höhe
function fillPreview(frame, html, fit) {
  frame.onload = () => {
    if (!fit) return;
    try { frame.style.height = frame.contentDocument.documentElement.scrollHeight + 'px'; } catch { /* Höhe bleibt */ }
  };
  frame.srcdoc = html;
}

// Vollbild-Ansicht mit Umschalter Desktop / Handy
function openFullscreen(n) {
  const box = document.createElement('div');
  box.className = 'nl-full';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Newsletter-Vorschau im Vollbild');
  box.innerHTML = `
    <div class="nl-full-bar">
      <div style="min-width:0"><span class="label">Vorschau · ${esc(n.day)}, ${fmtDayLong(n.date)}, ${esc(n.time)} Uhr</span><div class="nl-subject">${esc(n.subject || '')}</div><div class="muted small">${esc(n.preview || '')}</div></div>
      <div class="row">
        <button class="tab on" type="button" data-w="680">Desktop</button><button class="tab" type="button" data-w="390">Handy</button>
        <button class="btn small" type="button" data-close>Schließen</button>
      </div>
    </div>
    <div class="nl-full-stage"><iframe title="Newsletter-Vorschau" class="nl-full-frame"></iframe></div>`;
  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';
  const frame = box.querySelector('iframe');
  fillPreview(frame, nlPreviewHtml(n), true);
  const close = () => {
    box.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  box.querySelector('[data-close]').onclick = close;
  box.querySelector('[data-close]').focus();
  box.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => {
    box.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('on', x === b));
    frame.style.width = b.dataset.w + 'px';
    fillPreview(frame, nlPreviewHtml(n), true);
  }));
  // Wer im Browser Vollbild hat, bekommt es auch hier (optional)
  box.requestFullscreen?.().catch(() => {});
}

let nlFilter = 'alle';
function viewNewsletter() {
  const all = nlEntries();
  const today = new Date().toISOString().slice(0, 10);
  const list = all.filter((e) => nlFilter === 'alle' || (nlFilter === 'offen' ? !!e.note : e.date >= today));
  const counts = {};
  for (const e of all) counts[e.status] = (counts[e.status] || 0) + 1;
  const next = all.find((e) => e.date >= today && !['Versendet', 'Gestrichen'].includes(e.status));
  const types = NL.types || [];
  const total = types.reduce((s, t) => s + t.count, 0) || 1;
  const byKw = {};
  for (const e of list) (byKw[e.kw] ??= []).push(e);
  const fmtDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

  main.innerHTML = `
    <div class="head"><span class="label">Quelle ${esc(NL.source)} · ${NL.entries.length} Ausgaben</span><h1>${esc(NL.title)}</h1><p>${esc(NL.intro || '')}</p></div>
    <section class="section grid g3">
      <div class="card kpi"><span class="label">Nächster Newsletter</span>${next ? `<div class="num" style="font-size:34px">${esc(next.day.slice(0, 2))} ${fmtDay(next.date)}</div><p style="margin-top:8px">${esc(next.subject || next.topic)}</p>` : '<p>Kein offener Termin.</p>'}</div>
      <div class="card kpi"><span class="label">Status</span>
        <div class="statlist">${NL_STATUS.filter((k) => counts[k]).map((k) => `<div class="row" style="justify-content:space-between"><span>${esc(k)}</span><strong>${counts[k]}</strong></div>`).join('')}</div></div>
      <div class="card"><span class="label">Mix</span>
        <div class="pillars" role="img" aria-label="Verteilung gekoppelt und eigenständig">${types.map((t, i) => `<div class="p${i % 7}" style="width:${(t.count / total) * 100}%" title="${esc(t.name)}: ${t.count}">${t.count}</div>`).join('')}</div>
        <div class="row" style="gap:16px">${types.map((t, i) => `<span class="row" style="gap:8px"><span class="swatch p${i % 7}"></span>${esc(t.name)}</span>`).join('')}</div>
        <p class="muted small" style="margin-top:12px">Gekoppelt: vertieft den Social-Media-Post derselben Woche. Eigenständig: eigenes Thema.</p></div>
    </section>
    ${NL.steps?.length ? `<section class="section card"><h2>So arbeiten Sie mit dem Plan</h2><ol class="steps">${NL.steps.map((s) => `<li>${esc(s.replace(/^\d\.\s*/, ''))}</li>`).join('')}</ol>
      <p class="muted small" style="margin-top:12px">Freigabe, Status und Kennzahlen pflegen Sie direkt hier unter <a href="#freigabe-newsletter">Freigabe › Newsletter</a>.</p></section>` : ''}
    <section class="section">
      <div class="row" style="justify-content:space-between;margin-bottom:14px"><h2>Versandkalender</h2>
        <div class="row">${['alle', 'kommend', 'offen'].map((k) => `<button class="btn small ${nlFilter === k ? 'dark' : 'ghost'}" data-nlf="${k}">${{ alle: 'Alle', kommend: 'Kommend', offen: 'Mit offenen Punkten' }[k]}</button>`).join('')}</div></div>
      ${Object.keys(byKw).length ? Object.entries(byKw).map(([kw, items]) => `
        <div class="kw"><div class="kw-label"><span class="label">KW</span><strong>${esc(kw)}</strong></div>
          <div class="grid" style="gap:12px">${items.map((e) => `
            <article class="card entry ${e.date < today && NL_GROUPS.offen.includes(e.status) ? 'past' : ''}">
              <div class="entry-date"><strong>${esc(e.day.slice(0, 2))}</strong> ${fmtDay(e.date)}<br><span class="muted small">${esc(e.time)} Uhr</span></div>
              <div style="min-width:0">
                <div class="row" style="gap:8px;margin-bottom:6px"><span class="pill-tag ${e.type === 'eigenständig' ? 'b1' : 'b0'}">${esc(e.type)}</span><span class="pill-tag b2">${esc(e.rubric || '')}</span><span class="badge ${NL_BADGE[e.status] ?? 'grey'}">${esc(e.status)}</span></div>
                <h3>${esc(e.topic)}</h3>
                <p class="small" style="margin:6px 0 0"><span class="muted">Betreff:</span> ${esc(e.subject || '')}</p>
                <p class="muted small" style="margin:2px 0 0">Bezug: ${esc(e.social || 'keiner')}</p>
                ${e.note ? `<p class="open-point"><strong>Offen:</strong> ${esc(e.note)}</p>` : ''}
                <details><summary>Inhalt ansehen</summary>
                  <div style="margin-top:10px"><span class="label">Vorschautext</span><div class="pre">${esc(e.preview || '')}</div></div>
                  <div style="margin-top:10px"><span class="label">Text</span><div class="pre">${esc(e.text || '')}</div></div>
                  ${e.button_text ? `<p class="small" style="margin-top:10px"><span class="label">Button</span><br>${esc(e.button_text)} · <a href="${esc(e.button_link || '#')}" target="_blank" rel="noopener">${esc(e.button_link || '')}</a></p>` : ''}
                  ${e.extra_title ? `<div style="margin-top:10px"><span class="label">Zusatzblock</span><div class="pre"><strong>${esc(e.extra_title)}</strong>\n${esc(e.extra_text || '')}${e.extra_link ? `\n${esc(e.extra_link)}` : ''}</div></div>` : ''}
                  ${e.image_idea ? `<p class="muted small" style="margin-top:10px"><strong>Bildidee:</strong> ${esc(e.image_idea)}</p>` : ''}
                </details>
              </div>
              <div class="entry-act">${e.doc ? `<a class="btn ghost small" href="#freigabe-newsletter" data-goto="${esc(e.id)}">Zur Freigabe</a>` : '<span class="muted small">Noch kein Entwurf</span>'}</div>
            </article>`).join('')}</div></div>`).join('') : '<div class="card empty">Keine Ausgaben für diesen Filter.</div>'}
    </section>
    ${NL.sources?.length ? `<details class="card setup"><summary><h2>Quellen</h2></summary><ul class="steps">${NL.sources.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}`;
  main.querySelectorAll('[data-nlf]').forEach((b) => (b.onclick = () => { nlFilter = b.dataset.nlf; render(); }));
  main.querySelectorAll('[data-goto]').forEach((a) => (a.onclick = () => {
    const n = all.find((x) => x.id === a.dataset.goto);
    nlFreigabeFilter = Object.keys(NL_GROUPS).find((g) => NL_GROUPS[g].includes(n?.status)) || 'offen';
    nlFocus = a.dataset.goto;
  }));
}

// Umschalter oben auf der Freigabe-Seite
function freigabeParts(active) {
  const s = socialOpen();
  const n = nlDrafts().filter((x) => NL_GROUPS.offen.includes(x.status)).length;
  return `<div class="parts" role="tablist" aria-label="Bereich der Freigabe">
    <a role="tab" href="#freigabe" class="part ${active === 'social' ? 'on' : ''}" aria-selected="${active === 'social'}">Social Media <span class="part-n">${s} offen</span></a>
    <a role="tab" href="#freigabe-newsletter" class="part ${active === 'newsletter' ? 'on' : ''}" aria-selected="${active === 'newsletter'}">Newsletter <span class="part-n">${n} offen</span></a>
  </div>`;
}

let nlFreigabeFilter = 'offen';
let nlFocus = null;
function viewFreigabeNewsletter() {
  const all = nlDrafts();
  const byDate = (a, b) => String(a.date).localeCompare(String(b.date));
  const groups = Object.fromEntries(Object.entries(NL_GROUPS).map(([k, st]) => [k, all.filter((n) => st.includes(n.status)).sort(byDate)]));
  groups.erledigt.reverse();
  const list = groups[nlFreigabeFilter];
  main.innerHTML = `
    <div class="head"><h1>Freigabe</h1>${freigabeParts('newsletter')}<p>Die Vorschau zeigt den Newsletter so, wie er bei den Empfängern ankommt. Alle Links und Buttons sind klickbar, „Vollbild“ zeigt ihn groß als Desktop- oder Handy-Ansicht. Daneben lässt sich alles anpassen, die Vorschau ändert sich sofort. Dann freigeben (Darien), in MailPoet einplanen und hier abhaken.</p></div>
    <div class="row" style="margin-bottom:22px">
      ${Object.keys(NL_GROUPS).map((k) => `<button class="btn small ${nlFreigabeFilter === k ? 'dark' : 'ghost'}" data-filter="${k}">${k[0].toUpperCase() + k.slice(1)} (${groups[k].length})</button>`).join('')}
    </div>
    <div id="posts">${list.length ? list.map(nlCard).join('') : `<div class="card empty">${nlFreigabeFilter === 'offen' ? 'Kein Newsletter-Entwurf offen. Claude legt die Entwürfe einzeln an, den Versandplan sehen Sie unter <a href="#newsletter">Newsletter-Plan</a>.' : 'Nichts vorhanden.'}</div>`}</div>`;
  main.querySelectorAll('[data-filter]').forEach((b) => (b.onclick = () => { nlFreigabeFilter = b.dataset.filter; render(); }));
  main.querySelectorAll('.nl').forEach((el) => bindNl(el, all.find((n) => n.id === el.dataset.id)));
  if (nlFocus) {
    main.querySelector(`[data-id="${nlFocus}"]`)?.scrollIntoView({ block: 'start' });
    nlFocus = null;
  }
}

function nlCard(n) {
  const editable = NL_GROUPS.offen.includes(n.status);
  const dis = editable ? '' : 'disabled';
  const problem = editable ? nlProblem(n) : null;
  const warning = editable ? nlWarning(n) : null;
  const field = ([f, label, max, kind]) => {
    const v = n[f] || '';
    const input = kind
      ? `<textarea id="n-${n.id}-${f}" data-nf="${f}" class="${kind}" ${dis}>${esc(v)}</textarea>`
      : `<input id="n-${n.id}-${f}" type="text" data-nf="${f}" value="${esc(v)}" ${dis}>`;
    return `<div class="field"><label class="label" for="n-${n.id}-${f}">${label}</label>${input}${max ? `<div class="counter ${v.length > max ? 'over' : ''}" data-count="${f}">${v.length} / ${max} Zeichen</div>` : ''}</div>`;
  };
  const copy = `<div class="row" style="margin-top:12px"><span class="label">Für MailPoet kopieren</span>
      <button class="btn ghost small" data-copy="subject">Betreff</button><button class="btn ghost small" data-copy="preview">Vorschautext</button><button class="btn ghost small" data-copy="mail">Texte</button></div>`;
  const stamps = [['approved_at', 'Freigegeben'], ['planned_at', 'In MailPoet eingeplant'], ['sent_at', 'Versendet']].filter(([k]) => n[k]).map(([k, l]) => ` · ${l} ${fmtDate(n[k])}`).join('');
  let actions = '';
  if (editable) {
    actions = `<div class="row" style="margin-top:16px">
        <button class="btn" data-act="nl-approve">Freigeben</button>
        <button class="btn ghost" data-act="nl-save">Speichern</button>
        <button class="btn ghost small" data-act="nl-drop">Streichen</button></div>`;
  } else if (n.status === 'Freigegeben') {
    actions = `${copy}<div class="row" style="margin-top:16px"><button class="btn" data-act="nl-planned">In MailPoet eingeplant</button><button class="btn ghost small" data-act="nl-reopen">Zurück zu Entwurf</button></div>`;
  } else if (n.status === 'In MailPoet eingeplant') {
    actions = `${copy}<div class="row" style="margin-top:16px"><button class="btn" data-act="nl-sent">Als versendet markieren</button><button class="btn ghost small" data-act="nl-reopen">Zurück zu Entwurf</button></div>`;
  } else if (n.status === 'Versendet') {
    actions = `<div class="kpis"><span class="label">Kennzahlen aus MailPoet (nach etwa 7 Tagen)</span>
        <div class="row">${NL_KPI.map(([k, l]) => `<label class="kpi-in"><span class="small muted">${l}</span><input type="text" inputmode="decimal" id="n-${n.id}-${k}" data-kpi="${k}" value="${esc(n[k] ?? '')}"></label>`).join('')}
        <button class="btn ghost" data-act="nl-kpi">Kennzahlen speichern</button></div></div>`;
  } else {
    actions = `<div class="row" style="margin-top:16px"><button class="btn ghost" data-act="nl-reopen">Wiederherstellen</button></div>`;
  }
  return `
  <article class="card nl" data-id="${esc(n.id)}">
    <div class="nl-top">
      <div style="min-width:0">
        <div class="row" style="gap:8px;margin-bottom:8px"><span class="badge ${NL_BADGE[n.status] ?? 'grey'}">${esc(n.status)}</span><span class="pill-tag ${n.type === 'eigenständig' ? 'b1' : 'b0'}">${esc(n.type)}</span><span class="pill-tag b2">${esc(n.rubric || '')}</span></div>
        <h2>${esc(n.subject || n.topic)}</h2>
        <p class="muted small" style="margin:6px 0 0">Ausgabe ${esc(n.nr)} · Versand ${esc(n.day)}, ${fmtDayLong(n.date)}, ${esc(n.time)} Uhr · Bezug: ${esc(n.social || 'keiner')}${stamps}</p>
      </div>
      <button class="btn dark" type="button" data-act="nl-full">Vollbild</button>
    </div>
    ${n.note ? `<p class="open-point"><strong>Offen:</strong> ${esc(n.note)}</p>` : ''}
    ${problem ? `<p class="open-point"><strong>Vor der Freigabe:</strong> ${esc(problem)}</p>` : ''}
    ${warning ? `<p class="open-point"><strong>Hinweis:</strong> ${esc(warning)}</p>` : ''}
    <div class="nl-body">
      <div class="nl-preview">
        <div class="nl-inbox"><span class="label">Posteingang</span><strong>${esc(n.subject || '')}</strong><span class="muted">${esc(n.preview || '')}</span></div>
        <iframe title="Vorschau Newsletter ${esc(n.nr)}" class="nl-frame" loading="lazy"></iframe>
      </div>
      <div class="nl-edit" style="min-width:0">
        ${NL_SECTIONS.map(([title, fields, open]) => `<details class="nl-sec" ${open ? 'open' : ''}><summary>${title}</summary>
          ${fields.map(field).join('')}
          ${title === 'Bild' && editable && S.assets ? `<label class="btn ghost small">Bild für die Vorschau hochladen<input type="file" accept="image/jpeg,image/png,image/webp" data-act="nl-image" hidden></label>
            <p class="muted small" style="margin-top:6px">In MailPoet wird das Bild über die Adresse oben eingebunden. Die Vorschau hier braucht eine hochgeladene Kopie.</p>` : ''}
        </details>`).join('')}
        ${actions}
        ${['Versendet', 'Gestrichen'].includes(n.status) ? '' : improveBlock(n.id, 'Was soll anders werden? Zum Beispiel: Betreff kürzer, anderes Bild, Text sachlicher …')}
      </div>
    </div>
  </article>`;
}

function bindNl(el, n) {
  const frame = el.querySelector('.nl-frame');
  fillPreview(frame, nlPreviewHtml(n), false);
  const collect = () => Object.fromEntries([...el.querySelectorAll('[data-nf]')].map((i) => [i.dataset.nf, i.value.trim() || null]));
  let t = null;
  el.querySelectorAll('input, textarea').forEach((i) => i.addEventListener('input', () => {
    S.dirty.add(n.id);
    const c = el.querySelector(`[data-count="${i.dataset.nf}"]`);
    if (c) {
      const max = NL_FIELDS.find(([f]) => f === i.dataset.nf)[2];
      c.textContent = `${i.value.length} / ${max} Zeichen`;
      c.classList.toggle('over', i.value.length > max);
    }
    // Vorschau live nachziehen
    if (i.dataset.nf) {
      clearTimeout(t);
      t = setTimeout(() => {
        const y = frame.contentWindow?.scrollY || 0;
        frame.onload = () => { try { frame.contentWindow.scrollTo(0, y); } catch { /* egal */ } };
        frame.srcdoc = nlPreviewHtml({ ...n, ...collect() });
      }, 350);
    }
  }));
  const run = async (btn, fn, msg) => {
    btn.disabled = true;
    try {
      await fn();
      S.dirty.delete(n.id);
      toast(msg);
      render();
    } catch (e) {
      toast(e.message);
      btn.disabled = false;
    }
  };
  el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.copy;
    copyText(k === 'mail' ? nlMailText(n) : n[k] || '', { subject: 'Betreff', preview: 'Vorschautext', mail: 'Texte' }[k]);
  }));
  el.querySelectorAll('[data-act]').forEach((btn) => {
    const act = btn.dataset.act;
    if (act === 'nl-image') {
      btn.onchange = async () => {
        const file = btn.files[0];
        if (!file) return;
        try {
          if (file.size > 8 * 1024 * 1024) throw new Error('Bild größer als 8 MB.');
          toast('Bild wird hochgeladen …');
          const up = await S.assets.upload(file);
          await saveNl({ ...n, ...collect() }, { image_asset: up.id });
          S.dirty.delete(n.id);
          toast('Bild gespeichert.');
        } catch (e) {
          toast(e?.code === 'too_large' ? 'Bild zu groß.' : e.message || 'Hochladen fehlgeschlagen.');
        }
      };
      return;
    }
    btn.onclick = () => {
      if (act === 'nl-full') return openFullscreen({ ...n, ...collect() });
      if (act === 'improve') return sendImprove(btn, el, `Wunsch aus dem Dashboard zu Newsletter ${n.nr} „${n.subject || n.topic}“ (ID ${n.id}, Versand ${n.date}, Status ${n.status})`, n.id);
      if (act === 'nl-save') return run(btn, () => saveNl(n, collect()), 'Gespeichert.');
      if (act === 'nl-approve') {
        const data = collect();
        const problem = nlProblem({ ...n, ...data });
        if (problem) return toast(problem);
        return confirmClick(btn, 'Wirklich freigeben?', () => run(btn, () => saveNl(n, { ...data, status: 'Freigegeben', approved_at: nowIso() }), 'Freigegeben. Jetzt in MailPoet einplanen.'));
      }
      if (act === 'nl-drop') return confirmClick(btn, 'Wirklich streichen?', () => run(btn, () => saveNl(n, { ...collect(), status: 'Gestrichen' }), 'Gestrichen.'));
      if (act === 'nl-planned') return run(btn, () => saveNl(n, { status: 'In MailPoet eingeplant', planned_at: nowIso() }), 'Als in MailPoet eingeplant markiert.');
      if (act === 'nl-sent') return confirmClick(btn, 'Wirklich versendet?', () => run(btn, () => saveNl(n, { status: 'Versendet', sent_at: nowIso() }), 'Als versendet markiert. Kennzahlen bitte nach etwa 7 Tagen eintragen.'));
      if (act === 'nl-reopen') return run(btn, () => saveNl(n, { status: 'Entwurf', approved_at: null, planned_at: null }), 'Wieder als Entwurf offen.');
      if (act === 'nl-kpi') {
        const vals = Object.fromEntries([...el.querySelectorAll('[data-kpi]')].map((i) => {
          const v = i.value.trim().replace(',', '.');
          return [i.dataset.kpi, v === '' ? null : Number(v)];
        }));
        if (Object.values(vals).some((v) => v != null && Number.isNaN(v))) return toast('Bitte nur Zahlen eintragen, z. B. 34,5.');
        return run(btn, () => saveNl(n, vals), 'Kennzahlen gespeichert.');
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
    linkedin: ['Postet ausschließlich auf die Unternehmensseite zipperwalls.de. Bis LinkedIn die Community Management API freigibt, ist LinkedIn pausiert.', 'LINKEDIN_TOKEN, LINKEDIN_TOKEN_EXPIRES, LINKEDIN_AUTHOR'],
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
const views = { plan: viewPlan, newsletter: viewNewsletter, freigabe: viewFreigabe, checkliste: viewCheckliste, zahlen: viewZahlen, verbindungen: viewVerbindungen };
// #freigabe-newsletter ist der Newsletter-Teil der Freigabe-Seite
const viewKey = () => (location.hash === '#freigabe-newsletter' ? 'freigabe' : location.hash.slice(1));
const currentView = () => (views[viewKey()] ? viewKey() : 'freigabe');

function render() {
  // Waehrend in der Freigabe getippt wird, nicht neu zeichnen
  if (currentView() === 'freigabe' && S.dirty.size && main.querySelector('.post, .nl')) {
    S.pending = true;
    document.getElementById('pending').hidden = false;
    return;
  }
  S.pending = false;
  document.getElementById('pending').hidden = true;
  const view = currentView();
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  // Zähler: offene Social-Entwürfe plus Newsletter, die in den nächsten 14 Tagen rausgehen und noch nicht freigegeben sind
  const open = socialOpen() + nlDue();
  const c = document.getElementById('count-freigabe');
  c.hidden = !open;
  c.textContent = open;
  const runner = S.status.runner;
  document.getElementById('runner').textContent = runner?.last_run ? `Letzter Lauf ${fmtDate(runner.last_run)}` : '';
  if (!S.loaded && !['plan', 'newsletter', 'checkliste'].includes(view)) {
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
  let first = 5;
  const ready = () => { if (--first <= 0) S.loaded = true; render(); };
  db.collection('posts').onSnapshot((snap) => { S.posts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); ready(); }, onErr);
  db.collection('newsletters').onSnapshot((snap) => { S.newsletters = snap.docs.map((d) => ({ id: d.id, ...d.data() })); ready(); }, onErr);
  db.collection('metrics').onSnapshot((snap) => { S.metrics = snap.docs.map((d) => ({ id: d.id, ...d.data() })); ready(); }, onErr);
  db.collection('status').onSnapshot((snap) => { S.status = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])); ready(); }, onErr);
  db.collection('checklist').onSnapshot((snap) => { S.checklist = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])); ready(); }, onErr);
}
start();
