import { timingSafeEqual } from './crypto.js';

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const parseJson = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

let jwksCache = { at: 0, keys: null };

async function getJwks(env) {
  if (jwksCache.keys && Date.now() - jwksCache.at < 10 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Access Zertifikate nicht abrufbar');
  jwksCache = { at: Date.now(), keys: (await res.json()).keys };
  return jwksCache.keys;
}

// Admin Login: Cloudflare Access JWT wird serverseitig geprueft, nicht nur der Header geglaubt.
export async function authenticateAdmin(request, env) {
  if (env.DEV_ADMIN_EMAIL) return env.DEV_ADMIN_EMAIL; // nur lokal ueber .dev.vars
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  try {
    const [h, p, s] = jwt.split('.');
    const header = parseJson(h);
    const payload = parseJson(p);
    if (header.alg !== 'RS256') return null;
    const jwk = (await getJwks(env)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    const email = String(payload.email || '').toLowerCase();
    const admins = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
    return admins.includes(email) ? email : null;
  } catch {
    return null;
  }
}

// Agent API: festes Bearer Token (Worker Secret AGENT_API_TOKEN)
export function authenticateAgent(request, env) {
  if (!env.AGENT_API_TOKEN) return false;
  const m = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '');
  return !!m && timingSafeEqual(m[1], env.AGENT_API_TOKEN);
}

// Schutz gegen fremde Webseiten, die im Namen eines eingeloggten Admins schreiben wollen
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // nicht-Browser Aufrufe
  return origin === new URL(request.url).origin;
}
