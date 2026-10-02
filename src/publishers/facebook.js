import { apiFetch } from './http.js';

const base = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v22.0'}`;

function photoForm(accessToken, imageBytes, imageType, fields) {
  const form = new FormData();
  form.append('access_token', accessToken);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const ext = imageType === 'image/png' ? 'png' : 'jpg';
  form.append('source', new Blob([imageBytes], { type: imageType || 'image/jpeg' }), `bild.${ext}`);
  return form;
}

// Post auf die Facebook Seite. Bild wird als Datei hochgeladen (keine oeffentliche URL noetig).
export async function publishFacebook(env, { token, text, imageBytes, imageType }) {
  const { accessToken, meta } = token;
  const pageId = meta.pageId;
  let res;
  if (imageBytes) {
    res = await apiFetch(`${base(env)}/${pageId}/photos`, { method: 'POST', body: photoForm(accessToken, imageBytes, imageType, { caption: text }) });
  } else {
    res = await apiFetch(`${base(env)}/${pageId}/feed`, { method: 'POST', body: new URLSearchParams({ access_token: accessToken, message: text }) });
  }
  const id = res.data.post_id || res.data.id;
  return { externalId: id, url: `https://www.facebook.com/${id}` };
}

// Instagram braucht eine oeffentliche Bild URL. Dafuer wird das Bild unveroeffentlicht auf der
// Facebook Seite abgelegt; dessen Facebook CDN Adresse ist oeffentlich und immer JPEG.
export async function uploadHiddenPhoto(env, { token, imageBytes, imageType }) {
  const { accessToken, meta } = token;
  const up = await apiFetch(`${base(env)}/${meta.pageId}/photos`, {
    method: 'POST',
    body: photoForm(accessToken, imageBytes, imageType, { published: 'false' }),
  });
  const info = await apiFetch(`${base(env)}/${up.data.id}?fields=images&access_token=${accessToken}`);
  const best = [...(info.data.images || [])].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!best?.source) throw new Error('Bildadresse von Facebook nicht erhalten.');
  return { id: up.data.id, url: best.source };
}

export async function deletePhoto(env, { token, id }) {
  await apiFetch(`${base(env)}/${id}?access_token=${token.accessToken}`, { method: 'DELETE' });
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
