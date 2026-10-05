// Gemeinsame Helfer fuer Meta Insights (Facebook Seite und Instagram).
// Meta lehnt eine ganze Anfrage ab, sobald eine einzige Kennzahl ungueltig ist. Deshalb erst alle
// zusammen, bei Fehler jede einzeln. Fehlende Rechte (#10, #200) werden gesondert gemeldet.
import { apiFetch } from './http.js';

export const graph = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v22.0'}`;

export const isPermissionError = (e) => /\(#(10|200)\)|permission/i.test(e?.message || '');

// Meta liefert Tageswerte mit end_time am Folgetag (Mitternacht Pazifikzeit), gemeint ist der Vortag
export function dayKey(endTime) {
  return new Date(new Date(endTime).getTime() - 86400000).toISOString().slice(0, 10);
}

/**
 * Holt Insights fuer `metrics` (Liste von Namen) an `node`. `params` haengt period, since, until usw. an.
 * Liefert { data: [...], denied: bool }. Ungueltige Kennzahlen werden still uebergangen.
 */
export async function fetchInsights(env, accessToken, node, metrics, params = '') {
  const url = (list) => `${graph(env)}/${node}/insights?metric=${list.join(',')}${params ? '&' + params : ''}&access_token=${accessToken}`;
  try {
    return { data: (await apiFetch(url(metrics))).data.data || [], denied: false };
  } catch (e) {
    if (isPermissionError(e)) return { data: [], denied: true };
    if (metrics.length === 1) return { data: [], denied: false };
  }
  const data = [];
  let denied = false;
  for (const m of metrics) {
    const r = await fetchInsights(env, accessToken, node, [m], params);
    data.push(...r.data);
    denied ||= r.denied;
  }
  return { data, denied };
}

// Zeitreihe (period=day) in { 'YYYY-MM-DD': { feld: wert } } einsortieren
export function addSeries(daily, data, names) {
  for (const m of data) {
    const field = names[m.name];
    if (!field) continue;
    for (const v of m.values || []) {
      if (!v.end_time || typeof v.value !== 'number') continue;
      const d = dayKey(v.end_time);
      (daily[d] ||= {})[field] = v.value;
    }
  }
  return daily;
}

// Einzelwerte (lifetime) eines Posts in { feld: wert }
export function lifetimeValues(data, names) {
  const out = {};
  for (const m of data) {
    const field = names[m.name];
    const v = m.values?.[0]?.value ?? m.total_value?.value;
    if (field && v != null) out[field] = v;
  }
  return out;
}

export const unix = (d) => Math.floor(d.getTime() / 1000);
