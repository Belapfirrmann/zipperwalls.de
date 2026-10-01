import test from 'node:test';
import assert from 'node:assert/strict';
import { publishFacebook } from '../src/publishers/facebook.js';
import { publishInstagram } from '../src/publishers/instagram.js';
import { publishLinkedIn } from '../src/publishers/linkedin.js';

const env = { GRAPH_VERSION: 'v22.0', LINKEDIN_VERSION: '202506' };

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const { status = 200, body = {}, headers = {} } = handler(String(url), opts, calls.length);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
  };
  return calls;
}

test('Facebook: Bildpost geht an /photos mit caption', async () => {
  const calls = mockFetch(() => ({ body: { id: 'p1', post_id: '123_456' } }));
  const r = await publishFacebook(env, { token: { accessToken: 'T', meta: { pageId: '123' } }, text: 'Hallo', imageUrl: 'https://x/a.jpg' });
  assert.equal(calls[0].url, 'https://graph.facebook.com/v22.0/123/photos');
  const body = new URLSearchParams(calls[0].opts.body);
  assert.equal(body.get('caption'), 'Hallo');
  assert.equal(body.get('url'), 'https://x/a.jpg');
  assert.equal(r.externalId, '123_456');
});

test('Facebook: API Fehler wird lesbar weitergegeben', async () => {
  mockFetch(() => ({ status: 400, body: { error: { message: 'Invalid OAuth access token' } } }));
  await assert.rejects(publishFacebook(env, { token: { accessToken: 'T', meta: { pageId: '1' } }, text: 'x' }), /Invalid OAuth/);
});

test('Instagram: Container, Status, Publish in richtiger Reihenfolge', async () => {
  const calls = mockFetch((url) => {
    if (url.endsWith('/9/media')) return { body: { id: 'c1' } };
    if (url.includes('/c1?fields=status_code')) return { body: { status_code: 'FINISHED' } };
    if (url.endsWith('/9/media_publish')) return { body: { id: 'm1' } };
    if (url.includes('/m1?fields=permalink')) return { body: { permalink: 'https://instagram.com/p/abc' } };
    return { status: 404 };
  });
  const r = await publishInstagram(env, { token: { accessToken: 'T', meta: { igUserId: '9' } }, text: 'Cap', imageUrl: 'https://x/a.jpg' });
  assert.equal(calls.length, 4);
  assert.equal(new URLSearchParams(calls[2].opts.body).get('creation_id'), 'c1');
  assert.deepEqual(r, { externalId: 'm1', url: 'https://instagram.com/p/abc' });
});

test('Instagram: Verarbeitungsfehler bricht ab', async () => {
  mockFetch((url) => (url.endsWith('/media') ? { body: { id: 'c1' } } : { body: { status_code: 'ERROR', status: 'Bildformat' } }));
  await assert.rejects(publishInstagram(env, { token: { accessToken: 'T', meta: { igUserId: '9' } }, text: 'x', imageUrl: 'https://x' }), /Bildformat/);
});

test('LinkedIn: Bild hochladen und Post mit Media ID erstellen', async () => {
  const calls = mockFetch((url) => {
    if (url.includes('initializeUpload')) return { body: { value: { uploadUrl: 'https://upload.example/1', image: 'urn:li:image:42' } } };
    if (url === 'https://upload.example/1') return { status: 201, body: '' };
    if (url.endsWith('/rest/posts')) return { status: 201, body: '', headers: { 'x-restli-id': 'urn:li:share:7' } };
    return { status: 404 };
  });
  const r = await publishLinkedIn(env, { token: { accessToken: 'T', meta: { author: 'urn:li:person:abc' } }, text: 'Hi (Test) #messe', imageBytes: new Uint8Array([1, 2]), imageType: 'image/png' });
  const post = JSON.parse(calls[2].opts.body);
  assert.equal(post.author, 'urn:li:person:abc');
  assert.equal(post.commentary, 'Hi \\(Test\\) #messe');
  assert.equal(post.content.media.id, 'urn:li:image:42');
  assert.equal(calls[2].opts.headers['Linkedin-Version'], '202506');
  assert.equal(r.url, 'https://www.linkedin.com/feed/update/urn:li:share:7');
});
