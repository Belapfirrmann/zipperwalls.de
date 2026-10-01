// Tokens werden verschluesselt in D1 abgelegt (AES-GCM, Schluessel aus Worker-Secret ENCRYPTION_KEY)
const b64 = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

async function key(env) {
  if (!env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY ist nicht gesetzt.');
  const raw = b64.dec(env.ENCRYPTION_KEY);
  if (raw.length !== 32) throw new Error('ENCRYPTION_KEY muss 32 Bytes (base64) lang sein.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(env, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), new TextEncoder().encode(plain));
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), iv.length);
  return b64.enc(out);
}

export async function decrypt(env, packed) {
  const data = b64.dec(packed);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, await key(env), data.slice(12));
  return new TextDecoder().decode(pt);
}

export function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
