import test from 'node:test';
import assert from 'node:assert/strict';
import { publishJob, metricsJob, tokensFromEnv } from '../src/jobs.js';

const ENV = { META_PAGE_TOKEN: 'PT', META_PAGE_ID: '1', IG_USER_ID: '9', LINKEDIN_TOKEN: 'LT', LINKEDIN_AUTHOR: 'urn:li:organization:42', GRAPH_VERSION: 'v22.0' };
const img = { bytes: new Uint8Array([1, 2]), type: 'image/png' };
const post = (extra = {}) => ({ variants: { facebook: 'FB Text', instagram: 'IG Text', linkedin: 'LI Text' }, hashtags: ['#messe'], channels: ['facebook', 'instagram', 'linkedin'], ...extra });

// Simuliert Meta und LinkedIn; failIg schaltet einen Instagram Fehler ein
function fakeApis(state) {
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    state.calls.push(url);
    if (url.endsWith('/1/photos')) {
      const hidden = opts.body.get('published') === 'false';
      return Response.json(hidden ? { id: 'hid1' } : { id: 'ph', post_id: '1_2' });
    }
    if (url.includes('/hid1?fields=images')) return Response.json({ images: [{ width: 100, height: 125, source: 'https://small' }, { width: 1080, height: 1350, source: 'https://scontent.example/big.jpg' }] });
    if (url.includes('/hid1?') && opts.method === 'DELETE') return Response.json({ success: true });
    if (url.endsWith('/9/media')) {
      if (state.failIg) return Response.json({ error: { message: 'Medientyp ungültig' } }, { status: 400 });
      state.igImage = opts.body.get('image_url');
      return Response.json({ id: 'c1' });
    }
    if (url.includes('/c1?fields=status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/9/media_publish')) return Response.json({ id: 'm1' });
    if (url.includes('/m1?fields=permalink')) return Response.json({ permalink: 'https://instagram.com/p/m1' });
    if (url.includes('initializeUpload')) return Response.json({ value: { uploadUrl: 'https://upload.example/x', image: 'urn:li:image:1' } });
    if (url === 'https://upload.example/x') return new Response('', { status: 201 });
    if (url.endsWith('/rest/posts')) return new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:5' } });
    return Response.json({ error: { message: 'unerwartet ' + url } }, { status: 404 });
  };
}

test('Alle drei Kanaele: Instagram nutzt die oeffentliche Facebook Bildadresse', async () => {
  const state = { calls: [] };
  fakeApis(state);
  const r = await publishJob(ENV, { post: post(), images: { main: img } });
  assert.equal(r.status, 'published');
  assert.equal(state.igImage, 'https://scontent.example/big.jpg');
  assert.equal(r.results.linkedin.url, 'https://www.linkedin.com/feed/update/urn:li:share:5');
  assert.equal(r.results.facebook.external_id, '1_2');
});

test('Teilerfolg und Wiederholung ohne Doppelpost', async () => {
  const state = { calls: [], failIg: true };
  fakeApis(state);
  const first = await publishJob(ENV, { post: post(), images: { main: img } });
  assert.equal(first.status, 'partial');
  assert.match(first.results.instagram.error, /Medientyp/);

  state.failIg = false;
  state.calls = [];
  const second = await publishJob(ENV, { post: post({ results: first.results }), images: { main: img } });
  assert.equal(second.status, 'published');
  assert.deepEqual(Object.keys(second.results), ['instagram']);
  assert.ok(!state.calls.some((u) => u.endsWith('/rest/posts')), 'LinkedIn nicht erneut');
});

test('Platzhalter und fehlendes Bild werden vor jedem API Aufruf abgefangen', async () => {
  const state = { calls: [] };
  fakeApis(state);
  const r = await publishJob(ENV, { post: post({ variants: { facebook: 'Bis [DATUM] bestellen', instagram: 'x', linkedin: 'y' } }), images: {} });
  assert.equal(r.status, 'partial');
  assert.match(r.results.facebook.error, /\[DATUM\]/);
  assert.match(r.results.instagram.error, /Bild/);
  assert.equal(state.calls.length, 1); // nur LinkedIn Textpost
});

test('Trockenlauf sendet nichts', async () => {
  const state = { calls: [] };
  fakeApis(state);
  const r = await publishJob(ENV, { post: post(), images: { main: img } }, { dryRun: true });
  assert.equal(r.status, 'dry-run');
  assert.equal(state.calls.length, 0);
  assert.equal(r.results.instagram.status, 'dry-run');
});

test('Fehlende Zugangsdaten ergeben verstaendlichen Fehler', async () => {
  const r = await publishJob({}, { post: post({ channels: ['facebook'] }), images: { main: img } });
  assert.match(r.results.facebook.error, /Zugangsdaten fehlen/);
  assert.deepEqual(Object.keys(tokensFromEnv({ LINKEDIN_TOKEN: 'x' })), ['linkedin']);
});

test('Kennzahlen je Kanal', async () => {
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.includes('/1?fields=followers_count')) return Response.json({ followers_count: 120 });
    if (url.includes('/1_2?fields=reactions')) return Response.json({ reactions: { summary: { total_count: 7 } }, comments: { summary: { total_count: 2 } } });
    return Response.json({ error: { message: 'nicht verfügbar' } }, { status: 400 });
  };
  const r = await metricsJob({ META_PAGE_TOKEN: 'PT', META_PAGE_ID: '1' }, { published: [{ post_id: 'p', channel: 'facebook', external_id: '1_2' }] });
  assert.equal(r.channels.facebook.account.followers, 120);
  assert.deepEqual(r.posts.facebook.p, { likes: 7, comments: 2, shares: 0 });
});

test('LinkedIn ohne Unternehmensseite wird übersprungen, nie aufs persönliche Profil', async () => {
  const state = { calls: [] };
  fakeApis(state);
  const r = await publishJob({ ...ENV, LINKEDIN_AUTHOR: '' }, { post: post(), images: { main: img } });
  assert.equal(r.results.linkedin.status, 'skipped');
  assert.equal(r.status, 'published');
  assert.ok(!state.calls.some((u) => u.includes('linkedin')), 'kein LinkedIn-Aufruf');
});

test('Karussell: Facebook Mehrbild, Instagram CAROUSEL, LinkedIn multiImage', async () => {
  const seen = { fbFeed: null, igChildren: 0, igCarousel: null, liBody: null, hidden: 0 };
  let n = 0;
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url.endsWith('/1/photos')) { seen.hidden++; return Response.json({ id: 'ph' + (++n) }); }
    if (url.includes('?fields=images')) return Response.json({ images: [{ width: 1080, height: 1350, source: 'https://cdn/' + url.split('/').at(-1).split('?')[0] + '.jpg' }] });
    if (opts.method === 'DELETE') return Response.json({ success: true });
    if (url.endsWith('/1/feed')) { seen.fbFeed = new URLSearchParams(opts.body); return Response.json({ id: '1_99' }); }
    if (url.endsWith('/9/media')) {
      const b = opts.body;
      if (b.get('is_carousel_item') === 'true') { seen.igChildren++; return Response.json({ id: 'child' + seen.igChildren }); }
      if (b.get('media_type') === 'CAROUSEL') { seen.igCarousel = b; return Response.json({ id: 'car1' }); }
    }
    if (url.includes('fields=status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/9/media_publish')) return Response.json({ id: 'm9' });
    if (url.includes('fields=permalink')) return Response.json({ permalink: 'https://instagram.com/p/car' });
    if (url.includes('initializeUpload')) return Response.json({ value: { uploadUrl: 'https://upload.example/x', image: 'urn:li:image:' + (++n) } });
    if (url === 'https://upload.example/x') return new Response('', { status: 201 });
    if (url.endsWith('/rest/posts')) { seen.liBody = JSON.parse(opts.body); return new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } }); }
    return Response.json({ error: { message: 'unerwartet ' + url } }, { status: 404 });
  };
  const slides = [img, img, img];
  const r = await publishJob(ENV, { post: post(), images: { slides } });
  assert.equal(r.status, 'published', JSON.stringify(r.results));
  // Facebook: drei unveröffentlichte Fotos am Feed-Post
  assert.ok(seen.fbFeed.get('attached_media[2]'));
  assert.equal(JSON.parse(seen.fbFeed.get('attached_media[0]')).media_fbid.startsWith('ph'), true);
  // Instagram: drei Kinder plus Karussell-Container mit Bildunterschrift
  assert.equal(seen.igChildren, 3);
  assert.equal(seen.igCarousel.get('children'), 'child1,child2,child3');
  assert.equal(seen.igCarousel.get('caption').startsWith('IG Text'), true);
  // LinkedIn: multiImage mit drei Bildern
  assert.equal(seen.liBody.content.multiImage.images.length, 3);
});
