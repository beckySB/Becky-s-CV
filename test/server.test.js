'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

function start(env) {
  return new Promise((resolve, reject) => {
    const port = 18000 + Math.floor(Math.random() * 2000);
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: Object.assign({ PATH: process.env.PATH, PORT: String(port) }, env), stdio: ['ignore', 'pipe', 'pipe']
    });
    p.stdout.on('data', (d) => { if (/listening/.test(String(d))) resolve({ p, base: 'http://127.0.0.1:' + port }); });
    p.on('error', reject);
    setTimeout(() => reject(new Error('server did not start')), 5000);
  });
}
async function get(base, u, opts) { const r = await fetch(base + u, opts); return { status: r.status, headers: r.headers, body: await r.text() }; }

test('capabilities, gates and headers', async (t) => {
  const s = await start({});
  t.after(() => s.p.kill());
  const caps = JSON.parse((await get(s.base, '/api/capabilities')).body);
  assert.strictEqual(caps.news, true);
  assert.strictEqual(caps.draft, false);
  assert.match(caps.draftReason, /ANTHROPIC_API_KEY/);

  const d = await get(s.base, '/api/draft', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  assert.strictEqual(d.status, 503);

  const other = await get(s.base, '/index.html', { method: 'POST' });
  assert.strictEqual(other.status, 405, 'POST is only accepted on the draft endpoint');

  const page = await get(s.base, '/');
  assert.match(page.headers.get('content-security-policy'), /media-src 'self' blob:/);
  assert.strictEqual((await get(s.base, '/lib/draft.js')).status, 404, 'server code is not served');
  assert.strictEqual((await get(s.base, '/api/nope')).status, 404);
});

test('a key without a password still does not open drafting', async (t) => {
  const s = await start({ ANTHROPIC_API_KEY: 'sk-test' });
  t.after(() => s.p.kill());
  const caps = JSON.parse((await get(s.base, '/api/capabilities')).body);
  assert.strictEqual(caps.draft, false);
  assert.match(caps.draftReason, /SITE_PASSWORD/);
});

test('with a key and a password, drafting is on and the API sits behind the password', async (t) => {
  const s = await start({ ANTHROPIC_API_KEY: 'sk-test', SITE_PASSWORD: 'pw' });
  t.after(() => s.p.kill());
  assert.strictEqual((await get(s.base, '/api/capabilities')).status, 401);
  const auth = { headers: { authorization: 'Basic ' + Buffer.from('www:pw').toString('base64') } };
  const caps = JSON.parse((await get(s.base, '/api/capabilities', auth)).body);
  assert.strictEqual(caps.draft, true);
  const bad = await get(s.base, '/api/draft', { method: 'POST', body: 'not json', headers: auth.headers });
  assert.strictEqual(bad.status, 400);
  const none = await get(s.base, '/api/draft', { method: 'POST', body: '{"item":{}}', headers: auth.headers });
  assert.strictEqual(none.status, 400);

  const cap = (body) => get(s.base, '/api/caption', { method: 'POST', body: JSON.stringify(body), headers: auth.headers });
  const img = { media_type: 'image/jpeg', data: 'AAAA' };
  assert.strictEqual((await cap({ images: [], consent: true })).status, 400, 'no photos');
  assert.strictEqual((await cap({ images: [img], consent: false })).status, 400, 'no consent');
  assert.match((await cap({ images: [img] })).body, /consent/);
  assert.strictEqual((await cap({ images: Array(7).fill(img), consent: true })).status, 400, 'too many');
  assert.strictEqual((await cap({ images: [{ media_type: 'image/svg+xml', data: 'AAAA' }], consent: true })).status, 400, 'svg refused');
  assert.strictEqual((await cap({ images: [{ media_type: 'image/jpeg', data: '<script>' }], consent: true })).status, 400, 'not base64');
  const big = await get(s.base, '/api/caption', { method: 'POST', body: 'x'.repeat(13 * 1024 * 1024), headers: auth.headers }).catch((e) => ({ status: 'reset' }));
  assert.ok(big.status === 400 || big.status === 'reset', 'over 12 MB refused');
});

test('the caption endpoint is closed without a key, and the logo is served', async (t) => {
  const s = await start({});
  t.after(() => s.p.kill());
  const r = await get(s.base, '/api/caption', { method: 'POST', body: '{}' });
  assert.strictEqual(r.status, 503);
  const logo = await get(s.base, '/assets/brand/www-logo-horizontal.svg');
  assert.strictEqual(logo.status, 200);
  assert.match(logo.headers.get('content-type'), /svg/);
  assert.ok(!/<script/i.test(logo.body), 'logo carries no script');
});
