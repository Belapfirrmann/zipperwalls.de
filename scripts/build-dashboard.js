#!/usr/bin/env node
// Baut das Dashboard als eine einzige HTML Datei fuer das Claude Artefakt:
// Stylesheet, Logo, Redaktionsplan, Newsletter-Plan und die gemeinsame Textlogik aus src/ werden eingebettet.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { REDAKTIONSPLAN } from '../src/redaktionsplan.js';
import { NEWSLETTERPLAN } from '../src/newsletterplan.js';
import { WEEKLY_TEMPLATE, SETUP_TEMPLATE } from '../src/plan.js';
import { SETUP_STEPS } from '../src/setup-steps.js';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const stripModule = (src) => src.replace(/^import .*$/gm, '').replace(/^export /gm, '');

const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
// Logo aus dem Brandkit: CSS Klassen in fill Attribute umschreiben, damit nichts global ins Dashboard wirkt
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
// Farbiges Logo (auf Weiß) für die Newsletter-Vorschau als data-URI
const logoFarbig = 'data:image/svg+xml;base64,' + Buffer.from(read('dashboard/assets/logo-farbig.svg')).toString('base64');
const logoWeiss = 'data:image/svg+xml;base64,' + Buffer.from(read('dashboard/assets/logo-weiss.svg')).toString('base64');

const html = `<title>Zipperwalls Social Media</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,700;0,800;0,900;1,900&display=swap">
<style>
${read('dashboard/style.css')}
</style>
<div class="shell">
  <aside class="side">
    <div class="logo">${logo}</div>
    <nav id="nav">
      <a href="#plan" data-view="plan">Social-Plan</a>
      <a href="#newsletter" data-view="newsletter">Newsletter-Plan</a>
      <a href="#freigabe" data-view="freigabe">Freigabe <span class="count" id="count-freigabe" hidden></span></a>
      <a href="#checkliste" data-view="checkliste">Abhakeliste</a>
      <a href="#zahlen" data-view="zahlen">Zahlen</a>
      <a href="#verbindungen" data-view="verbindungen">Verbindungen</a>
    </nav>
    <div class="who" id="runner"></div>
  </aside>
  <div style="min-width:0">
    <main>
      <div class="notice pending" id="pending" hidden>Es gibt neue Änderungen. <button class="btn small ghost" id="pending-btn" type="button">Aktualisieren</button> (nicht gespeicherte Eingaben gehen verloren)</div>
      <div id="main" aria-live="polite"></div>
    </main>
  </div>
</div>
<div class="toast" id="toast" role="status"></div>
<script>
const PLAN = ${json(REDAKTIONSPLAN)};
const NL = ${json(NEWSLETTERPLAN)};
const LOGO_FARBIG = ${json(logoFarbig)};
const LOGO_WEISS = ${json(logoWeiss)};
const WEEKLY_TEMPLATE = ${json(WEEKLY_TEMPLATE)};
const SETUP_TEMPLATE = ${json(SETUP_TEMPLATE)};
const SETUP_STEPS = ${json(SETUP_STEPS)};
${stripModule(read('src/text.js'))}
${stripModule(read('src/newsletter-render.js'))}
${read('dashboard/app.js')}
</script>
`;

mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/social-dashboard.html', root), html);
console.log(`dist/social-dashboard.html (${Math.round(html.length / 1024)} KB)`);
