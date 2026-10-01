import { authenticateAdmin, authenticateAgent, sameOrigin } from './auth.js';
import { CHANNELS, composeText, normalizeHashtags, isoWeek, LIMITS } from './text.js';
import { DEFAULT_PLAN, WEEKLY_TEMPLATE, SETUP_TEMPLATE } from './plan.js';
import { publishPost, runDuePosts, refreshMetrics, publicImageUrl } from './publish.js';
import { listConnections } from './tokens.js';
import { metaStart, metaCallback, linkedinStart, linkedinCallback } from './oauth.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (message, status = 400) => json({ error: message }, status);
const nowIso = () => new Date().toISOString();
const MAX_IMAGE = 8 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function hydrate(env, row, results = []) {
  return {
    ...row,
    hashtags: JSON.parse(row.hashtags || '[]'),
    variants: JSON.parse(row.variants || '{}'),
    channels: JSON.parse(row.channels || '[]'),
    image: publicImageUrl(env, row),
    results: results.map((r) => ({ ...r, stats: r.stats ? JSON.parse(r.stats) : null })),
    preview: Object.fromEntries(CHANNELS.map((c) => [c, composeText(row, c)])),
  };
}

async function getPost(env, id) {
  const row = await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(id).first();
  if (!row) return null;
  const results = (await env.DB.prepare('SELECT * FROM post_results WHERE post_id=?').bind(id).all()).results;
  return hydrate(env, row, results);
}

async function storeImage(env, bytes, type) {
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new Error('Nur JPEG oder PNG erlaubt. Instagram akzeptiert nur JPEG.');
  if (bytes.byteLength > MAX_IMAGE) throw new Error('Bild größer als 8 MB.');
  const key = `${crypto.randomUUID()}.${ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
  return key;
}

function cleanChannels(list) {
  const c = (Array.isArray(list) ? list : CHANNELS).filter((x) => CHANNELS.includes(x));
  return c.length ? [...new Set(c)] : CHANNELS;
}

// ---------- Agent API (Bearer Token) ----------
async function agentCreatePost(env, request) {
  const b = await readBody(request);
  if (!b || !b.title || !b.body) return fail('title und body sind Pflicht.');
  let imageKey = null;
  let imageUrl = null;
  if (b.image_base64) {
    try {
      const bin = Uint8Array.from(atob(b.image_base64), (c) => c.charCodeAt(0));
      imageKey = await storeImage(env, bin, b.image_type || 'image/jpeg');
    } catch (e) {
      return fail(e.message);
    }
  } else if (b.image_url) {
    if (!/^https:\/\//.test(b.image_url)) return fail('image_url muss mit https:// beginnen.');
    imageUrl = b.image_url;
  }
  let scheduled = null;
  if (b.scheduled_at) {
    if (Number.isNaN(Date.parse(b.scheduled_at))) return fail('scheduled_at ist kein gültiges Datum (ISO 8601).');
    scheduled = new Date(b.scheduled_at).toISOString();
  }
  const id = crypto.randomUUID();
  const t = nowIso();
  await env.DB.prepare(
    `INSERT INTO posts (id,title,body,hashtags,variants,channels,image_key,image_url,notes,status,scheduled_at,source,created_at,updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'draft',?10,'agent',?11,?11)`,
  )
    .bind(id, String(b.title).slice(0, 200), String(b.body), JSON.stringify(normalizeHashtags(b.hashtags)), JSON.stringify(b.variants && typeof b.variants === 'object' ? b.variants : {}), JSON.stringify(cleanChannels(b.channels)), imageKey, imageUrl, b.notes ? String(b.notes).slice(0, 2000) : null, scheduled, t)
    .run();
  return json({ id, status: 'draft', review_url: `${env.PUBLIC_BASE_URL}/#freigabe` }, 201);
}

async function agentSummary(env) {
  const posts = (await env.DB.prepare(`SELECT id,title,status,scheduled_at,created_at FROM posts ORDER BY created_at DESC LIMIT 20`).all()).results;
  const best = (
    await env.DB.prepare(
      `SELECT p.title, r.channel, r.stats FROM post_results r JOIN posts p ON p.id=r.post_id WHERE r.stats IS NOT NULL ORDER BY r.stats_at DESC LIMIT 30`,
    ).all()
  ).results.map((r) => ({ title: r.title, channel: r.channel, stats: JSON.parse(r.stats) }));
  const metrics = (await env.DB.prepare(`SELECT channel,date,metric,value FROM metrics ORDER BY date DESC LIMIT 200`).all()).results;
  const plan = await loadPlan(env);
  return json({ plan, recent_posts: posts, post_stats: best, metrics });
}

// ---------- Plan, Checkliste ----------
async function loadPlan(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key='plan'`).first();
  return row ? JSON.parse(row.value) : DEFAULT_PLAN;
}

async function ensureChecklist(env, week) {
  const have = await env.DB.prepare(`SELECT COUNT(*) n FROM checklist WHERE kind='weekly' AND week=?`).bind(week).first();
  if (!have.n) {
    await env.DB.batch(
      WEEKLY_TEMPLATE.map((label, i) =>
        env.DB.prepare(`INSERT INTO checklist (id,kind,week,label,pos) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(), 'weekly', week, label, i),
      ),
    );
  }
  const setup = await env.DB.prepare(`SELECT COUNT(*) n FROM checklist WHERE kind='setup'`).first();
  if (!setup.n) {
    await env.DB.batch(
      SETUP_TEMPLATE.map((label, i) => env.DB.prepare(`INSERT INTO checklist (id,kind,week,label,pos) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(), 'setup', null, label, i)),
    );
  }
}

// ---------- Admin API ----------
async function adminApi(request, env, ctx, url, email) {
  const { pathname: p } = url;
  const m = request.method;
  let r;

  if (p === '/api/me') return json({ email });

  if (p === '/api/plan') {
    if (m === 'GET') return json(await loadPlan(env));
    if (m === 'PUT') {
      const b = await readBody(request);
      if (!b || typeof b !== 'object' || !b.title) return fail('Ungültiger Plan.');
      await env.DB.prepare(`INSERT INTO settings (key,value) VALUES ('plan',?1) ON CONFLICT(key) DO UPDATE SET value=?1`).bind(JSON.stringify({ ...b, placeholder: false })).run();
      return json({ ok: true });
    }
  }

  if (p === '/api/posts' && m === 'GET') {
    const status = url.searchParams.get('status');
    const rows = (status
      ? await env.DB.prepare(`SELECT * FROM posts WHERE status=? ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 100`).bind(status).all()
      : await env.DB.prepare(`SELECT * FROM posts ORDER BY created_at DESC LIMIT 100`).all()
    ).results;
    const results = (await env.DB.prepare(`SELECT * FROM post_results`).all()).results;
    return json(rows.map((row) => hydrate(env, row, results.filter((x) => x.post_id === row.id))));
  }

  if ((r = /^\/api\/posts\/([\w-]+)$/.exec(p))) {
    const post = await getPost(env, r[1]);
    if (!post) return fail('Post nicht gefunden.', 404);
    if (m === 'GET') return json(post);
    if (m === 'PATCH') {
      if (!['draft', 'rejected', 'scheduled', 'failed', 'partial'].includes(post.status)) return fail('Dieser Post kann in seinem Status nicht bearbeitet werden.', 409);
      const b = (await readBody(request)) || {};
      const variants = b.variants && typeof b.variants === 'object' ? b.variants : post.variants;
      for (const c of CHANNELS) if (variants[c] && variants[c].length > LIMITS[c] + 5000) return fail('Text zu lang.');
      await env.DB.prepare(`UPDATE posts SET title=?2, body=?3, hashtags=?4, variants=?5, channels=?6, scheduled_at=?7, updated_at=?8 WHERE id=?1`)
        .bind(
          post.id,
          String(b.title ?? post.title).slice(0, 200),
          String(b.body ?? post.body),
          JSON.stringify(normalizeHashtags(b.hashtags ?? post.hashtags)),
          JSON.stringify(variants),
          JSON.stringify(cleanChannels(b.channels ?? post.channels)),
          b.scheduled_at === undefined ? post.scheduled_at : b.scheduled_at ? new Date(b.scheduled_at).toISOString() : null,
          nowIso(),
        )
        .run();
      return json(await getPost(env, post.id));
    }
  }

  if ((r = /^\/api\/posts\/([\w-]+)\/image$/.exec(p)) && m === 'POST') {
    const post = await getPost(env, r[1]);
    if (!post) return fail('Post nicht gefunden.', 404);
    if (!['draft', 'rejected', 'scheduled', 'failed', 'partial'].includes(post.status)) return fail('Bild kann jetzt nicht getauscht werden.', 409);
    const type = (request.headers.get('Content-Type') || '').split(';')[0];
    try {
      const key = await storeImage(env, await request.arrayBuffer(), type);
      await env.DB.prepare(`UPDATE posts SET image_key=?2, image_url=NULL, updated_at=?3 WHERE id=?1`).bind(post.id, key, nowIso()).run();
    } catch (e) {
      return fail(e.message);
    }
    return json(await getPost(env, post.id));
  }

  if ((r = /^\/api\/posts\/([\w-]+)\/(approve|reject)$/.exec(p)) && m === 'POST') {
    const post = await getPost(env, r[1]);
    if (!post) return fail('Post nicht gefunden.', 404);
    if (r[2] === 'reject') {
      if (!['draft', 'scheduled'].includes(post.status)) return fail('Nur Entwürfe oder geplante Posts können abgelehnt werden.', 409);
      await env.DB.prepare(`UPDATE posts SET status='rejected', updated_at=?2 WHERE id=?1`).bind(post.id, nowIso()).run();
      return json(await getPost(env, post.id));
    }
    if (!['draft', 'rejected', 'scheduled', 'failed', 'partial'].includes(post.status)) return fail('Dieser Post ist bereits freigegeben oder veröffentlicht.', 409);
    const b = (await readBody(request)) || {};
    const connected = new Set((await listConnections(env)).filter((c) => c.connected).map((c) => c.channel));
    if (!post.channels.some((c) => connected.has(c))) return fail('Keiner der gewählten Kanäle ist verbunden. Bitte unter "Verbindungen" verbinden.', 409);
    let when = nowIso();
    if (b.mode === 'schedule') {
      if (!b.scheduled_at || Number.isNaN(Date.parse(b.scheduled_at))) return fail('Bitte einen gültigen Zeitpunkt wählen.');
      when = new Date(b.scheduled_at).toISOString();
    }
    const status = b.mode === 'schedule' ? 'scheduled' : 'approved';
    await env.DB.prepare(`UPDATE posts SET status=?2, scheduled_at=?3, approved_by=?4, approved_at=?5, updated_at=?5 WHERE id=?1`).bind(post.id, status, when, email, nowIso()).run();
    if (b.mode !== 'schedule') ctx.waitUntil(publishPost(env, post.id));
    return json(await getPost(env, post.id));
  }

  if (p === '/api/checklist' && m === 'GET') {
    const week = /^\d{4}-W\d{2}$/.test(url.searchParams.get('week') || '') ? url.searchParams.get('week') : isoWeek();
    await ensureChecklist(env, week);
    const items = (await env.DB.prepare(`SELECT * FROM checklist WHERE (kind='weekly' AND week=?) OR kind='setup' ORDER BY kind DESC, pos`).bind(week).all()).results;
    return json({ week, currentWeek: isoWeek(), items });
  }
  if ((r = /^\/api\/checklist\/([\w-]+)\/toggle$/.exec(p)) && m === 'POST') {
    const item = await env.DB.prepare('SELECT * FROM checklist WHERE id=?').bind(r[1]).first();
    if (!item) return fail('Eintrag nicht gefunden.', 404);
    const done = item.done ? 0 : 1;
    await env.DB.prepare(`UPDATE checklist SET done=?2, done_by=?3, done_at=?4 WHERE id=?1`).bind(item.id, done, done ? email : null, done ? nowIso() : null).run();
    return json({ ...item, done, done_by: done ? email : null, done_at: done ? nowIso() : null });
  }

  if (p === '/api/metrics' && m === 'GET') {
    const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    const rows = (await env.DB.prepare(`SELECT channel,date,metric,value FROM metrics WHERE date >= ? ORDER BY date`).bind(since).all()).results;
    const posts = (
      await env.DB.prepare(`SELECT p.id, p.title, r.channel, r.url, r.published_at, r.stats FROM post_results r JOIN posts p ON p.id=r.post_id WHERE r.status='ok' ORDER BY r.published_at DESC LIMIT 60`).all()
    ).results.map((x) => ({ ...x, stats: x.stats ? JSON.parse(x.stats) : null }));
    return json({ series: rows, posts });
  }
  if (p === '/api/metrics/refresh' && m === 'POST') return json(await refreshMetrics(env));

  if (p === '/api/connections' && m === 'GET') {
    return json({ connections: await listConnections(env), providers: { meta: !!env.META_APP_ID && !!env.META_APP_SECRET, linkedin: !!env.LINKEDIN_CLIENT_ID && !!env.LINKEDIN_CLIENT_SECRET, linkedinOrg: !!env.LINKEDIN_ORG_ID } });
  }
  if ((r = /^\/api\/connections\/(facebook|instagram|linkedin)\/disconnect$/.exec(p)) && m === 'POST') {
    await env.DB.prepare('DELETE FROM tokens WHERE channel=?').bind(r[1]).run();
    return json({ ok: true });
  }

  return fail('Nicht gefunden.', 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      // Oeffentlich: Bilder (Instagram und Facebook muessen sie per URL abrufen)
      if (p.startsWith('/media/') && request.method === 'GET') {
        const obj = await env.MEDIA.get(decodeURIComponent(p.slice(7)));
        if (!obj) return new Response('Nicht gefunden', { status: 404 });
        return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
      }

      // Agent API
      if (p.startsWith('/api/agent/')) {
        if (!authenticateAgent(request, env)) return fail('Nicht autorisiert.', 401);
        if (p === '/api/agent/posts' && request.method === 'POST') return await agentCreatePost(env, request);
        if (p === '/api/agent/summary' && request.method === 'GET') return await agentSummary(env);
        let r;
        if ((r = /^\/api\/agent\/posts\/([\w-]+)$/.exec(p)) && request.method === 'GET') {
          const post = await getPost(env, r[1]);
          return post ? json({ id: post.id, status: post.status, scheduled_at: post.scheduled_at, results: post.results }) : fail('Nicht gefunden.', 404);
        }
        return fail('Nicht gefunden.', 404);
      }

      // Alles andere nur fuer Admins
      const email = await authenticateAdmin(request, env);
      if (!email) return fail('Nicht angemeldet.', 401);
      if (request.method !== 'GET' && !sameOrigin(request)) return fail('Ungültige Herkunft.', 403);

      if (p === '/oauth/meta/start') return await metaStart(env);
      if (p === '/oauth/meta/callback') return await metaCallback(env, url);
      if (p === '/oauth/linkedin/start') return await linkedinStart(env);
      if (p === '/oauth/linkedin/callback') return await linkedinCallback(env, url);

      return await adminApi(request, env, ctx, url, email);
    } catch (e) {
      console.error(e);
      return fail('Serverfehler: ' + e.message, 500);
    }
  },

  async scheduled(event, env, ctx) {
    if (event.cron === '0 4 * * *') ctx.waitUntil(refreshMetrics(env));
    else ctx.waitUntil(runDuePosts(env));
  },
};
