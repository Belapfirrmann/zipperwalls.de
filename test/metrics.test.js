import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsJob, mergeMetricDocs } from '../src/jobs.js';
import { dayKey } from '../src/publishers/meta-insights.js';
import { onlineHours } from '../src/publishers/instagram.js';

const ENV = { META_PAGE_TOKEN: 'PT', META_PAGE_ID: '1', IG_USER_ID: '9', GRAPH_VERSION: 'v22.0' };
const NOW = new Date('2026-10-05T06:00:00Z');
const series = (name, pairs) => ({ name, period: 'day', values: pairs.map(([end_time, value]) => ({ end_time, value })) });

// Meta-Attrappe: page_impressions ist ungueltig (zwingt Einzelabfragen), Instagram-Insights je nach igDenied
function fakeMeta({ igDenied }) {
  const calls = [];
  globalThis.fetch = async (url) => {
    url = String(url);
    calls.push(url);
    const metric = new URL(url).searchParams.get('metric') || '';
    if (url.includes('/1?fields=followers_count')) return Response.json({ followers_count: 14 });
    if (url.includes('/1/insights')) {
      if (metric.includes(',')) return Response.json({ error: { message: '(#100) The value must be a valid insights metric' } }, { status: 400 });
      if (metric === 'page_media_view') return Response.json({ data: [series('page_media_view', [['2026-10-04T07:00:00+0000', 5], ['2026-10-05T07:00:00+0000', 69]])] });
      if (metric === 'page_follows') return Response.json({ data: [series('page_follows', [['2026-10-05T07:00:00+0000', 14]])] });
      return Response.json({ error: { message: '(#100) The value must be a valid insights metric' } }, { status: 400 });
    }
    if (url.includes('/1_2?fields=reactions')) return Response.json({ reactions: { summary: { total_count: 2 } }, comments: { summary: { total_count: 1 } } });
    if (url.includes('/1_2/insights')) return Response.json({ data: [{ name: 'post_media_view', values: [{ value: 30 }] }, { name: 'post_total_media_view_unique', values: [{ value: 7 }] }, { name: 'post_clicks', values: [{ value: 1 }] }] });
    if (url.includes('/9?fields=followers_count')) return Response.json({ followers_count: 20, follows_count: 5, media_count: 1 });
    if (url.includes('/insights') && igDenied) return Response.json({ error: { message: '(#10) Application does not have permission for this action' } }, { status: 403 });
    if (url.includes('/9/insights')) {
      if (metric.includes('reach,follower_count')) return Response.json({ data: [series('reach', [['2026-10-05T07:00:00+0000', 40]]), series('follower_count', [['2026-10-05T07:00:00+0000', 2]])] });
      if (metric === 'online_followers') return Response.json({ data: [{ name: 'online_followers', values: [{ value: { 0: 10, 1: 4 }, end_time: 'x' }] }] });
      if (metric === 'follower_demographics') return Response.json({ data: [{ name: 'follower_demographics', total_value: { breakdowns: [{ dimension_keys: ['city'], results: [{ dimension_values: ['Mannheim'], value: 3 }] }] } }] });
      return Response.json({ data: [{ name: 'views', total_value: { value: 11 } }] });
    }
    if (url.includes('/m1?fields=like_count')) return Response.json({ like_count: 3, comments_count: 0 });
    if (url.includes('/m1/insights')) return Response.json({ data: metric.startsWith('reach') ? [{ name: 'reach', values: [{ value: 50 }] }, { name: 'saved', values: [{ value: 4 }] }] : [] });
    return Response.json({ error: { message: 'unerwartet ' + url } }, { status: 404 });
  };
  return calls;
}

const JOB = {
  published: [
    { post_id: 'plan-1', channel: 'facebook', external_id: '1_2' },
    { post_id: 'plan-1', channel: 'instagram', external_id: 'm1' },
  ],
};

test('Tageswerte gehoeren zum Vortag des end_time', () => {
  assert.equal(dayKey('2026-10-05T07:00:00+0000'), '2026-10-04');
});

test('Facebook: Tageswerte trotz ungueltiger Kennzahl, Post mit Reichweite und Klicks', async () => {
  fakeMeta({ igDenied: true });
  const r = await metricsJob(ENV, JOB, NOW);
  assert.deepEqual(r.channels.facebook.daily['2026-10-04'], { views: 69, followers: 14 });
  assert.equal(r.channels.facebook.daily['2026-10-03'].views, 5);
  assert.deepEqual(r.posts.facebook['plan-1'], { likes: 2, comments: 1, shares: 0, views: 30, reach: 7, clicks: 1 });
});

test('Instagram ohne Insights-Recht: Likes bleiben, Hinweis auf fehlendes Recht', async () => {
  fakeMeta({ igDenied: true });
  const r = await metricsJob(ENV, JOB, NOW);
  assert.deepEqual(r.missing.instagram, ['instagram_manage_insights']);
  assert.deepEqual(r.posts.instagram['plan-1'], { likes: 3, comments: 0 });
  assert.equal(r.docs['2026-10-05'].meta.missing.instagram[0], 'instagram_manage_insights');
});

test('Instagram mit Insights: Reichweite, Zielgruppe, Post-Werte', async () => {
  fakeMeta({ igDenied: false });
  const r = await metricsJob(ENV, { ...JOB, days: 2 }, NOW);
  const ig = r.channels.instagram;
  assert.equal(r.missing.instagram, undefined);
  assert.equal(ig.daily['2026-10-04'].reach, 40);
  assert.equal(ig.daily['2026-10-04'].new_follows, 2);
  assert.equal(ig.daily['2026-10-04'].views, 11);
  assert.equal(ig.audience.demographics.city[0].label, 'Mannheim');
  assert.equal(ig.audience.online_hours.length, 24);
  assert.deepEqual(r.posts.instagram['plan-1'], { likes: 3, comments: 0, reach: 50, saves: 4 });
});

test('online_followers wird von Pazifikzeit auf Berliner Zeit verschoben', () => {
  const h = onlineHours([{ name: 'online_followers', values: [{ value: { 0: 10 } }] }], NOW);
  assert.equal(h[9], 10);
});

test('Zusammenfuehren behaelt vorhandene Werte und setzt den Tagesstand', () => {
  const existing = { '2026-10-04': { id: '2026-10-04', facebook: { day: { reach: 3, page_views: 13 } } } };
  const docs = mergeMetricDocs(existing, {
    date: '2026-10-05',
    fetched_at: 'T',
    missing: {},
    errors: {},
    channels: { facebook: { account: { followers: 14 }, daily: { '2026-10-04': { views: 69 } } } },
  });
  assert.deepEqual(docs['2026-10-04'], { facebook: { day: { reach: 3, page_views: 13, views: 69 } } });
  assert.equal(docs['2026-10-05'].facebook.account.followers, 14);
  assert.equal(docs['2026-10-05'].meta.fetched_at, 'T');
});

test('LinkedIn ohne Unternehmensseite: kein Aufruf, nur Hinweis', async () => {
  const calls = fakeMeta({ igDenied: true });
  const r = await metricsJob({ LINKEDIN_TOKEN: 'LT' }, { published: [] }, NOW);
  assert.deepEqual(r.missing.linkedin, ['organization']);
  assert.equal(calls.length, 0);
});
