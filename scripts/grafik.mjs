#!/usr/bin/env node
// Baut Social-Media-Grafiken im Zipperwalls-Stil aus einer JSON-Beschreibung (HTML + Chromium-Screenshot).
//   node scripts/grafik.mjs spec.json
// Vorher einmal: npm i --no-save playwright @fontsource/barlow   (Chromium liegt unter /opt/pw-browsers)
//
// spec: { "out": "tmp/grafik/plan-5", "slides": [ { "layout": "title|point|end|quote", "size": "4:5|1:1",
//          "badge": "Messe-Tipp #02", "headline": "...", "num": 1, "text": "...", "photo": "bild.webp", "focus": "50% 50%",
//          "dark": false } ] }
// Regeln (docs/routinen/entwuerfe.md): heller Hintergrund, kein Zipperwalls-Logo, mindestens ein echtes Foto,
// genau ein gelbes Signalelement, Barlow, zwei runde Ecken.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(resolve('package.json'));
const { chromium } = require('playwright');
const fontDir = dirname(require.resolve('@fontsource/barlow/package.json')) + '/files';

const SIZES = { '4:5': [1080, 1350], '1:1': [1200, 1200] };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const lines = (s) => esc(s).replace(/\n/g, '<br>');
const font = (w, style) => `@font-face{font-family:Barlow;font-weight:${w};font-style:${style};src:url(${pathToFileURL(`${fontDir}/barlow-latin-${w}-${style}.woff2`)}) format('woff2')}`;

function slideHtml(s, base) {
  const [W, H] = SIZES[s.size || '4:5'];
  const photo = s.photo ? pathToFileURL(resolve(base, s.photo)).href : null;
  const dark = !!s.dark;
  const bg = dark ? '#1F2725' : s.layout === 'point' ? '#F5F5F5' : '#FFFFFF';
  const ink = dark ? '#FFFFFF' : '#1D1D1B';
  const sq = W === H;
  const photoH = s.photoH ?? (s.layout === 'title' ? (sq ? 640 : 860) : s.layout === 'quote' ? (sq ? 640 : 860) : sq ? 640 : 820);
  const head = s.layout === 'title' || s.layout === 'quote' ? (sq ? 92 : 104) : sq ? 64 : 70;
  const tile = photo ? `<div class="photo" style="height:${photoH}px;background-image:url('${photo}');background-position:${s.focus || '50% 50%'};background-size:${s.fit || 'cover'}"></div>` : '';
  const badge = s.num != null ? `<div class="num">${s.num}</div>` : s.badge ? `<div class="badge">${esc(s.badge)}</div>` : '';
  const quote = s.layout === 'quote' ? `<div class="q">„${lines(s.headline)}“</div>${s.source ? `<div class="src">${esc(s.source)}</div>` : ''}` : '';
  return `<!doctype html><meta charset="utf-8"><style>
${font(400, 'normal')}${font(700, 'normal')}${font(800, 'normal')}${font(900, 'normal')}${font(900, 'italic')}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;background:${bg};color:${ink};font-family:Barlow;overflow:hidden;position:relative}
.wrap{position:absolute;inset:80px 80px auto 80px}
.badge{display:inline-block;background:#FFCC20;color:#1D1D1B;font-weight:800;font-size:28px;letter-spacing:.1em;text-transform:uppercase;padding:14px 26px;border-radius:20px 0 20px 0;margin-bottom:34px}
.num{width:110px;height:110px;background:#FFCC20;color:#1D1D1B;font-weight:900;font-style:italic;font-size:72px;display:grid;place-items:center;border-radius:28px 0 28px 0;margin-bottom:34px}
h1{font-weight:900;font-style:italic;text-transform:uppercase;font-size:${s.headSize || head}px;line-height:.98;letter-spacing:-.005em}
p{font-size:${sq ? 34 : 36}px;line-height:1.38;margin-top:26px;max-width:${W - 160}px;color:${dark ? '#E6E8EA' : '#1D1D1B'}}
.q{font-weight:900;font-style:italic;font-size:${s.headSize || (sq ? 66 : 72)}px;line-height:1.04;text-transform:none}
.src{font-weight:700;font-size:30px;margin-top:22px;color:${dark ? '#BFC4C9' : '#4B4F58'}}
.photo{position:absolute;left:80px;right:80px;bottom:80px;border-radius:70px 0 70px 0;background-color:#ECEEF0;background-repeat:no-repeat}
</style><body><div class="wrap">${badge}${s.layout === 'quote' ? quote : `<h1>${lines(s.headline)}</h1>`}${s.text ? `<p>${lines(s.text)}</p>` : ''}</div>${tile}</body>`;
}

const specPath = process.argv[2];
if (!specPath) throw new Error('Aufruf: node scripts/grafik.mjs spec.json');
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const base = dirname(resolve(specPath));
const out = resolve(base, spec.out || '.');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const files = [];
for (const [i, s] of spec.slides.entries()) {
  const [W, H] = SIZES[s.size || '4:5'];
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  // Als Datei laden: nur so darf die Seite lokale Schriften und Fotos einbinden
  const tmp = join(out, `.slide-${i}.html`);
  writeFileSync(tmp, slideHtml(s, base));
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const check = await page.evaluate(async (src) => {
    const font = document.fonts.check('italic 900 40px Barlow') && document.fonts.check('400 20px Barlow');
    if (!src) return { font, photo: true };
    const img = new Image();
    img.src = src;
    const photo = await img.decode().then(() => img.naturalWidth > 0, () => false);
    return { font, photo };
  }, s.photo ? pathToFileURL(resolve(base, s.photo)).href : null);
  rmSync(tmp);
  if (!check.font) throw new Error('Barlow wurde nicht geladen (npm i --no-save @fontsource/barlow).');
  if (!check.photo) throw new Error(`Foto nicht lesbar: ${s.photo}`);
  // Foto füllt den Platz unter dem Text (56 px Abstand) bis 80 px vor dem unteren Rand, sofern photoH nicht gesetzt ist
  const free = await page.evaluate((fixed) => {
    const w = document.querySelector('.wrap').getBoundingClientRect();
    const p = document.querySelector('.photo');
    if (!p) return 999;
    if (!fixed) { p.style.top = `${Math.round(w.bottom + 56)}px`; p.style.height = 'auto'; }
    return Math.round(p.getBoundingClientRect().top - w.bottom);
  }, s.photoH != null);
  if (free < 40) console.error(`Achtung Slide ${i + 1}: Text und Foto zu eng (${free} px).`);
  const photoPx = await page.evaluate(() => document.querySelector('.photo')?.getBoundingClientRect().height ?? 999);
  if (photoPx < 380) console.error(`Achtung Slide ${i + 1}: Foto nur ${Math.round(photoPx)} px hoch, Text kürzen.`);
  const file = join(out, s.name || `${String(i + 1).padStart(2, '0')}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  files.push(file);
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ files }, null, 1));
