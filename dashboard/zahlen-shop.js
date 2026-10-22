// ---------- Zahlen: Shop und Newsletter ----------
// Shop: shop/<YYYY-MM-DD> mit { orders, gross, net, shipping, items, sources: {<quelle>: {orders, net}}, products: {<name>: {qty, net}} }
// Newsletter: Felder open_rate, click_rate, unsubscribes, stats in newsletters/<key>, Listen in status/shop.lists.
// Beides holt die Routine "Social Zahlen" mit scripts/shop.js (docs/routinen/zahlen.md). Nutzt die Helfer aus zahlen.js.
const SHOP_SOURCES = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', bio: 'Bio-Link (Linktree)', newsletter: 'Newsletter',
  google_ads: 'Google Ads', google: 'Google (organisch)', other_search: 'Andere Suchmaschinen', referral: 'Andere Webseiten',
  direct: 'Direkt', admin: 'Manuell angelegt', unknown: 'Unbekannt',
};
const MARKETING = ['facebook', 'instagram', 'linkedin', 'bio', 'newsletter'];
const fmtEur = (v) => (v == null ? 'k. A.' : `${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`);
const srcColor = (k) => `var(--c-${k})`;

function zahlenParts(active) {
  return `<div class="parts" role="tablist" aria-label="Bereich der Zahlen">
    <a role="tab" href="#zahlen" class="part ${active === 'social' ? 'on' : ''}" aria-selected="${active === 'social'}">Social Media</a>
    <a role="tab" href="#zahlen-shop" class="part ${active === 'shop' ? 'on' : ''}" aria-selected="${active === 'shop'}">Shop</a>
    <a role="tab" href="#zahlen-newsletter" class="part ${active === 'newsletter' ? 'on' : ''}" aria-selected="${active === 'newsletter'}">Newsletter</a>
  </div>`;
}

function shopRange() {
  const N = Z.range;
  const end = addDays(berlinDay(), -1);
  const dates = Array.from({ length: N }, (_, i) => addDays(end, i - N + 1));
  const prevDates = dates.map((d) => addDays(d, -N));
  const byDay = Object.fromEntries((S.shop || []).map((d) => [d.id, d]));
  // Vorzeitraum nur vergleichen, wenn er vollständig abgerufen wurde (Tage ohne Bestellung haben kein Dokument)
  const since = (S.status.shop?.since) || (S.shop || []).map((d) => d.id).sort()[0] || '9999';
  const sum = (ds, f) => (ds[0] < since ? null : ds.reduce((s, d) => s + (byDay[d] ? f(byDay[d]) || 0 : 0), 0));
  const sources = (ds) => {
    const out = {};
    if (ds[0] < since) return out;
    for (const d of ds) for (const [k, v] of Object.entries(byDay[d]?.sources || {})) {
      const o = (out[k] ??= { orders: 0, net: 0 });
      o.orders += v.orders || 0;
      o.net += v.net || 0;
    }
    return out;
  };
  return { N, end, dates, prevDates, byDay, sum, sources, since };
}

function rangeFilters(dates, end) {
  return `<div class="filters" role="group" aria-label="Zeitraum">${RANGES.map(([n, l]) => `<button class="tab ${n === Z.range ? 'on' : ''}" data-range="${n}" type="button">${l}</button>`).join('')}
    <span class="muted small">${shortDate(dates[0])} bis ${shortDate(end)}</span></div>`;
}

function viewZahlenShop() {
  const R = shopRange();
  const { dates, prevDates, sum } = R;
  const st = S.status.shop || {};
  const head = `<div class="head"><h1>Zahlen</h1>${zahlenParts('shop')}<p>Bestellungen und Umsatz aus dem Shop, dazu woher die Käufer kamen. Nur Summen, keine Kundendaten. Claude holt die Werte jeden Morgen${st.fetched_at ? `, zuletzt am ${fmtDate(st.fetched_at)}` : ''}.</p></div>`;
  if (!(S.shop || []).length) {
    main.innerHTML = `${head}<div class="card empty"><h2>Noch keine Shop-Zahlen</h2><p style="margin-top:10px">Die Zahlen kommen mit dem nächsten Morgenlauf.</p></div>`;
    return;
  }
  const net = sum(dates, (d) => d.net), netPrev = sum(prevDates, (d) => d.net);
  const orders = sum(dates, (d) => d.orders), ordersPrev = sum(prevDates, (d) => d.orders);
  const aov = orders ? net / orders : null, aovPrev = ordersPrev ? netPrev / ordersPrev : null;
  const src = R.sources(dates);
  const known = Object.entries(src).filter(([k]) => k !== 'unknown').reduce((s, [, v]) => s + v.orders, 0);
  const mkt = MARKETING.reduce((s, k) => s + (src[k]?.net || 0), 0);
  const mktOrders = MARKETING.reduce((s, k) => s + (src[k]?.orders || 0), 0);
  const keys = Object.keys(SHOP_SOURCES).filter((k) => dates.some((d) => R.byDay[d]?.sources?.[k]));
  const series = keys.map((k) => ({ key: k, label: SHOP_SOURCES[k], values: dates.map((d) => Math.round(R.byDay[d]?.sources?.[k]?.net || 0)) }));
  const srcRows = Object.entries(src).sort((a, b) => b[1].net - a[1].net).map(([k, v]) => ({ key: k, label: SHOP_SOURCES[k] || k, value: Math.round(v.net), hint: `${v.orders} Bestellungen, Umsatz netto` }));
  const prods = {};
  for (const d of dates) for (const [name, p] of Object.entries(R.byDay[d]?.products || {})) {
    const o = (prods[name] ??= { qty: 0, net: 0 });
    o.qty += p.qty || 0;
    o.net += p.net || 0;
  }
  const prodRows = Object.entries(prods).sort((a, b) => b[1].net - a[1].net).slice(0, 10).map(([name, p]) => ({ key: 'shop', label: name, value: Math.round(p.net), hint: `${p.qty} Stück, Umsatz netto` }));
  const unknownShare = orders ? (src.unknown?.orders || 0) / orders : 0;

  main.innerHTML = `${head}
    ${rangeFilters(dates, R.end)}
    <section class="section grid zk">
      ${kpi('Umsatz netto', net, delta(net, netPrev), 'Ohne Steuern, mit Versand', fmtEur)}
      ${kpi('Bestellungen', orders, delta(orders, ordersPrev), 'Ohne stornierte und erstattete')}
      ${kpi('Ø Bestellwert', aov, delta(aov, aovPrev), 'Umsatz netto je Bestellung', fmtEur)}
      ${kpi('Artikel', sum(dates, (d) => d.items), delta(sum(dates, (d) => d.items), sum(prevDates, (d) => d.items)), 'Verkaufte Stück')}
      ${kpi('Über Social und Newsletter', mkt, `<span class="muted">${mktOrders} Bestellungen</span>`, 'Facebook, Instagram, LinkedIn, Bio-Link, Newsletter', fmtEur)}
      ${kpi('Herkunft bekannt', orders ? known / orders : null, `<span class="muted">${known} von ${orders} Bestellungen</span>`, 'Rest ohne Zuordnung', fmtPct)}
    </section>
    ${unknownShare > 0.5 ? `<div class="notice small">Bei ${fmtPct(unknownShare)} der Bestellungen ist die Herkunft unbekannt. WooCommerce merkt sich die Herkunft nur, wenn der Käufer Cookies erlaubt. Die Anteile unten beziehen sich deshalb nur auf einen Teil der Käufe.</div>` : ''}
    <section class="section card">
      <h2>Umsatz je Tag</h2><p class="muted small" style="margin-top:6px">Umsatz netto in Euro, nach Herkunft der Käufer</p>
      <div class="legend">${keys.map((k) => `<span><i style="background:${srcColor(k)}"></i>${SHOP_SOURCES[k]}</span>`).join('')}</div>
      ${stackedBars(dates, series, 'Umsatz netto je Tag nach Herkunft', { left: 72 })}
    </section>
    <section class="section grid g2">
      <div class="card"><h2>Woher die Käufer kommen</h2><p class="muted small" style="margin:6px 0 14px">Umsatz netto im Zeitraum</p>${srcRows.length ? hBars(srcRows, { fmt: fmtEur, color: (r) => srcColor(r.key), pct: true }) : '<p class="muted">Keine Bestellungen im Zeitraum.</p>'}</div>
      <div class="card"><h2>Meistverkaufte Produkte</h2><p class="muted small" style="margin:6px 0 14px">Umsatz netto im Zeitraum</p>${prodRows.length ? hBars(prodRows, { fmt: fmtEur, color: () => 'var(--c-shop)' }) : '<p class="muted">Keine Bestellungen im Zeitraum.</p>'}</div>
    </section>`;
  bindZahlen();
}

function viewZahlenNewsletter() {
  const R = shopRange();
  const st = S.status.shop || {};
  const sent = nlEntries().filter((n) => n.doc && n.status === 'Versendet').sort((a, b) => b.send_at.localeCompare(a.send_at));
  const withStats = sent.filter((n) => n.stats?.sent);
  const avg = (f) => (withStats.length ? withStats.reduce((s, n) => s + (n[f] || 0), 0) / withStats.length : null);
  const subs = (st.lists || []).reduce((s, l) => s + (l.subscribed || 0), 0);
  const nlSrc = R.sources(R.dates).newsletter || { orders: 0, net: 0 };
  const nlPrev = R.prevDates[0] < R.since ? { net: null } : (R.sources(R.prevDates).newsletter || { orders: 0, net: 0 });
  const missing = (st.missing || []).includes('mailpoet_stats');
  const pct = (v) => (v == null ? 'k. A.' : `${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);

  main.innerHTML = `
    <div class="head"><h1>Zahlen</h1>${zahlenParts('newsletter')}<p>Öffnungen, Klicks und Abmeldungen je Ausgabe direkt aus MailPoet, dazu die Bestellungen, die über einen Newsletter-Link kamen${st.fetched_at ? `. Zuletzt geholt am ${fmtDate(st.fetched_at)}` : ''}.</p></div>
    ${missing ? `<div class="notice small">MailPoet liefert die Kennzahlen erst, wenn das Code-Snippet „Zipperwalls Newsletter-Schnittstelle“ in WordPress aktualisiert ist (neuer Endpunkt für Statistiken). Bis dahin stehen hier die von Hand eingetragenen Werte.</div>` : ''}
    ${rangeFilters(R.dates, R.end)}
    <section class="section grid zk">
      ${kpi('Abonnenten', st.lists ? subs : null, `<span class="muted">${(st.lists || []).length} Listen</span>`, 'Aktive Empfänger')}
      ${kpi('Ø Öffnungsrate', avg('open_rate'), `<span class="muted">${withStats.length} Ausgaben</span>`, 'Geöffnet je Empfänger', pct)}
      ${kpi('Ø Klickrate', avg('click_rate'), `<span class="muted">${withStats.length} Ausgaben</span>`, 'Geklickt je Empfänger', pct)}
      ${kpi('Abmeldungen', withStats.length ? withStats.reduce((s, n) => s + (n.unsubscribes || 0), 0) : null, '<span class="muted">alle Ausgaben</span>', 'Summe')}
      ${kpi('Umsatz über Newsletter', nlSrc.net, delta(nlSrc.net, nlPrev.net), `${nlSrc.orders} Bestellungen im Zeitraum`, fmtEur)}
      ${kpi('Versendet', sent.length, '<span class="muted">seit Start</span>', 'Ausgaben')}
    </section>
    <section class="section card"><h2>Ausgaben</h2>
      ${sent.length ? `<div class="tablewrap"><table class="ztable"><thead><tr><th>Ausgabe</th><th>Versand</th><th class="n">Empfänger</th><th class="n">Öffnungsrate</th><th class="n">Klickrate</th><th class="n">Abmeldungen</th></tr></thead><tbody>
        ${sent.map((n) => `<tr><td>${esc(n.subject || n.topic)}</td><td>${esc(fmtDayLong(n.date))}</td><td class="n">${n.stats?.sent != null ? fmtNum(n.stats.sent) : 'k. A.'}</td>
          <td class="n">${pct(n.open_rate)}</td><td class="n">${pct(n.click_rate)}</td><td class="n">${n.unsubscribes != null ? fmtNum(n.unsubscribes) : 'k. A.'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted" style="margin-top:10px">Noch keine versendeten Ausgaben.</p>'}
      <p class="muted small" style="margin-top:10px">Öffnungsraten sind wegen Datenschutzfunktionen mancher Mailprogramme nur ein Richtwert. Klicks und Bestellungen sind verlässlicher.</p>
    </section>`;
  bindZahlen();
}
