/* Server for the Women Worth & Wealth Content Studio: the static site, plus a few small endpoints.

   /api/news   reads the public feeds named in data/news.json and returns one list. It
               stores nothing and fetches nothing a visitor names.
   /api/draft  turns one news item into a content pack with Claude. It only runs when
               ANTHROPIC_API_KEY is set, and only behind SITE_PASSWORD, because an open
               endpoint that spends money is an invitation.

   The one dependency is the official Anthropic SDK, loaded only when a draft is asked for,
   so the site and the newsroom run without it. */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const feeds = require('./lib/feeds');
const drafting = require('./lib/draft');
const captioning = require('./lib/caption');
const { createSocial } = require('./lib/social');
const { createMoments } = require('./lib/moments');
const { createClips } = require('./lib/clips');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

/* Optional gate. Set SITE_PASSWORD (and optionally SITE_USER) in Railway and the whole
   site asks for a password. Leave it unset and the site is open to anyone with the link. */
const USER = process.env.SITE_USER || 'www';
const PASSWORD = process.env.SITE_PASSWORD || '';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/* Fonts from Google, and the three Google origins the Gmail drafting needs. Everything else
   comes from this server.

   The exceptions are narrow on purpose and each one is load bearing: accounts.google.com serves
   the sign-in script and the consent window, oauth2.googleapis.com is where the token comes
   from, and gmail.googleapis.com is where a draft is written. Take any of them out and Connect
   Gmail fails silently, which is the worst way for it to fail. Nothing else is opened up, so a
   drafted message still cannot leave this page to anywhere but the mailbox it is addressed
   through. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  /* The video editor plays the file you pick from a blob: URL, in this browser only.
     Without this line the browser refuses to play it and the editor shows a black box. */
  "media-src 'self' blob:",
  "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://gmail.googleapis.com",
  "frame-src https://accounts.google.com",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'"
].join('; ');

function secure(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
}

/* Compare without leaking length or position through timing. */
function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function authorised(req) {
  if (!PASSWORD) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); }
  catch (e) { return false; }
  const split = decoded.indexOf(':');
  if (split < 0) return false;
  return sameSecret(decoded.slice(0, split), USER) &&
         sameSecret(decoded.slice(split + 1), PASSWORD);
}

function send(res, status, body, type) {
  secure(res);
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

/* ---------- publishing ---------- */

const social = createSocial({ root: ROOT });

function redirect(res, to) {
  secure(res);
  res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' });
  res.end();
}

async function handleSocial(req, res, pathname, query) {
  const sub = pathname.slice('/api/social/'.length);
  if (sub === 'status' && req.method === 'GET') return sendJson(res, 200, social.status());
  if (!social.cfg.gated) return sendJson(res, 503, { error: 'Publishing is off because this site has no password. Set SITE_PASSWORD in Railway first: these endpoints post for the firm in public.' });

  /* A browser sends the site password with any request to this origin, including one a
     different site makes it send. A custom header cannot be added cross-site without this
     server agreeing, so every change requires it. */
  if (req.method === 'POST' && req.headers['x-studio-request'] !== '1') return sendJson(res, 403, { error: 'Missing the request header the Studio sends.' });

  const fail = (e) => sendJson(res, (e && e.status >= 400 && e.status < 500) ? e.status : 400, { error: e && e.message ? e.message : String(e), problems: e && e.problems });
  const json = async (limit) => JSON.parse(await readBody(req, limit) || '{}');

  if (sub === 'posts' && req.method === 'GET') return sendJson(res, 200, { posts: social.posts() });
  if (sub === 'log.csv' && req.method === 'GET') {
    const body = social.csv();
    secure(res);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="www-publish-log.csv"', 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  let m = /^image\/([a-f0-9]{24})$/.exec(sub);
  if (m && req.method === 'GET') {
    const owns = social.store.state.posts.some((p) => p.images.some((im) => im.id === m[1]));
    if (!owns) return sendJson(res, 404, { error: 'Not found' });
    const buf = social.store.readImage(m[1]);
    secure(res);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=3600' });
    return res.end(buf);
  }
  if (sub === 'posts' && req.method === 'POST') {
    let input;
    try { input = await json(60 * 1024 * 1024); }
    catch (e) { return sendJson(res, 400, { error: 'The request was not valid JSON, or the images were over 60 MB together.' }); }
    try { return sendJson(res, 200, { post: social.publicPost(social.createPost(input || {})) }); }
    catch (e) { return fail(e); }
  }
  m = /^posts\/([a-f0-9]{16})\/(update|approve|unapprove|cancel|retry|mark|delete)$/.exec(sub);
  if (m && req.method === 'POST') {
    let input;
    try { input = await json(256 * 1024); } catch (e) { return sendJson(res, 400, { error: 'The request was not valid JSON.' }); }
    try {
      const p = social.act(m[1], m[2], input || {});
      /* Due now: post now rather than at the next tick of the clock. */
      if (p && p.status === 'scheduled' && Date.parse(p.scheduledAt) <= Date.now()) {
        setImmediate(() => social.tick().catch((e) => console.error('publish failed:', e)));
      }
      return sendJson(res, 200, { post: p ? social.publicPost(p) : null });
    } catch (e) { return fail(e); }
  }
  if (sub === 'page' && req.method === 'POST') {
    try { social.choosePage(String((await json(4096)).pageId || '')); return sendJson(res, 200, social.status()); } catch (e) { return fail(e); }
  }
  /* A finished video or image, sent as the raw file, saved to the connected Google Drive. */
  if (sub === 'drive/upload' && req.method === 'POST') {
    let bytes;
    try { bytes = await readBytes(req, 512 * 1024 * 1024); }
    catch (e) { return sendJson(res, 413, { error: 'The file is over 512 MB. Export it at 720p, or save it by hand.' }); }
    let name = '';
    try { name = decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch (e) { name = ''; }
    try {
      return sendJson(res, 200, await social.saveToDrive({ name, mimeType: String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase(), bytes }));
    } catch (e) {
      if (!(e && e.status)) console.error('drive upload failed:', e && e.message);
      return fail(e);
    }
  }
  if (sub === 'disconnect' && req.method === 'POST') {
    try { social.disconnect(String((await json(4096)).platform || '')); return sendJson(res, 200, social.status()); } catch (e) { return fail(e); }
  }
  return sendJson(res, 404, { error: 'Not found' });
}

async function handleAuth(req, res, pathname, query) {
  const m = /^\/auth\/(linkedin|meta|google)\/(start|callback)$/.exec(pathname);
  if (!m || req.method !== 'GET') return send(res, 404, 'Not found');
  if (m[2] === 'start') {
    const url = social.startAuth(m[1]);
    if (!url) return redirect(res, '/#/publish/connections');
    return redirect(res, url);
  }
  try {
    await social.finishAuth(m[1], query);
  } catch (e) {
    console.error('connect ' + m[1] + ' failed:', e && e.message);
    social.setConnectError(e && e.message ? e.message : 'The connection failed.');
  }
  return redirect(res, '/#/publish/connections');
}

/* ---------- the clip maker ---------- */

const clips = createClips({ root: ROOT, saveToDrive: (input) => social.saveToDrive(input) });

async function handleClips(req, res, pathname, query) {
  const sub = pathname.slice('/api/clips/'.length);
  if (sub === 'status' && req.method === 'GET') return sendJson(res, 200, await clips.status());
  /* Recordings are of real people and cost real money to process. Never on an open site. */
  if (!clips.cfg.gated) return sendJson(res, 503, { error: 'The clip maker is off because this site has no password. Set SITE_PASSWORD in Railway first.' });
  if (req.method === 'POST' && req.headers['x-studio-request'] !== '1') return sendJson(res, 403, { error: 'Missing the request header the Studio sends.' });
  const fail = (e) => {
    if (!(e && e.status)) console.error('clips error:', e && e.message);
    return sendJson(res, e && e.status >= 400 && e.status < 600 ? e.status : 400, { error: e && e.message ? e.message : String(e) });
  };
  const json = async () => JSON.parse(await readBody(req, 256 * 1024) || '{}');
  try {
    if (sub === 'jobs' && req.method === 'GET') return sendJson(res, 200, { jobs: clips.list() });
    if (sub === 'jobs' && req.method === 'POST') { const j = clips.create(await json()); return sendJson(res, 200, { job: clips.get(j.id) }); }
    let m = /^jobs\/([a-f0-9]{16})$/.exec(sub);
    if (m && req.method === 'GET') return sendJson(res, 200, { job: clips.get(m[1]) });
    m = /^jobs\/([a-f0-9]{16})\/chunk$/.exec(sub);
    if (m && req.method === 'POST') {
      let bytes;
      try { bytes = await readBytes(req, 40 * 1024 * 1024); } catch (e) { return sendJson(res, 413, { error: 'That piece of the upload was too large.' }); }
      return sendJson(res, 200, clips.chunk(m[1], Number(query.get('offset')) || 0, bytes));
    }
    m = /^jobs\/([a-f0-9]{16})\/(start|delete|drop-source|drive)$/.exec(sub);
    if (m && req.method === 'POST') {
      if (m[2] === 'start') { clips.start(m[1]); return sendJson(res, 200, { job: clips.get(m[1]) }); }
      if (m[2] === 'delete') { clips.remove(m[1]); return sendJson(res, 200, { ok: true }); }
      if (m[2] === 'drop-source') { clips.dropSource(m[1]); return sendJson(res, 200, { job: clips.get(m[1]) }); }
      const r = await clips.drive(m[1], Number((await json()).n) || 0);
      return sendJson(res, 200, Object.assign(r, { job: clips.get(m[1]) }));
    }
    m = /^jobs\/([a-f0-9]{16})\/clips\/(\d{1,2})$/.exec(sub);
    if (m && req.method === 'POST') { clips.update(m[1], Number(m[2]), await json()); return sendJson(res, 200, { job: clips.get(m[1]) }); }
    m = /^jobs\/([a-f0-9]{16})\/notes\.txt$/.exec(sub);
    if (m && req.method === 'GET') {
      const body = clips.sheet(m[1]);
      secure(res);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="clips-captions-and-review-notes.txt"', 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    m = /^jobs\/([a-f0-9]{16})\/clips\/(\d{1,2})\.mp4$/.exec(sub);
    if (m && (req.method === 'GET' || req.method === 'HEAD')) return sendVideo(req, res, clips.clipPath(m[1], Number(m[2])), query.get('download') === '1');
  } catch (e) { return fail(e); }
  return sendJson(res, 404, { error: 'Not found' });
}

/* A finished clip, with byte ranges so the browser can scrub it and Safari will play it. */
function sendVideo(req, res, f, download) {
  const size = fs.statSync(f.path).size;
  const head = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' };
  if (download) head['Content-Disposition'] = 'attachment; filename="' + f.name.replace(/[^A-Za-z0-9._-]/g, '-') + '"';
  const r = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  let start = 0, end = size - 1, status = 200;
  if (r && (r[1] || r[2])) {
    if (r[1]) { start = Number(r[1]); if (r[2]) end = Math.min(Number(r[2]), size - 1); }
    else { start = Math.max(0, size - Number(r[2])); }
    if (!(start <= end) || start >= size) { secure(res); res.writeHead(416, { 'Content-Range': 'bytes */' + size }); return res.end(); }
    status = 206; head['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  }
  head['Content-Length'] = end - start + 1;
  secure(res);
  res.writeHead(status, head);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(f.path, { start, end }).on('error', () => res.destroy()).pipe(res);
}

/* ---------- moments ---------- */

const moments = createMoments({
  root: ROOT,
  playbook: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'moments.json'), 'utf8')),
  occasions: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'experience.json'), 'utf8')).milestones.occasions,
  instagram: () => social.instagramReader()
});

async function handleMoments(req, res, pathname) {
  const sub = pathname.slice('/api/moments/'.length);
  if (sub === 'status' && req.method === 'GET') return sendJson(res, 200, moments.status());
  /* The watch list is names of clients. It never sits on an open site. */
  if (!moments.cfg.gated) return sendJson(res, 503, { error: 'Moments is off because this site has no password. Set SITE_PASSWORD in Railway first: the watch list names the firm\'s clients.' });
  if (req.method === 'POST' && req.headers['x-studio-request'] !== '1') return sendJson(res, 403, { error: 'Missing the request header the Studio sends.' });
  const fail = (e) => sendJson(res, e && e.status >= 400 && e.status < 600 ? e.status : 400, { error: e && e.message ? e.message : String(e) });
  const json = async (limit) => JSON.parse(await readBody(req, limit || 512 * 1024) || '{}');
  try {
    if (sub === 'contacts' && req.method === 'GET') return sendJson(res, 200, { contacts: moments.contacts() });
    if (sub === 'contacts' && req.method === 'POST') { const b = await json(); return sendJson(res, 200, { contacts: moments.upsert(b.contacts || []) }); }
    let m = /^contacts\/([a-f0-9]{12})\/delete$/.exec(sub);
    if (m && req.method === 'POST') { moments.remove(m[1]); return sendJson(res, 200, { ok: true }); }
    if (sub === 'alerts' && req.method === 'GET') return sendJson(res, 200, { alerts: moments.alerts() });
    m = /^alerts\/([a-f0-9]{12})\/(done|dismiss|notthem|reopen)$/.exec(sub);
    if (m && req.method === 'POST') return sendJson(res, 200, { alert: moments.act(m[1], m[2], await json()) });
    if (sub === 'scan' && req.method === 'POST') {
      if (moments.status().scanning) return sendJson(res, 409, { error: 'A scan is already running.' });
      moments.scan('by hand').catch((e) => console.error('moments scan failed:', e));
      return sendJson(res, 202, { started: true });
    }
    if (sub === 'settings' && req.method === 'POST') return sendJson(res, 200, { settings: moments.setSettings(await json()) });
    if (sub === 'read-post' && req.method === 'POST') {
      const busy = draftAllowed();
      if (busy) return sendJson(res, 429, { error: busy });
      let b;
      try { b = await json(8 * 1024 * 1024); } catch (e) { return sendJson(res, 400, { error: 'The screenshot was over about 6 MB. Crop it to the post and try again.' }); }
      draftLog.push(Date.now());
      draftsRunning++;
      try { return sendJson(res, 200, await moments.readPost(b)); } finally { draftsRunning--; }
    }
    if (sub === 'draft' && req.method === 'POST') {
      const busy = draftAllowed();
      if (busy) return sendJson(res, 429, { error: busy });
      const b = await json();
      draftLog.push(Date.now());
      draftsRunning++;
      try { return sendJson(res, 200, await moments.draft(b)); } finally { draftsRunning--; }
    }
  } catch (e) {
    if (!(e && e.status)) console.error('moments error:', e && e.message);
    return fail(e);
  }
  return sendJson(res, 404, { error: 'Not found' });
}

/* ---------- the newsroom endpoints ---------- */

function loadNewsConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'news.json'), 'utf8'));
    return {
      feeds: (cfg.feeds || []).filter((f) => f && f.id && f.url && f.kind),
      draftDomains: (cfg.draftDomains || []).slice(0, 64),
      guardrails: (cfg.guardrails || []).map((g) => g.rule || g).filter(Boolean)
    };
  } catch (e) {
    console.error('data/news.json could not be read:', e.message);
    return { feeds: [], draftDomains: [], guardrails: [] };
  }
}
const NEWS = loadNewsConfig();

const HAS_KEY = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const DRAFT_OPEN = process.env.DRAFT_ALLOW_OPEN === '1';
const DRAFTS_PER_HOUR = Math.max(1, parseInt(process.env.DRAFTS_PER_HOUR || '20', 10) || 20);

function draftAvailability() {
  if (!HAS_KEY) return { draft: false, reason: 'Set ANTHROPIC_API_KEY in Railway to turn on drafting with Claude. Until then the Studio gives you a brief to paste into Claude yourself.' };
  if (!PASSWORD && !DRAFT_OPEN) return { draft: false, reason: 'Drafting is off because this site has no password. Set SITE_PASSWORD in Railway first, so nobody with the link can spend the firm\'s API budget.' };
  if (!NEWS.draftDomains.length) return { draft: false, reason: 'data/news.json lists no trusted domains for search, so a draft could not be sourced.' };
  return { draft: true, reason: '' };
}

/* A small budget guard. Not a substitute for the password, a backstop behind it. */
const draftLog = [];
let draftsRunning = 0;
function draftAllowed() {
  const hourAgo = Date.now() - 3600 * 1000;
  while (draftLog.length && draftLog[0] < hourAgo) draftLog.shift();
  if (draftsRunning >= 2) return 'Two drafts are already running. Try again in a minute.';
  if (draftLog.length >= DRAFTS_PER_HOUR) return 'The hourly limit of ' + DRAFTS_PER_HOUR + ' drafts is reached. Raise DRAFTS_PER_HOUR in Railway if that is too low.';
  return '';
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  secure(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function readBytes(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

async function handleDraft(req, res) {
  const avail = draftAvailability();
  if (!avail.draft) return sendJson(res, 503, { error: avail.reason });
  const busy = draftAllowed();
  if (busy) return sendJson(res, 429, { error: busy });

  let input;
  try {
    const raw = await readBody(req, 64 * 1024);
    input = JSON.parse(raw);
  } catch (e) {
    return sendJson(res, 400, { error: 'The request was not valid JSON, or was larger than 64 KB.' });
  }
  const item = input && input.item ? input.item : {};
  const clean = {
    item: {
      title: str(item.title, 400), source: str(item.source, 200), published: str(item.published, 40),
      link: feeds.safeLink(str(item.link, 1000)), summary: str(item.summary, 2000)
    },
    region: str(input.region, 80),
    frame: str(input.frame, 4000),
    angle: str(input.angle, 1000),
    advisor: str(input.advisor, 200),
    voiceBrief: str(input.voiceBrief, 24000),
    today: new Date().toISOString().slice(0, 10)
  };
  if (!clean.item.title) return sendJson(res, 400, { error: 'Pick a news item first.' });

  draftLog.push(Date.now());
  draftsRunning++;
  try {
    const out = await drafting.draft(clean, NEWS);
    return sendJson(res, 200, out);
  } catch (e) {
    let A = null;
    try { const m = require('@anthropic-ai/sdk'); A = m.default || m; } catch (x) { /* not installed */ }
    let status = 502;
    let msg = 'The draft failed: ' + (e && e.message ? e.message : 'unknown error');
    if (e && e.code === 'refusal') { status = 422; msg = e.message; }
    else if (A && e instanceof A.AuthenticationError) { status = 503; msg = 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Railway.'; }
    else if (A && e instanceof A.RateLimitError) { status = 429; msg = 'The Anthropic API is rate limiting this key. Wait a minute and try again.'; }
    else if (A && e instanceof A.BadRequestError) { status = 502; msg = 'The Anthropic API rejected the request: ' + e.message; }
    else if (A && e instanceof A.APIConnectionError) { status = 504; msg = 'Could not reach the Anthropic API from the server.'; }
    console.error('draft failed:', e && e.message);
    return sendJson(res, status, { error: msg });
  } finally {
    draftsRunning--;
  }
}

/* Photos for a post. Up to six, downscaled in the browser first, checked here for type and
   size. They go to Claude to be described and are not kept: nothing here writes them to
   disk or holds them after the answer is sent. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
async function handleCaption(req, res) {
  const avail = draftAvailability();
  if (!avail.draft) return sendJson(res, 503, { error: avail.reason });
  const busy = draftAllowed();
  if (busy) return sendJson(res, 429, { error: busy });

  let input;
  try { input = JSON.parse(await readBody(req, 12 * 1024 * 1024)); }
  catch (e) { return sendJson(res, 400, { error: 'The request was not valid JSON, or the photos were larger than 12 MB together.' }); }

  const imgs = Array.isArray(input && input.images) ? input.images : [];
  if (!imgs.length) return sendJson(res, 400, { error: 'Add at least one photo.' });
  if (imgs.length > 6) return sendJson(res, 400, { error: 'Six photos at most per caption.' });
  for (const im of imgs) {
    if (!im || IMAGE_TYPES.indexOf(im.media_type) < 0) return sendJson(res, 400, { error: 'Photos must be JPEG, PNG, WebP or GIF.' });
    if (typeof im.data !== 'string' || im.data.length > 3 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(im.data)) {
      return sendJson(res, 400, { error: 'A photo was not readable, or was larger than about 2 MB after downscaling.' });
    }
  }
  if (input.consent !== true) return sendJson(res, 400, { error: 'Confirm consent for everyone recognizable in the photos first.' });
  const d = input.details || {};
  const clean = {
    images: imgs.map((im) => ({ media_type: im.media_type, data: im.data })),
    details: {
      what: str(d.what, 300), when: str(d.when, 120), where: str(d.where, 200), who: str(d.who, 600),
      happened: str(d.happened, 1500), why: str(d.why, 800), link: feeds.safeLink(str(d.link, 500)),
      platforms: Array.isArray(d.platforms) ? d.platforms.filter((x) => ['LinkedIn', 'Instagram', 'Facebook'].indexOf(x) >= 0) : [],
      advisor: str(d.advisor, 200)
    },
    voiceBrief: str(input.voiceBrief, 24000),
    guardrails: NEWS.guardrails.slice(0, 12)
  };

  draftLog.push(Date.now());
  draftsRunning++;
  try {
    return sendJson(res, 200, await captioning.caption(clean));
  } catch (e) {
    let A = null;
    try { const m = require('@anthropic-ai/sdk'); A = m.default || m; } catch (x) { /* not installed */ }
    let status = 502, msg = 'The caption failed: ' + (e && e.message ? e.message : 'unknown error');
    if (e && (e.code === 'refusal' || e.code === 'shape')) { status = 422; msg = e.message; }
    else if (A && e instanceof A.AuthenticationError) { status = 503; msg = 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Railway.'; }
    else if (A && e instanceof A.RateLimitError) { status = 429; msg = 'The Anthropic API is rate limiting this key. Wait a minute and try again.'; }
    else if (A && e instanceof A.BadRequestError) { status = 502; msg = 'The Anthropic API rejected the request: ' + e.message; }
    else if (A && e instanceof A.APIConnectionError) { status = 504; msg = 'Could not reach the Anthropic API from the server.'; }
    console.error('caption failed:', e && e.message);
    return sendJson(res, status, { error: msg });
  } finally {
    draftsRunning--;
  }
}

async function handleApi(req, res, pathname, query) {
  if (pathname.startsWith('/api/social/')) return handleSocial(req, res, pathname, query);
  if (pathname.startsWith('/api/moments/')) return handleMoments(req, res, pathname);
  if (pathname.startsWith('/api/clips/')) return handleClips(req, res, pathname, query);
  if (pathname === '/api/capabilities' && req.method === 'GET') {
    const a = draftAvailability();
    return sendJson(res, 200, { news: NEWS.feeds.length > 0, feeds: NEWS.feeds.length, draft: a.draft, draftReason: a.reason });
  }
  if (pathname === '/api/news' && req.method === 'GET') {
    try {
      const out = await feeds.getNews(NEWS.feeds, { force: query.get('refresh') === '1' });
      return sendJson(res, 200, out);
    } catch (e) {
      return sendJson(res, 502, { error: 'The news sources could not be read: ' + e.message });
    }
  }
  if (pathname === '/api/draft' && req.method === 'POST') return handleDraft(req, res);
  if (pathname === '/api/caption' && req.method === 'POST') return handleCaption(req, res);
  return sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  const postPath = req.url ? req.url.split('?')[0] : '';
  const isDraftPost = req.method === 'POST' && (postPath === '/api/draft' || postPath === '/api/caption' || postPath.startsWith('/api/social/') || postPath.startsWith('/api/moments/') || postPath.startsWith('/api/clips/'));
  if (req.method !== 'GET' && req.method !== 'HEAD' && !isDraftPost) {
    return send(res, 405, 'Method not allowed');
  }

  let pathname, query;
  try {
    const u = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(u.pathname);
    query = u.searchParams;
  }
  catch (e) { return send(res, 400, 'Bad request'); }

  /* Railway's health check runs before anyone signs in, so it sits above the gate. */
  if (pathname === '/healthz') {
    return send(res, 200, 'ok');
  }

  /* Meta's servers fetch the images of a post while it is being published. They cannot
     sign in, so this one path sits above the gate, and answers only for that post, only
     during that minute, at a link nobody could guess. */
  const media = /^\/media\/([a-f0-9]{48})\.jpg$/.exec(pathname);
  if (media && (req.method === 'GET' || req.method === 'HEAD')) {
    const buf = social.mediaFor(media[1]);
    if (!buf) return send(res, 404, 'Not found');
    secure(res);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : buf);
  }

  if (!authorised(req)) {
    secure(res);
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Women Worth & Wealth Content Studio", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8'
    });
    return res.end('This site is private.');
  }

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname, query).catch((e) => {
      console.error('api error:', e);
      if (!res.headersSent) sendJson(res, 500, { error: 'Server error' });
    });
    return;
  }

  if (pathname.startsWith('/auth/')) {
    handleAuth(req, res, pathname, query).catch((e) => {
      console.error('auth error:', e);
      if (!res.headersSent) send(res, 500, 'Server error');
    });
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  /* Serve the site, not the project directory. Anything outside these three places is
     not part of the site: no .git, no source of this server, no build scripts. */
  const servable = pathname === '/index.html' ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/data/');
  if (!servable) return send(res, 404, 'Not found');

  /* Reject dot segments outright rather than relying on normalisation alone. */
  if (pathname.split('/').some((seg) => seg.startsWith('.'))) {
    return send(res, 404, 'Not found');
  }

  /* Resolve inside the project directory or refuse. */
  const target = path.resolve(ROOT, '.' + pathname);
  if (!target.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      return send(res, 404, 'Not found');
    }

    const ext = path.extname(target).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';

    /* index.html must never be held in a cache, or a deploy would not reach anyone.
       The rest changes rarely and is revalidated. */
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

/* A sourced draft can take a few minutes: several searches, then a long write. Node's
   default would cut it off at five. */
server.requestTimeout = 10 * 60 * 1000;

server.listen(PORT, HOST, () => {
  console.log('Women Worth & Wealth Content Studio listening on ' + HOST + ':' + PORT +
    (PASSWORD ? ' (password protected)' : ' (open, no password set)') +
    '. Newsroom: ' + NEWS.feeds.length + ' feeds. Drafting: ' + (draftAvailability().draft ? 'on' : 'off') +
    '. Publishing: ' + (social.cfg.gated ? 'on' : 'off') + (social.cfg.gated && !social.cfg.persistent ? ' (no volume: the queue is lost on redeploy)' : '') + '.');
  social.start();
  moments.start();
});
