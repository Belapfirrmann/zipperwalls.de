#!/usr/bin/env node
// Trusted Shops Bewertungen holen und Antworten veröffentlichen.
//   node scripts/bewertungen.js fetch [--raw] [--known id1,id2]   Bewertungen vereinheitlicht als JSON
//   node scripts/bewertungen.js reply <reviewId> < antwort.txt     Antwort bei Trusted Shops veröffentlichen
//   node scripts/bewertungen.js check                              Zugang prüfen
//
// Mit ETRUSTED_CLIENT_ID und ETRUSTED_CLIENT_SECRET (Händler-Schnittstelle eTrusted, Netzwerk: login.etrusted.com,
// api.etrusted.com) kommen bis zu 100 Bewertungen samt bestehender Antworten, und `reply` funktioniert.
// Ohne diese Zugangsdaten nur lesend über die öffentliche Schnittstelle (TRUSTED_SHOPS_ID, api.trustedshops.com):
// nur die 10 neuesten bis gestern, ohne Antworten (geprüft 18.10.2026).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extractReviews, newReviews } from '../src/bewertungen.js';

// Node fetch nutzt den Proxy der Cloud-Umgebung nur mit NODE_USE_ENV_PROXY=1, deshalb bei Bedarf neu starten
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const [cmd, ...args] = process.argv.slice(2);
const { TRUSTED_SHOPS_ID: tsId, ETRUSTED_CLIENT_ID: clientId, ETRUSTED_CLIENT_SECRET: clientSecret } = process.env;
const hasEtrusted = !!(clientId && clientSecret);

async function json(res, what) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${what}: Trusted Shops antwortet mit ${res.status}. ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function token() {
  const res = await fetch('https://login.etrusted.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, audience: 'https://api.etrusted.com' }),
  });
  const j = await json(res, 'Anmeldung');
  if (!j.access_token) throw new Error('Anmeldung: kein Zugangstoken erhalten.');
  return j.access_token;
}

async function fetchEtrusted() {
  const auth = { authorization: `Bearer ${await token()}`, accept: 'application/json' };
  return json(await fetch('https://api.etrusted.com/reviews?count=100', { headers: auth }), 'Bewertungen');
}

async function fetchPublic() {
  if (!/^X[0-9A-F]{32}$/i.test(tsId || '')) throw new Error('TRUSTED_SHOPS_ID fehlt oder hat nicht das Format X + 32 Zeichen.');
  return json(await fetch(`https://api.trustedshops.com/rest/public/v2/shops/${tsId}/reviews.json`, { headers: { accept: 'application/json' } }), 'Bewertungen');
}

async function main() {
  if (cmd === 'fetch') {
    const raw = hasEtrusted ? await fetchEtrusted() : await fetchPublic();
    if (args.includes('--raw')) return console.log(JSON.stringify(raw, null, 2));
    let list = extractReviews(raw);
    const k = args.indexOf('--known');
    if (k >= 0) list = newReviews(list, (args[k + 1] || '').split(',').filter(Boolean));
    list.sort((a, b) => a.date.localeCompare(b.date));
    return console.log(JSON.stringify(list, null, 2));
  }
  if (cmd === 'reply') {
    const id = args[0];
    if (!hasEtrusted) throw new Error('Veröffentlichen braucht ETRUSTED_CLIENT_ID und ETRUSTED_CLIENT_SECRET.');
    if (!/^rev-[\w-]+$/.test(id || '')) throw new Error('Aufruf: node scripts/bewertungen.js reply <rev-...> < antwort.txt');
    const comment = readFileSync(0, 'utf8').trim();
    if (!comment) throw new Error('Antworttext fehlt (über stdin übergeben).');
    const res = await fetch(`https://api.etrusted.com/reviews/${id}/reply`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ comment, sendNotification: false }),
    });
    await json(res, 'Antwort');
    return console.log(JSON.stringify({ ok: true, id }));
  }
  if (cmd === 'check') {
    if (!hasEtrusted) return console.log('Nur lesend (öffentliche Schnittstelle). Für automatisches Veröffentlichen fehlen ETRUSTED_CLIENT_ID und ETRUSTED_CLIENT_SECRET.');
    const n = extractReviews(await fetchEtrusted()).length;
    return console.log(`eTrusted Zugang ok, ${n} Bewertungen abrufbar.`);
  }
  throw new Error('Aufruf: node scripts/bewertungen.js fetch|reply|check');
}
main().catch((e) => { console.error(e.message); process.exit(1); });
