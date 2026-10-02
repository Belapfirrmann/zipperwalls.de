#!/usr/bin/env node
// Kommandozeile fuer die Claude Routine.
//   node scripts/social.js publish job.json [--dry-run]   Post veroeffentlichen
//   node scripts/social.js metrics job.json               Kennzahlen holen
//   node scripts/social.js check                          Zugangsdaten pruefen
// Ausgabe immer JSON auf stdout. Zugangsdaten nur aus Umgebungsvariablen.
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { publishJob, metricsJob, checkConnections } from '../src/jobs.js';

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

function loadImage(path, base) {
  if (!path) return null;
  const full = resolve(base, path);
  const type = TYPES[extname(full).toLowerCase()];
  if (!type) throw new Error(`Bildformat nicht unterstützt: ${path} (nur JPEG oder PNG)`);
  return { bytes: readFileSync(full), type };
}

const [cmd, file, ...flags] = process.argv.slice(2);
try {
  let out;
  if (cmd === 'check') {
    out = await checkConnections(process.env);
  } else if (cmd === 'publish' || cmd === 'metrics') {
    if (!file) throw new Error('Job Datei fehlt.');
    const job = JSON.parse(readFileSync(file, 'utf8'));
    if (cmd === 'metrics') {
      out = await metricsJob(process.env, job);
    } else {
      const base = dirname(resolve(file));
      const images = { main: loadImage(job.images?.main, base), linkedin: loadImage(job.images?.linkedin, base) };
      out = await publishJob(process.env, { post: job.post, images }, { dryRun: flags.includes('--dry-run') });
    }
  } else {
    throw new Error('Befehl: publish | metrics | check');
  }
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
