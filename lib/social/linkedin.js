/* Posting to a LinkedIn personal profile through the self-serve "Share on LinkedIn" product.

   Sign in asks for openid, profile and w_member_social. Tokens last about 60 days and this
   kind of app gets no refresh token, so the Studio counts the days down and asks for a
   reconnect before the deadline rather than after a post fails.

   Images: initializeUpload, PUT the bytes, wait until LinkedIn says the image is AVAILABLE,
   then one call to /rest/posts. One image is a media post; two to twenty is a multiImage post.

   The post text is LinkedIn's "little text format", in which ( ) [ ] { } < > @ # * _ ~ | \
   are markup. Left unescaped, a parenthesis can silently cut the post short. Every one is
   escaped, and a #word becomes a real hashtag. */
'use strict';

const { SocialError } = require('./errors');

const AUTH = 'https://www.linkedin.com/oauth/v2';
const API = 'https://api.linkedin.com';
const SCOPES = ['openid', 'profile', 'w_member_social'];
const MAX_TEXT = 3000;

function authUrl({ clientId, redirectUri, state }) {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state, scope: SCOPES.join(' ') });
  return AUTH + '/authorization?' + q.toString();
}

async function readJson(r) {
  const t = await r.text();
  try { return t ? JSON.parse(t) : {}; } catch (e) { return { message: t.slice(0, 300) }; }
}

function fail(r, j, what) {
  const msg = (j && (j.message || j.error_description || j.error)) || ('HTTP ' + r.status);
  const reconnect = r.status === 401 || /expired|revoked|invalid.?token/i.test(msg);
  return new SocialError('linkedin', what + ': ' + msg + (reconnect ? '. Reconnect LinkedIn in Publishing, Connections.' : ''), { status: r.status, reconnect });
}

async function exchange({ fetch, clientId, clientSecret, redirectUri, code, now }) {
  const r = await fetch(AUTH + '/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }).toString()
  });
  const j = await readJson(r);
  if (!r.ok || !j.access_token) throw fail(r, j, 'LinkedIn did not issue a token');
  const token = j.access_token;
  const u = await fetch(API + '/v2/userinfo', { headers: { Authorization: 'Bearer ' + token } });
  const me = await readJson(u);
  if (!u.ok || !me.sub) throw fail(u, me, 'LinkedIn did not say who signed in');
  return {
    token,
    expiresAt: new Date((now || Date.now()) + (Number(j.expires_in) || 60 * 86400) * 1000).toISOString(),
    scope: j.scope || '',
    author: 'urn:li:person:' + me.sub,
    name: me.name || [me.given_name, me.family_name].filter(Boolean).join(' ') || 'LinkedIn member'
  };
}

function escapeText(s) { return String(s).replace(/[\\|{}@[\]()<>#*_~]/g, '\\$&'); }

function commentary(text) {
  const re = /(^|\s)#([\p{L}\p{N}]*\p{L}[\p{L}\p{N}]*)/gu;
  let out = '', last = 0, m;
  const src = String(text || '');
  while ((m = re.exec(src))) {
    const at = m.index + m[1].length;
    out += escapeText(src.slice(last, at)) + '{hashtag|\\#|' + m[2] + '}';
    last = at + 1 + m[2].length;
  }
  return out + escapeText(src.slice(last));
}

async function publish({ fetch, token, author, version, text, images, sleep }) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const headers = {
    Authorization: 'Bearer ' + token,
    'LinkedIn-Version': version,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json'
  };
  if (!images.length) throw new SocialError('linkedin', 'A LinkedIn post from the Studio needs at least one image.');
  if (images.length > 20) throw new SocialError('linkedin', 'LinkedIn takes at most 20 images in one post.');

  const ids = [];
  for (let i = 0; i < images.length; i++) {
    const r = await fetch(API + '/rest/images?action=initializeUpload', {
      method: 'POST', headers, body: JSON.stringify({ initializeUploadRequest: { owner: author } })
    });
    const j = await readJson(r);
    if (!r.ok || !j.value || !j.value.uploadUrl) throw fail(r, j, 'LinkedIn would not start the upload of image ' + (i + 1));
    const put = await fetch(j.value.uploadUrl, {
      method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: images[i].buf
    });
    if (!put.ok) throw fail(put, await readJson(put), 'LinkedIn refused image ' + (i + 1));
    ids.push(j.value.image);
  }

  /* LinkedIn processes an upload before a post can use it. Wait for AVAILABLE, up to a
     minute in all, and go ahead anyway if the status call itself is not allowed. */
  for (const id of ids) {
    for (let k = 0; k < 20; k++) {
      const r = await fetch(API + '/rest/images/' + encodeURIComponent(id), { headers });
      if (!r.ok) break;
      const j = await readJson(r);
      if (j.status === 'AVAILABLE') break;
      if (j.status === 'PROCESSING_FAILED') throw new SocialError('linkedin', 'LinkedIn could not process one of the images.');
      await wait(3000);
    }
  }

  const alt = (i) => String((images[i] && images[i].alt) || '').slice(0, 1000);
  const content = ids.length === 1
    ? { media: { id: ids[0], altText: alt(0) } }
    : { multiImage: { images: ids.map((id, i) => ({ id, altText: alt(i) })) } };
  const body = {
    author,
    commentary: commentary(text),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content,
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false
  };
  const r = await fetch(API + '/rest/posts', { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) throw fail(r, await readJson(r), 'LinkedIn did not publish the post');
  const id = r.headers.get('x-restli-id') || r.headers.get('x-linkedin-id') || '';
  return { id, url: id ? 'https://www.linkedin.com/feed/update/' + id + '/' : '' };
}

module.exports = { authUrl, exchange, publish, commentary, escapeText, SCOPES, MAX_TEXT };
