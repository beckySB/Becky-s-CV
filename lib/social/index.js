/* Publishing: the queue, the scheduler, and the connections to LinkedIn, Facebook and
   Instagram.

   The rule from the firm's plan holds here: nothing posts unless it was approved. A post is
   a draft until someone approves it for a time; the scheduler posts what is approved and due;
   every attempt, good or bad, goes into the publish log with the exact text that went out.

   It runs only behind SITE_PASSWORD, because the endpoints speak for the firm in public, and
   it connects accounts only when SOCIAL_TOKEN_KEY is set, because the tokens are stored. */
'use strict';

const path = require('path');
const crypto = require('crypto');
const { createStore, sealer } = require('./store');
const { jpegSize } = require('./jpeg');
const linkedin = require('./linkedin');
const meta = require('./meta');
const drive = require('./drive');
const { SocialError } = require('./errors');

const PLATFORMS = ['linkedin', 'facebook', 'instagram'];
const NAMES = { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram' };
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DRIVE_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf', 'text/plain': 'txt' };
const MAX_DRIVE_BYTES = 512 * 1024 * 1024;

function config(env, root) {
  const domain = env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + env.RAILWAY_PUBLIC_DOMAIN : '';
  const publicUrl = String(env.PUBLIC_URL || domain).replace(/\/+$/, '');
  const volume = env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || '';
  return {
    publicUrl,
    dataDir: volume || path.join(root, '.data'),
    persistent: !!volume,
    tokenKey: env.SOCIAL_TOKEN_KEY || '',
    gated: !!env.SITE_PASSWORD || env.SOCIAL_ALLOW_OPEN === '1',
    user: env.SITE_USER || 'www',
    linkedin: { clientId: env.LINKEDIN_CLIENT_ID || '', clientSecret: env.LINKEDIN_CLIENT_SECRET || '', version: env.LINKEDIN_VERSION || '202609' },
    meta: { appId: env.META_APP_ID || '', appSecret: env.META_APP_SECRET || '', version: env.META_GRAPH_VERSION || 'v25.0' },
    google: { clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '', folderName: env.DRIVE_FOLDER_NAME || 'Women Worth & Wealth Studio' },
    tickMs: Number(env.PUBLISH_TICK_MS) || 30000
  };
}

function createSocial(opts) {
  const cfg = config(opts.env || process.env, opts.root);
  const fetchFn = opts.fetch || global.fetch;
  const now = opts.now || (() => Date.now());
  const sleep = opts.sleep;
  const store = createStore(cfg.dataDir);
  /* No SOCIAL_TOKEN_KEY, but a volume: make a key once and keep it on the volume, so there
     is one less thing to set up. A key set in Railway always wins. Without a volume a
     generated key would vanish on the next deploy, so it is not offered. */
  if (!cfg.tokenKey && cfg.persistent) {
    const kf = require('path').join(store.dir, '.token-key');
    try { cfg.tokenKey = require('fs').readFileSync(kf, 'utf8').trim(); }
    catch (e) {
      cfg.tokenKey = crypto.randomBytes(32).toString('hex');
      require('fs').writeFileSync(kf, cfg.tokenKey, { mode: 0o600 });
    }
    cfg.tokenKeySource = 'volume';
  } else if (cfg.tokenKey) cfg.tokenKeySource = 'railway';
  const vault = sealer(cfg.tokenKey);
  const S = () => store.state;
  const oauth = new Map();
  let lastConnectError = '';
  let running = false;

  /* ---------- what is set up ---------- */

  function redirectUri(p) { return cfg.publicUrl + '/auth/' + p + '/callback'; }

  function missing() {
    const m = [];
    if (!cfg.gated) m.push('SITE_PASSWORD (publishing speaks for the firm, so it never runs on an open site)');
    if (!cfg.tokenKey) m.push('SOCIAL_TOKEN_KEY (attach a volume and it is made for you; or set a long random string)');
    if (!/^https:\/\//.test(cfg.publicUrl)) m.push('PUBLIC_URL (the https address of this site, which Meta and LinkedIn send you back to)');
    return m;
  }
  const canConnect = (p) => !missing().length && (p === 'linkedin'
    ? !!(cfg.linkedin.clientId && cfg.linkedin.clientSecret)
    : p === 'google'
      ? !!(cfg.google.clientId && cfg.google.clientSecret)
      : !!(cfg.meta.appId && cfg.meta.appSecret));

  function connectionFor(platform) {
    const c = S().connections;
    if (platform === 'linkedin') return c.linkedin || null;
    const m = c.meta; if (!m) return null;
    const page = (m.pages || []).find((p) => p.id === m.pageId) || null;
    if (!page) return null;
    if (platform === 'facebook') return { page };
    return page.ig ? { page, ig: page.ig } : null;
  }

  function status() {
    const c = S().connections;
    const li = c.linkedin;
    const days = li ? Math.floor((Date.parse(li.expiresAt) - now()) / 86400000) : null;
    return {
      enabled: cfg.gated,
      missing: missing(),
      keySource: cfg.tokenKeySource || 'missing',
      storage: { persistent: cfg.persistent, dir: cfg.persistent ? cfg.dataDir : 'inside the app (lost on every deploy)' },
      publicUrl: cfg.publicUrl,
      redirects: { linkedin: cfg.publicUrl ? redirectUri('linkedin') : '', meta: cfg.publicUrl ? redirectUri('meta') : '', google: cfg.publicUrl ? redirectUri('google') : '' },
      apps: { linkedin: !!(cfg.linkedin.clientId && cfg.linkedin.clientSecret), meta: !!(cfg.meta.appId && cfg.meta.appSecret), google: !!(cfg.google.clientId && cfg.google.clientSecret) },
      canConnect: { linkedin: canConnect('linkedin'), meta: canConnect('meta'), google: canConnect('google') },
      google: c.google ? { email: c.google.email, connectedAt: c.google.connectedAt, needsReconnect: !!c.google.needsReconnect, folder: c.google.folder ? { name: c.google.folder.name, link: c.google.folder.link } : null, recent: (c.google.recent || []).slice(0, 10) } : null,
      lastConnectError,
      linkedin: li ? { name: li.name, expiresAt: li.expiresAt, daysLeft: days, expired: days !== null && days < 0, needsReconnect: !!li.needsReconnect, connectedAt: li.connectedAt } : null,
      meta: c.meta ? {
        userName: c.meta.userName, connectedAt: c.meta.connectedAt, pageId: c.meta.pageId, needsReconnect: !!c.meta.needsReconnect,
        pages: (c.meta.pages || []).map((p) => ({ id: p.id, name: p.name, ig: p.ig }))
      } : null,
      ready: { linkedin: !!connectionFor('linkedin'), facebook: !!connectionFor('facebook'), instagram: !!connectionFor('instagram') }
    };
  }

  /* ---------- connecting ---------- */

  function startAuth(platform) {
    if (!canConnect(platform)) return null;
    for (const [k, v] of oauth) if (v.exp < now()) oauth.delete(k);
    const state = crypto.randomBytes(18).toString('hex');
    oauth.set(state, { platform, exp: now() + 10 * 60000 });
    if (platform === 'google') return drive.authUrl({ clientId: cfg.google.clientId, redirectUri: redirectUri('google'), state });
    return platform === 'linkedin'
      ? linkedin.authUrl({ clientId: cfg.linkedin.clientId, redirectUri: redirectUri('linkedin'), state })
      : meta.authUrl({ appId: cfg.meta.appId, redirectUri: redirectUri('meta'), state, version: cfg.meta.version });
  }

  async function finishAuth(platform, query) {
    const state = query.get('state') || '';
    const pending = oauth.get(state);
    oauth.delete(state);
    if (!pending || pending.platform !== platform || pending.exp < now()) {
      throw new SocialError(platform, 'The sign-in link had expired or did not start here. Start again from Connections.');
    }
    if (query.get('error')) throw new SocialError(platform, 'Sign-in was cancelled or refused: ' + (query.get('error_description') || query.get('error')));
    const code = query.get('code');
    if (!code) throw new SocialError(platform, 'The platform sent no sign-in code back.');
    const at = new Date(now()).toISOString();
    if (platform === 'google') {
      const r = await drive.exchange({ fetch: fetchFn, clientId: cfg.google.clientId, clientSecret: cfg.google.clientSecret, redirectUri: redirectUri('google'), code, now: now() });
      if (!/drive\.file/.test(r.scope)) throw new SocialError('google', 'Google connected without permission to save files. On the consent screen, leave the Google Drive box ticked, and connect again.');
      const prev = S().connections.google;
      /* Google sends the refresh token on a fresh consent. Keep the old one if it did not. */
      const refreshSealed = r.refreshToken ? vault.seal(r.refreshToken) : (prev && prev.refresh) || '';
      if (!refreshSealed) throw new SocialError('google', 'Google sent no long-lived token. Remove the Studio at myaccount.google.com/permissions, then connect again.');
      const same = prev && prev.email === r.email;
      S().connections.google = { email: r.email, refresh: refreshSealed, connectedAt: at, folder: same ? prev.folder || null : null, recent: same ? prev.recent || [] : [] };
    } else if (platform === 'linkedin') {
      const r = await linkedin.exchange({ fetch: fetchFn, clientId: cfg.linkedin.clientId, clientSecret: cfg.linkedin.clientSecret, redirectUri: redirectUri('linkedin'), code, now: now() });
      if (!/w_member_social/.test(r.scope || 'w_member_social')) {
        throw new SocialError('linkedin', 'LinkedIn connected without permission to post. Add the Share on LinkedIn product to the app and connect again.');
      }
      S().connections.linkedin = { name: r.name, author: r.author, token: vault.seal(r.token), expiresAt: r.expiresAt, scope: r.scope, connectedAt: at };
    } else {
      const r = await meta.exchange({ fetch: fetchFn, appId: cfg.meta.appId, appSecret: cfg.meta.appSecret, redirectUri: redirectUri('meta'), code, version: cfg.meta.version, now: now() });
      if (!r.pages.length) throw new SocialError('meta', 'Facebook connected, but no Page came back. Choose the Women Worth & Wealth Page when Facebook asks which Pages to share, and connect again.');
      const prev = S().connections.meta;
      const keep = prev && r.pages.some((p) => p.id === prev.pageId) ? prev.pageId : '';
      const withIg = r.pages.find((p) => p.ig);
      S().connections.meta = {
        userName: r.userName, userExpiresAt: r.userExpiresAt, connectedAt: at,
        pageId: keep || (r.pages.length === 1 ? r.pages[0].id : (withIg ? withIg.id : '')),
        pages: r.pages.map((p) => ({ id: p.id, name: p.name, ig: p.ig, token: vault.seal(p.token) }))
      };
    }
    lastConnectError = '';
    store.save();
  }

  /* ---------- Google Drive ----------
     Finished videos and images go into one folder the Studio makes in the connected Drive.
     Nothing is published by this: it is a save, the same as a download. */

  async function driveToken() {
    const g = S().connections.google;
    if (!g || !vault) throw new SocialError('google', 'Google Drive is not connected. Connect it in Publishing, Connections.', { status: 409 });
    try {
      const r = await drive.refresh({ fetch: fetchFn, clientId: cfg.google.clientId, clientSecret: cfg.google.clientSecret, refreshToken: vault.open(g.refresh), now: now() });
      if (g.needsReconnect) { delete g.needsReconnect; store.save(); }
      return r.accessToken;
    } catch (e) {
      if (e && e.reconnect) { g.needsReconnect = true; store.save(); }
      throw e;
    }
  }

  async function saveToDrive(input) {
    const ext = DRIVE_TYPES[input.mimeType];
    if (!ext) throw new SocialError('google', 'Only MP4, WebM and MOV videos, PNG and JPEG images, PDFs and text notes can be saved to Drive.', { status: 415 });
    const bytes = input.bytes;
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new SocialError('google', 'The file was empty.', { status: 400 });
    if (bytes.length > MAX_DRIVE_BYTES) throw new SocialError('google', 'The file is over 512 MB. Export it at 720p, or save it by hand.', { status: 413 });
    let name = String(input.name || '').replace(/[\\/\u0000-\u001f]/g, ' ').trim().slice(0, 160) || 'studio-file';
    if (!new RegExp('\\.' + ext + '$', 'i').test(name)) name += '.' + ext;
    const token = await driveToken();
    const g = S().connections.google;
    if (g.folder && !(await drive.folderExists({ fetch: fetchFn, token, id: g.folder.id }))) g.folder = null;
    if (!g.folder) { g.folder = await drive.createFolder({ fetch: fetchFn, token, name: cfg.google.folderName }); store.save(); }
    const f = await drive.upload({ fetch: fetchFn, token, name, mimeType: input.mimeType, bytes, parentId: g.folder.id });
    g.recent = [{ name: f.name, link: f.link, bytes: f.bytes, at: new Date(now()).toISOString(), by: input.by || cfg.user }].concat(g.recent || []).slice(0, 20);
    store.save();
    return { file: f, folder: { name: g.folder.name, link: g.folder.link } };
  }

  /* ---------- the queue ---------- */

  function find(id) { return S().posts.find((p) => p.id === id) || null; }

  function publicPost(p) {
    return Object.assign({}, p, { images: p.images.map((im) => ({ id: im.id, width: im.width, height: im.height, bytes: im.bytes })) });
  }

  function clean(input, partial) {
    const out = {};
    if (!partial || input.title !== undefined) out.title = String(input.title || '').slice(0, 160);
    if (!partial || input.platforms !== undefined) {
      out.platforms = Array.isArray(input.platforms) ? PLATFORMS.filter((p) => input.platforms.indexOf(p) >= 0) : [];
    }
    if (!partial || input.captions !== undefined) {
      const c = input.captions || {};
      out.captions = {};
      PLATFORMS.forEach((p) => { out.captions[p] = String(c[p] || '').slice(0, 5000); });
    }
    if (!partial || input.altText !== undefined) out.altText = (Array.isArray(input.altText) ? input.altText : []).slice(0, MAX_IMAGES).map((a) => String(a || '').slice(0, 1000));
    if (!partial || input.firstComment !== undefined) out.firstComment = String(input.firstComment || '').slice(0, 1000);
    if (input.scheduledAt !== undefined) {
      const t = input.scheduledAt ? Date.parse(input.scheduledAt) : NaN;
      out.scheduledAt = isNaN(t) ? null : new Date(t).toISOString();
    }
    return out;
  }

  function createPost(input) {
    const raw = Array.isArray(input.images) ? input.images : [];
    if (!raw.length) throw new SocialError('', 'Add at least one image.');
    if (raw.length > MAX_IMAGES) throw new SocialError('', 'Ten images at most per post.');
    const bufs = raw.map((d, i) => {
      if (typeof d !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(d)) throw new SocialError('', 'Image ' + (i + 1) + ' was not readable.');
      const b = Buffer.from(d, 'base64');
      if (b.length > MAX_IMAGE_BYTES) throw new SocialError('', 'Image ' + (i + 1) + ' is over 8 MB, which Instagram refuses.');
      const size = jpegSize(b);
      if (!size) throw new SocialError('', 'Image ' + (i + 1) + ' is not a JPEG. Instagram takes JPEG only.');
      return { b, size };
    });
    const at = new Date(now()).toISOString();
    const post = Object.assign({
      id: crypto.randomBytes(8).toString('hex'),
      status: 'draft', createdAt: at, updatedAt: at, scheduledAt: null,
      source: String(input.source || '').slice(0, 40),
      results: {}, notes: []
    }, clean(input, false));
    post.images = bufs.map(({ b, size }) => store.putImage(b, size));
    S().posts.push(post);
    store.save();
    return post;
  }

  function hashtags(text) { return (String(text).match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length; }

  /* Everything that would make a platform refuse the post, found before it is approved. */
  function problems(p) {
    const out = [];
    if (!p.platforms.length) out.push('Pick at least one platform.');
    p.platforms.forEach((pl) => {
      const text = p.captions[pl] || '';
      if (!text.trim()) out.push(NAMES[pl] + ' has no caption.');
      if (!connectionFor(pl)) out.push(NAMES[pl] + ' is not connected. Connect it in Publishing, Connections.');
    });
    if (p.platforms.indexOf('linkedin') >= 0 && (p.captions.linkedin || '').length > linkedin.MAX_TEXT) out.push('The LinkedIn text is over 3,000 characters.');
    if (p.platforms.indexOf('instagram') >= 0) {
      const t = p.captions.instagram || '';
      if (t.length > meta.IG_MAX_TEXT) out.push('The Instagram caption is over 2,200 characters.');
      if (hashtags(t) > meta.IG_MAX_TAGS) out.push('Instagram allows 30 hashtags at most.');
      p.images.forEach((im, i) => {
        const r = im.width / im.height;
        if (r < 0.79 || r > 1.92) out.push('Image ' + (i + 1) + ' is ' + im.width + ' by ' + im.height + '. The Instagram feed takes 4:5 to 1.91:1, so a 9:16 story size will be refused. Remake it at 4:5 or 1:1, or leave Instagram off.');
      });
    }
    return out;
  }

  function act(id, action, body) {
    const p = find(id);
    if (!p) throw new SocialError('', 'That post is no longer in the queue.', { status: 404 });
    const at = new Date(now()).toISOString();
    const need = (states) => {
      if (states.indexOf(p.status) < 0) throw new SocialError('', 'That cannot be done to a post that is ' + p.status + '.', { status: 409 });
    };
    if (action === 'update') {
      need(['draft']);
      Object.assign(p, clean(body || {}, true));
    } else if (action === 'approve') {
      need(['draft']);
      const c = clean(body || {}, true);
      const when = c.scheduledAt || p.scheduledAt;
      if (!when) throw new SocialError('', 'Pick a time, or use Post now.', { status: 400 });
      if (Date.parse(when) > now() + 400 * 86400000) throw new SocialError('', 'That time is more than a year out.', { status: 400 });
      const bad = problems(p);
      if (bad.length) { const e = new SocialError('', bad.join(' '), { status: 400 }); e.problems = bad; throw e; }
      p.scheduledAt = Date.parse(when) < now() ? at : when;
      p.status = 'scheduled'; p.approvedAt = at; p.approvedBy = cfg.user;
    } else if (action === 'unapprove') {
      need(['scheduled']);
      p.status = 'draft'; p.approvedAt = null; p.approvedBy = null;
    } else if (action === 'cancel') {
      need(['draft', 'scheduled']);
      p.status = 'cancelled';
    } else if (action === 'retry') {
      need(['failed', 'partial', 'check']);
      const bad = problems(Object.assign({}, p, { platforms: p.platforms.filter((pl) => !(p.results[pl] && p.results[pl].ok)) }));
      if (bad.length) throw new SocialError('', bad.join(' '), { status: 400 });
      p.status = 'scheduled'; p.scheduledAt = at; p.approvedAt = at; p.approvedBy = cfg.user;
    } else if (action === 'mark') {
      /* After a restart mid-post, a person looks at the account and says it is up. */
      need(['check', 'partial', 'failed']);
      const pl = String((body || {}).platform || '');
      if (p.platforms.indexOf(pl) < 0) throw new SocialError('', 'That platform is not on this post.', { status: 400 });
      p.results[pl] = { ok: true, manual: true, at, url: String((body || {}).url || '').slice(0, 500) };
      S().log.push({ at, postId: p.id, platform: pl, ok: true, manual: true, text: p.captions[pl], images: p.images.map((im) => im.sha256) });
      settle(p);
    } else if (action === 'delete') {
      need(['draft', 'cancelled']);
      p.images.forEach((im) => store.removeImage(im.id));
      S().posts = S().posts.filter((x) => x !== p);
      store.save();
      return null;
    } else {
      throw new SocialError('', 'Unknown action.', { status: 404 });
    }
    p.updatedAt = at;
    store.save();
    return p;
  }

  function settle(p) {
    const done = p.platforms.filter((pl) => p.results[pl] && p.results[pl].ok).length;
    p.status = done === p.platforms.length ? 'published' : done ? 'partial' : 'failed';
    if (p.status === 'published') p.publishedAt = new Date(now()).toISOString();
  }

  /* ---------- publishing ---------- */

  function imageUrls(p) {
    if (!/^https:\/\//.test(cfg.publicUrl)) throw new SocialError('', 'PUBLIC_URL must be the https address of this site, because Meta fetches the images from it.');
    return p.images.map((im) => cfg.publicUrl + '/media/' + im.token + '.jpg');
  }

  async function publishOne(platform, p) {
    const text = p.captions[platform];
    const conn = connectionFor(platform);
    if (!conn) throw new SocialError(platform, NAMES[platform] + ' is not connected.', { reconnect: true });
    if (platform === 'linkedin') {
      if (Date.parse(conn.expiresAt) < now()) throw new SocialError('linkedin', 'The LinkedIn connection expired. Reconnect it in Publishing, Connections.', { reconnect: true });
      return linkedin.publish({
        fetch: fetchFn, sleep, token: vault.open(conn.token), author: conn.author, version: cfg.linkedin.version, text,
        images: p.images.map((im, i) => ({ buf: store.readImage(im.id), alt: p.altText[i] || '' }))
      });
    }
    const token = vault.open(conn.page.token);
    if (platform === 'facebook') return meta.publishFacebook({ fetch: fetchFn, version: cfg.meta.version, pageId: conn.page.id, token, text, imageUrls: imageUrls(p) });
    return meta.publishInstagram({ fetch: fetchFn, sleep, version: cfg.meta.version, igId: conn.ig.id, token, text, imageUrls: imageUrls(p) });
  }

  async function publishPost(p) {
    p.status = 'publishing';
    p.startedAt = new Date(now()).toISOString();
    store.save();
    for (const pl of p.platforms) {
      if (p.results[pl] && p.results[pl].ok) continue;
      const at = () => new Date(now()).toISOString();
      try {
        const r = await publishOne(pl, p);
        p.results[pl] = { ok: true, id: r.id, url: r.url, at: at() };
        const c = pl === 'linkedin' ? S().connections.linkedin : S().connections.meta;
        if (c) delete c.needsReconnect;
        S().log.push({ at: at(), postId: p.id, platform: pl, ok: true, id: r.id, url: r.url, text: p.captions[pl], images: p.images.map((im) => im.sha256), approvedBy: p.approvedBy, approvedAt: p.approvedAt });
      } catch (e) {
        /* A dropped connection is not a refusal: the post may or may not have landed. */
        const msg = e instanceof SocialError ? e.message
          : 'The connection to ' + NAMES[pl] + ' failed' + (e && e.cause && e.cause.code ? ' (' + e.cause.code + ')' : e && e.message ? ' (' + e.message + ')' : '') + '. Look at the account before retrying, in case it went through.';
        p.results[pl] = { ok: false, error: msg, reconnect: !!(e && e.reconnect), at: at() };
        S().log.push({ at: at(), postId: p.id, platform: pl, ok: false, error: msg, text: p.captions[pl], images: p.images.map((im) => im.sha256), approvedBy: p.approvedBy, approvedAt: p.approvedAt });
        if (e && e.reconnect) {
          if (pl === 'linkedin' && S().connections.linkedin) S().connections.linkedin.needsReconnect = true;
          if (pl !== 'linkedin' && S().connections.meta) S().connections.meta.needsReconnect = true;
        }
        console.error('publish ' + pl + ' failed for ' + p.id + ':', msg);
      }
      store.save();
    }
    settle(p);
    p.updatedAt = new Date(now()).toISOString();
    store.save();
  }

  async function tick() {
    if (running) return 0;
    running = true;
    let n = 0;
    try {
      const due = S().posts
        .filter((p) => p.status === 'scheduled' && Date.parse(p.scheduledAt) <= now())
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
      for (const p of due) { await publishPost(p); n++; }
    } finally { running = false; }
    return n;
  }

  /* A restart in the middle of a post leaves it unknown which platforms took it. Say so and
     let a person look, rather than retry and risk posting twice. */
  S().posts.forEach((p) => {
    if (p.status === 'publishing') {
      p.status = 'check';
      p.notes.push('The server restarted while this was posting. Look at each account before retrying, and mark any that already show it, so nothing posts twice.');
    }
  });
  store.save();

  let timer = null;
  function start() {
    if (timer || !cfg.gated) return;
    timer = setInterval(() => { tick().catch((e) => console.error('publish tick failed:', e)); }, cfg.tickMs);
    if (timer.unref) timer.unref();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  /* The one route that answers without the site password: Meta's servers fetching an image
     for a post that is being published right now. Anything else is a 404. */
  function mediaFor(token) {
    if (!/^[a-f0-9]{48}$/.test(token)) return null;
    for (const p of S().posts) {
      if (p.status !== 'publishing') continue;
      const im = p.images.find((x) => x.token === token);
      if (im) return store.readImage(im.id);
    }
    return null;
  }

  function csv() {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['time (UTC)', 'post', 'platform', 'result', 'link or error', 'approved by', 'approved at', 'image sha256', 'text'].map(q).join(',')];
    S().log.forEach((l) => rows.push([l.at, l.postId, NAMES[l.platform] || l.platform, l.ok ? (l.manual ? 'marked posted' : 'posted') : 'failed',
      l.ok ? (l.url || l.id || '') : l.error, l.approvedBy || '', l.approvedAt || '', (l.images || []).join(' '), l.text].map(q).join(',')));
    return rows.join('\r\n') + '\r\n';
  }

  return {
    cfg, store, status, startAuth, finishAuth, createPost, act, problems, tick, start, stop, mediaFor, csv, publicPost,
    setConnectError(m) { lastConnectError = m; },
    choosePage(id) {
      const m = S().connections.meta;
      if (!m || !(m.pages || []).some((p) => p.id === id)) throw new SocialError('meta', 'That Page is not among the connected ones.', { status: 400 });
      m.pageId = id; store.save();
    },
    saveToDrive,
    disconnect(platform) {
      if (platform === 'linkedin') delete S().connections.linkedin;
      else if (platform === 'google') delete S().connections.google;
      else if (platform === 'meta') delete S().connections.meta;
      else throw new SocialError('', 'Unknown platform.', { status: 400 });
      store.save();
    },
    /* For Moments: read other business accounts and posts that tag the firm, when Instagram
       is connected. Null otherwise. */
    instagramReader() {
      const conn = connectionFor('instagram');
      if (!conn || !vault) return null;
      const base = { fetch: fetchFn, version: cfg.meta.version, igId: conn.ig.id, token: vault.open(conn.page.token) };
      return {
        account: conn.ig.username,
        discover: (username) => meta.discover(Object.assign({ username }, base)),
        tagged: () => meta.tagged(base)
      };
    },
    posts() { return S().posts.slice().sort((a, b) => (Date.parse(b.scheduledAt || b.createdAt) - Date.parse(a.scheduledAt || a.createdAt))).map(publicPost); },
    find
  };
}

module.exports = { createSocial, config, PLATFORMS };
