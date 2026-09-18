/* Static file server for the CV.
   No dependencies on purpose: nothing to audit, nothing to keep patched. */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

/* There is no access gate here, and that is deliberate. This page carries no
   practice financials — no revenue, no assets under management, no production
   figures, nothing about the book — so it is a document meant to be handed to
   people and forwarded by them. The profile that does carry those figures is a
   separate property and keeps its own gate.

   It does carry a phone number and an email address, so it is kept out of
   search indexes. Set SITE_INDEXABLE=1 to allow indexing. */
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
  "form-action 'none'",
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

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed');
  }

  if (pathname === '/healthz') return send(res, 200, 'ok');

  if (pathname === '/robots.txt') {
    return send(res, 200, INDEXABLE
      ? 'User-agent: *\nAllow: /\n'
      : 'User-agent: *\nDisallow: /\n');
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
  console.log('CV listening on ' + HOST + ':' + PORT);
  console.log(INDEXABLE ? 'Indexing allowed.' : 'Search indexing disallowed.');
});
