/* Static file server for the CV.
   No dependencies on purpose: nothing to audit, nothing to keep patched. */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

/* The site sits behind a gate code that the viewer types. One shared code,
   handed out with the link.

   The code is baked in below rather than read from the host environment. That
   is a deliberate trade: this repository is PRIVATE, so the code is readable
   only by someone who can already see the source, and in exchange the gate
   works the moment the site deploys with nothing to configure. Set
   SITE_GATE_CODE in the host environment to override it without a commit.

   If this repository is ever made public, the code must move to the
   environment on the same day. */
const GATE_CODE = process.env.SITE_GATE_CODE || '07050310';

/* The cookie carries an HMAC of a fixed string keyed by the code, so it cannot
   be forged without knowing the code, and it changes automatically whenever
   the code does — rotating the code logs everyone out. */
const GATE_TOKEN = crypto.createHmac('sha256', GATE_CODE)
  .update('cv-gate-v1').digest('hex');
const COOKIE = 'cv_gate';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/* Gated or not, a page carrying a phone number stays out of search indexes.
   Set SITE_INDEXABLE=1 to allow indexing. */
const INDEXABLE = process.env.SITE_INDEXABLE === '1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

/* The page loads its fonts from Google and everything else from itself. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",   /* the gate form posts to /gate — 'none' blocks it */
  "frame-ancestors 'self'",
  "base-uri 'self'"
].join('; ');

function secure(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (!INDEXABLE) res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

/* Compare without leaking length or position through timing. */
function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function authorised(req) {
  const raw = req.headers.cookie || '';
  const hit = raw.split(';').map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + '='));
  if (!hit) return false;
  return sameSecret(hit.slice(COOKIE.length + 1), GATE_TOKEN);
}

/* Read a small form body, and refuse anything that is not one. */
function readBody(req, done) {
  let size = 0;
  const parts = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 2048) { req.destroy(); return; }
    parts.push(chunk);
  });
  req.on('end', () => done(Buffer.concat(parts).toString('utf8')));
  req.on('error', () => done(''));
}

function gatePage(wrong) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Curriculum Vitae</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>\u{1FAB6}</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Public+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{--ink:#16211f;--ink-3:#6b7c77;--line:#e2e0d8;--bg:#faf9f5;--surface:#fff;
    --brand:#1d4d43;--brand-soft:#e6efec;--gold:#9a7b3f;--alert:#9c3b30;--alert-soft:#fbe8e5;
    --sans:"Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    --serif:"Newsreader","Iowan Old Style",Palatino,Georgia,serif}
  @media (prefers-color-scheme:dark){:root{--ink:#eef1ef;--ink-3:#8d9a95;--line:#2b3634;
    --bg:#111716;--surface:#18201f;--brand:#7fc4b2;--brand-soft:#1c2e2a;--gold:#d3b070;
    --alert:#e08b7e;--alert-soft:#2f1e1b}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
    background:radial-gradient(900px 420px at 50% -10%,var(--brand-soft),transparent 70%),var(--bg);
    color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.6}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;
    padding:40px;width:100%;max-width:400px;
    box-shadow:0 1px 2px rgba(22,33,31,.05),0 20px 48px -24px rgba(22,33,31,.25)}
  .rule{width:34px;height:2px;background:var(--gold);margin-bottom:22px}
  .eyebrow{margin:0 0 8px;font-size:.62rem;letter-spacing:.19em;text-transform:uppercase;
    color:var(--gold);font-weight:600}
  h1{margin:0 0 10px;font-family:var(--serif);font-weight:500;font-size:1.7rem;
    letter-spacing:-.02em;line-height:1.15}
  p.lede{margin:0 0 26px;font-size:.9rem;color:var(--ink-3)}
  label{display:block;font-size:.62rem;letter-spacing:.13em;text-transform:uppercase;
    color:var(--ink-3);font-weight:600;margin-bottom:8px}
  input{width:100%;padding:13px 15px;font-family:var(--sans);font-size:1.05rem;
    letter-spacing:.22em;border:1px solid var(--line);border-radius:9px;
    background:var(--bg);color:var(--ink)}
  input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
  button{width:100%;margin-top:16px;padding:13px;font-family:var(--sans);font-size:.95rem;
    font-weight:600;letter-spacing:.02em;color:#fff;background:var(--brand);
    border:0;border-radius:9px;cursor:pointer}
  button:hover{background:#2c6b5e}
  .err{margin:0 0 20px;padding:11px 14px;border-radius:9px;font-size:.85rem;
    background:var(--alert-soft);color:var(--alert)}
  .foot{margin:22px 0 0;font-size:.72rem;color:var(--ink-3);text-align:center}
</style></head>
<body>
  <main class="card">
    <div class="rule"></div>
    <p class="eyebrow">Eternal Wealth Partners</p>
    <h1>Curriculum Vitae</h1>
    <p class="lede">Enter the access code you were given.</p>
    ${wrong ? '<p class="err">That code was not recognised. Please try again.</p>' : ''}
    <form method="POST" action="/gate">
      <label for="code">Access code</label>
      <input id="code" name="code" type="password" inputmode="numeric"
             autocomplete="one-time-code" autofocus required>
      <button type="submit">View CV</button>
    </form>
    <p class="foot">Rebecca M. Gustafson, CFP&reg;</p>
  </main>
</body></html>`;
}

function send(res, status, body, type) {
  secure(res);
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (e) { return send(res, 400, 'Bad request'); }

  /* The only POST the site accepts: the gate form. */
  if (req.method === 'POST' && pathname === '/gate') {
    return readBody(req, (body) => {
      const params = new URLSearchParams(body);
      const given = (params.get('code') || '').trim();
      if (!sameSecret(given, GATE_CODE)) {
        secure(res);
        const page = gatePage(true);
        res.writeHead(401, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(page)
        });
        return res.end(page);
      }
      const https = (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
      secure(res);
      res.writeHead(303, {
        'Location': '/',
        'Set-Cookie': COOKIE + '=' + GATE_TOKEN + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' +
          COOKIE_MAX_AGE + (https ? '; Secure' : '')
      });
      return res.end();
    });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed');
  }

  /* Railway's health check runs before anyone signs in, so it sits above the gate. */
  if (pathname === '/healthz') return send(res, 200, 'ok');

  if (pathname === '/robots.txt') {
    return send(res, 200, INDEXABLE
      ? 'User-agent: *\nAllow: /\n'
      : 'User-agent: *\nDisallow: /\n');
  }

  /* Everything below the gate, including the stylesheet and both scripts,
     needs the cookie. */
  if (!authorised(req)) {
    secure(res);
    const page = gatePage(false);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(page),
      'Cache-Control': 'no-store'
    });
    return res.end(page);
  }

  if (pathname === '/') pathname = '/index.html';

  /* Serve the site, not the project directory. Anything outside these places
     is not part of the site: no .git, no source of this server, no README. */
  const servable = pathname === '/index.html' || pathname.startsWith('/assets/');
  if (!servable) return send(res, 404, 'Not found');

  /* Reject dot segments outright rather than relying on normalisation alone. */
  if (pathname.split('/').some((seg) => seg.startsWith('.'))) {
    return send(res, 404, 'Not found');
  }

  /* Resolve inside the project directory or refuse. */
  const target = path.resolve(ROOT, '.' + pathname);
  if (!target.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not found');

    const ext = path.extname(target).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';

    /* index.html must never be held in a cache, or a deploy would not reach
       anyone. The rest changes rarely and is revalidated. */
    const cache = pathname === '/index.html'
      ? 'no-cache'
      : 'public, max-age=0, must-revalidate';

    const etag = '"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"';
    if (req.headers['if-none-match'] === etag) {
      secure(res);
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': cache });
      return res.end();
    }

    secure(res);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': cache,
      'ETag': etag
    });

    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  const source = process.env.SITE_GATE_CODE ? 'environment' : 'built-in default';
  console.log('CV listening on ' + HOST + ':' + PORT);
  console.log('Gate code active, from the ' + source + '. Visitors enter it on the');
  console.log('landing page; every route but /healthz sits behind it.');
});
