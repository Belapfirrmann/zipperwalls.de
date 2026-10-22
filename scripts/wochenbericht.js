#!/usr/bin/env node
// Für die Routine "Wochenbericht" (docs/routinen/wochenbericht.md):
//   node scripts/wochenbericht.js input.json
//   input: { posts, newsletters, metrics, reviews, shop, todos: [docs mit id], now? }
// Ausgabe JSON: { week, subject, body, summary }
import { readFileSync } from 'node:fs';
import { weeklyReport } from '../src/wochenbericht.js';

try {
  const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(weeklyReport({ ...input, now: input.now ? new Date(input.now) : new Date() }), null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
