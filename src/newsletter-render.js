// Newsletter "Standpunkt" als E-Mail-HTML im Zipperwalls-Design (Grundlage: newsletter/messepraxis-vorlage.html auf main).
// Reine Funktionen ohne Netzwerk: das Dashboard nutzt sie für die Vorschau, Tests prüfen sie.
// Der Fließtext bleibt einfacher Text und wird so gegliedert:
//   Leerzeile trennt Absätze · Zeile in Versalien = Zwischenüberschrift · "1. Titel. Text" = nummerierter Schritt
//   "Viele Grüße …" = Grußformel · Absatz mit "Telefon" oder E-Mail-Adresse = Kontaktzeile
//   Absatz, in dem jede Zeile "Wann: Was" ist = Zeitplan · "Tipp:" am Zeilenanfang wird hervorgehoben

export const NL_NAME = 'Standpunkt';

const H = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const F = "font-family:'Barlow',Arial,Helvetica,sans-serif;";
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// MailPoet-Links: im Export bleiben die Shortcodes, in der Vorschau führen sie ins Leere
export const MAILPOET = {
  webversion: '[link:newsletter_view_in_browser_action]',
  unsubscribe: '[link:subscription_unsubscribe_url]',
  manage: '[link:subscription_manage_url]',
};
const ICON = (glyph) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 36 36"><circle cx="18" cy="18" r="18" fill="#FFFFFF"/>${glyph}</svg>`);
export const SOCIAL = [
  ['Instagram', 'https://www.instagram.com/zipperwalls.de/', ICON('<rect x="10" y="10" width="16" height="16" rx="5" fill="none" stroke="#1D1D1B" stroke-width="2.2"/><circle cx="18" cy="18" r="3.8" fill="none" stroke="#1D1D1B" stroke-width="2.2"/><circle cx="22.7" cy="13.3" r="1.2" fill="#1D1D1B"/>')],
  ['LinkedIn', 'https://www.linkedin.com/company/zipperwalls', ICON('<rect x="10.8" y="15" width="3" height="10.5" fill="#1D1D1B"/><circle cx="12.3" cy="11.6" r="1.8" fill="#1D1D1B"/><path d="M16.6 15h2.9v1.5c.6-1 1.8-1.8 3.4-1.8 2.7 0 3.9 1.7 3.9 4.5v6.3h-3v-5.5c0-1.5-.5-2.4-1.8-2.4-1.4 0-2.4 1-2.4 2.5v5.4h-3z" fill="#1D1D1B"/>')],
  ['Facebook', 'https://www.facebook.com/zipperwalls', ICON('<path d="M19.6 27.5v-8.4h2.8l.4-3.3h-3.2v-2.1c0-.9.3-1.6 1.6-1.6h1.7V9.2c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4h-2.8v3.3h2.8v8.4z" fill="#1D1D1B"/>')],
];

// Text in Bausteine zerlegen
export function parseNewsletterText(text) {
  const blocks = [];
  for (const raw of String(text || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const b = raw.trim();
    if (!b) continue;
    const step = /^(\d{1,2})\.\s+([\s\S]+)$/.exec(b);
    if (/^Viele Grüße|^Mit freundlichen Grüßen|^Beste Grüße/i.test(b)) blocks.push({ type: 'signature', lines: b.split('\n') });
    else if (/^Telefon|^Tel\.|[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(b) && b.length < 240) blocks.push({ type: 'contact', lines: b.split('\n') });
    else if (b.length < 90 && !b.includes('\n') && /[A-ZÄÖÜ]/.test(b) && b === b.toUpperCase()) blocks.push({ type: 'heading', text: b });
    else if (b.includes('\n') && b.split('\n').every((l) => /^[A-ZÄÖÜ0-9][^:\n]{2,28}:\s+\S/.test(l))) blocks.push({ type: 'timeline', items: b.split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i), l.slice(i + 1).trim()]; }) });
    else if (step) {
      const [, num, rest] = step;
      const m = /^(.+?[.:!?])\s+([\s\S]+)$/.exec(rest);
      blocks.push({ type: 'step', num: Number(num), title: m ? m[1] : rest, text: m ? m[2] : '' });
    } else blocks.push({ type: 'p', text: b });
  }
  return blocks;
}

// Adressen im Text klickbar machen
function linkify(escaped) {
  return escaped
    .replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:#1D1D1B;font-weight:700;">$1</a>')
    .replace(/(^|[\s(|])(www\.zipperwalls\.de(?:[^\s<]*[^\s<.,;:!?)])?)/g, '$1<a href="https://$2" style="color:#1D1D1B;font-weight:700;">$2</a>')
    .replace(/\b([\w.+-]+@[\w-]+\.[a-z]{2,})\b/gi, '<a href="mailto:$1" style="color:#1D1D1B;font-weight:700;">$1</a>');
}
const nl2br = (s) => s.replace(/\n/g, '<br>');
// Absatztext: maskieren, verlinken, "Tipp:" am Zeilenanfang hervorheben, Zeilenumbrüche
const richText = (s) => nl2br(linkify(H(s)).replace(/(^|\n)(Tipp:)/g, '$1<span style="display:inline-block;margin-top:8px;font-weight:800;">$2</span>'));

function button(text, href, dark) {
  if (!text || !href) return '';
  const bg = dark ? '#1D1D1B' : '#FFCC20';
  const fg = dark ? '#FFFFFF' : '#1D1D1B';
  return `<table role="presentation"><tr><td style="background:${bg};border-radius:12px 0 12px 0;">
    <a href="${H(href)}" style="${F}display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:${fg};text-decoration:none;">${H(text)}</a>
  </td></tr></table>`;
}

function stepsBox(steps) {
  return `<tr><td class="pad" style="padding:20px 40px 0;">
    <table role="presentation" width="100%" style="background:#F5F5F5;border-radius:30px 0 30px 0;"><tr><td class="box" style="padding:24px 24px 8px;">
      <table role="presentation" width="100%">${steps.map((s) => `
        <tr>
          <td valign="top" width="54" class="num" style="${F}padding:0 12px 18px 0;font-size:34px;line-height:1;font-weight:900;font-style:italic;color:#1D1D1B;">${String(s.num).padStart(2, '0')}</td>
          <td valign="top" style="${F}padding:2px 0 18px;font-size:16px;line-height:1.5;color:#1D1D1B;"><strong>${H(s.title)}</strong>${s.text ? ` ${richText(s.text)}` : ''}</td>
        </tr>`).join('')}
      </table>
    </td></tr></table>
  </td></tr>`;
}

// n: Newsletter (Felder wie im Plan plus badge, headline, image_*, offer_*), opts: { logo, imageSrc, preview }
// Öffentliche Bilder für echte Mails (WordPress-Mediathek, hochgeladen am 04.10.2026). Die Vorschau im Dashboard nutzt eingebettete Varianten.
const UP = 'https://www.zipperwalls.de/wp-content/uploads/';
export const EXPORT_ASSETS = {
  logo: UP + 'standpunkt-logo-farbig.png',
  logoLight: UP + 'standpunkt-logo-weiss.png',
  icons: { Instagram: UP + 'standpunkt-icon-instagram.png', LinkedIn: UP + 'standpunkt-icon-linkedin.png', Facebook: UP + 'standpunkt-icon-facebook.png' },
};

export function renderNewsletter(n, optsIn = {}) {
  const preview = !!optsIn.preview;
  const opts = preview ? optsIn : { ...EXPORT_ASSETS, ...optsIn };
  const link = (key) => (preview ? '#' : MAILPOET[key]);
  const d = n.date ? new Date(n.date + 'T12:00:00Z') : null;
  const issue = `Ausgabe ${String(n.nr ?? '').padStart(2, '0')}${d ? ` · ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ''}`;
  // In der Vorschau nur Bilder, die das Dashboard laden darf; sonst ein Platzhalter
  const img = preview ? opts.imageSrc : n.image_url;
  const imgMissing = preview && !img && n.image_url;

  // Text: Schritte bündeln, Haupt-Button vor die Grußformel
  const rows = [];
  let steps = [];
  let buttonDone = false;
  const flush = () => { if (steps.length) rows.push(stepsBox(steps)); steps = []; };
  const mainButton = () => {
    if (buttonDone || !n.button_text) return;
    buttonDone = true;
    rows.push(`<tr><td class="pad" style="padding:22px 40px 0;">${button(n.button_text, n.button_link)}</td></tr>`);
  };
  for (const b of parseNewsletterText(n.text)) {
    if (b.type === 'step') { steps.push(b); continue; }
    flush();
    if (b.type === 'heading') rows.push(`<tr><td class="pad" style="padding:30px 40px 0;"><h2 style="${F}margin:0;font-size:24px;line-height:1.1;font-weight:900;text-transform:uppercase;color:#1D1D1B;">${H(b.text)}</h2></td></tr>`);
    else if (b.type === 'p') rows.push(`<tr><td class="pad" style="${F}padding:16px 40px 0;font-size:17px;line-height:1.55;color:#1D1D1B;">${richText(b.text)}</td></tr>`);
    else if (b.type === 'timeline') rows.push(`<tr><td class="pad" style="padding:16px 40px 0;"><table role="presentation" width="100%">${b.items.map(([when, what]) => `<tr>
        <td valign="top" width="150" class="when" style="${F}padding:10px 12px 10px 0;border-top:2px solid #1D1D1B;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#1D1D1B;">${H(when)}</td>
        <td valign="top" style="${F}padding:10px 0;border-top:2px solid #1D1D1B;font-size:16px;line-height:1.5;color:#1D1D1B;">${linkify(H(what))}</td></tr>`).join('')}</table></td></tr>`);
    else if (b.type === 'signature') {
      mainButton();
      rows.push(`<tr><td class="pad" style="${F}padding:30px 40px 0;font-size:17px;line-height:1.55;color:#1D1D1B;">${b.lines.map((l, i) => (i === b.lines.length - 1 && b.lines.length > 1 ? `<strong>${H(l)}</strong>` : H(l))).join('<br>')}</td></tr>`);
    } else if (b.type === 'contact') rows.push(`<tr><td class="pad" style="${F}padding:14px 40px 0;font-size:14px;line-height:1.6;color:#4B4F58;">${b.lines.map((l) => linkify(H(l))).join('<br>')}</td></tr>`);
  }
  flush();
  mainButton();

  const offer = n.offer_title ? `
  <tr><td class="pad" style="padding:36px 40px 0;">
    <table role="presentation" width="100%" style="background:#1F2725;border-radius:30px 0 30px 0;"><tr><td class="box" style="${F}padding:26px 28px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#FFCC20;">${H(n.offer_label || 'Persönliche Beratung')}</div>
      <h2 style="${F}margin:8px 0 10px;font-size:24px;line-height:1.1;font-weight:900;text-transform:uppercase;color:#FFFFFF;">${H(n.offer_title)}</h2>
      ${n.offer_text ? `<p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#E6E8EA;">${nl2br(H(n.offer_text))}</p>` : ''}
      ${button(n.offer_button_text, n.offer_button_link)}
    </td></tr></table>
  </td></tr>` : '';

  // Drei Produktempfehlungen (Felder p1_* bis p3_*), Bild in der Vorschau aus den Dashboard-Assets
  const prods = [1, 2, 3].map((i) => ({ name: n[`p${i}_name`], price: n[`p${i}_price`], text: n[`p${i}_text`], link: n[`p${i}_link`], img: preview ? opts.productImages?.[i - 1] : n[`p${i}_image_url`] })).filter((x) => x.name);
  const products = prods.length ? `
  <tr><td class="pad" style="padding:0 40px 36px;background:#FFCC20;">
    <div style="${F}padding-top:32px;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#1D1D1B;">${H(n.products_label || 'Unsere Empfehlung')}</div>
    <h2 style="${F}margin:8px 0 20px;font-size:26px;line-height:1.05;font-weight:900;font-style:italic;text-transform:uppercase;color:#1D1D1B;">${nl2br(H(n.products_title || ''))}</h2>
    <table role="presentation" width="100%"><tr>${prods.map((x, i) => `
      <td class="col" valign="top" width="33%" style="padding:0 ${i < prods.length - 1 ? '10px' : '0'} 0 0;">
        <table role="presentation" width="100%" style="background:#FFFFFF;border-radius:20px 0 20px 0;"><tr><td style="padding:0;">
          <a href="${H(x.link || '#')}">${x.img ? `<img src="${H(x.img)}" alt="${H(x.name)}" height="130" class="pimg" style="width:100%;height:130px;object-fit:cover;border-radius:20px 0 0 0;">` : `<div style="${F}height:130px;background:#F5F5F5;border-radius:20px 0 0 0;font-size:12px;color:#4B4F58;text-align:center;line-height:130px;">Bild</div>`}</a>
        </td></tr><tr><td style="${F}padding:14px 14px 16px;">
          <div style="font-size:16px;line-height:1.15;font-weight:900;text-transform:uppercase;color:#1D1D1B;">${H(x.name)}</div>
          ${x.price ? `<div style="margin-top:6px;font-size:15px;font-weight:800;color:#1D1D1B;">${H(x.price)}</div>` : ''}
          <p style="margin:6px 0 10px;font-size:14px;line-height:1.45;color:#4B4F58;">${H(x.text || '')}</p>
          <a href="${H(x.link || '#')}" style="font-size:14px;font-weight:800;color:#1D1D1B;">Ansehen ›</a>
        </td></tr></table>
      </td>`).join('')}
    </tr></table>
  </td></tr>` : '';

  const extra = n.extra_title ? `
  <tr><td class="pad" style="padding:36px 40px 0;"><div style="border-top:1px solid #D9DDE0;font-size:0;line-height:0;">&nbsp;</div></td></tr>
  <tr><td class="pad" style="${F}padding:24px 40px 0;">
    <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#4B4F58;">${H(n.extra_title)}</div>
    <p style="margin:8px 0 0;font-size:17px;line-height:1.55;color:#1D1D1B;">${nl2br(linkify(H(n.extra_text || '')))}${n.extra_link ? ` <a href="${H(n.extra_link)}" style="color:#1D1D1B;font-weight:700;">Mehr dazu</a>` : ''}</p>
  </td></tr>` : '';

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${H(n.subject || NL_NAME)}</title>
${preview ? '<base target="_blank">' : ''}
<link href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,700;0,800;0,900;1,900&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:#F2F5F7; }
  table { border-collapse:collapse; }
  img { border:0; display:block; max-width:100%; height:auto; }
  a { color:#1D1D1B; }
  @media (max-width:620px) {
    .wrap { width:100% !important; }
    .outer { padding:0 !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
    .box { padding-left:16px !important; padding-right:16px !important; }
    .h1 { font-size:30px !important; }
    .num { width:40px !important; font-size:28px !important; }
    .when { width:110px !important; }
    .col { display:block !important; width:100% !important; padding:0 0 14px !important; }
    .pimg { height:190px !important; }
  }
</style></head>
<body>
<div style="display:none;max-height:0;overflow:hidden;">${H(n.preview || '')}</div>
<table role="presentation" width="100%" style="background:#F2F5F7;"><tr><td class="outer" align="center" style="padding:24px 8px;">
<table role="presentation" class="wrap" width="600" style="width:600px;background:#FFFFFF;">

  <tr><td class="pad" style="${F}padding:12px 40px;background:#F2F5F7;font-size:12px;color:#4B4F58;text-align:right;">
    Wird die E-Mail nicht richtig angezeigt? <a href="${link('webversion')}" style="color:#4B4F58;">Im Browser lesen</a>
  </td></tr>

  <tr><td class="pad" style="padding:32px 40px 20px;">
    <a href="https://www.zipperwalls.de/">${opts.logo ? `<img src="${H(opts.logo)}" width="220" alt="zipperwalls.de" style="width:220px;">` : `<span style="${F}font-size:28px;font-weight:900;font-style:italic;color:#1D1D1B;">LOGO</span>`}</a>
  </td></tr>
  <tr><td class="pad" style="padding:0 40px;">
    <table role="presentation" width="100%"><tr>
      <td style="${F}border-top:3px solid #1D1D1B;padding-top:10px;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#1D1D1B;">${NL_NAME}</td>
      <td align="right" style="${F}border-top:3px solid #1D1D1B;padding-top:10px;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#4B4F58;">${H(issue)}</td>
    </tr></table>
  </td></tr>

  ${img ? `<tr><td class="pad" style="padding:28px 40px 0;">
    <a href="${H(n.image_link || n.button_link || 'https://www.zipperwalls.de/')}"><img src="${H(img)}" width="520" alt="${H(n.image_alt || '')}" style="width:100%;border-radius:30px 0 30px 0;"></a>
  </td></tr>` : ''}
  ${imgMissing ? `<tr><td class="pad" style="padding:28px 40px 0;"><div style="${F}background:#F5F5F5;border-radius:30px 0 30px 0;padding:60px 20px;text-align:center;font-size:14px;color:#4B4F58;">Bild: ${H(n.image_alt || n.image_url)}<br>Für die Vorschau im Dashboard bitte hochladen.</div></td></tr>` : ''}

  ${n.badge ? `<tr><td class="pad" style="padding:28px 40px 0;">
    <table role="presentation"><tr><td style="${F}background:#FFCC20;color:#1D1D1B;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;padding:5px 12px;border-radius:8px 0 8px 0;">${H(n.badge)}</td></tr></table>
  </td></tr>` : ''}
  ${n.headline ? `<tr><td class="pad" style="padding:14px 40px 0;">
    <h1 class="h1" style="${F}margin:0;font-size:40px;line-height:1;font-weight:900;font-style:italic;text-transform:uppercase;color:#1D1D1B;">${nl2br(H(n.headline))}</h1>
  </td></tr>` : ''}

  ${rows.join('\n')}
  ${offer}
  ${extra}

  <tr><td style="font-size:0;line-height:0;height:40px;">&nbsp;</td></tr>
  ${products}

  <tr><td class="pad" style="${F}padding:32px 40px;background:#1F2725;font-size:13px;line-height:1.6;color:#C9CDD0;">
    <a href="https://www.zipperwalls.de/">${opts.logoLight ? `<img src="${H(opts.logoLight)}" width="170" alt="zipperwalls.de" style="width:170px;">` : `<span style="${F}font-size:22px;font-weight:900;font-style:italic;color:#FFFFFF;">zipperwalls.de</span>`}</a>
    <p style="margin:20px 0 10px;color:#FFFFFF;font-size:15px;font-weight:700;">Jeden Dienstag und Donnerstag ein neuer Tipp auf unseren Kanälen:</p>
    <table role="presentation"><tr>${SOCIAL.map(([name, url, icon]) => `<td style="padding:0 10px 0 0;"><a href="${url}" title="${name}"><img src="${H(opts.icons?.[name] || icon)}" width="36" height="36" alt="${name}" style="width:36px;height:36px;"></a></td>`).join('')}</tr></table>
    <p style="margin:22px 0 8px;">Sie erhalten diese E-Mail, weil Sie den Newsletter ${NL_NAME} von Zipperwalls abonniert haben.</p>
    <p style="margin:0;"><a href="${link('unsubscribe')}" style="color:#FFFFFF;">Abmelden</a> · <a href="${link('manage')}" style="color:#FFFFFF;">Einstellungen</a> · <a href="https://www.zipperwalls.de/impressum/" style="color:#FFFFFF;">Impressum</a> · <a href="https://www.zipperwalls.de/datenschutzerklaerung/" style="color:#FFFFFF;">Datenschutz</a></p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
