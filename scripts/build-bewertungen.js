#!/usr/bin/env node
// Baut das Bewertungs-Dashboard als eine HTML Datei fürs Claude Artefakt: dist/bewertungen.html
// Nutzt Stylesheet und Logo des Social Dashboards, dazu bewertungen/extra.css und die Logik aus src/bewertungen.js.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const stripModule = (src) => src.replace(/^import .*$/gm, '').replace(/^export /gm, '');

function inlineSvg(src) {
  const fills = {};
  for (const m of src.matchAll(/\.(cls-\d+)\s*\{\s*fill:\s*([^;]+);\s*\}/g)) fills[m[1]] = m[2].trim();
  return src
    .replace(/<\?xml[^>]*>\s*/, '')
    .replace(/<defs>[\s\S]*?<\/defs>\s*/, '')
    .replace(/ (id|data-name)="[^"]*"/g, '')
    .replace(/class="(cls-\d+)"/g, (_, c) => `fill="${fills[c] || '#fff'}"`)
    .replace('<svg ', '<svg role="img" aria-label="Zipperwalls" ');
}
const logo = inlineSvg(read('dashboard/assets/logo-weiss.svg'));

const html = `<title>Zipperwalls Bewertungen</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,700;0,800;0,900;1,900&display=swap">
<style>
${read('dashboard/style.css')}
${read('bewertungen/extra.css')}
</style>
<div class="shell">
  <aside class="side">
    <div class="logo">${logo}</div>
    <nav><a href="#" class="active">Bewertungen <span class="count" id="count" hidden></span></a></nav>
    <div class="who">Trusted Shops</div>
  </aside>
  <div style="min-width:0">
    <main><div id="main" aria-live="polite"></div></main>
  </div>
</div>
<div class="toast" id="toast" role="status"></div>
<script>
${stripModule(read('src/bewertungen.js'))}
${read('bewertungen/app.js')}
</script>
`;

mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/bewertungen.html', root), html);
console.log(`dist/bewertungen.html (${Math.round(html.length / 1024)} KB)`);
