#!/usr/bin/env node
// Kommandozeile für die Claude Routine "Newsletter Versand" (MailPoet über das Code-Snippet auf zipperwalls.de).
//   node scripts/newsletter.js info                       MailPoet-Version, Listen, Absender
//   node scripts/newsletter.js plan input.json            Aktionen bestimmen ({ now, newsletters: [docs], posts: { nr: {scheduled_at} } })
//   node scripts/newsletter.js schedule job.json          Newsletter in MailPoet anlegen und einplanen ({ key, doc, send_at, segment_ids? })
//   node scripts/newsletter.js preview job.json           Testmail ({ key, doc, email })
//   node scripts/newsletter.js status <key>               Stand in MailPoet
//   node scripts/newsletter.js unschedule <key>           Einplanung zurücknehmen
//   node scripts/newsletter.js trash <key>                In den MailPoet-Papierkorb (nur eigene, z. B. nach Tests)
//   node scripts/newsletter.js html job.json              Nur das E-Mail-HTML ausgeben (ohne Netzwerk)
// Zugangsdaten nur aus WP_USER und WP_APP_PASSWORD, Adresse aus WP_URL (Standard https://www.zipperwalls.de).
// Ausgabe immer JSON auf stdout.
import { readFileSync } from 'node:fs';
import { renderNewsletter } from '../src/newsletter-render.js';
import { planActions, LIST_IDS } from '../src/newsletter-sync.js';

const BASE = (process.env.WP_URL || 'https://www.zipperwalls.de').replace(/\/$/, '') + '/wp-json/zipperwalls/v1/newsletter';

async function call(path, body) {
  if (!process.env.WP_USER || !process.env.WP_APP_PASSWORD) throw new Error('WP_USER oder WP_APP_PASSWORD fehlt.');
  const auth = 'Basic ' + Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok: false, error: text.slice(0, 300) }; }
  if (!res.ok || data.ok === false) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const payload = (job) => ({
  key: job.key,
  subject: job.doc.subject,
  preheader: job.doc.preview || '',
  html: renderNewsletter({ ...job.doc, nr: job.doc.nr }, {}),
});

const [cmd, arg] = process.argv.slice(2);
try {
  let out;
  if (cmd === 'info') out = await call('/info');
  else if (cmd === 'plan') {
    const input = read(arg);
    out = { actions: planActions(input.newsletters || [], input.posts || {}, input.now ? new Date(input.now) : new Date()) };
  } else if (cmd === 'html') out = { html: payload(read(arg)).html };
  else if (cmd === 'schedule') {
    const job = read(arg);
    if (!job.send_at) throw new Error('send_at fehlt.');
    out = await call('/schedule', { ...payload(job), send_at: job.send_at, segment_ids: job.segment_ids || LIST_IDS });
  } else if (cmd === 'preview') {
    const job = read(arg);
    out = await call('/preview', { ...payload(job), email: job.email });
  } else if (['status', 'unschedule', 'trash'].includes(cmd)) {
    if (!arg) throw new Error('key fehlt.');
    out = cmd === 'status' ? await call('/status?key=' + encodeURIComponent(arg)) : await call('/' + cmd, { key: arg });
  } else throw new Error('Befehl: info | plan | schedule | preview | status | unschedule | trash | html');
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
