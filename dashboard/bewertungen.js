// Ansicht "Bewertungen" (Trusted Shops): pro Bewertung zwei Felder (Bewertung, Antwortvorschlag von Claude)
// und darunter Freigeben und Verbessern. Läuft im Zipperwalls Dashboard, nutzt dessen S, main, esc, toast, nowIso.
// Daten in der Artefakt-Datenbank:
//   reviews/<id>  stars, text, date, tone, status (neu|Entwurf|Freigegeben|Veröffentlicht|Übersprungen), reply, reply_note,
//                 approved_at, published_at, created_at
//   wishes/<id>   target (Review-ID), text, status (offen|in Arbeit|erledigt|Rückfrage), reply, replied_at, created_at
// Routine und Ablauf: docs/routinen/bewertungen.md. tone, sterne, styleProblems kommen aus src/bewertungen.js.
const RV = { filter: 'offen', open: new Set() };
const rvWhen = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '');
const rvDay = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : '');
const rvIsOpen = (r) => r.status === 'neu' || r.status === 'Entwurf';
const RV_BADGE = { neu: '', Entwurf: '', Freigegeben: 'dark', Veröffentlicht: 'grey', Übersprungen: 'grey' };
const RV_TONE = { positiv: 'positive Bewertung', gemischt: 'gemischte Bewertung', kritisch: 'kritische Bewertung' };
const rvOpenCount = () => S.reviews.filter(rvIsOpen).length;

function rvVisible() {
  const list = S.reviews.filter((r) => (RV.filter === 'offen' ? rvIsOpen(r) || r.status === 'Freigegeben' : true));
  return list.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at)));
}

function rvWishList(id) {
  const list = S.wishes.filter((w) => w.target === id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 3);
  if (!list.length) return '';
  return `<div class="wish-list">${list.map((w) => {
    const done = w.status === 'erledigt' || w.status === 'Rückfrage';
    return `<div class="wish ${done ? 'done' : 'busy'}">
      <div class="wish-q"><span class="muted small">${rvWhen(w.created_at)}</span><p>${esc(w.text)}</p></div>
      ${done ? `<div class="wish-a${w.status === 'Rückfrage' ? ' ask' : ''}"><span class="who">Claude${w.status === 'Rückfrage' ? ' · Rückfrage an euch' : ''} <span class="muted small">${rvWhen(w.replied_at)}</span></span><p>${esc(w.reply || 'Erledigt.')}</p></div>`
        : `<div class="wish-a working" role="status"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${w.status === 'in Arbeit' ? 'Claude arbeitet daran …' : 'Angekommen, Claude ist dran …'}</span></div>`}
    </div>`;
  }).join('')}</div>`;
}

function rvCard(r) {
  const hasReply = !!(r.reply && r.reply.trim());
  const problems = hasReply ? styleProblems(r.reply) : [];
  const stage = r.status;
  const approved = stage === 'Freigegeben' || stage === 'Veröffentlicht';
  return `<article class="card rv" data-id="${esc(r.id)}">
    <header class="rv-head">
      <span class="stars" role="img" aria-label="${r.stars} von 5 Sternen">${sterne(r.stars)}</span>
      <span class="muted small">${esc(rvDay(r.date))} · ${RV_TONE[r.tone || tone(r.stars)]}</span>
      <span class="badge tiny ${RV_BADGE[stage] || ''}">${esc(stage)}</span>
    </header>
    <div class="rv-cols">
      <section class="rv-box" aria-label="Bewertung von Trusted Shops">
        <h3 class="label">Bewertung bei Trusted Shops</h3>
        <p class="rv-text">${r.text ? esc(r.text) : '<span class="muted">Ohne Text, nur Sterne.</span>'}</p>
      </section>
      <section class="rv-box reply" aria-label="Vorgeschlagene Antwort">
        <h3 class="label">Vorgeschlagene Antwort von Claude</h3>
        ${hasReply ? `<p class="rv-text">${esc(r.reply)}</p>
          ${r.reply_note ? `<p class="muted small">Hinweis von Claude: ${esc(r.reply_note)}</p>` : ''}
          ${problems.length ? `<p class="open-point">Stil: ${esc(problems.join(', '))}. Bitte verbessern lassen.</p>` : ''}`
        : `<p class="muted">${r.reply_note ? 'Hinweis von Claude: ' + esc(r.reply_note) : 'Claude schreibt den Entwurf beim nächsten Lauf.'}</p>`}
      </section>
    </div>
    <div class="rv-actions">
      ${approved
        ? `<button class="btn ghost" data-rv="copy">Antwort kopieren</button>
           ${stage === 'Freigegeben' ? '<button class="btn dark" data-rv="published">In Trusted Shops eingestellt</button>' : '<span class="muted small">Veröffentlicht ' + esc(rvWhen(r.published_at)) + '</span>'}
           <button class="btn ghost small" data-rv="reopen">Zurück in den Entwurf</button>`
        : `<button class="btn" data-rv="approve"${hasReply && !problems.length ? '' : ' disabled'}>Freigeben</button>
           <button class="btn dark" data-rv="improve-toggle"${hasReply ? '' : ' disabled'}>Verbessern</button>
           <button class="btn ghost small" data-rv="skip">Keine Antwort nötig</button>`}
    </div>
    <div class="improve" data-improve ${RV.open.has(r.id) ? '' : 'hidden'}>
      <label class="label" for="rv-imp-${esc(r.id)}">Was soll Claude ändern?</label>
      <div class="improve-row">
        <textarea id="rv-imp-${esc(r.id)}" data-imp rows="2" maxlength="3000" placeholder="z. B. kürzer, persönlicher, den Liefertermin erwähnen"></textarea>
        <button class="btn dark" data-rv="improve">An Claude senden</button>
      </div>
    </div>
    <div class="wishes" data-rv-wishes="${esc(r.id)}">${rvWishList(r.id)}</div>
  </article>`;
}

function viewBewertungen() {
  const open = rvOpenCount();
  const list = rvVisible();
  const avg = S.reviews.length ? (S.reviews.reduce((s, r) => s + r.stars, 0) / S.reviews.length).toFixed(2).replace('.', ',') : '';
  main.innerHTML = `
    <div class="head">
      <h1>Bewertungen</h1>
      <p>${open ? `${open} ${open === 1 ? 'Bewertung wartet' : 'Bewertungen warten'} auf Ihre Freigabe.` : 'Alles beantwortet.'}${avg ? ` Schnitt der erfassten Bewertungen: ${avg} von 5.` : ''}</p>
      <div class="tabs" role="tablist">
        <button class="tab${RV.filter === 'offen' ? ' on' : ''}" data-rv-filter="offen" role="tab">Offen</button>
        <button class="tab${RV.filter === 'alle' ? ' on' : ''}" data-rv-filter="alle" role="tab">Alle</button>
      </div>
    </div>
    ${list.length ? `<div class="rv-list">${list.map(rvCard).join('')}</div>`
      : `<div class="card empty"><h2>${RV.filter === 'offen' ? 'Nichts zu tun' : 'Noch keine Bewertungen'}</h2><p style="margin-top:10px">${S.reviews.length ? 'Neue Bewertungen erscheinen hier, sobald die Routine sie bei Trusted Shops findet.' : 'Die Routine „Bewertungen“ legt neue Bewertungen von Trusted Shops mit einem Antwortvorschlag hier ab.'}</p></div>`}`;
}

// Neue Antworten von Claude sofort einsetzen, auch wenn gerade getippt wird
function refreshRvWishes() {
  main.querySelectorAll('[data-rv-wishes]').forEach((el) => { el.innerHTML = rvWishList(el.dataset.rvWishes); });
}

const rvPatch = (id, fields) => write((db) => db.collection('reviews').doc(id).update(fields));

async function rvSendImprove(btn, el, r) {
  const box = el.querySelector('[data-imp]');
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
    const text = `Antwort auf Trusted Shops Bewertung ${r.id} (${r.stars} Sterne) verbessern. Aktuelle Antwort:\n${r.reply}\n\nWunsch:\n${wish}`.slice(0, 3900);
    await S.comments.sendToClaude({ anchor, text });
    await write((db) => db.collection('wishes').doc(`w-${Date.now()}`).set({ target: r.id, text: wish, status: 'offen', created_at: nowIso() })).catch(() => {});
    box.value = '';
    toast('An Claude gesendet. Der neue Entwurf erscheint hier.');
  } catch (e) {
    const msg = { consent_required: 'Bitte erlauben Sie dem Dashboard einmalig, Kommentare zu schreiben, und senden Sie erneut.', forbidden: 'Kommentieren aus dem Dashboard ist hier ausgeschaltet.', rate_limited: 'Kurz warten, dann erneut senden.', claude_unavailable: 'Claude ist gerade nicht erreichbar. Ihr Text ist noch da, bitte später erneut senden.' }[e?.code];
    toast(msg || e?.message || 'Senden fehlgeschlagen.');
  }
  btn.disabled = false;
}

main.addEventListener('click', async (e) => {
  const f = e.target.closest('[data-rv-filter]');
  if (f) { RV.filter = f.dataset.rvFilter; return render(); }
  const btn = e.target.closest('[data-rv]');
  if (!btn) return;
  const el = btn.closest('.rv');
  const r = S.reviews.find((x) => x.id === el?.dataset.id);
  if (!r) return;
  try {
    switch (btn.dataset.rv) {
      case 'approve': {
        const p = styleProblems(r.reply || '');
        if (p.length) return toast('Antwort ' + p.join(', ') + '.');
        await rvPatch(r.id, { status: 'Freigegeben', approved_at: nowIso() });
        toast('Freigegeben. Antwort kopieren und bei Trusted Shops einstellen.');
        break;
      }
      case 'improve-toggle': {
        const box = el.querySelector('[data-improve]');
        box.hidden = !box.hidden;
        box.hidden ? RV.open.delete(r.id) : RV.open.add(r.id);
        if (!box.hidden) box.querySelector('textarea').focus();
        break;
      }
      case 'improve': await rvSendImprove(btn, el, r); break;
      case 'copy':
        try { await navigator.clipboard.writeText(r.reply); toast('Antwort kopiert.'); }
        catch { toast('Kopieren nicht möglich. Bitte den Text markieren und von Hand kopieren.'); }
        break;
      case 'published': await rvPatch(r.id, { status: 'Veröffentlicht', published_at: nowIso() }); toast('Als eingestellt markiert.'); break;
      case 'reopen': await rvPatch(r.id, { status: 'Entwurf', approved_at: null }); break;
      case 'skip': await rvPatch(r.id, { status: 'Übersprungen' }); toast('Übersprungen.'); break;
    }
  } catch (err) {
    toast(err?.message || 'Speichern fehlgeschlagen.');
  }
});
