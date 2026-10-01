import { apiFetch } from './http.js';

const base = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v22.0'}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function publishInstagram(env, { token, text, imageUrl }) {
  const { accessToken, meta } = token;
  const igId = meta.igUserId;
  const create = await apiFetch(`${base(env)}/${igId}/media`, {
    method: 'POST',
    body: new URLSearchParams({ image_url: imageUrl, caption: text, access_token: accessToken }),
  });
  const creationId = create.data.id;
  // Container muss fertig verarbeitet sein, bevor veroeffentlicht wird
  for (let i = 0; i < 10; i++) {
    const st = await apiFetch(`${base(env)}/${creationId}?fields=status_code,status&access_token=${accessToken}`);
    if (st.data.status_code === 'FINISHED') break;
    if (st.data.status_code === 'ERROR' || st.data.status_code === 'EXPIRED') {
      throw new Error(`Instagram Verarbeitung fehlgeschlagen: ${st.data.status || st.data.status_code}`);
    }
    await sleep(2000);
  }
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

export async function insightsInstagram(env, { token, results }) {
  const { accessToken, meta } = token;
  const out = { account: {}, posts: {} };
  const acc = await apiFetch(`${base(env)}/${meta.igUserId}?fields=followers_count&access_token=${accessToken}`);
  out.account.followers = acc.data.followers_count ?? 0;
  for (const r of results) {
    try {
      const { data } = await apiFetch(`${base(env)}/${r.external_id}?fields=like_count,comments_count&access_token=${accessToken}`);
      const stats = { likes: data.like_count ?? 0, comments: data.comments_count ?? 0 };
      try {
        const ins = await apiFetch(`${base(env)}/${r.external_id}/insights?metric=reach,saved,shares&access_token=${accessToken}`);
        for (const m of ins.data.data || []) stats[m.name === 'saved' ? 'saves' : m.name] = m.values?.[0]?.value ?? 0;
      } catch {
        /* Insights je nach Medientyp nicht verfuegbar */
      }
      out.posts[r.post_id] = stats;
    } catch {
      /* uebergehen */
    }
  }
  return out;
}
