// Tiny JSON-file data store. On Railway, mount a Volume and set DATA_DIR
// (e.g. /data) so profiles, shout-outs and photos survive redeploys.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const empty = () => ({ members: [], shoutouts: [], inquiries: [] });

function load() {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

let db = load();

function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const id = () => crypto.randomBytes(8).toString('hex');

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  list(kind) {
    return [...db[kind]];
  },
  get(kind, itemId) {
    return db[kind].find((x) => x.id === itemId);
  },
  add(kind, item) {
    const record = { id: id(), createdAt: new Date().toISOString(), ...item };
    db[kind].push(record);
    save();
    return record;
  },
  update(kind, itemId, fields) {
    const rec = db[kind].find((x) => x.id === itemId);
    if (!rec) return null;
    Object.assign(rec, fields, { updatedAt: new Date().toISOString() });
    save();
    return rec;
  },
  remove(kind, itemId) {
    const rec = db[kind].find((x) => x.id === itemId);
    db[kind] = db[kind].filter((x) => x.id !== itemId);
    save();
    return rec;
  },
};
