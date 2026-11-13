/* Posting to the Women Worth & Wealth Facebook Page and the Instagram professional account linked to it,
   through one Meta app and Facebook Login.

   Sign in returns a short user token. It is swapped for a long-lived one, and the Page token
   read with that never expires on its own; it stops working if the password changes, the
   app is removed, or the person loses their role on the Page. Instagram calls use the same
   Page token.

   Meta fetches each image from a URL rather than taking the bytes, so the Studio serves the
   finished JPEG at an unguessable link, and only while that post is being published.

   Facebook, several photos: each is uploaded unpublished, then one feed post attaches them.
   Instagram: a container per image, a carousel container over them, wait for FINISHED, then
   media_publish. */
'use strict';

const { SocialError } = require('./errors');

const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management', 'instagram_basic', 'instagram_content_publish'];
const IG_MAX_TEXT = 2200;
const IG_MAX_TAGS = 30;
const IG_MAX_IMAGES = 10;

const graphBase = (v) => 'https://graph.facebook.com/' + v;

function authUrl({ appId, redirectUri, state, version, scopes }) {
  const q = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, response_type: 'code', scope: (scopes || SCOPES).join(',') });
  return 'https://www.facebook.com/' + version + '/dialog/oauth?' + q.toString();
}

async function graph(fetch, platform, method, url, params) {
  let r;
  if (method === 'GET') r = await fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + new URLSearchParams(params).toString());
  else r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : {}; } catch (e) { j = { error: { message: t.slice(0, 300) } }; }
  if (!r.ok || j.error) {
    const e = j.error || {};
    const msg = e.error_user_msg || e.message || ('HTTP ' + r.status);
    const reconnect = e.code === 190 || e.code === 102 || (e.code === 10 || e.code === 200) && /permission/i.test(msg);
    throw new SocialError(platform, msg + (reconnect ? '. Reconnect Facebook and Instagram in Publishing, Connections.' : ''), { status: r.status, reconnect, detail: e.code ? 'code ' + e.code + (e.error_subcode ? '/' + e.error_subcode : '') : '' });
  }
  return j;
}

async function exchange({ fetch, appId, appSecret, redirectUri, code, version, now }) {
  const G = graphBase(version);
  const short = await graph(fetch, 'meta', 'GET', G + '/oauth/access_token', { client_id: appId, redirect_uri: redirectUri, client_secret: appSecret, code });
  const long = await graph(fetch, 'meta', 'GET', G + '/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token });
  const userToken = long.access_token || short.access_token;
  const me = await graph(fetch, 'meta', 'GET', G + '/me', { fields: 'id,name', access_token: userToken });
  const acc = await graph(fetch, 'meta', 'GET', G + '/me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '100', access_token: userToken });
  const pages = (acc.data || []).filter((p) => p.access_token).map((p) => ({
    id: String(p.id), name: p.name || 'Page ' + p.id, token: p.access_token,
    ig: p.instagram_business_account ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username || '' } : null
  }));
  return {
    userName: me.name || '',
    userExpiresAt: long.expires_in ? new Date((now || Date.now()) + long.expires_in * 1000).toISOString() : null,
    pages
  };
}

async function publishFacebook({ fetch, version, pageId, token, text, imageUrls }) {
  const G = graphBase(version);
  if (!imageUrls.length) throw new SocialError('facebook', 'A Facebook post from the Studio needs at least one image.');
  let postId;
  if (imageUrls.length === 1) {
    const j = await graph(fetch, 'facebook', 'POST', G + '/' + pageId + '/photos', { url: imageUrls[0], message: text, published: 'true', access_token: token });
    postId = j.post_id || j.id;
  } else {
    const media = [];
    for (const url of imageUrls) {
      const j = await graph(fetch, 'facebook', 'POST', G + '/' + pageId + '/photos', { url, published: 'false', access_token: token });
      media.push({ media_fbid: j.id });
    }
    const j = await graph(fetch, 'facebook', 'POST', G + '/' + pageId + '/feed', { message: text, attached_media: JSON.stringify(media), access_token: token });
    postId = j.id;
  }
  return { id: String(postId || ''), url: postId ? 'https://www.facebook.com/' + postId : '' };
}

async function waitFinished(fetch, G, id, token, wait) {
  for (let k = 0; k < 40; k++) {
    const j = await graph(fetch, 'instagram', 'GET', G + '/' + id, { fields: 'status_code,status', access_token: token });
    if (j.status_code === 'FINISHED') return;
    if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') {
      throw new SocialError('instagram', 'Instagram could not process the image: ' + (j.status || j.status_code) + '. Check the image is a JPEG between 4:5 and 1.91:1.');
    }
    await wait(3000);
  }
  throw new SocialError('instagram', 'Instagram was still processing the image after two minutes.');
}

async function publishInstagram({ fetch, version, igId, token, text, imageUrls, sleep }) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const G = graphBase(version);
  if (!imageUrls.length) throw new SocialError('instagram', 'Instagram needs at least one image.');
  if (imageUrls.length > IG_MAX_IMAGES) throw new SocialError('instagram', 'Instagram takes at most ten images in a carousel.');
  let creation;
  if (imageUrls.length === 1) {
    creation = (await graph(fetch, 'instagram', 'POST', G + '/' + igId + '/media', { image_url: imageUrls[0], caption: text, access_token: token })).id;
  } else {
    const kids = [];
    for (const url of imageUrls) {
      const id = (await graph(fetch, 'instagram', 'POST', G + '/' + igId + '/media', { image_url: url, is_carousel_item: 'true', access_token: token })).id;
      await waitFinished(fetch, G, id, token, wait);
      kids.push(id);
    }
    creation = (await graph(fetch, 'instagram', 'POST', G + '/' + igId + '/media', { media_type: 'CAROUSEL', children: kids.join(','), caption: text, access_token: token })).id;
  }
  await waitFinished(fetch, G, creation, token, wait);
  const pub = await graph(fetch, 'instagram', 'POST', G + '/' + igId + '/media_publish', { creation_id: creation, access_token: token });
  let url = '';
  try { url = (await graph(fetch, 'instagram', 'GET', G + '/' + pub.id, { fields: 'permalink', access_token: token })).permalink || ''; }
  catch (e) { /* the post is up; the link is a nicety */ }
  return { id: String(pub.id), url };
}

/* Reading, for Moments. Business Discovery returns the recent public posts of another
   Instagram business or creator account, by username, through the firm's own account.
   Personal and private accounts are not readable this way, by design. */
const HANDLE = /^[A-Za-z0-9._]{1,30}$/;
function asPost(m, username) {
  return { caption: String(m.caption || ''), link: m.permalink || '', published: m.timestamp || null, username: m.username || username || '', type: m.media_type || '' };
}
async function discover({ fetch, version, igId, token, username, limit }) {
  if (!HANDLE.test(username || '')) throw new SocialError('instagram', 'Not an Instagram username: ' + username);
  const G = graphBase(version);
  const j = await graph(fetch, 'instagram', 'GET', G + '/' + igId, {
    fields: 'business_discovery.username(' + username + '){username,media.limit(' + (limit || 8) + '){caption,permalink,timestamp,media_type}}',
    access_token: token
  });
  const bd = j.business_discovery || {};
  return ((bd.media && bd.media.data) || []).map((m) => asPost(m, bd.username || username));
}
/* Posts by other people that tag the firm's Instagram account. */
async function tagged({ fetch, version, igId, token, limit }) {
  const G = graphBase(version);
  const j = await graph(fetch, 'instagram', 'GET', G + '/' + igId + '/tags', { fields: 'caption,permalink,timestamp,username,media_type', limit: String(limit || 25), access_token: token });
  return (j.data || []).map((m) => asPost(m));
}

module.exports = { authUrl, exchange, publishFacebook, publishInstagram, discover, tagged, HANDLE, SCOPES, IG_MAX_TEXT, IG_MAX_TAGS, IG_MAX_IMAGES };
