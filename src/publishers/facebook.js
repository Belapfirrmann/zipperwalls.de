import { apiFetch } from './http.js';

const base = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v22.0'}`;

export async function publishFacebook(env, { token, text, imageUrl }) {
  const { accessToken, meta } = token;
  const pageId = meta.pageId;
  const form = new URLSearchParams({ access_token: accessToken });
  let path;
  if (imageUrl) {
    path = `/${pageId}/photos`;
    form.set('url', imageUrl);
    form.set('caption', text);
  } else {
    path = `/${pageId}/feed`;
    form.set('message', text);
  }
  const { data } = await apiFetch(base(env) + path, { method: 'POST', body: form });
  const id = data.post_id || data.id;
  return { externalId: id, url: `https://www.facebook.com/${id}` };
}

export async function insightsFacebook(env, { token, results }) {
  const { accessToken, meta } = token;
  const out = { account: {}, posts: {} };
  const page = await apiFetch(`${base(env)}/${meta.pageId}?fields=followers_count,fan_count&access_token=${accessToken}`);
  out.account.followers = page.data.followers_count ?? page.data.fan_count ?? 0;
  for (const r of results) {
    try {
      const f = 'reactions.summary(true).limit(0),comments.summary(true).limit(0),shares';
      const { data } = await apiFetch(`${base(env)}/${r.external_id}?fields=${f}&access_token=${accessToken}`);
      out.posts[r.post_id] = {
        likes: data.reactions?.summary?.total_count ?? 0,
        comments: data.comments?.summary?.total_count ?? 0,
        shares: data.shares?.count ?? 0,
      };
    } catch {
      /* einzelner Post nicht abrufbar, uebergehen */
    }
  }
  return out;
}
