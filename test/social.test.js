'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { createSocial } = require('../lib/social');
const { sealer } = require('../lib/social/store');
const { jpegSize } = require('../lib/social/jpeg');
const linkedin = require('../lib/social/linkedin');

/* A JPEG header with a baseline frame of the given size: all the queue reads. */
function jpeg(w, h) {
  return Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    Buffer.from([0xFF, 0xD9])
  ]);
}
const b64 = (b) => b.toString('base64');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'www-social-')); }

/* A stand-in for LinkedIn and Meta that records every call, and fetches image URLs back
   through the Studio the way Meta's servers would. */
function platforms(social, opts) {
  opts = opts || {};
  const calls = [];
  let n = 0;
  const res = (status, body, headers) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: headers || {} });
  async function fetch(url, init) {
    init = init || {};
    const u = new URL(url);
    const form = init.body && typeof init.body === 'string' && /x-www-form/.test((init.headers || {})['Content-Type'] || '') ? Object.fromEntries(new URLSearchParams(init.body)) : null;
    const q = Object.fromEntries(u.searchParams);
    calls.push({ method: init.method || 'GET', host: u.host, path: u.pathname, q, form, json: form || !init.body || Buffer.isBuffer(init.body) ? null : JSON.parse(init.body), headers: init.headers || {} });
    if (u.host === 'www.linkedin.com' && u.pathname === '/oauth/v2/accessToken') return res(200, { access_token: 'li-token', expires_in: 5184000, scope: 'openid,profile,w_member_social' });
    if (u.host === 'api.linkedin.com') {
      if (opts.liFail) return res(401, { message: 'Invalid access token', status: 401 });
      if (u.pathname === '/v2/userinfo') return res(200, { sub: 'abc123', name: 'Becky Gustafson' });
      if (u.pathname === '/rest/images' && q.action === 'initializeUpload') { n++; return res(200, { value: { uploadUrl: 'https://upload.linkedin.test/u/' + n, image: 'urn:li:image:I' + n } }); }
      if (u.pathname.startsWith('/rest/images/')) return res(200, { status: 'AVAILABLE' });
      if (u.pathname === '/rest/posts') return res(201, '', { 'x-restli-id': 'urn:li:share:777' });
    }
    if (u.host === 'upload.linkedin.test') return res(201, '');
    if (u.host === 'graph.facebook.com') {
      const p = u.pathname.replace(/^\/v[\d.]+/, '');
      if (p === '/oauth/access_token') return res(200, q.grant_type ? { access_token: 'fb-long', expires_in: 5184000 } : { access_token: 'fb-short' });
      if (p === '/me') return res(200, { id: '1', name: 'Becky Gustafson' });
      if (p === '/me/accounts') return res(200, { data: [{ id: '55', name: 'Women Worth & Wealth', access_token: 'page-token', instagram_business_account: { id: '99', username: 'womenworthandwealth' } }] });
      if (opts.fbFetchImages && form && (form.url || form.image_url)) {
        /* Meta fetching the picture from the Studio while the post is in flight. */
        const tok = /\/media\/([a-f0-9]{48})\.jpg$/.exec(form.url || form.image_url)[1];
        opts.fetched.push(!!social.mediaFor(tok));
      }
      if (p === '/55/photos') { n++; return res(200, form.published === 'false' ? { id: 'ph' + n } : { id: 'ph' + n, post_id: '55_single' }); }
      if (p === '/55/feed') return res(200, { id: '55_multi' });
      if (p === '/99/media') { n++; return res(200, { id: 'c' + n }); }
      if (/^\/c\d+$/.test(p)) return res(200, { status_code: 'FINISHED' });
      if (p === '/99/media_publish') return res(200, { id: 'm1' });
      if (p === '/m1') return res(200, { permalink: 'https://www.instagram.com/p/xyz/' });
      if (p === '/99' && /business_discovery\.username\(doucetmarine\)/.test(q.fields || '')) return res(200, { business_discovery: { username: 'doucetmarine', media: { data: [{ caption: 'New yard in Kenner', permalink: 'https://www.instagram.com/p/k/', timestamp: '2026-11-10T15:00:00+0000', media_type: 'IMAGE' }] } } });
      if (p === '/99/tags') return res(200, { data: [{ caption: 'With @womenworthandwealth', permalink: 'https://www.instagram.com/p/t/', timestamp: '2026-11-11T15:00:00+0000', username: 'landrycpa' }] });
    }
    return res(404, { error: { message: 'unexpected ' + u.host + u.pathname } });
  }
  return { fetch, calls };
}

function make(extra) {
  const dir = tmp();
  const env = Object.assign({ SITE_PASSWORD: 'pw', SOCIAL_TOKEN_KEY: 'k'.repeat(40), PUBLIC_URL: 'https://studio.example', DATA_DIR: dir,
    LINKEDIN_CLIENT_ID: 'lid', LINKEDIN_CLIENT_SECRET: 'lsec', META_APP_ID: 'mid', META_APP_SECRET: 'msec' }, extra || {});
  const box = { fetch: null };
  const social = createSocial({ env, root: dir, fetch: (u, i) => box.fetch(u, i), sleep: async () => {} });
  return { social, dir, env, box };
}

async function connectAll(social) {
  for (const p of ['linkedin', 'meta']) {
    const url = new URL(social.startAuth(p));
    await social.finishAuth(p, new URLSearchParams({ code: 'c', state: url.searchParams.get('state') }));
  }
}

test('tokens are sealed, and a tampered token does not open', () => {
  const v = sealer('secret');
  const s = v.seal('li-token');
  assert.notStrictEqual(s, 'li-token');
  assert.strictEqual(v.open(s), 'li-token');
  assert.throws(() => sealer('other').open(s));
  const parts = s.split(':'); parts[3] = Buffer.from('x').toString('base64');
  assert.throws(() => v.open(parts.join(':')));
});

test('JPEG size, and anything else refused', () => {
  assert.deepStrictEqual(jpegSize(jpeg(1080, 1350)), { width: 1080, height: 1350 });
  assert.strictEqual(jpegSize(Buffer.from('\x89PNG\r\n')), null);
});

test('LinkedIn text is escaped, and hashtags become hashtags', () => {
  assert.strictEqual(linkedin.commentary('Thanks (all) to #NOLA, Q&A #1 at 5*'), 'Thanks \\(all\\) to {hashtag|\\#|NOLA}, Q&A \\#1 at 5\\*');
});

test('connect, queue, approve, publish to all three, and keep the record', async () => {
  const { social, dir, box } = make();
  const fetched = [];
  const P = platforms(social, { fbFetchImages: true, fetched });
  box.fetch = P.fetch;

  assert.match(social.startAuth('linkedin'), /^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization\?.*scope=openid\+profile\+w_member_social/);
  assert.match(social.startAuth('meta'), /redirect_uri=https%3A%2F%2Fstudio\.example%2Fauth%2Fmeta%2Fcallback/);
  await assert.rejects(social.finishAuth('linkedin', new URLSearchParams({ code: 'c', state: 'forged' })), /expired or did not start here/);

  await connectAll(social);
  const st = social.status();
  assert.deepStrictEqual(st.ready, { linkedin: true, facebook: true, instagram: true });
  assert.strictEqual(st.linkedin.name, 'Becky Gustafson');
  assert.strictEqual(st.linkedin.daysLeft, 59);
  assert.strictEqual(st.meta.pages[0].ig.username, 'womenworthandwealth');
  const disk = fs.readFileSync(path.join(dir, 'social', 'state.json'), 'utf8');
  assert.ok(!/li-token|page-token|fb-long/.test(disk), 'no token is stored in the clear');
  assert.ok(!/token/.test(JSON.stringify(st).replace(/SOCIAL_TOKEN_KEY/g, '')), 'status never returns a token');

  assert.throws(() => social.createPost({ images: [b64(Buffer.from('not a jpeg'))] }), /not a JPEG/);

  /* A 9:16 story image is refused for Instagram at approval, not at posting time. */
  const story = social.createPost({ images: [b64(jpeg(1080, 1920))], platforms: ['instagram'], captions: { instagram: 'Hi' } });
  assert.throws(() => social.act(story.id, 'approve', { scheduledAt: new Date(Date.now() + 3600e3).toISOString() }), /4:5 to 1\.91:1/);

  const post = social.createPost({
    title: 'Expo', source: 'post-maker', platforms: ['linkedin', 'facebook', 'instagram'],
    captions: { linkedin: 'A full room (thank you). #Metairie', facebook: 'Thank you, Metairie.', instagram: 'A full room. #NOLAbusiness' },
    altText: ['Panel on stage', 'Booth'], images: [b64(jpeg(1080, 1350)), b64(jpeg(1080, 1350))]
  });
  assert.strictEqual(post.status, 'draft');
  assert.strictEqual(await social.tick(), 0, 'a draft never posts');

  assert.throws(() => social.act(post.id, 'approve', {}), /Pick a time/);
  const later = new Date(Date.now() + 3600e3).toISOString();
  social.act(post.id, 'approve', { scheduledAt: later });
  assert.strictEqual(social.find(post.id).status, 'scheduled');
  assert.strictEqual(await social.tick(), 0, 'not due yet');
  assert.strictEqual(social.mediaFor(social.find(post.id).images[0].token), null, 'images are not public while waiting');

  social.act(post.id, 'unapprove');
  social.act(post.id, 'update', { captions: { linkedin: 'A full room (thank you). #Metairie', facebook: 'Thank you, Metairie.', instagram: 'A full room. #NOLAbusiness #Metairie' } });
  social.act(post.id, 'approve', { scheduledAt: new Date(Date.now() - 1000).toISOString() });
  assert.strictEqual(await social.tick(), 1);

  const done = social.find(post.id);
  assert.strictEqual(done.status, 'published');
  assert.strictEqual(done.results.linkedin.url, 'https://www.linkedin.com/feed/update/urn:li:share:777/');
  assert.strictEqual(done.results.facebook.id, '55_multi');
  assert.strictEqual(done.results.instagram.url, 'https://www.instagram.com/p/xyz/');
  assert.ok(fetched.length >= 4 && fetched.every(Boolean), 'Meta could fetch every image while it was publishing');
  assert.strictEqual(social.mediaFor(done.images[0].token), null, 'and cannot once it is done');

  const liPost = P.calls.find((c) => c.path === '/rest/posts');
  assert.strictEqual(liPost.json.author, 'urn:li:person:abc123');
  assert.strictEqual(liPost.json.commentary, 'A full room \\(thank you\\). {hashtag|\\#|Metairie}');
  assert.deepStrictEqual(liPost.json.content.multiImage.images.map((i) => i.altText), ['Panel on stage', 'Booth']);
  assert.ok(/^\d{6}$/.test(liPost.headers['LinkedIn-Version']));
  const fbFeed = P.calls.find((c) => c.path.endsWith('/55/feed'));
  assert.strictEqual(JSON.parse(fbFeed.form.attached_media).length, 2);
  assert.strictEqual(fbFeed.form.access_token, 'page-token');
  const carousel = P.calls.find((c) => c.form && c.form.media_type === 'CAROUSEL');
  assert.strictEqual(carousel.form.children.split(',').length, 2);
  assert.strictEqual(carousel.form.caption, 'A full room. #NOLAbusiness #Metairie');

  const csv = social.csv();
  assert.strictEqual(csv.trim().split('\r\n').length, 4, 'one header and three posted rows');
  assert.match(csv, /"posted","https:\/\/www\.instagram\.com\/p\/xyz\/","www"/);
  assert.throws(() => social.act(post.id, 'delete'), /published/, 'a published post stays on the record');
});

test('one platform failing: the others post, the failure says reconnect, and a retry posts only what is missing', async () => {
  const { social, box } = make();
  box.fetch = platforms(social).fetch;
  await connectAll(social);
  box.fetch = platforms(social, { liFail: true }).fetch;
  const post = social.createPost({ platforms: ['linkedin', 'facebook'], captions: { linkedin: 'x', facebook: 'y' }, images: [b64(jpeg(1080, 1080))] });
  social.act(post.id, 'approve', { scheduledAt: new Date(Date.now() - 1).toISOString() });
  await social.tick();
  const p = social.find(post.id);
  assert.strictEqual(p.status, 'partial');
  assert.strictEqual(p.results.facebook.id, '55_single');
  assert.match(p.results.linkedin.error, /Reconnect LinkedIn/);
  assert.strictEqual(social.status().linkedin.needsReconnect, true);

  const P = platforms(social);
  box.fetch = P.fetch;
  social.act(post.id, 'retry');
  await social.tick();
  assert.strictEqual(social.find(post.id).status, 'published');
  assert.ok(!P.calls.some((c) => c.host === 'graph.facebook.com'), 'Facebook was not posted twice');
});

test('a restart mid-post asks a person to check instead of posting twice', async () => {
  const { social, dir, env, box } = make();
  box.fetch = platforms(social).fetch;
  await connectAll(social);
  const post = social.createPost({ platforms: ['facebook'], captions: { facebook: 'y' }, images: [b64(jpeg(1080, 1080))] });
  social.act(post.id, 'approve', { scheduledAt: new Date(Date.now() - 1).toISOString() });
  social.find(post.id).status = 'publishing';
  social.store.save();

  const again = createSocial({ env, root: dir, fetch: () => { throw new Error('must not post'); } });
  const p = again.find(post.id);
  assert.strictEqual(p.status, 'check');
  assert.match(p.notes.join(' '), /so nothing posts twice/);
  assert.strictEqual(await again.tick(), 0);
  again.act(post.id, 'mark', { platform: 'facebook', url: 'https://www.facebook.com/55_x' });
  assert.strictEqual(again.find(post.id).status, 'published');
});

test('the server: publishing needs the password, the request header, and serves no image to strangers', async (t) => {
  const dir = tmp();
  function start(env) {
    return new Promise((resolve, reject) => {
      const port = 20000 + Math.floor(Math.random() * 2000);
      const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({ PATH: process.env.PATH, PORT: String(port), DATA_DIR: dir }, env), stdio: ['ignore', 'pipe', 'pipe'] });
      p.stdout.on('data', (d) => { if (/listening/.test(String(d))) resolve({ p, base: 'http://127.0.0.1:' + port, out: String(d) }); });
      p.on('error', reject);
      setTimeout(() => reject(new Error('server did not start')), 5000);
    });
  }
  const open = await start({});
  t.after(() => open.p.kill());
  const st = await (await fetch(open.base + '/api/social/status')).json();
  assert.strictEqual(st.enabled, false);
  assert.match(st.missing.join(' '), /SITE_PASSWORD/);
  assert.strictEqual((await fetch(open.base + '/api/social/posts')).status, 503);

  const s = await start({ SITE_PASSWORD: 'pw', SOCIAL_TOKEN_KEY: 'x'.repeat(40), PUBLIC_URL: 'https://studio.example' });
  t.after(() => s.p.kill());
  assert.match(s.out, /Publishing: on/);
  const auth = { Authorization: 'Basic ' + Buffer.from('www:pw').toString('base64') };
  assert.strictEqual((await fetch(s.base + '/api/social/posts', { headers: {} })).status, 401);
  const body = JSON.stringify({ images: [b64(jpeg(1080, 1350))], platforms: ['linkedin'], captions: { linkedin: 'Hi' } });
  const noHeader = await fetch(s.base + '/api/social/posts', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body });
  assert.strictEqual(noHeader.status, 403, 'a cross-site form cannot queue a post');
  const ok = await fetch(s.base + '/api/social/posts', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'X-Studio-Request': '1' }, auth), body });
  const j = await ok.json();
  assert.strictEqual(j.post.status, 'draft');
  assert.ok(!('token' in j.post.images[0]), 'the public link is never sent to the browser');
  const img = await fetch(s.base + '/api/social/image/' + j.post.images[0].id, { headers: auth });
  assert.strictEqual(img.headers.get('content-type'), 'image/jpeg');
  const approve = await fetch(s.base + '/api/social/posts/' + j.post.id + '/approve', { method: 'POST', headers: Object.assign({ 'X-Studio-Request': '1' }, auth), body: JSON.stringify({ scheduledAt: new Date(Date.now() + 3600e3).toISOString() }) });
  assert.strictEqual(approve.status, 400);
  assert.match((await approve.json()).error, /LinkedIn is not connected/);
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'social', 'state.json'), 'utf8'));
  assert.strictEqual((await fetch(s.base + '/media/' + state.posts[0].images[0].token + '.jpg')).status, 404, 'no image is public unless it is posting right now');
  const start2 = await fetch(s.base + '/auth/linkedin/start', { headers: auth, redirect: 'manual' });
  assert.strictEqual(start2.status, 302);
  assert.strictEqual(start2.headers.get('location'), '/#/publish/connections', 'no app keys yet, so back to Connections');
});

test('Moments can read Instagram through the connected account, and only then', async () => {
  const { social, box } = make();
  box.fetch = platforms(social).fetch;
  assert.strictEqual(social.instagramReader(), null, 'nothing to read with until Instagram is connected');
  await connectAll(social);
  const ig = social.instagramReader();
  assert.strictEqual(ig.account, 'womenworthandwealth');
  const posts = await ig.discover('doucetmarine');
  assert.deepStrictEqual(posts.map((x) => [x.caption, x.username]), [['New yard in Kenner', 'doucetmarine']]);
  assert.strictEqual((await ig.tagged())[0].username, 'landrycpa');
  await assert.rejects(ig.discover('not a handle!'), /Not an Instagram username/);
});

test('with a volume and no SOCIAL_TOKEN_KEY, a key is made once and kept', async () => {
  const dir = tmp();
  const env = { SITE_PASSWORD: 'pw', PUBLIC_URL: 'https://studio.example', DATA_DIR: dir, LINKEDIN_CLIENT_ID: 'lid', LINKEDIN_CLIENT_SECRET: 'lsec', META_APP_ID: 'mid', META_APP_SECRET: 'msec' };
  const box = { fetch: null };
  const a = createSocial({ env, root: dir, fetch: (u, i) => box.fetch(u, i), sleep: async () => {} });
  assert.strictEqual(a.status().keySource, 'volume');
  assert.deepStrictEqual(a.status().missing, []);
  box.fetch = platforms(a).fetch;
  await connectAll(a);
  const b = createSocial({ env, root: dir, fetch: (u, i) => box.fetch(u, i) });
  assert.strictEqual(b.status().ready.instagram, true);
  assert.ok(b.instagramReader(), 'the same key opens the tokens after a restart');
  const noVolume = createSocial({ env: { SITE_PASSWORD: 'pw', PUBLIC_URL: 'https://studio.example' }, root: tmp() });
  assert.match(noVolume.status().missing.join(' '), /SOCIAL_TOKEN_KEY/, 'without a volume nothing is generated');
});
