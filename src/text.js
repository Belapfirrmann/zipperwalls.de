// Reine Funktionen: Textaufbereitung und Pruefung je Kanal (ohne Netzwerk, gut testbar)
export const CHANNELS = ['facebook', 'instagram', 'linkedin'];

export const LIMITS = {
  facebook: 63000,
  instagram: 2200,
  linkedin: 3000,
};

export function normalizeHashtags(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const t = String(raw).trim().replace(/^#+/, '').replace(/\s+/g, '');
    if (t && !out.includes(t)) out.push(t);
  }
  return out.map((t) => '#' + t);
}

// Hinweis auf den Link in der Bio (linktr.ee/zipperwalls, Profil-Link bei Instagram und Facebook), steht in jedem Post
// vor den Hashtags (Vorgabe Bela und Darien, 07.10.2026). Bei Facebook und LinkedIn ist der Link zusätzlich klickbar.
export const BIO_LINK = 'https://linktr.ee/zipperwalls';
export const BIO_HINT = {
  instagram: 'Unseren Onlineshop und vieles mehr finden Sie über den Link in unserer Bio.',
  facebook: `Unseren Onlineshop und vieles mehr finden Sie über den Link in unserer Bio: ${BIO_LINK}`,
  linkedin: `Unseren Onlineshop und vieles mehr finden Sie hier: ${BIO_LINK}`,
};
const hasBioHint = (text) => /linktr\.ee\/zipperwalls|link in unserer bio/i.test(text);

export function composeText(post, channel) {
  const variants = typeof post.variants === 'string' ? JSON.parse(post.variants || '{}') : post.variants || {};
  const tags = normalizeHashtags(typeof post.hashtags === 'string' ? JSON.parse(post.hashtags || '[]') : post.hashtags);
  let text = String(variants[channel] || post.body || '').trim();
  // Hashtags am Ende abtrennen, damit der Hinweis davor steht
  const tail = text.match(/(?:\n\s*(?:#[\p{L}\p{N}_]+\s*)+)$/u);
  const trailing = tail ? tail[0].trim() : '';
  if (tail) text = text.slice(0, tail.index).trim();
  if (text && BIO_HINT[channel] && !hasBioHint(text)) text += '\n\n' + BIO_HINT[channel];
  if (trailing) text += '\n\n' + trailing;
  const missing = tags.filter((t) => !text.toLowerCase().includes(t.toLowerCase()));
  if (missing.length) text += '\n\n' + missing.join(' ');
  return text;
}

// Gibt eine Fehlermeldung (Deutsch) oder null zurueck
export function validate(channel, text, hasImage) {
  if (!text) return 'Kein Text vorhanden.';
  const placeholder = findPlaceholder(text);
  if (placeholder) return `Platzhalter ${placeholder} im Text noch ersetzen.`;
  const forbidden = findForbidden(text);
  if (forbidden) return `„${forbidden}“ darf nicht vorkommen: keine Angaben zur Herkunft der Produkte.`;
  if (text.length > LIMITS[channel]) return `Text zu lang (${text.length} von ${LIMITS[channel]} Zeichen).`;
  if (channel === 'instagram') {
    if (!hasImage) return 'Instagram braucht ein Bild.';
    const tags = (text.match(/(^|\s)#\w+/g) || []).length;
    if (tags > 30) return `Zu viele Hashtags (${tags}, maximal 30).`;
  }
  return null;
}

// LinkedIn "little text format": reservierte Zeichen muessen maskiert werden.
// Hashtags (# direkt vor einem Wort am Wortanfang) bleiben erhalten.
export function escapeLinkedIn(text) {
  const reserved = /[\\|{}@\[\]()<>*_~]/g;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '#') {
      const prevOk = i === 0 || /\s/.test(text[i - 1]);
      const nextOk = /[\p{L}\p{N}]/u.test(text[i + 1] || '');
      out += prevOk && nextOk ? '#' : '\\#';
    } else {
      out += c.replace(reserved, (m) => '\\' + m);
    }
  }
  return out;
}

// ISO Kalenderwoche, z. B. 2026-W40
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Platzhalter wie [DATUM] oder [ZEITEN] aus dem Redaktionsplan duerfen nie veroeffentlicht werden
export function findPlaceholder(text) {
  const m = /\[[A-ZÄÖÜ][A-ZÄÖÜ _-]{2,}\]/.exec(text || '');
  return m ? m[0] : null;
}

// Ortszeit Berlin (z. B. "2026-10-06", "09:00") in UTC ISO umrechnen, Sommer und Winterzeit beachtet
export function berlinToUtc(date, time = '09:00') {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (ts) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(new Date(ts))
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - ts;
  };
  return new Date(guess - offset(guess - offset(guess))).toISOString();
}

// Keine Herkunftsangaben: Ortsnamen und "Made in" Aussagen sind tabu (Vorgabe Bela und Darien)
const FORBIDDEN = [/herxheim/i, /aus deutschland/i, /in deutschland (hergestellt|produziert|gefertigt|gedruckt)/i, /made in germany/i, /deutsche[nr]? (produktion|fertigung|qualität)/i, /hergestellt in/i, /produziert in/i];
export function findForbidden(text) {
  for (const re of FORBIDDEN) {
    const m = re.exec(text || '');
    if (m) return m[0];
  }
  return null;
}
