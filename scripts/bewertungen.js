#!/usr/bin/env node
// Holt die Trusted Shops Bewertungen und gibt sie vereinheitlicht als JSON aus.
//   node scripts/bewertungen.js fetch            alle abrufbaren Bewertungen
//   node scripts/bewertungen.js fetch --known id1,id2   nur neue
// Braucht TRUSTED_SHOPS_ID (TS-ID, beginnt mit X) und Netzwerkzugriff auf api.trustedshops.com.
// Die öffentliche Schnittstelle liefert laut Drittquellen nur die letzten 12 Monate. Antwortformat noch nicht gegen
// das echte Konto geprüft: Weicht es ab, die Rohantwort mit `fetch --raw` ansehen und src/bewertungen.js anpassen.
import { extractReviews, newReviews } from '../src/bewertungen.js';

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
