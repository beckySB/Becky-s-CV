/* Saving finished videos and images to Google Drive.

   Sign in asks for one Drive permission, drive.file: the Studio can see and change only the
   files and folders it made itself, never the rest of the Drive. That scope is not one Google
   reviews, so the app needs no verification. openid and email are asked for only so the
   Connections screen can say whose Drive it is.

   Google gives a refresh token on the first consent (access_type=offline, prompt=consent).
   The Studio keeps it sealed and trades it for a one-hour access token whenever it uploads,
   so the connection does not run out the way LinkedIn's does.

   Uploads are resumable: one call opens an upload session, a second sends the bytes. That is
   the only kind Drive takes for files over 5 MB, and a video always is. */
'use strict';

const { SocialError } = require('./errors');

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];
const FOLDER = 'application/vnd.google-apps.folder';

function authUrl({ clientId, redirectUri, state }) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
    scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true'
  });
  return AUTH + '?' + q.toString();
}

async function readJson(r) {
  const t = await r.text();
  try { return t ? JSON.parse(t) : {}; } catch (e) { return { message: t.slice(0, 300) }; }
}

function fail(r, j, what) {
  const err = j && j.error;
  const msg = (err && (err.message || j.error_description || (typeof err === 'string' ? err : ''))) || (j && j.message) || ('HTTP ' + r.status);
  const reconnect = r.status === 401 || /invalid_grant|expired|revoked/i.test(msg);
  return new SocialError('google', what + ': ' + msg + (reconnect ? '. Reconnect Google Drive in Publishing, Connections.' : ''), { status: r.status, reconnect });
}

function form(fetch, body) {
  return fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
}

async function exchange({ fetch, clientId, clientSecret, redirectUri, code, now }) {
  const r = await form(fetch, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
  const j = await readJson(r);
  if (!r.ok || !j.access_token) throw fail(r, j, 'Google did not issue a token');
  const u = await fetch(API + '/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + j.access_token } });
  const me = await readJson(u);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || '',
    expiresAt: new Date((now || Date.now()) + (Number(j.expires_in) || 3600) * 1000).toISOString(),
    scope: j.scope || '',
    email: (u.ok && me.email) || 'your Google account'
  };
}

async function refresh({ fetch, clientId, clientSecret, refreshToken, now }) {
  const r = await form(fetch, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret });
  const j = await readJson(r);
  if (!r.ok || !j.access_token) throw fail(r, j, 'Google did not renew the connection');
  return { accessToken: j.access_token, expiresAt: new Date((now || Date.now()) + (Number(j.expires_in) || 3600) * 1000).toISOString() };
}

async function createFolder({ fetch, token, name, parentId }) {
  const body = { name, mimeType: FOLDER };
  if (parentId) body.parents = [parentId];
  const r = await fetch(API + '/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await readJson(r);
  if (!r.ok || !j.id) throw fail(r, j, 'Google Drive did not make the folder');
  return { id: j.id, name: j.name, link: j.webViewLink || 'https://drive.google.com/drive/folders/' + j.id };
}

/* True while the folder is still there and not in the trash. */
async function folderExists({ fetch, token, id }) {
  const r = await fetch(API + '/drive/v3/files/' + encodeURIComponent(id) + '?fields=id,trashed', { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 404) return false;
  const j = await readJson(r);
  if (!r.ok) throw fail(r, j, 'Google Drive could not be read');
  return !j.trashed;
}

async function upload({ fetch, token, name, mimeType, bytes, parentId }) {
  const start = await fetch(API + '/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,size', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(bytes.length) },
    body: JSON.stringify(parentId ? { name, parents: [parentId] } : { name })
  });
  if (!start.ok) throw fail(start, await readJson(start), 'Google Drive did not start the upload');
  const session = start.headers.get('location');
  if (!session) throw new SocialError('google', 'Google Drive did not start the upload: no upload address came back.');
  const put = await fetch(session, { method: 'PUT', headers: { 'Content-Type': mimeType, 'Content-Length': String(bytes.length) }, body: bytes });
  const j = await readJson(put);
  if (!put.ok || !j.id) throw fail(put, j, 'Google Drive did not take the file');
  return { id: j.id, name: j.name, link: j.webViewLink || 'https://drive.google.com/file/d/' + j.id + '/view', bytes: bytes.length };
}

module.exports = { authUrl, exchange, refresh, createFolder, folderExists, upload, SCOPES };
