// Ansicht "Ideen": Themen, Kundenfragen und Fotos sammeln (auch vom Handy), Claude macht daraus auf Wunsch einen Entwurf.
// Läuft im Zipperwalls Dashboard, nutzt dessen S, main, esc, toast, nowIso, write, confirmClick, blobUrl, fmtDate, TODO_PEOPLE.
// Daten in der Artefakt-Datenbank:
//   ideas/<id>     text, kind (post|newsletter|offen), who (bela|darien), photo (Asset-ID oder null),
//                  status (neu|beauftragt|umgesetzt|verworfen), created_at, result (Hinweis von Claude, z. B. welcher Entwurf)
//   requests/idee-<id>  kind (social|newsletter), nr null, idea <id>, prompt, status offen|in Arbeit|erledigt|fehler
// Die Aufträge holen die Routinen „Social Posting“ und „Newsletter Versand“ ab (docs/routinen/auftraege.md).
const IDEA_KIND = { post: 'Social-Media-Post', newsletter: 'Newsletter', offen: 'Noch offen' };
const IDEA_FILTERS = { neu: ['neu'], beauftragt: ['beauftragt'], umgesetzt: ['umgesetzt'], alle: null };
const ID = { filter: 'neu', who: 'bela', kind: 'post', photo: null, photoName: '' };
const ideasNew = () => (S.ideas || []).filter((i) => i.status === 'neu');

function ideaCard(i) {
  const req = S.requests[`idee-${i.id}`];
  const reqLine = req ? { offen: 'Beauftragt, Claude holt den Auftrag beim nächsten Lauf ab (werktags 7 bis 19 Uhr, stündlich).', 'in Arbeit': 'Claude erstellt gerade den Entwurf.', erledigt: 'Entwurf erstellt, er liegt in der Freigabe.', fehler: `Fehler: ${req.error || 'unbekannt'}` }[req.status] : '';
  return `<article class="card idea">
    ${i.photo ? `<img class="idea-img" src="${blobUrl(i.photo)}" alt="Foto zur Idee" data-zoom="idee-${esc(i.id)}">` : ''}
    <div style="min-width:0">
      <div class="row" style="gap:8px;margin-bottom:6px"><span class="badge ${i.status === 'neu' ? '' : 'grey'}">${esc(i.status)}</span><span class="pill-tag b1">${esc(IDEA_KIND[i.kind] || i.kind)}</span>
        <span class="muted small">${esc(TODO_NAME[i.who] || '')}, ${fmtDate(i.created_at)}</span></div>
      <p class="idea-text">${esc(i.text)}</p>
      ${reqLine ? `<p class="muted small" style="margin:6px 0 0">${esc(reqLine)}</p>` : ''}
      ${i.result ? `<p class="small" style="margin:6px 0 0"><strong>Claude:</strong> ${esc(i.result)}</p>` : ''}
      <div class="row" style="margin-top:12px">
        ${i.status === 'neu' ? `
          <button class="btn small" type="button" data-idea-make="social" data-id="${esc(i.id)}">Als Post erstellen lassen</button>
          <button class="btn small ghost" type="button" data-idea-make="newsletter" data-id="${esc(i.id)}">Als Newsletter erstellen lassen</button>
          <button class="btn small ghost" type="button" data-idea-status="verworfen" data-id="${esc(i.id)}">Verwerfen</button>` : ''}
        ${i.status === 'beauftragt' && req?.status === 'erledigt' ? `<button class="btn small ghost" type="button" data-idea-status="umgesetzt" data-id="${esc(i.id)}">Als umgesetzt markieren</button>` : ''}
        ${i.status === 'verworfen' || i.status === 'umgesetzt' ? `<button class="btn small ghost" type="button" data-idea-status="neu" data-id="${esc(i.id)}">Wieder öffnen</button>` : ''}
        <button class="btn small ghost" type="button" data-idea-del="${esc(i.id)}">Löschen</button>
      </div>
    </div>
  </article>`;
}

function viewIdeen() {
  const all = (S.ideas || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const count = (k) => (IDEA_FILTERS[k] ? all.filter((i) => IDEA_FILTERS[k].includes(i.status)).length : all.length);
  const list = IDEA_FILTERS[ID.filter] ? all.filter((i) => IDEA_FILTERS[ID.filter].includes(i.status)) : all;
  const dis = S.db ? '' : 'disabled';
  main.innerHTML = `
    <div class="head"><h1>Ideen</h1><p>Themen, Kundenfragen, Fotos von der Messe: hier landet alles, was ein Post oder Newsletter werden könnte. Auf Wunsch macht Claude daraus einen Entwurf, der dann ganz normal in der Freigabe auftaucht.</p></div>
    <section class="section card">
      <form class="idea-add">
        <label class="label" for="idea-text">Neue Idee</label>
        <textarea id="idea-text" name="text" placeholder="Zum Beispiel: Kunde fragt oft, ob die Theke in einen Kombi passt. Foto vom Aufbau auf der Messe XY." ${dis}></textarea>
        <div class="row" style="margin-top:10px;gap:14px">
          <div class="tabs" role="group" aria-label="Von">${TODO_PEOPLE.map(([k, n]) => `<button type="button" class="tab ${ID.who === k ? 'on' : ''}" data-idea-who="${k}">${n}</button>`).join('')}</div>
          <div class="tabs" role="group" aria-label="Wofür">${Object.entries(IDEA_KIND).map(([k, n]) => `<button type="button" class="tab ${ID.kind === k ? 'on' : ''}" data-idea-kind="${k}">${n}</button>`).join('')}</div>
          ${S.assets ? `<label class="btn ghost small">${ID.photo ? 'Foto ändern' : 'Foto hinzufügen'}<input type="file" accept="image/*" data-idea-photo hidden></label>${ID.photo ? `<span class="muted small">${esc(ID.photoName)}</span>` : ''}` : ''}
          <button class="btn" type="submit" style="margin-left:auto" ${dis}>Idee speichern</button>
        </div>
      </form>
    </section>
    <div class="row" style="margin-bottom:18px">${Object.keys(IDEA_FILTERS).map((k) => `<button class="btn small ${ID.filter === k ? 'dark' : 'ghost'}" data-idea-filter="${k}">${k[0].toUpperCase() + k.slice(1)} (${count(k)})</button>`).join('')}</div>
    <div class="grid" style="gap:16px">${list.length ? list.map(ideaCard).join('') : '<div class="card empty">Keine Ideen in dieser Ansicht.</div>'}</div>`;

  const form = main.querySelector('.idea-add');
  const keep = () => { ID.draft = form.text.value; };
  form.text.value = ID.draft || '';
  form.text.oninput = keep;
  main.querySelectorAll('[data-idea-who]').forEach((b) => (b.onclick = () => { keep(); ID.who = b.dataset.ideaWho; render(); }));
  main.querySelectorAll('[data-idea-kind]').forEach((b) => (b.onclick = () => { keep(); ID.kind = b.dataset.ideaKind; render(); }));
  main.querySelectorAll('[data-idea-filter]').forEach((b) => (b.onclick = () => { keep(); ID.filter = b.dataset.ideaFilter; render(); }));
  const photo = main.querySelector('[data-idea-photo]');
  if (photo) photo.onchange = async () => {
    const file = photo.files?.[0];
    if (!file) return;
    keep();
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('Foto größer als 15 MB.');
      toast('Foto wird hochgeladen …');
      const up = await S.assets.upload(file);
      ID.photo = up.id;
      ID.photoName = file.name;
      toast('Foto bereit, jetzt die Idee speichern.');
      render();
    } catch (e) { toast(e?.code === 'too_large' ? 'Foto zu groß.' : e.message || 'Hochladen fehlgeschlagen.'); }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = form.text.value.trim();
    if (!text) return form.text.focus();
    const id = `i-${Date.now()}`;
    try {
      await write((db) => db.collection('ideas').doc(id).set({ text, kind: ID.kind, who: ID.who, photo: ID.photo || null, status: 'neu', created_at: nowIso(), result: null }));
      Object.assign(ID, { draft: '', photo: null, photoName: '', filter: 'neu' });
      toast('Idee gespeichert.');
      render();
    } catch (err) { toast(err.message); }
  };
  main.querySelectorAll('[data-idea-make]').forEach((b) => (b.onclick = () => {
    const i = all.find((x) => x.id === b.dataset.id);
    const kind = b.dataset.ideaMake;
    confirmClick(b, kind === 'social' ? 'Post-Entwurf beauftragen?' : 'Newsletter-Entwurf beauftragen?', async () => {
      try {
        await write((db) => db.collection('requests').doc(`idee-${i.id}`).set({
          kind, nr: null, idea: i.id, status: 'offen', requested_at: nowIso(), started_at: null, done_at: null, error: null,
          prompt: `Idee aus dem Dashboard (${TODO_NAME[i.who] || ''}): ${i.text}`.slice(0, 2000),
        }));
        await write((db) => db.collection('ideas').doc(i.id).update({ status: 'beauftragt', kind: kind === 'social' ? 'post' : 'newsletter' }));
        toast('Beauftragt. Claude holt das beim nächsten Lauf ab.');
      } catch (err) { toast(err.message); }
    });
  }));
  main.querySelectorAll('[data-idea-status]').forEach((b) => (b.onclick = async () => {
    try { await write((db) => db.collection('ideas').doc(b.dataset.id).update({ status: b.dataset.ideaStatus })); } catch (err) { toast(err.message); }
  }));
  main.querySelectorAll('[data-idea-del]').forEach((b) => (b.onclick = () => confirmClick(b, 'Wirklich löschen?', async () => {
    try { await write((db) => db.collection('ideas').doc(b.dataset.ideaDel).delete()); } catch (err) { toast(err.message); }
  })));
}
