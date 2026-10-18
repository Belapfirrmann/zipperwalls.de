#!/usr/bin/env node
// Holt die Trusted Shops Bewertungen und gibt sie vereinheitlicht als JSON aus.
//   node scripts/bewertungen.js fetch            alle abrufbaren Bewertungen
//   node scripts/bewertungen.js fetch --known id1,id2   nur neue
// Braucht TRUSTED_SHOPS_ID (TS-ID, beginnt mit X) und Netzwerkzugriff auf api.trustedshops.com.
// Die öffentliche Schnittstelle liefert nur die 10 neuesten Bewertungen der letzten 12 Monate bis gestern (Parameter für
// Seiten oder Größe werden ignoriert, geprüft 18.10.2026). Bei zwei Läufen am Tag reicht das.
import { spawnSync } from 'node:child_process';
import { extractReviews, newReviews } from '../src/bewertungen.js';

// Node fetch nutzt den Proxy der Cloud-Umgebung nur mit NODE_USE_ENV_PROXY=1, deshalb bei Bedarf neu starten
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const [cmd, ...args] = process.argv.slice(2);
const id = process.env.TRUSTED_SHOPS_ID;

async function main() {
  if (cmd !== 'fetch') throw new Error('Aufruf: node scripts/bewertungen.js fetch [--raw] [--known id1,id2]');
  if (!/^X[0-9A-F]{32}$/i.test(id || '')) throw new Error('TRUSTED_SHOPS_ID fehlt oder hat nicht das Format X + 32 Zeichen.');
  const res = await fetch(`https://api.trustedshops.com/rest/public/v2/shops/${id}/reviews.json`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Trusted Shops antwortet mit ${res.status}.`);
  const json = await res.json();
  if (args.includes('--raw')) return console.log(JSON.stringify(json, null, 2));
  let list = extractReviews(json);
  const k = args.indexOf('--known');
  if (k >= 0) list = newReviews(list, (args[k + 1] || '').split(',').filter(Boolean));
  list.sort((a, b) => a.date.localeCompare(b.date));
  console.log(JSON.stringify(list, null, 2));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
