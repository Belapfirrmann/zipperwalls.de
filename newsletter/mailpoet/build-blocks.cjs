require('global-jsdom/register');
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
const fs = require('fs');
const { createBlock: B, serialize } = require('@wordpress/blocks');
require('@wordpress/block-library').registerCoreBlocks();

const INK = '#1D1D1B', GREY = '#4B4F58', YEL = '#FFCC20', DARK = '#1F2725', LIGHT = '#F5F5F5';
const LOGO = { id: 41347, url: 'https://www.zipperwalls.de/wp-content/uploads/zipperwalls-logo-farbig-440.png' };
const r = (tl, br) => ({ topLeft: tl, topRight: '0px', bottomLeft: '0px', bottomRight: br });
const pad = (t, rr, b, l) => ({ top: t, right: rr, bottom: b, left: l });
const tag = (t, label) => `<a data-link-href="[mailpoet/${t}]" contenteditable="false" class="mailpoet-email-editor__personalization-tags-link" style="text-decoration: underline;">${label}</a>`;

const P = (content, { size = '17px', color = INK, lh = '1.55', weight, italic, upper, ls, align, link } = {}) => B('core/paragraph', {
  content, align,
  style: {
    color: { text: color },
    typography: Object.assign({ fontSize: size, lineHeight: lh }, weight && { fontWeight: weight }, italic && { fontStyle: 'italic' }, upper && { textTransform: 'uppercase' }, ls && { letterSpacing: ls }),
    ...(link && { elements: { link: { color: { text: link } } } }),
  },
});
const LABEL = (text, color = GREY) => P(text, { size: '12px', color, lh: '1.3', weight: '800', upper: true, ls: '1.4px' });
const H = (level, content, size, { color = INK, italic, lh = '1.05' } = {}) => B('core/heading', {
  level, content,
  style: { color: { text: color }, typography: Object.assign({ fontSize: size, lineHeight: lh, fontWeight: '900', textTransform: 'uppercase' }, italic && { fontStyle: 'italic' }) },
});
const BTN = (text, url, { bg = YEL, color = INK } = {}) => B('core/buttons', {}, [B('core/button', {
  text, url,
  style: { color: { background: bg, text: color }, border: { radius: r('12px', '12px') }, spacing: { padding: pad('14px', '26px', '14px', '26px') }, typography: { fontSize: '16px', fontWeight: '700' } },
})]);
const BOX = (inner, { bg = LIGHT, p = pad('26px', '28px', '26px', '28px') } = {}) => B('core/group', {
  style: { color: { background: bg }, border: { radius: r('30px', '30px') }, spacing: { padding: p } },
  layout: { type: 'constrained' },
}, inner);
const GAP = (h = '28px') => B('core/spacer', { height: h });

function build(d) {
  const utm = (url, content) => `${url}?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=messepraxis-${d.nn}${content ? '&amp;utm_content=' + content : ''}`;
  const plain = u => u.replace(/&amp;/g, '&');
  const out = [];
  out.push(P(`Wird die Mail nicht richtig angezeigt? ${tag('newsletter-view-in-browser-url', 'Im Browser lesen')}`, { size: '12px', color: GREY, align: 'right', link: GREY }));
  out.push(B('core/image', { id: LOGO.id, url: LOGO.url, alt: 'zipperwalls.de', width: '220px', sizeSlug: 'full', linkDestination: 'custom', href: plain(utm('https://www.zipperwalls.de/')) }));
  out.push(B('core/group', { style: { border: { top: { color: INK, width: '3px', style: 'solid' } }, spacing: { padding: { top: '10px' } } }, layout: { type: 'constrained' } }, [
    B('core/columns', { isStackedOnMobile: false }, [
      B('core/column', { width: '40%' }, [LABEL('Messepraxis', INK)]),
      B('core/column', { width: '60%' }, [Object.assign(LABEL(`Ausgabe ${d.nn} · ${d.monat}`), {})]),
    ]),
  ]));
  out[out.length - 1].innerBlocks[0].innerBlocks[1].innerBlocks[0].attributes.align = 'right';
  out.push(GAP());
  out.push(P(`Guten Tag <!--[mailpoet/subscriber-firstname default="und willkommen"]-->,`));
  d.intro.forEach(t => out.push(P(t)));
  out.push(GAP());
  out.push(P(`<mark style="background-color:${YEL};color:${INK};padding:5px 12px;border-radius:8px 0 8px 0" class="has-inline-color">MESSE-TIPP #${d.tippNr}</mark>`, { size: '12px', weight: '800', ls: '1.4px', lh: '2' }));
  out.push(H(1, d.headline, '40px', { italic: true, lh: '1' }));
  d.haupttipp.forEach(t => out.push(P(t)));
  out.push(BOX(d.schritte.map(([label, zeit, text]) => B('core/columns', { isStackedOnMobile: false }, [
    B('core/column', { width: '28%' }, [P(label, { size: '13px', weight: '800', upper: true, ls: '1px', lh: '1.3' }), P(zeit, { size: '13px', color: GREY, lh: '1.3' })]),
    B('core/column', { width: '72%' }, [P(text, { size: '16px', lh: '1.5' })]),
  ])), { p: pad('22px', '24px', '6px', '24px') }));
  out.push(P(`<strong>${d.checkTitel}</strong>`));
  d.check.forEach((t, i) => out.push(P(`${i + 1}. ${t}`)));
  out.push(BTN(d.btnHaupt, plain(utm(d.linkHaupt))));
  out.push(GAP('36px'));
  out.push(B('core/group', { style: { border: { top: { color: '#D9DDE0', width: '1px', style: 'solid' } }, spacing: { padding: { top: '28px' } } }, layout: { type: 'constrained' } }, [
    LABEL(`Kurz-Tipp #${d.kurzNr}`),
    H(2, d.kurzHeadline, '26px'),
    P(`${d.kurzText} <a href="${utm(d.linkRatgeber)}"><strong>Zum Ratgeber</strong></a>`, { link: INK }),
  ]));
  out.push(GAP('36px'));
  out.push(BOX([
    B('core/group', { style: { color: { background: '#424242' }, border: { radius: { topLeft: '30px', topRight: '0px', bottomLeft: '0px', bottomRight: '0px' } }, spacing: { padding: pad('90px', '20px', '90px', '20px') } }, layout: { type: 'constrained' } }, [
      P(`Bild: ${d.bild}`, { size: '13px', color: '#B8BCBF', align: 'center' }),
    ]),
    B('core/group', { style: { spacing: { padding: pad('24px', '28px', '28px', '28px') } }, layout: { type: 'constrained' } }, [
      LABEL('Produkt im Einsatz', YEL),
      H(2, d.produkt, '26px', { color: '#FFFFFF' }),
      P(d.nutzen, { size: '16px', color: '#E6E8EA' }),
      ...d.fakten.map(t => P(t, { size: '15px', color: '#E6E8EA', lh: '1.5' })),
      BTN('Jetzt konfigurieren', plain(utm(d.linkProdukt, d.produktUtm))),
    ]),
  ], { bg: DARK, p: pad('0px', '0px', '0px', '0px') }));
  out.push(GAP('36px'));
  out.push(LABEL('Aus unseren Bewertungen'));
  out.push(P(`„${d.zitat}“`, { size: '24px', lh: '1.25', weight: '700', italic: true }));
  out.push(P(d.quelle, { size: '14px', color: GREY, lh: '1.5' }));
  out.push(GAP('36px'));
  out.push(BOX([
    H(2, d.angebotHeadline, '22px', { lh: '1.1' }),
    P(d.angebot, { size: '16px' }),
    P('<strong>+49 7276 4049970</strong> · Mo bis Fr, 8 bis 17 Uhr', { size: '16px' }),
    BTN(d.btnAngebot, plain(utm(d.linkAngebot, 'beratung')), { bg: INK, color: '#FFFFFF' }),
  ]));
  out.push(GAP('36px'));
  out.push(P('<strong>Jeden Dienstag und Donnerstag ein neuer Tipp.</strong>', { size: '16px' }));
  out.push(P('Kurz und zum Speichern auf <a href="https://www.instagram.com/zipperwalls.de/"><strong>Instagram</strong></a>, ausführlicher auf <a href="https://www.linkedin.com/company/zipperwalls"><strong>LinkedIn</strong></a> und <a href="https://www.facebook.com/zipperwalls"><strong>Facebook</strong></a>.', { size: '16px', link: INK }));
  out.push(GAP());
  out.push(P('Viele Grüße aus Herxheim'));
  out.push(P('<strong>Bela und Darien Pfirrmann</strong>'));
  out.push(GAP('40px'));
  const F = (t, c = '#C9CDD0') => P(t, { size: '13px', color: c, lh: '1.6', link: '#FFFFFF' });
  out.push(B('core/group', { style: { color: { background: DARK }, spacing: { padding: pad('28px', '40px', '28px', '40px') } }, layout: { type: 'constrained' } }, [
    F('<strong>Zipperwalls</strong>', '#FFFFFF'),
    F('DP ExpoTrade GmbH · Gewerbepark West 13 · 76863 Herxheim<br>+49 7276 4049970 · info@zipperwalls.de'),
    F('Sie erhalten diese Mail, weil Sie sich für die Messepraxis angemeldet haben.'),
    F(`${tag('subscription-unsubscribe-url', 'Abmelden')} · ${tag('subscription-manage-url', 'Einstellungen')} · <a href="https://www.zipperwalls.de/impressum/">Impressum</a> · <a href="https://www.zipperwalls.de/datenschutz/">Datenschutz</a>`),
  ]));
  return serialize(out);
}

const vorlage = {
  nn: 'NN', monat: '[MONAT JAHR]', tippNr: '[NR]', kurzNr: '[NR]',
  intro: ['[INTRO: zwei bis drei Sätze. Worum geht es heute und warum gerade jetzt?]'],
  headline: '[HEADLINE ZEILE 1]<br>[ZEILE 2]',
  haupttipp: ['[HAUPTTIPP ABSATZ 1: Problem aus Sicht des Ausstellers.]', '[HAUPTTIPP ABSATZ 2: Überleitung zu den Schritten.]'],
  schritte: [['[SCHRITT 1]', '[ZEIT]', '<strong>[Kernaussage.]</strong> [Erklärung in ein bis zwei Sätzen.]'], ['[SCHRITT 2]', '[ZEIT]', '<strong>[Kernaussage.]</strong> [Erklärung.]'], ['[SCHRITT 3]', '[ZEIT]', '<strong>[Kernaussage.]</strong> [Erklärung.]'], ['[SCHRITT 4]', '[ZEIT]', '<strong>[Kernaussage.]</strong> [Erklärung.]']],
  checkTitel: '[ZWISCHENÜBERSCHRIFT CHECKLISTE:]', check: ['[Punkt]', '[Punkt]', '[Punkt]'],
  btnHaupt: '[BUTTON HAUPTTIPP]', linkHaupt: 'https://www.zipperwalls.de/[LINK-HAUPTTIPP]/',
  kurzHeadline: '[HEADLINE KURZ-TIPP]', kurzText: '[KURZ-TIPP: drei Sätze, gern der Instagram-Text ausformuliert.]', linkRatgeber: 'https://www.zipperwalls.de/[LINK-RATGEBER]/',
  bild: '[PRODUKTFOTO 1080 px breit]', produkt: '[PRODUKTNAME]', nutzen: '[NUTZEN IN EINEM SATZ]', fakten: ['[FAKT 1]', '[FAKT 2]', '[FAKT 3]'],
  linkProdukt: 'https://www.zipperwalls.de/[LINK-PRODUKT]/', produktUtm: 'produkt',
  zitat: '[ZITAT AUS BEWERTUNG]', quelle: '[QUELLE] · [AKTUELLE NOTE]',
  angebotHeadline: '[HEADLINE ANGEBOT]', angebot: '[ANGEBOT: Beratung, Grafikservice, Bestellschluss o. ä. Sachlich, ohne Rabattton.]',
  btnAngebot: '[BUTTON ANGEBOT]', linkAngebot: 'https://www.zipperwalls.de/[LINK-ANGEBOT]/',
};
const a01 = {
  nn: '01', monat: 'Oktober 2026', tippNr: '01', kurzNr: '02',
  intro: ['willkommen zur ersten Ausgabe der Messepraxis. Auf Instagram und LinkedIn zeigen wir unsere Messe-Tipps kurz und kompakt. Hier finden Sie sie alle zwei Wochen ausführlich: mit Zeitplänen, Checklisten und Beispielen aus unseren Projekten.', 'Heute geht es um die Frühjahrsmessen 2027. Die entscheiden sich nämlich jetzt.'],
  headline: 'Frühjahrsmesse?<br>Jetzt planen.',
  haupttipp: ['Wer zwischen Januar und März ausstellt, hat weniger Zeit, als der Kalender vermuten lässt. Zwischen den Jahren ruhen Druck und Versand, und im Januar wollen viele Aussteller gleichzeitig beliefert werden. In der Praxis wird deshalb selten der Aufbau knapp, sondern die Zeit davor.', 'Am einfachsten planen Sie rückwärts vom Messetag. So sieht das für eine Messe Mitte Februar aus:'],
  schritte: [
    ['12 Wochen vorher', 'Mitte November', '<strong>Standmaße und Standart festlegen.</strong> Reihenstand (eine offene Seite), Eckstand (zwei) oder Kopfstand (drei). Davon hängt ab, welche Flächen bedruckt werden und ob Sie Wände beidseitig brauchen.'],
    ['8 Wochen vorher', 'Mitte Dezember', '<strong>Motiv und Druckdaten anlegen.</strong> Planen Sie mindestens eine Korrekturschleife ein, idealerweise vor den Feiertagen.'],
    ['6 Wochen vorher', 'Anfang Januar', '<strong>Bestellen und Druckdaten freigeben.</strong> Die Lieferzeit steht bei jedem Produkt im Shop. Rechnen Sie eine Woche Puffer dazu.'],
    ['4 Wochen vorher', 'Mitte Januar', '<strong>Probeaufbau im Büro.</strong> Einmal komplett aufbauen, fotografieren, prüfen, ob alles im Auto Platz hat. Fehlt etwas, ist jetzt noch Zeit.'],
  ],
  checkTitel: 'Drei Fragen, die Sie vorab mit der Messe klären sollten:',
  check: ['Welche maximale Standhöhe erlauben die technischen Richtlinien?', 'Ist ein Stromanschluss gebucht, falls Sie Licht oder Bildschirme einsetzen?', 'Welche Brandschutzklasse wird für Textilien verlangt? Unsere Stoffe sind B1-zertifiziert.'],
  btnHaupt: 'Messewände ansehen', linkHaupt: 'https://www.zipperwalls.de/messewaende/',
  kurzHeadline: 'Licht zieht Besucher an', kurzText: 'In gleichmäßig ausgeleuchteten Hallen fällt auf, was selbst leuchtet. Eine hinterleuchtete Rückwand wirkt deutlich weiter in den Gang hinein als ein angestrahlter Druck. Wir nennen das den Motten-Effekt.', linkRatgeber: 'https://www.zipperwalls.de/wissen/',
  bild: 'Messewand EASE L im Einsatz', produkt: 'Messewand EASE L', nutzen: 'Eine Rückwand, die eine Person allein aufbaut: Aluminiumrahmen im Klicksystem, bedruckter Stoffbezug mit Reißverschluss.',
  fakten: ['Breiten von 240 bis 600 cm', 'Ein- oder beidseitig bedruckt, B1-zertifiziert, waschbar bei 30 °C', 'Transport in Tasche oder Trolley, Druck später austauschbar'],
  linkProdukt: 'https://www.zipperwalls.de/', produktUtm: 'ease-l',
  zitat: 'Persönliche Betreuung ist heute nicht mehr selbstverständlich.', quelle: 'Verifizierte Bewertung bei Trusted Shops · aktuell 4,77 von 5',
  angebotHeadline: 'Wir planen Ihre Frühjahrsmesse mit', angebot: 'Nennen Sie uns Messe, Standmaße und Termin. Wir schlagen Ihnen eine passende Ausstattung vor und sagen Ihnen, bis wann bestellt sein sollte. Persönlich und unverbindlich.',
  btnAngebot: 'Angebot anfordern', linkAngebot: 'https://www.zipperwalls.de/kontakt/',
};
fs.writeFileSync(__dirname + '/messepraxis-vorlage.blocks.html', build(vorlage));
fs.writeFileSync(__dirname + '/messepraxis-01.blocks.html', build(a01));
