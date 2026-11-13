/* Where publishing keeps its state: the queue, the publish log, the platform connections
   (tokens sealed with SOCIAL_TOKEN_KEY), and the finished images.

   One JSON file and one folder of JPEGs under DATA_DIR. On Railway that folder must be a
   volume, or every deploy starts the queue empty. The file is written whole to a temporary
   name and renamed over the old one, so a crash mid-write leaves the last good copy. */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sealer(secret) {
  if (!secret) return null;
  const key = crypto.createHash('sha256').update('www-social-tokens:' + secret).digest();
  return {
    seal(text) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
      return 'v1:' + [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join(':');
    },
    open(sealed) {
      const parts = String(sealed || '').split(':');
      if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('not a sealed token');
      const [iv, tag, ct] = parts.slice(1).map((p) => Buffer.from(p, 'base64'));
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    }
  };
}

function createStore(dir) {
  const root = path.join(dir, 'social');
  const media = path.join(root, 'media');
  fs.mkdirSync(media, { recursive: true });
  const file = path.join(root, 'state.json');
  const fresh = () => ({ version: 1, posts: [], log: [], connections: {} });
  let state = fresh();
  try {
    state = Object.assign(fresh(), JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      /* Keep the unreadable file for a person to look at, and start clean rather than
         crash-looping the whole site over it. */
      const aside = file + '.unreadable-' + Date.now();
      try { fs.renameSync(file, aside); } catch (x) { /* nothing to move */ }
      console.error('publishing state was unreadable, moved to ' + aside + ':', e.message);
    }
  }

  function save() {
    const tmp = file + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
    fs.renameSync(tmp, file);
  }

  function imagePath(id) {
    if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('bad image id');
    return path.join(media, id + '.jpg');
  }

  return {
    dir: root,
    get state() { return state; },
    save,
    putImage(buf, meta) {
      const id = crypto.randomBytes(12).toString('hex');
      fs.writeFileSync(imagePath(id), buf);
      return Object.assign({
        id,
        token: crypto.randomBytes(24).toString('hex'),
        bytes: buf.length,
        sha256: crypto.createHash('sha256').update(buf).digest('hex')
      }, meta || {});
    },
    readImage(id) { return fs.readFileSync(imagePath(id)); },
    removeImage(id) { try { fs.unlinkSync(imagePath(id)); } catch (e) { /* already gone */ } }
  };
}

module.exports = { createStore, sealer };
