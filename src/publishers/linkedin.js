import { apiFetch } from './http.js';
import { escapeLinkedIn } from '../text.js';

// LinkedIn schaltet API-Versionen nach etwa 12 Monaten ab. Ohne feste Vorgabe nehmen wir den Monat
// vor drei Monaten (YYYYMM): sicher veröffentlicht und noch lange aktiv.
export function linkedinVersion(env = {}, now = new Date()) {
  if (env.LINKEDIN_VERSION) return env.LINKEDIN_VERSION;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const headers = (env, token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  'Linkedin-Version': linkedinVersion(env),
  'X-Restli-Protocol-Version': '2.0.0',
  ...extra,
});

async function uploadImage(env, { token, author, imageBytes, imageType }) {
  const init = await apiFetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: headers(env, token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
  });
  const { uploadUrl, image } = init.data.value;
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': imageType || 'application/octet-stream' }, body: imageBytes });
  if (!put.ok) throw new Error(`LinkedIn Bild Upload fehlgeschlagen (HTTP ${put.status})`);
  return image;
}

export async function publishLinkedIn(env, { token, text, imageBytes, imageType }) {
  const { accessToken, meta } = token;
  const author = meta.author;
  const body = {
    author,
    commentary: escapeLinkedIn(text),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  if (imageBytes) {
    const id = await uploadImage(env, { token: accessToken, author, imageBytes, imageType });
    body.content = { media: { id, altText: 'Zipperwalls Messewand' } };
  }
  const { headers: h } = await apiFetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: headers(env, accessToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const urn = h.get('x-restli-id');
  return { externalId: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}` : null };
}

// Zahlen gibt es nur fuer Unternehmensseiten mit genehmigter Community Management API
export async function insightsLinkedIn(env, { token, results }) {
  const { accessToken, meta } = token;
  const out = { account: {}, posts: {} };
  if (!meta.author?.startsWith('urn:li:organization:')) return out;
  try {
    const { data } = await apiFetch(
      `https://api.linkedin.com/rest/networkSizes/${encodeURIComponent(meta.author)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
      { headers: headers(env, accessToken) },
    );
    out.account.followers = data.firstDegreeSize ?? 0;
  } catch {
    /* ohne Freigabe nicht verfuegbar */
  }
  for (const r of results) {
    try {
      const q = `q=organizationalEntity&organizationalEntity=${encodeURIComponent(meta.author)}&shares=List(${encodeURIComponent(r.external_id)})`;
      const { data } = await apiFetch(`https://api.linkedin.com/rest/organizationalEntityShareStatistics?${q}`, { headers: headers(env, accessToken) });
      const s = data.elements?.[0]?.totalShareStatistics;
      if (s) out.posts[r.post_id] = { reach: s.uniqueImpressionsCount ?? 0, likes: s.likeCount ?? 0, comments: s.commentCount ?? 0, shares: s.shareCount ?? 0 };
    } catch {
      /* uebergehen */
    }
  }
  return out;
}
