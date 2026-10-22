// Ansicht "To-dos": je eine Liste für Bela und Darien. Läuft im Zipperwalls Dashboard, nutzt dessen S, main, esc, toast,
// nowIso, write, confirmClick, render.
// Daten in der Artefakt-Datenbank:
//   todos/<id>  who (bela|darien), text, due (YYYY-MM-DD oder null), done_at (ISO oder null), created_at, source (dashboard|claude)
// Claude darf Aufgaben eintragen (ArtifactData set mit source "claude"), hakt sie aber nie selbst ab.
const TODO_PEOPLE = [['bela', 'Bela'], ['darien', 'Darien']];
const TODO_NAME = Object.fromEntries(TODO_PEOPLE);
const TD = { open: new Set() }; // aufgeklappte "Erledigt"-Bereiche

const todoToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
const todoOpen = (who) => S.todos.filter((t) => !t.done_at && (!who || t.who === who));
const todoCount = () => todoOpen().length;
function todoDue(due) {
  if (!due) return '';
  const today = todoToday();
  const d = new Date(due + 'T12:00:00');
  const label = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  if (due < today) return `<span class="badge tiny td-late">überfällig, ${label}</span>`;
  if (due === today) return `<span class="badge tiny">heute</span>`;
  return `<span class="muted small">bis ${label}</span>`;
}
// Offene: überfällige und datierte zuerst (nach Datum), dann ohne Datum nach Anlage
const todoSort = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || String(a.created_at).localeCompare(String(b.created_at));

function todoItem(t) {
  const other = TODO_PEOPLE.find(([k]) => k !== t.who);
  return `<div class="td-item${t.done_at ? ' done' : ''}">
    <label class="check${t.done_at ? ' done' : ''}"><input type="checkbox" data-td-done="${esc(t.id)}" ${t.done_at ? 'checked' : ''} ${S.db ? '' : 'disabled'}><span class="box"></span>
      <span><span class="t">${esc(t.text)}</span>
      <small>${[t.done_at ? `erledigt ${fmtDate(t.done_at)}` : todoDue(t.due), t.source === 'claude' ? 'von Claude eingetragen' : ''].filter(Boolean).join(' · ')}</small></span></label>
    ${t.done_at ? '' : `<div class="td-act">
      <button class="btn ghost small" type="button" data-td-move="${esc(t.id)}" title="An ${other[1]} geben">→ ${other[1]}</button>
      <button class="btn ghost small" type="button" data-td-del="${esc(t.id)}" aria-label="Löschen">Löschen</button></div>`}
  </div>`;
}

function todoColumn(who, name) {
  const open = todoOpen(who).sort(todoSort);
  const done = S.todos.filter((t) => t.who === who && t.done_at).sort((a, b) => String(b.done_at).localeCompare(String(a.done_at))).slice(0, 30);
  const late = open.filter((t) => t.due && t.due < todoToday()).length;
  return `<section class="card td-col">
    <div class="row" style="justify-content:space-between"><h2>${name}</h2>
      <span class="muted small">${open.length ? `${open.length} offen${late ? `, ${late} überfällig` : ''}` : 'alles erledigt'}</span></div>
    <form class="td-add" data-td-who="${who}">
      <input type="text" name="text" placeholder="Neue Aufgabe für ${name}" aria-label="Neue Aufgabe für ${name}" maxlength="300" ${S.db ? '' : 'disabled'}>
      <input type="date" name="due" aria-label="Erledigen bis (optional)" title="Erledigen bis (optional)" ${S.db ? '' : 'disabled'}>
      <button class="btn small" type="submit" ${S.db ? '' : 'disabled'}>Hinzufügen</button>
    </form>
    <div class="td-list">${open.length ? open.map(todoItem).join('') : '<p class="muted small" style="margin:14px 0 0">Keine offenen Aufgaben.</p>'}</div>
    ${done.length ? `<details class="td-done" data-td-open="${who}"${TD.open.has(who) ? ' open' : ''}><summary>Erledigt (${done.length})</summary>${done.map(todoItem).join('')}</details>` : ''}
  </section>`;
}

function viewTodos() {
  main.innerHTML = `
    <div class="head"><h1>To-dos</h1><p>Aufgaben für Bela und Darien. Ihr seht beide Listen, Häkchen und neue Einträge werden sofort gespeichert. Mit dem Pfeil gebt ihr eine Aufgabe an den anderen weiter.</p></div>
    <div class="grid g2">${TODO_PEOPLE.map(([who, name]) => todoColumn(who, name)).join('')}</div>`;

  main.querySelectorAll('form.td-add').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const text = f.text.value.trim();
    if (!text) return f.text.focus();
    const id = `t-${Date.now()}`;
    try {
      await write((db) => db.collection('todos').doc(id).set({ who: f.dataset.tdWho, text, due: f.due.value || null, done_at: null, created_at: nowIso(), source: 'dashboard' }));
      requestAnimationFrame(() => main.querySelector(`form[data-td-who="${f.dataset.tdWho}"] input[name=text]`)?.focus());
    } catch (err) { toast(err.message); }
  }));
  main.querySelectorAll('[data-td-done]').forEach((cb) => (cb.onchange = async () => {
    try {
      await write((db) => db.collection('todos').doc(cb.dataset.tdDone).update({ done_at: cb.checked ? nowIso() : null }));
    } catch (err) { toast(err.message); cb.checked = !cb.checked; }
  }));
  main.querySelectorAll('[data-td-move]').forEach((b) => (b.onclick = async () => {
    const t = S.todos.find((x) => x.id === b.dataset.tdMove);
    if (!t) return;
    const to = t.who === 'bela' ? 'darien' : 'bela';
    try {
      await write((db) => db.collection('todos').doc(t.id).update({ who: to }));
      toast(`An ${TODO_NAME[to]} gegeben.`);
    } catch (err) { toast(err.message); }
  }));
  main.querySelectorAll('[data-td-del]').forEach((b) => (b.onclick = () => confirmClick(b, 'Wirklich löschen?', async () => {
    try { await write((db) => db.collection('todos').doc(b.dataset.tdDel).delete()); } catch (err) { toast(err.message); }
  })));
  main.querySelectorAll('details.td-done').forEach((d) => d.addEventListener('toggle', () => {
    d.open ? TD.open.add(d.dataset.tdOpen) : TD.open.delete(d.dataset.tdOpen);
  }));
}
