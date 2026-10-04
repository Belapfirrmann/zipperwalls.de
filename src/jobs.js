// Veroeffentlichen und Kennzahlen ohne eigenen Server. Wird von scripts/social.js aufgerufen,
// das wiederum die Claude Routine startet. Reine Logik, Netzwerk nur ueber die Publisher.
import { composeText, validate, CHANNELS } from './text.js';
import { publishFacebook, uploadHiddenPhoto, deletePhoto, insightsFacebook } from './publishers/facebook.js';
import { publishInstagram, insightsInstagram } from './publishers/instagram.js';
import { publishLinkedIn, insightsLinkedIn, linkedinVersion } from './publishers/linkedin.js';
import { apiFetch } from './publishers/http.js';

// Zugangsdaten kommen aus Umgebungsvariablen der Claude Umgebung, nie aus dem Dashboard
export function tokensFromEnv(env) {
  const t = {};
  if (env.META_PAGE_TOKEN && env.META_PAGE_ID) t.facebook = { accessToken: env.META_PAGE_TOKEN, meta: { pageId: env.META_PAGE_ID } };
  if (env.META_PAGE_TOKEN && env.META_PAGE_ID && env.IG_USER_ID) {
    t.instagram = { accessToken: env.META_PAGE_TOKEN, meta: { igUserId: env.IG_USER_ID, pageId: env.META_PAGE_ID } };
  }
  if (env.LINKEDIN_TOKEN) t.linkedin = { accessToken: env.LINKEDIN_TOKEN, meta: { author: env.LINKEDIN_AUTHOR || null } };
  return t;
}

async function linkedinAuthor(token) {
  if (token.meta.author) return token.meta.author;
  const me = await apiFetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token.accessToken}` } });
  return `urn:li:person:${me.data.sub}`;
}

// LinkedIn nur als Unternehmensseite (Vorgabe Bela und Darien): ohne Organisations-Absender wird nicht gepostet
export const isOrgAuthor = (env) => String(env.LINKEDIN_AUTHOR || '').startsWith('urn:li:organization:');
export const LINKEDIN_PAUSED = 'Pausiert: LinkedIn postet nur als Unternehmensseite. Dafür fehlt noch die Freigabe der Community Management API (LINKEDIN_AUTHOR).';

const imageFor = (images, channel) => (channel === 'linkedin' && images?.linkedin) || images?.main || null;

/**
 * job: { post: {variants, body, hashtags, channels, results}, images: {main, linkedin, slides: [...]} } (je {bytes,type})
 * slides mit 2 bis 10 Bildern ergibt auf allen Kanälen ein Karussell (Bilder zum Durchwischen).
 * Kanaele, die in post.results schon status 'ok' haben, werden nie erneut gesendet.
 */
export async function publishJob(env, job, { dryRun = false } = {}) {
  const tokens = tokensFromEnv(env);
  const post = job.post;
  const previous = post.results || {};
  const channels = (post.channels || CHANNELS).filter((c) => CHANNELS.includes(c));
  const results = {};
  const at = new Date().toISOString();

  for (const channel of channels) {
    if (previous[channel]?.status === 'ok') continue;
    if (channel === 'linkedin' && !isOrgAuthor(env)) {
      results[channel] = { status: 'skipped', error: LINKEDIN_PAUSED, at };
      continue;
    }
    const text = composeText(post, channel);
    const slides = job.images?.slides?.length >= 2 ? job.images.slides.slice(0, 10) : null;
    const img = slides ? slides[0] : imageFor(job.images, channel);
    try {
      const problem = validate(channel, text, !!img);
      if (problem) throw new Error(problem);
      const token = tokens[channel];
      if (!token) throw new Error('Nicht verbunden: Zugangsdaten fehlen in der Claude Umgebung.');
      if (dryRun) {
        results[channel] = { status: 'dry-run', at, chars: text.length, image: !!img, slides: slides?.length || 0 };
        continue;
      }
      let r;
      if (channel === 'facebook') {
        r = await publishFacebook(env, { token, text, imageBytes: img?.bytes, imageType: img?.type, slides });
      } else if (channel === 'instagram') {
        const hidden = [];
        for (const sl of slides || [img]) hidden.push(await uploadHiddenPhoto(env, { token, imageBytes: sl.bytes, imageType: sl.type }));
        r = await publishInstagram(env, { token, text, imageUrl: hidden[0].url, imageUrls: slides ? hidden.map((h) => h.url) : null });
        for (const h of hidden) await deletePhoto(env, { token, id: h.id }).catch(() => {});
      } else {
        const author = await linkedinAuthor(token);
        r = await publishLinkedIn(env, { token: { ...token, meta: { author } }, text, imageBytes: img?.bytes, imageType: img?.type, slides });
      }
      results[channel] = { status: 'ok', external_id: r.externalId, url: r.url, at };
    } catch (e) {
      results[channel] = { status: 'error', error: e.message, at };
    }
  }

  const merged = { ...previous, ...results };
  const active = channels.filter((c) => merged[c]?.status !== 'skipped');
  const okCount = active.filter((c) => merged[c]?.status === 'ok').length;
  const status = dryRun ? 'dry-run' : active.length && okCount === active.length ? 'published' : okCount > 0 ? 'partial' : 'failed';
  return { status, results };
}

/** job: { published: [{post_id, channel, external_id}] } */
export async function metricsJob(env, job) {
  const tokens = tokensFromEnv(env);
  const fns = { facebook: insightsFacebook, instagram: insightsInstagram, linkedin: insightsLinkedIn };
  const out = { date: new Date().toISOString().slice(0, 10), channels: {}, errors: {} };
  for (const channel of CHANNELS) {
    const token = tokens[channel];
    if (!token) continue;
    try {
      const t = channel === 'linkedin' ? { ...token, meta: { author: await linkedinAuthor(token) } } : token;
      const results = (job.published || []).filter((r) => r.channel === channel && r.external_id);
      out.channels[channel] = await fns[channel](env, { token: t, results });
    } catch (e) {
      out.errors[channel] = e.message;
    }
  }
  return out;
}

// Prueft die Zugangsdaten und liefert den Verbindungsstatus fuer das Dashboard
export async function checkConnections(env) {
  const tokens = tokensFromEnv(env);
  const g = `https://graph.facebook.com/${env.GRAPH_VERSION || 'v22.0'}`;
  const at = new Date().toISOString();
  const out = {};
  const run = async (channel, fn) => {
    if (!tokens[channel]) return (out[channel] = { ok: false, error: 'Zugangsdaten fehlen', checked_at: at });
    try {
      out[channel] = { ok: true, ...(await fn(tokens[channel])), checked_at: at };
    } catch (e) {
      out[channel] = { ok: false, error: e.message, checked_at: at };
    }
  };
  await run('facebook', async (t) => ({ label: (await apiFetch(`${g}/${t.meta.pageId}?fields=name&access_token=${t.accessToken}`)).data.name }));
  await run('instagram', async (t) => ({ label: '@' + (await apiFetch(`${g}/${t.meta.igUserId}?fields=username&access_token=${t.accessToken}`)).data.username }));
  await run('linkedin', async (t) => {
    if (!isOrgAuthor(env)) throw new Error(LINKEDIN_PAUSED);
    // Eigene App nur mit Community Management API: kein "Sign In", daher Prüfung über die Beiträge der Seite
    const author = encodeURIComponent(env.LINKEDIN_AUTHOR);
    await apiFetch(`https://api.linkedin.com/rest/posts?q=author&author=${author}&count=1`, {
      headers: { Authorization: `Bearer ${t.accessToken}`, 'Linkedin-Version': linkedinVersion(env), 'X-Restli-Protocol-Version': '2.0.0', 'X-RestLi-Method': 'FINDER' },
    });
    const exp = env.LINKEDIN_TOKEN_EXPIRES ? new Date(env.LINKEDIN_TOKEN_EXPIRES) : null;
    return { label: 'Unternehmensseite', days_left: exp ? Math.floor((exp - Date.now()) / 86400000) : null };
  });
  return out;
}
