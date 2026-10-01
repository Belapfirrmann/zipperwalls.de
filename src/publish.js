import { composeText, validate, CHANNELS } from './text.js';
import { loadToken } from './tokens.js';
import { publishFacebook, insightsFacebook } from './publishers/facebook.js';
import { publishInstagram, insightsInstagram } from './publishers/instagram.js';
import { publishLinkedIn, insightsLinkedIn } from './publishers/linkedin.js';

const mediaUrl = (env, key) => `${env.PUBLIC_BASE_URL}/media/${encodeURIComponent(key)}`;

// Bild je Kanal: eigenes Kanalbild (z. B. LinkedIn 1200x1200), sonst das Hauptbild
export function imageSource(post, channel) {
  const own = JSON.parse(post.channel_images || '{}')[channel];
  if (own) return own.startsWith('https://') ? { url: own } : { key: own };
  if (post.image_key) return { key: post.image_key };
  if (post.image_url) return { url: post.image_url };
  return null;
}

export function publicImageUrl(env, post, channel) {
  const src = imageSource(post, channel);
  return src ? src.url || mediaUrl(env, src.key) : null;
}

async function imageBytes(env, post, channel) {
  const src = imageSource(post, channel);
  if (src?.key) {
    const obj = await env.MEDIA.get(src.key);
    if (!obj) throw new Error('Bild nicht mehr vorhanden.');
    return { bytes: await obj.arrayBuffer(), type: obj.httpMetadata?.contentType };
  }
  if (src?.url) {
    const res = await fetch(src.url);
    if (!res.ok) throw new Error(`Bild nicht abrufbar (HTTP ${res.status}).`);
    return { bytes: await res.arrayBuffer(), type: res.headers.get('content-type') };
  }
  return { bytes: null, type: null };
}

async function publishOne(env, post, channel) {
  const text = composeText(post, channel);
  const imageUrl = publicImageUrl(env, post, channel);
  const problem = validate(channel, text, !!imageUrl);
  if (problem) throw new Error(problem);
  const token = await loadToken(env, channel);
  if (channel === 'facebook') return publishFacebook(env, { token, text, imageUrl });
  if (channel === 'instagram') return publishInstagram(env, { token, text, imageUrl });
  const img = await imageBytes(env, post, channel);
  return publishLinkedIn(env, { token, text, imageBytes: img.bytes, imageType: img.type });
}

// Veroeffentlicht einen freigegebenen Post. Kanaele, die schon geklappt haben, werden nie doppelt gesendet.
export async function publishPost(env, postId) {
  const now = new Date().toISOString();
  const claim = await env.DB.prepare(
    `UPDATE posts SET status='publishing', updated_at=?2 WHERE id=?1 AND status IN ('approved','scheduled','failed','partial')`,
  )
    .bind(postId, now)
    .run();
  if (claim.meta.changes !== 1) return null;

  const post = await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(postId).first();
  const channels = JSON.parse(post.channels).filter((c) => CHANNELS.includes(c));
  const existing = (await env.DB.prepare('SELECT * FROM post_results WHERE post_id=?').bind(postId).all()).results;
  const done = new Set(existing.filter((r) => r.status === 'ok').map((r) => r.channel));

  for (const channel of channels) {
    if (done.has(channel)) continue;
    try {
      const r = await publishOne(env, post, channel);
      await env.DB.prepare(
        `INSERT INTO post_results (post_id, channel, status, external_id, url, error, attempts, published_at)
         VALUES (?1, ?2, 'ok', ?3, ?4, NULL, 1, ?5)
         ON CONFLICT(post_id, channel) DO UPDATE SET status='ok', external_id=?3, url=?4, error=NULL, attempts=attempts+1, published_at=?5`,
      )
        .bind(postId, channel, r.externalId, r.url, new Date().toISOString())
        .run();
      done.add(channel);
    } catch (e) {
      await env.DB.prepare(
        `INSERT INTO post_results (post_id, channel, status, error, attempts)
         VALUES (?1, ?2, 'error', ?3, 1)
         ON CONFLICT(post_id, channel) DO UPDATE SET status='error', error=?3, attempts=attempts+1`,
      )
        .bind(postId, channel, e.message)
        .run();
    }
  }
  const status = channels.every((c) => done.has(c)) ? 'published' : done.size > 0 ? 'partial' : 'failed';
  await env.DB.prepare('UPDATE posts SET status=?2, updated_at=?3 WHERE id=?1').bind(postId, status, new Date().toISOString()).run();
  return status;
}

// Cron: faellige geplante Posts senden, haengende Vorgaenge freigeben
export async function runDuePosts(env) {
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await env.DB.prepare(`UPDATE posts SET status='failed' WHERE status='publishing' AND updated_at < ?`).bind(stale).run();
  const due = (
    await env.DB.prepare(`SELECT id FROM posts WHERE status IN ('approved','scheduled') AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 10`)
      .bind(now)
      .all()
  ).results;
  for (const p of due) await publishPost(env, p.id);
}

// Cron taeglich: Kennzahlen je Kanal holen und als Tagesstand speichern
export async function refreshMetrics(env) {
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const fns = { facebook: insightsFacebook, instagram: insightsInstagram, linkedin: insightsLinkedIn };
  const report = {};
  for (const channel of CHANNELS) {
    try {
      const token = await loadToken(env, channel);
      const results = (
        await env.DB.prepare(`SELECT * FROM post_results WHERE channel=? AND status='ok' AND external_id IS NOT NULL AND published_at >= ?`)
          .bind(channel, since)
          .all()
      ).results;
      const data = await fns[channel](env, { token, results });
      const totals = { likes: 0, comments: 0, shares: 0, reach: 0, saves: 0 };
      for (const [postId, stats] of Object.entries(data.posts)) {
        for (const k of Object.keys(totals)) totals[k] += stats[k] || 0;
        await env.DB.prepare('UPDATE post_results SET stats=?3, stats_at=?4 WHERE post_id=?1 AND channel=?2')
          .bind(postId, channel, JSON.stringify(stats), new Date().toISOString())
          .run();
      }
      const rows = { ...data.account, ...totals };
      for (const [metric, value] of Object.entries(rows)) {
        await env.DB.prepare(
          `INSERT INTO metrics (channel, date, metric, value) VALUES (?1,?2,?3,?4)
           ON CONFLICT(channel, date, metric) DO UPDATE SET value=?4`,
        )
          .bind(channel, today, metric, value)
          .run();
      }
      report[channel] = 'ok';
    } catch (e) {
      report[channel] = e.message;
    }
  }
  return report;
}
