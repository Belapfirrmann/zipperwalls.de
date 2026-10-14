#!/usr/bin/env node
// Für die Routine "Freigabe-Erinnerung":
//   node scripts/erinnerung.js input.json     input: { posts: [docs mit id], newsletters: [docs mit id], now? }
// Ausgabe JSON: { date, items, subject?, body? }. items leer = keine Mail senden.
import { readFileSync } from 'node:fs';
import { dueReminders } from '../src/erinnerung.js';

try {
  const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(dueReminders({ ...input, now: input.now ? new Date(input.now) : new Date() }), null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
