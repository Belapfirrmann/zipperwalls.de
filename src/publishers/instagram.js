import { apiFetch } from './http.js';
import { fetchInsights, addSeries, lifetimeValues, unix } from './meta-insights.js';

const base = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v22.0'}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Container muss fertig verarbeitet sein, bevor er verwendet wird
async function waitFinished(env, accessToken, id) {
  for (let i = 0; i < 15; i++) {
    const st = await apiFetch(`${base(env)}/${id}?fields=status_code,status&access_token=${accessToken}`);
    if (st.data.status_code === 'FINISHED') return;
    if (st.data.status_code === 'ERROR' || st.data.status_code === 'EXPIRED') {
      throw new Error(`Instagram Verarbeitung fehlgeschlagen: ${st.data.status || st.data.status_code}`);
    }
    await sleep(2000);
  }
}

// imageUrls mit 2 bis 10 Einträgen ergibt ein Karussell, sonst ein Einzelbild
export async function publishInstagram(env, { token, text, imageUrl, imageUrls }) {
  const { accessToken, meta } = token;
  const igId = meta.igUserId;
  const urls = imageUrls?.length >= 2 ? imageUrls.slice(0, 10) : null;
  let creationId;
  if (urls) {
    const children = [];
    for (const url of urls) {
      const c = await apiFetch(`${base(env)}/${igId}/media`, {
        method: 'POST',
        body: new URLSearchParams({ image_url: url, is_carousel_item: 'true', access_token: accessToken }),
      });
      await waitFinished(env, accessToken, c.data.id);
      children.push(c.data.id);
    }
    const car = await apiFetch(`${base(env)}/${igId}/media`, {
      method: 'POST',
      body: new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), caption: text, access_token: accessToken }),
    });
    creationId = car.data.id;
  } else {
    const create = await apiFetch(`${base(env)}/${igId}/media`, {
      method: 'POST',
      body: new URLSearchParams({ image_url: imageUrl, caption: text, access_token: accessToken }),
    });
    creationId = create.data.id;
  }
  await waitFinished(env, accessToken, creationId);
  const pub = await apiFetch(`${base(env)}/${igId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: creationId, access_token: accessToken }),
  });
  let url = null;
  try {
    const p = await apiFetch(`${base(env)}/${pub.data.id}?fields=permalink&access_token=${accessToken}`);
    url = p.data.permalink;
  } catch {
    /* Permalink ist optional */
  }
  return { externalId: pub.data.id, url };
}

// Konto-Kennzahlen: Zeitreihen (period=day) und Tagessummen (metric_type=total_value)
const IG_SERIES = { reach: 'reach', follower_count: 'new_follows' };
const IG_TOTAL = {
  views: 'views',
  accounts_engaged: 'accounts_engaged',
  total_interactions: 'engagements',
  profile_views: 'profile_views',
  website_clicks: 'website_clicks',
};
const IG_POST = { reach: 'reach', views: 'views', saved: 'saves', shares: 'shares', total_interactions: 'interactions' };
const IG_POST_EXTRA = { profile_visits: 'profile_visits', follows: 'follows' };

// Stunde in Zeitzone A -> Stunde in Zeitzone B am Tag `date`
function tzOffsetHours(tz, date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour) - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours())) / 3600000;
}

// online_followers kommt je Stunde in Pazifikzeit; Durchschnitt je Stunde in Berliner Zeit
export function onlineHours(data, now = new Date()) {
  const vals = (data.find((m) => m.name === 'online_followers')?.values || []).filter((v) => v.value && Object.keys(v.value).length);
  if (!vals.length) return null;
  const shift = Math.round(tzOffsetHours('Europe/Berlin', now) - tzOffsetHours('America/Los_Angeles', now));
  const sum = Array(24).fill(0);
  for (const v of vals) for (const [h, n] of Object.entries(v.value)) sum[(Number(h) + shift + 24) % 24] += n;
  return sum.map((n) => Math.round(n / vals.length));
}

function demographics(data) {
  const out = {};
  for (const m of data) {
    const bd = m.total_value?.breakdowns?.[0];
    if (!bd) continue;
    const key = bd.dimension_keys?.[0];
    out[key] = (bd.results || []).map((r) => ({ label: r.dimension_values.join(' '), value: r.value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }
  return Object.keys(out).length ? out : null;
}

/** Konto, Tageswerte, Zielgruppe und Werte je Post. Insights brauchen instagram_manage_insights. */
export async function insightsInstagram(env, { token, results, days = 7, now = new Date() }) {
  const { accessToken, meta } = token;
  const out = { account: {}, daily: {}, posts: {}, audience: {}, missing: [] };
  const acc = await apiFetch(`${base(env)}/${meta.igUserId}?fields=followers_count,follows_count,media_count&access_token=${accessToken}`);
  out.account = { followers: acc.data.followers_count ?? 0, following: acc.data.follows_count ?? 0, media: acc.data.media_count ?? 0 };
  let denied = false;

  const span = Math.min(days, 30);
  const series = await fetchInsights(env, accessToken, meta.igUserId, Object.keys(IG_SERIES), `period=day&since=${unix(new Date(now.getTime() - span * 86400000))}&until=${unix(now)}`);
  denied ||= series.denied;
  addSeries(out.daily, series.data, IG_SERIES);

  // Tagessummen einzeln je Tag (bis 14 Tage), sonst liefert Meta nur eine Summe ueber den Zeitraum
  if (!denied) {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for (let i = Math.min(days, 14); i >= 1; i--) {
      const start = new Date(today - i * 86400000);
      const r = await fetchInsights(env, accessToken, meta.igUserId, Object.keys(IG_TOTAL), `period=day&metric_type=total_value&since=${unix(start)}&until=${unix(start) + 86399}`);
      const d = start.toISOString().slice(0, 10);
      for (const m of r.data) if (IG_TOTAL[m.name] && m.total_value?.value != null) (out.daily[d] ||= {})[IG_TOTAL[m.name]] = m.total_value.value;
    }
    const online = await fetchInsights(env, accessToken, meta.igUserId, ['online_followers'], 'period=lifetime');
    out.audience.online_hours = onlineHours(online.data, now);
    const demo = [];
    for (const b of ['age', 'gender', 'city', 'country']) {
      demo.push(...(await fetchInsights(env, accessToken, meta.igUserId, ['follower_demographics'], `period=lifetime&metric_type=total_value&breakdown=${b}`)).data);
    }
    out.audience.demographics = demographics(demo);
  }

  for (const r of results) {
    try {
      const { data } = await apiFetch(`${base(env)}/${r.external_id}?fields=like_count,comments_count&access_token=${accessToken}`);
      const stats = { likes: data.like_count ?? 0, comments: data.comments_count ?? 0 };
      if (!denied) {
        const core = await fetchInsights(env, accessToken, r.external_id, Object.keys(IG_POST));
        denied ||= core.denied;
        Object.assign(stats, lifetimeValues(core.data, IG_POST));
        // Profilbesuche und Follows gibt es nicht fuer jeden Medientyp
        Object.assign(stats, lifetimeValues((await fetchInsights(env, accessToken, r.external_id, Object.keys(IG_POST_EXTRA))).data, IG_POST_EXTRA));
      }
      out.posts[r.post_id] = stats;
    } catch {
      /* uebergehen */
    }
  }
  if (denied) out.missing.push('instagram_manage_insights');
  return out;
}
