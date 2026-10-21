// Trusted Shops Bewertungen: Rohdaten vereinheitlichen, Status, Obsidian Notiz.
// Gemeinsam genutzt von scripts/bewertungen.js (Abruf) und dem Dashboard (bewertungen/app.js).

export const REVIEW_STATUS = ['neu', 'Entwurf', 'Freigegeben', 'Veröffentlicht', 'Übersprungen'];

// Ein Hash aus Datum und Text als stabile ID, falls die Quelle keine eigene ID liefert
function hashId(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Zwei Quellen:
// Öffentliche Schnittstelle (v2.4, geprüft 18.10.2026): response.data.shop.reviews mit UID, mark ("5.00"), comment,
//   creationDate. Ohne Shop-Antworten.
// eTrusted Händler-Schnittstelle (laut Doku, noch nicht gegen das Konto geprüft): items mit id ("rev-..."), rating,
//   title, comment, submittedAt, status, reply.comment.
// Unbrauchbare Einträge (ohne Note) werden verworfen.
export function normalizeReview(raw) {
  if (!raw || typeof raw !== 'object' || raw.status === 'REJECTED') return null;
  const stars = Number(raw.mark ?? raw.rating ?? raw.stars);
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) return null;
  const text = String(raw.comment ?? raw.text ?? raw.description ?? raw.title ?? '').trim();
  const created = String(raw.creationDate ?? raw.submittedAt ?? raw.createdAt ?? raw.date ?? '').trim();
  const day = created.slice(0, 10);
  const uid = raw.UID ?? raw.uid ?? raw.reviewUid ?? raw.id;
  return {
    id: uid ? etrustedId(String(uid)) : `ts-${day}-${hashId(created + text)}`,
    stars: Math.round(stars),
    text,
    date: day,
    order_date: String(raw.orderDate ?? '').slice(0, 10),
    reply_existing: String(raw.reply?.comment ?? (typeof raw.reply === 'string' ? raw.reply : '') ?? '').trim(),
  };
}

// Die UID der öffentlichen Schnittstelle ist die eTrusted ID ohne Bindestriche (geprüft 18.10.2026):
// 91e858c069ef4ed29b153cf00dd1006c entspricht rev-91e858c0-69ef-4ed2-9b15-3cf00dd1006c. So haben beide Quellen dieselbe ID.
export function etrustedId(uid) {
  const m = /^(?:rev-)?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i.exec(uid);
  return m ? `rev-${m.slice(1).join('-')}`.toLowerCase() : uid;
}

// Aus der Antwort der Schnittstelle die Liste ziehen (verschachtelt oder flach)
export function extractReviews(json) {
  const data = json?.response?.data ?? json?.data ?? json;
  const list = data?.shop?.reviews ?? data?.reviews ?? data?.items ?? (Array.isArray(data) ? data : []);
  return list.map(normalizeReview).filter(Boolean);
}

// Welche der abgerufenen Bewertungen sind neu (noch nicht in der Datenbank)?
export function newReviews(fetched, knownIds) {
  const known = new Set(knownIds);
  return fetched.filter((r) => !known.has(r.id));
}

// Gleiche Bewertung aus beiden Quellen erkennen (die IDs unterscheiden sich): Tag, Note und Text
export function matchKey(r) {
  return `${r.date}|${r.stars}|${String(r.text || '').replace(/\s+/g, ' ').trim()}`;
}

// Tonart je Note: bestimmt, welche Regeln aus docs/bewertungen/schreibstil.md gelten
export function tone(stars) {
  if (stars >= 4) return 'positiv';
  if (stars === 3) return 'gemischt';
  return 'kritisch';
}

export function sterne(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// Obsidian (Vault github.com/Belapfirrmann/obsidian-vault): eine Notiz pro Jahr, Namensregeln des Vaults
// (sprechender Titel ohne Datums-Präfix, Datum im Frontmatter, keine Gedankenstriche).
export const OBSIDIAN_DIR = 'Themen/Trusted Shops Bewertungen';
export function obsidianPath(date) {
  return `${OBSIDIAN_DIR}/Bewertungen ${String(date).slice(0, 4)}.md`;
}

const deDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d || '');
const quote = (t) => t.split('\n').map((l) => `> ${l}`).join('\n');

export function obsidianEntry(r) {
  const lines = [`## ${deDate(r.date)} ${sterne(r.stars)} <!-- ${r.id} ${r.date} -->`, '', r.text ? quote(r.text) : '> (nur Sterne, ohne Text)', ''];
  const when = r.published_at ? ` am ${deDate(String(r.published_at).slice(0, 10))}` : '';
  lines.push(`Status: ${r.status || 'neu'}${r.status === 'Veröffentlicht' ? when : ''}`);
  if (r.reply) lines.push('', `**Antwort${r.status === 'Veröffentlicht' ? '' : ' (Entwurf)'}**`, '', quote(r.reply));
  return lines.join('\n') + '\n';
}

function noteHead(year) {
  return `---\ntags: [trusted-shops, bewertungen, kunden]\ndatum: ${new Date().toISOString().slice(0, 10)}\n---\n\n` +
    `# Trusted Shops Bewertungen ${year}\n\n` +
    'Wird von der Claude Routine „Bewertungen (Trusted Shops)“ gepflegt (Repo zipperwalls.de, docs/routinen/bewertungen.md). ' +
    'Freigegeben wird im Zipperwalls Dashboard, Reiter Bewertungen. Schreibstil: [[Stimme des Kunden]] und docs/bewertungen/schreibstil.md.\n';
}

// Eintrag einfügen oder ersetzen (erkennbar am <!-- id datum --> Kommentar), Einträge nach Datum absteigend.
// Alles vor dem ersten Eintrag (Frontmatter, Einleitung, eigene Notizen) bleibt unverändert.
export function upsertEntry(note, r) {
  const entry = obsidianEntry(r).trimEnd();
  const parts = (note || noteHead(String(r.date).slice(0, 4))).split(/\n(?=## )/);
  const head = parts[0].trimEnd();
  const entries = parts.slice(1).map((e) => e.trimEnd());
  const key = (e) => (/<!-- (\S+) (\S+) -->/.exec(e) || [])[1];
  const date = (e) => (/<!-- \S+ (\S+) -->/.exec(e) || [])[1] || '';
  const i = entries.findIndex((e) => key(e) === r.id);
  if (i >= 0) entries[i] = entry; else entries.push(entry);
  entries.sort((a, b) => date(b).localeCompare(date(a)));
  return [head, ...entries].join('\n\n') + '\n';
}

// Gedankenstriche sind im Zipperwalls Schreibstil tabu. Prüfung vor jeder Anzeige und Freigabe.
export function styleProblems(reply) {
  const out = [];
  if (/[–—]/.test(reply) || / - /.test(reply)) out.push('enthält einen Gedankenstrich');
  if (reply.length > 700) out.push('zu lang (über 700 Zeichen)');
  if (!reply.trim()) out.push('leer');
  return out;
}
