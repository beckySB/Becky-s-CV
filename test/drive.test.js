'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { createSocial } = require('../lib/social');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'www-drive-')); }

/* A stand-in for Google that records every call. */
function google(opts) {
  opts = opts || {};
  const calls = [];
  const state = { folders: 0, files: 0, folderGone: false, revoked: false };
  const res = (status, body, headers) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: headers || {} });
  async function fetch(url, init) {
    init = init || {};
    const u = new URL(url);
    const form = init.body && typeof init.body === 'string' && /x-www-form/.test((init.headers || {})['Content-Type'] || '') ? Object.fromEntries(new URLSearchParams(init.body)) : null;
    calls.push({ method: init.method || 'GET', host: u.host, path: u.pathname, form, headers: init.headers || {}, body: init.body });
    if (u.host === 'oauth2.googleapis.com') {
      if (form.grant_type === 'authorization_code') return res(200, Object.assign({ access_token: 'g-access', expires_in: 3599, scope: opts.scope || 'openid email https://www.googleapis.com/auth/drive.file' }, opts.noRefresh ? {} : { refresh_token: 'g-refresh' }));
      if (state.revoked) return res(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      assert.strictEqual(form.refresh_token, 'g-refresh');
      return res(200, { access_token: 'g-access-2', expires_in: 3599 });
    }
    if (u.host === 'www.googleapis.com') {
      if (u.pathname === '/oauth2/v3/userinfo') return res(200, { email: 'becky@example.com' });
      if (u.pathname === '/drive/v3/files' && init.method === 'POST') { state.folders++; return res(200, { id: 'folder' + state.folders, name: JSON.parse(init.body).name, webViewLink: 'https://drive.google.com/drive/folders/folder' + state.folders }); }
      if (u.pathname.startsWith('/drive/v3/files/')) return state.folderGone ? res(404, { error: { message: 'File not found' } }) : res(200, { id: u.pathname.split('/').pop(), trashed: false });
      if (u.pathname === '/upload/drive/v3/files') return res(200, '', { location: 'https://upload.google.test/session/1' });
    }
    if (u.host === 'upload.google.test') { state.files++; return res(200, { id: 'file' + state.files, name: 'clip.mp4', webViewLink: 'https://drive.google.com/file/d/file' + state.files + '/view' }); }
    throw new Error('unexpected call to ' + url);
  }
  return { fetch, calls, state };
}

function make(extra) {
  const dir = tmp();
  const env = Object.assign({ SITE_PASSWORD: 'pw', SOCIAL_TOKEN_KEY: 'k'.repeat(40), PUBLIC_URL: 'https://studio.example', DATA_DIR: dir,
    GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec' }, extra || {});
  const box = { fetch: null };
  const social = createSocial({ env, root: dir, fetch: (u, i) => box.fetch(u, i), sleep: async () => {} });
  return { social, dir, box };
}

async function connect(social) {
  const url = new URL(social.startAuth('google'));
  await social.finishAuth('google', new URLSearchParams({ code: 'c', state: url.searchParams.get('state') }));
  return url;
}

test('Google Drive: asks only for its own files, connects, and never stores a token in the clear', async () => {
  const { social, dir, box } = make();
  const G = google(); box.fetch = G.fetch;
  assert.strictEqual(social.status().canConnect.google, true);
  assert.strictEqual(social.status().redirects.google, 'https://studio.example/auth/google/callback');
  const url = await connect(social);
  assert.strictEqual(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.strictEqual(url.searchParams.get('scope'), 'openid email https://www.googleapis.com/auth/drive.file');
  assert.strictEqual(url.searchParams.get('access_type'), 'offline');
  const st = social.status();
  assert.strictEqual(st.google.email, 'becky@example.com');
  const disk = fs.readFileSync(path.join(dir, 'social', 'state.json'), 'utf8');
  assert.ok(!/g-refresh|g-access/.test(disk), 'no token is stored in the clear');
  assert.ok(!/g-refresh|g-access|refresh/.test(JSON.stringify(st.google)), 'status never returns a token');
});

test('Google Drive: a consent without the Drive box, or without a lasting token, is refused in plain words', async () => {
  const a = make(); a.box.fetch = google({ scope: 'openid email' }).fetch;
  await assert.rejects(connect(a.social), /without permission to save files/);
  const b = make(); b.box.fetch = google({ noRefresh: true }).fetch;
  await assert.rejects(connect(b.social), /no long-lived token/);
  assert.strictEqual(b.social.status().google, null);
});

test('Google Drive: saves into one Studio folder, remakes it if it was deleted, and keeps a short record', async () => {
  const { social, box } = make();
  const G = google(); box.fetch = G.fetch;
  await assert.rejects(social.saveToDrive({ name: 'a.mp4', mimeType: 'video/mp4', bytes: Buffer.from('x') }), /not connected/);
  await connect(social);

  const bytes = Buffer.alloc(2048, 7);
  const r = await social.saveToDrive({ name: 'launch/clip: one', mimeType: 'video/mp4', bytes });
  assert.strictEqual(r.folder.name, 'Women Worth & Wealth Studio');
  assert.strictEqual(r.file.link, 'https://drive.google.com/file/d/file1/view');
  const start = G.calls.find((c) => c.path === '/upload/drive/v3/files');
  assert.strictEqual(start.headers.Authorization, 'Bearer g-access-2', 'uploads use a renewed token');
  assert.deepStrictEqual(JSON.parse(start.body), { name: 'launch clip: one.mp4', parents: ['folder1'] });
  assert.strictEqual(start.headers['X-Upload-Content-Length'], '2048');
  const put = G.calls.find((c) => c.host === 'upload.google.test');
  assert.strictEqual(put.method, 'PUT');
  assert.strictEqual(put.body.length, 2048);

  await social.saveToDrive({ name: 'two.mp4', mimeType: 'video/mp4', bytes });
  assert.strictEqual(G.state.folders, 1, 'the folder is made once');
  G.state.folderGone = true;
  await social.saveToDrive({ name: 'three.mp4', mimeType: 'video/mp4', bytes });
  assert.strictEqual(G.state.folders, 2, 'a deleted folder is made again');
  assert.deepStrictEqual(social.status().google.recent.map((f) => f.name.length > 0), [true, true, true]);

  await assert.rejects(social.saveToDrive({ name: 'x.exe', mimeType: 'application/octet-stream', bytes }), /Only MP4/);
  await assert.rejects(social.saveToDrive({ name: 'x.mp4', mimeType: 'video/mp4', bytes: Buffer.alloc(0) }), /empty/);
});

test('Google Drive: a revoked connection says reconnect, and disconnect forgets it', async () => {
  const { social, box } = make();
  const G = google(); box.fetch = G.fetch;
  await connect(social);
  G.state.revoked = true;
  await assert.rejects(social.saveToDrive({ name: 'a.mp4', mimeType: 'video/mp4', bytes: Buffer.from('x') }), /Reconnect Google Drive/);
  assert.strictEqual(social.status().google.needsReconnect, true);
  social.disconnect('google');
  assert.strictEqual(social.status().google, null);
});

test('the server: a Drive upload needs the password and the request header, and says so when Drive is not connected', async (t) => {
  const dir = tmp();
  const port = 22000 + Math.floor(Math.random() * 2000);
  const s = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dir, SITE_PASSWORD: 'pw', SOCIAL_TOKEN_KEY: 'x'.repeat(40), PUBLIC_URL: 'https://studio.example' }, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => { if (/listening/.test(String(d))) resolve({ p, base: 'http://127.0.0.1:' + port }); });
    p.on('error', reject);
    setTimeout(() => reject(new Error('server did not start')), 5000);
  });
  t.after(() => s.p.kill());
  const auth = { Authorization: 'Basic ' + Buffer.from('www:pw').toString('base64') };
  const body = Buffer.alloc(1024, 1);
  const up = (headers) => fetch(s.base + '/api/social/drive/upload', { method: 'POST', headers: Object.assign({ 'Content-Type': 'video/mp4', 'X-File-Name': 'clip.mp4' }, headers), body });
  assert.strictEqual((await up({})).status, 401);
  assert.strictEqual((await up(auth)).status, 403);
  const r = await up(Object.assign({ 'X-Studio-Request': '1' }, auth));
  assert.strictEqual(r.status, 409);
  assert.match((await r.json()).error, /Google Drive is not connected/);
  const start = await fetch(s.base + '/auth/google/start', { headers: auth, redirect: 'manual' });
  assert.strictEqual(start.headers.get('location'), '/#/publish/connections', 'no app keys yet, so back to Connections');
});
