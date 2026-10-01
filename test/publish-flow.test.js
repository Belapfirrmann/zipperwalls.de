import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { publishPost, runDuePosts } from '../src/publish.js';
import { saveToken } from '../src/tokens.js';

// Minimaler D1 Ersatz auf Basis von node:sqlite
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())) };
}

const env = () => ({
  DB: d1(),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  PUBLIC_BASE_URL: 'https://social.example',
  GRAPH_VERSION: 'v22.0',
  MEDIA: { get: async () => null },
});

async function addPost(e, { status = 'approved', channels = ['facebook', 'instagram'], image = 'https://cdn.example/a.jpg', scheduled = null } = {}) {
  const t = new Date().toISOString();
  await e.DB.prepare(`INSERT INTO posts (id,title,body,channels,image_url,status,scheduled_at,created_at,updated_at) VALUES ('p1','T','Text',?,?,?,?,?,?)`)
    .bind(JSON.stringify(channels), image, status, scheduled, t, t).run();
}

test('Teilerfolg: Facebook ok, Instagram Fehler, Wiederholung postet Facebook nicht doppelt', async () => {
  const e = env();
  await saveToken(e, 'facebook', { accessToken: 'FB', meta: { pageId: '1' } });
  await saveToken(e, 'instagram', { accessToken: 'IG', meta: { igUserId: '9' } });
  await addPost(e);
  let fbCalls = 0;
  let igFail = true;
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.includes('/1/photos')) { fbCalls++; return Response.json({ post_id: '1_2' }); }
    if (igFail) return Response.json({ error: { message: 'Token ungültig' } }, { status: 400 });
    if (url.endsWith('/9/media')) return Response.json({ id: 'c' });
    if (url.includes('status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('media_publish')) return Response.json({ id: 'm' });
    return Response.json({ permalink: 'https://instagram.com/p/m' });
  };
  assert.equal(await publishPost(e, 'p1'), 'partial');
  const err = await e.DB.prepare(`SELECT * FROM post_results WHERE channel='instagram'`).first();
  assert.match(err.error, /Token ungültig/);

  igFail = false;
  assert.equal(await publishPost(e, 'p1'), 'published');
  assert.equal(fbCalls, 1);
  // bereits veroeffentlicht: kein weiterer Versuch
  assert.equal(await publishPost(e, 'p1'), null);
});

test('Nicht verbundener Kanal ergibt verstaendlichen Fehler', async () => {
  const e = env();
  await addPost(e, { channels: ['linkedin'] });
  assert.equal(await publishPost(e, 'p1'), 'failed');
  const r = await e.DB.prepare('SELECT error FROM post_results').first();
  assert.match(r.error, /Nicht verbunden/);
});

test('Cron sendet nur faellige geplante Posts', async () => {
  const e = env();
  await saveToken(e, 'facebook', { accessToken: 'FB', meta: { pageId: '1' } });
  await addPost(e, { status: 'scheduled', channels: ['facebook'], scheduled: new Date(Date.now() + 3600e3).toISOString() });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ post_id: '1_2' }); };
  await runDuePosts(e);
  assert.equal(calls, 0);
  await e.DB.prepare(`UPDATE posts SET scheduled_at=?`).bind(new Date(Date.now() - 1000).toISOString()).run();
  await runDuePosts(e);
  assert.equal(calls, 1);
  assert.equal((await e.DB.prepare('SELECT status FROM posts').first()).status, 'published');
});
