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
    id: String(uid || `ts-${day}-${hashId(created + text)}`),
    stars: Math.round(stars),
    text,
    date: day,
    order_date: String(raw.orderDate ?? '').slice(0, 10),
    reply_existing: String(raw.reply?.comment ?? (typeof raw.reply === 'string' ? raw.reply : '') ?? '').trim(),
  };
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

// Obsidian Notiz für einen Monat: Claude/Bewertungen/YYYY-MM.md
export function obsidianPath(date) {
  return `Claude/Bewertungen/${String(date).slice(0, 7)}.md`;
}

export function obsidianEntry(r) {
  const lines = [
    `## ${r.date} ${sterne(r.stars)} (${r.stars}/5) <!-- ${r.id} -->`,
    '',
    r.text ? r.text.split('\n').map((l) => `> ${l}`).join('\n') : '> (ohne Text)',
    '',
    `Status: ${r.status || 'neu'}`,
  ];
  if (r.reply) lines.push('', '**Antwort**', '', r.reply.split('\n').map((l) => `> ${l}`).join('\n'));
  return lines.join('\n') + '\n';
}

// Einträge in bestehende Monatsnotiz einfügen. Ein Eintrag ist an seinem <!-- id --> Kommentar erkennbar
// und wird ersetzt statt doppelt angelegt.
export function upsertEntry(note, r) {
  const entry = obsidianEntry(r);
  const marker = `<!-- ${r.id} -->`;
  if (!note) return `# Bewertungen ${String(r.date).slice(0, 7)}\n\n${entry}`;
  const parts = note.split(/\n(?=## )/);
  const i = parts.findIndex((p) => p.includes(marker));
  if (i >= 0) parts[i] = entry.trimEnd();
  else parts.push(entry.trimEnd());
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// Gedankenstriche sind im Zipperwalls Schreibstil tabu. Prüfung vor jeder Anzeige und Freigabe.
export function styleProblems(reply) {
  const out = [];
  if (/[–—]/.test(reply) || / - /.test(reply)) out.push('enthält einen Gedankenstrich');
  if (reply.length > 700) out.push('zu lang (über 700 Zeichen)');
  if (!reply.trim()) out.push('leer');
  return out;
}
