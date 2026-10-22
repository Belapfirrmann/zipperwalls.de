// Shop-Kennzahlen aus WooCommerce für den Reiter Zahlen. Reine Funktionen ohne Netzwerk (Abruf: scripts/shop.js).
// Gespeichert werden nur Summen je Tag, nie Namen, Adressen oder E-Mails von Kunden.

// Bestellungen mit diesen Status zählen nicht als Umsatz
export const IGNORED_STATUS = ['cancelled', 'refunded', 'failed', 'pending', 'checkout-draft', 'trash'];

export const SOURCE_LABEL = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', bio: 'Bio-Link (Linktree)', newsletter: 'Newsletter',
  google_ads: 'Google Ads', google: 'Google (organisch)', other_search: 'Andere Suchmaschinen', referral: 'Andere Webseiten',
  direct: 'Direkt', admin: 'Manuell angelegt', unknown: 'Unbekannt',
};

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Herkunft aus der WooCommerce-Bestellzuordnung (_wc_order_attribution_*)
export function classifySource(meta = {}) {
  const type = String(meta.source_type || '').toLowerCase();
  const src = String(meta.utm_source || '').toLowerCase();
  const medium = String(meta.utm_medium || '').toLowerCase();
  const ref = host(meta.referrer || '');
  const has = (s, ...keys) => keys.some((k) => s.includes(k));
  if (has(src, 'mailpoet', 'newsletter') || medium === 'email') return 'newsletter';
  if (has(src, 'linktr') || has(ref, 'linktr.ee')) return 'bio';
  if (has(src, 'instagram') || src === 'ig' || has(ref, 'instagram.com')) return 'instagram';
  if (has(src, 'facebook') || src === 'fb' || has(ref, 'facebook.com', 'fb.com', 'fb.me')) return 'facebook';
  if (has(src, 'linkedin') || has(ref, 'linkedin.com', 'lnkd.in')) return 'linkedin';
  if (has(src, 'google') && ['cpc', 'ppc', 'paid', 'paidsearch'].some((m) => medium.includes(m))) return 'google_ads';
  if (has(src, 'google') && type === 'utm') return 'google_ads';
  if (type === 'organic') return has(src, 'google') || has(ref, 'google.') ? 'google' : 'other_search';
  if (type === 'referral') return ref.includes('google.') ? 'google' : 'referral';
  if (type === 'typein') return 'direct';
  if (type === 'admin') return 'admin';
  return 'unknown';
}

// Tag in deutscher Zeit; WooCommerce liefert date_created in der Zeitzone des Shops (Berlin) ohne Zone
const dayOf = (o) => String(o.date_created || '').slice(0, 10);
const num = (v) => Math.round(Number(v || 0) * 100) / 100;

/**
 * orders: WooCommerce-Bestellungen (Felder id, status, date_created, total, total_tax, shipping_total, line_items, meta_data)
 * Liefert { "<YYYY-MM-DD>": { orders, gross, net, shipping, items, sources: { <quelle>: { orders, net } }, products: { <name>: { qty, net } } } }
 */
export function aggregateOrders(orders) {
  const days = {};
  for (const o of orders) {
    if (IGNORED_STATUS.includes(o.status)) continue;
    const day = dayOf(o);
    if (!day) continue;
    const d = (days[day] ??= { orders: 0, gross: 0, net: 0, shipping: 0, items: 0, sources: {}, products: {} });
    const gross = Number(o.total || 0);
    const net = gross - Number(o.total_tax || 0);
    d.orders += 1;
    d.gross = num(d.gross + gross);
    d.net = num(d.net + net);
    d.shipping = num(d.shipping + Number(o.shipping_total || 0));
    const meta = {};
    for (const m of o.meta_data || []) {
      const k = String(m.key || '');
      if (k.startsWith('_wc_order_attribution_')) meta[k.slice(22)] = m.value;
    }
    const s = (d.sources[classifySource(meta)] ??= { orders: 0, net: 0 });
    s.orders += 1;
    s.net = num(s.net + net);
    for (const li of o.line_items || []) {
      // Varianten unter dem Hauptprodukt zusammenfassen (parent_name), sonst der Positionsname
      const key = String(li.parent_name || li.name || 'Ohne Namen').trim().slice(0, 80);
      const p = (d.products[key] ??= { qty: 0, net: 0 });
      p.qty += Number(li.quantity || 0);
      p.net = num(p.net + Number(li.total || 0));
      d.items += Number(li.quantity || 0);
    }
  }
  // Je Tag nur die 15 umsatzstärksten Produkte behalten (Dokumentgröße)
  for (const d of Object.values(days)) {
    d.products = Object.fromEntries(Object.entries(d.products).sort((a, b) => b[1].net - a[1].net).slice(0, 15));
  }
  return days;
}

// MailPoet-Statistik eines Newsletters als Felder für newsletters/<key>
export function newsletterKpis(st) {
  if (!st || !st.sent) return null;
  const pct = (v) => (v == null ? null : Math.round((v / st.sent) * 1000) / 10);
  return {
    open_rate: pct(st.opens), click_rate: pct(st.clicks), unsubscribes: st.unsubscribes ?? null,
    stats: { sent: st.sent, opens: st.opens ?? null, clicks: st.clicks ?? null, unsubscribes: st.unsubscribes ?? null, sent_at: st.sent_at || null },
  };
}
