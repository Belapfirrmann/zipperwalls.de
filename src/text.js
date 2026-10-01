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

export function composeText(post, channel) {
  const variants = typeof post.variants === 'string' ? JSON.parse(post.variants || '{}') : post.variants || {};
  const tags = normalizeHashtags(typeof post.hashtags === 'string' ? JSON.parse(post.hashtags || '[]') : post.hashtags);
  let text = String(variants[channel] || post.body || '').trim();
  const missing = tags.filter((t) => !text.toLowerCase().includes(t.toLowerCase()));
  if (missing.length) text += '\n\n' + missing.join(' ');
  return text;
}

// Gibt eine Fehlermeldung (Deutsch) oder null zurueck
export function validate(channel, text, hasImage) {
  if (!text) return 'Kein Text vorhanden.';
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
