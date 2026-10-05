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

export async function publishLinkedIn(env, { token, text, imageBytes, imageType, slides }) {
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
  if (slides?.length >= 2) {
    const images = [];
    for (const sl of slides.slice(0, 20)) {
      const id = await uploadImage(env, { token: accessToken, author, imageBytes: sl.bytes, imageType: sl.type });
      images.push({ id, altText: 'Zipperwalls Messewand' });
    }
    body.content = { multiImage: { images } };
  } else if (imageBytes) {
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
// Zeitraum im Rest.li-2.0-Format, Tageswerte
const timeIntervals = (from, to) => `timeIntervals=(timeRange:(start:${from},end:${to}),timeGranularityType:DAY)`;
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Nur fuer die Unternehmensseite (Community Management API): Follower, Tageswerte und Werte je Post. */
export async function insightsLinkedIn(env, { token, results, days = 7, now = new Date() }) {
  const { accessToken, meta } = token;
  const out = { account: {}, daily: {}, posts: {}, missing: [] };
  if (!meta.author?.startsWith('urn:li:organization:')) {
    out.missing.push('organization');
    return out;
  }
  const org = encodeURIComponent(meta.author);
  const get = (path) => apiFetch(`https://api.linkedin.com/rest/${path}`, { headers: headers(env, accessToken) });
  const to = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const from = to - Math.min(days, 90) * 86400000;
  const add = (ms, vals) => Object.assign((out.daily[day(ms)] ||= {}), vals);
  try {
    out.account.followers = (await get(`networkSizes/${org}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`)).data.firstDegreeSize ?? 0;
  } catch {
    /* ohne Freigabe nicht verfuegbar */
  }
  try {
    const { data } = await get(`organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${org}&${timeIntervals(from, to)}`);
    for (const e of data.elements || []) {
      const s = e.totalShareStatistics || {};
      add(e.timeRange.start, { views: s.impressionCount ?? 0, reach: s.uniqueImpressionsCount ?? 0, clicks: s.clickCount ?? 0, engagements: (s.likeCount ?? 0) + (s.commentCount ?? 0) + (s.shareCount ?? 0) });
    }
  } catch {
    /* uebergehen */
  }
  try {
    const { data } = await get(`organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${org}&${timeIntervals(from, to)}`);
    for (const e of data.elements || []) {
      const g = e.followerGains || {};
      add(e.timeRange.start, { new_follows: (g.organicFollowerGain ?? 0) + (g.paidFollowerGain ?? 0) });
    }
  } catch {
    /* uebergehen */
  }
  try {
    const { data } = await get(`organizationPageStatistics?q=organization&organization=${org}&${timeIntervals(from, to)}`);
    for (const e of data.elements || []) add(e.timeRange.start, { page_views: e.totalPageStatistics?.views?.allPageViews?.pageViews ?? 0 });
  } catch {
    /* uebergehen */
  }
  for (const r of results) {
    try {
      const q = `q=organizationalEntity&organizationalEntity=${org}&shares=List(${encodeURIComponent(r.external_id)})`;
      const { data } = await get(`organizationalEntityShareStatistics?${q}`);
      const s = data.elements?.[0]?.totalShareStatistics;
      if (s) out.posts[r.post_id] = { views: s.impressionCount ?? 0, reach: s.uniqueImpressionsCount ?? 0, clicks: s.clickCount ?? 0, likes: s.likeCount ?? 0, comments: s.commentCount ?? 0, shares: s.shareCount ?? 0 };
    } catch {
      /* uebergehen */
    }
  }
  return out;
}
