#!/usr/bin/env node
// Holt alle Produkte mit Bildern aus dem Shop (WooCommerce Store API, öffentlich) und schreibt plans/shop-katalog.json,
// gruppiert nach Produktfamilie. Grundlage für die Fotoauswahl der Social-Posts (docs/routinen/entwuerfe.md, Abwechslung).
//   node scripts/shop-katalog.mjs
import { writeFileSync } from 'node:fs';

// Reihenfolge = Priorität: die erste passende Kategorie bestimmt die Familie
const FAMILIES = [
  ['PIXLIP GO', ['PIXLIP GO Lightbox', 'PIXLIP GO Zubehör']],
  ['PIXLIP POP', ['Pixlip POP Lightbox']],
  ['Beachflag', ['Beachflag']],
  ['Promotiontheke', ['Mobile Promotiontheke']],
  ['Kundenstopper', ['Kundenstopper', 'Kundenstopper Outdoor']],
  ['Rollup und Prospektständer', ['Rollups', 'Prospektständer']],
  ['Deckenhänger', ['Deckenhänger']],
  ['Digital Signage', ['Digital Signage', 'Digitale Stele', 'Digitaler Kundenstopper']],
  ['Textilrahmen', ['Textilspannrahmen unbeleuchtet']],
  ['Beleuchtung', ['Messestand Beleuchtung mit LED Strahlern']],
  ['Messestand-Set', ['Messestand kaufen', 'Messestände 10 bis 30 m² kaufen', 'Messestand klein bis 10 m² kaufen', 'Messestand groß ab 30 m² kaufen']],
  ['LED-Messewand und Leuchtkasten', ['LED Messewand', 'Leuchtkasten']],
  ['Messewand gebogen', ['Messewand gebogen']],
  ['Messetheke LED', ['Messetheke LED']],
  ['Messetheke', ['Messetheken', 'Messetheke mit Druck', 'Mobile Messetheke']],
  ['Outdoor und Zelte', ['Messestand Outdoor', 'Aufblasbare Eventzelte', 'Faltzelt bedruckt', 'Werbemöbel für Outdoor Events', 'Torbogen aufblasbar', 'Aufblasbare Werbesäule', 'Aufblasbare Theke']],
  ['Messewand gerade', ['Messewand']],
  ['Ersatzdruck', ['Ersatzdruck Messewand', 'Messetheke Stoff Ersatzdruck', 'Ersatzdruck für Messetheke', 'Ersatzdruck für LED Messewände', 'Messetheke LED Ersatz', 'Promotiontheke Ersatzdruck', 'Textilrahmen Ersatzdruck']],
  ['Zubehör', ['Messeausstattung', 'Messestand Outdoor Zubehör']],
];

const all = [];
for (let page = 1; page < 20; page++) {
  const res = await fetch(`https://www.zipperwalls.de/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
  if (!res.ok) throw new Error(`Shop antwortet mit HTTP ${res.status}`);
  const batch = await res.json();
  all.push(...batch);
  if (batch.length < 100) break;
}
const decode = (s) => s.replace(/&#8211;/g, '–').replace(/&#215;/g, '×').replace(/&amp;/g, '&').replace(/&#8217;/g, '’');
const families = Object.fromEntries(FAMILIES.map(([f]) => [f, []]).concat([['Sonstiges', []]]));
for (const p of all) {
  const cats = p.categories.map((c) => c.name);
  const fam = FAMILIES.find(([, list]) => cats.some((c) => list.includes(c)))?.[0] || 'Sonstiges';
  families[fam].push({ name: decode(p.name), url: p.permalink, images: p.images.slice(0, 6).map((i) => ({ src: i.src, alt: i.alt || '' })) });
}
const out = { stand: new Date().toISOString().slice(0, 10), produkte: all.length, hinweis: 'Viele Bilder zeigen das Lieferantenlogo „a.“ bzw. „adsystem“ oder fremde Kundenlogos. Jedes Bild vor der Verwendung ansehen, solche Bilder nicht verwenden. PIXLIP GO ist erlaubt.', familien: families };
writeFileSync(new URL('../plans/shop-katalog.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(Object.entries(families).map(([f, l]) => `${f}: ${l.length}`).join('\n'));
