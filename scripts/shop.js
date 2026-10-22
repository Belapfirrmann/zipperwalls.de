#!/usr/bin/env node
// Für die Routine "Social Zahlen" (docs/routinen/zahlen.md), nur lesend:
//   node scripts/shop.js metrics job.json     job: { days: 14|90, now? }
// Holt WooCommerce-Bestellungen der letzten <days> Tage und die MailPoet-Kennzahlen (über den Endpunkt /newsletter/stats
// aus wordpress/zipperwalls-newsletter-snippet.php). Zugangsdaten nur aus WP_USER und WP_APP_PASSWORD, Adresse aus WP_URL.
// Ausgabe JSON: { shop: { "<YYYY-MM-DD>": {...} }, newsletters: { "<key>": {open_rate, click_rate, unsubscribes, stats} },
//                lists: [...], missing: [...], errors: [...] }
import { readFileSync } from 'node:fs';
import { aggregateOrders, newsletterKpis } from '../src/shop.js';

const BASE = (process.env.WP_URL || 'https://www.zipperwalls.de').replace(/\/$/, '') + '/wp-json';

async function get(path) {
  if (!process.env.WP_USER || !process.env.WP_APP_PASSWORD) throw new Error('WP_USER oder WP_APP_PASSWORD fehlt.');
  const auth = 'Basic ' + Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
  const res = await fetch(BASE + path, { headers: { Authorization: auth } });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Nur die Felder, die für die Summen nötig sind (keine Kundendaten abrufen)
const FIELDS = 'id,status,date_created,total,total_tax,shipping_total,line_items,meta_data';

async function orders(after) {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const batch = await get(`/wc/v3/orders?per_page=100&page=${page}&after=${encodeURIComponent(after)}&orderby=date&order=asc&_fields=${FIELDS}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

const [cmd, file] = process.argv.slice(2);
try {
  if (cmd !== 'metrics') throw new Error('Befehl: metrics job.json');
  const job = file ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const now = job.now ? new Date(job.now) : new Date();
  const days = Number(job.days) || 14;
  const out = { fetched_at: now.toISOString(), shop: {}, newsletters: {}, lists: [], missing: [], errors: [] };

  const after = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10) + 'T00:00:00';
  try {
    out.shop = aggregateOrders(await orders(after));
  } catch (e) {
    out.errors.push(`Shop: ${e.message}`);
  }
  try {
    const st = await get('/zipperwalls/v1/newsletter/stats');
    for (const [key, row] of Object.entries(st.newsletters || {})) {
      const k = newsletterKpis({ ...row, sent_at: row.sent_at });
      if (k) out.newsletters[key] = k;
    }
    out.lists = st.lists || [];
  } catch (e) {
    if (e.status === 404) out.missing.push('mailpoet_stats');
    else out.errors.push(`MailPoet: ${e.message}`);
  }
  console.log(JSON.stringify(out, null, 1));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
