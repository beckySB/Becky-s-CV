const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const store = require('./lib/store');
const views = require('./lib/views');

const PORT = process.env.PORT || 3000;
const PORTAL_CODE = String(process.env.PORTAL_CODE || '1011222').replace(/\s/g, '');
const SECRET =
  process.env.SESSION_SECRET || crypto.createHash('sha256').update(`10kb2b:${PORTAL_CODE}`).digest('hex');
const COOKIE = 'tenk_member';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser(SECRET));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
app.use('/uploads', express.static(store.UPLOAD_DIR, { maxAge: '30d' }));

app.use((req, res, next) => {
  req.authed = req.signedCookies[COOKIE] === 'member';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/* ---------- helpers ---------- */
const clean = (v, max = 3000) => String(v ?? '').trim().slice(0, max);

function codeMatches(input) {
  const a = Buffer.from(String(input || '').replace(/\s/g, ''));
  const b = Buffer.from(PORTAL_CODE);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function grantAccess(req, res) {
  res.cookie(COOKIE, 'member', {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

// Simple in-memory rate limit for access-code attempts.
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const rec = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(ip, rec);
  return rec.length >= 10;
}
const recordFailure = (ip) => attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);

const requireMember = (req, res, next) =>
  req.authed ? next() : res.redirect(`/portal?next=${encodeURIComponent(req.originalUrl)}`);

const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/portal');

const upload = multer({
  storage: multer.diskStorage({
    destination: store.UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype];
      cb(null, crypto.randomBytes(12).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

function removeUpload(filename) {
  if (!filename) return;
  const p = path.join(store.UPLOAD_DIR, path.basename(filename));
  fs.promises.unlink(p).catch(() => {});
}

const PROFILE_FIELDS = {
  name: 120, title: 120, business: 160, industry: 80, bio: 3000, services: 300,
  publicEmail: 160, publicPhone: 40, website: 200, linkedin: 200, instagram: 200,
  privatePhone: 40, privateEmail: 160, privateNotes: 300,
};
const profileFrom = (body) =>
  Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([k, max]) => [k, clean(body[k], max)]));

/* ---------- public pages ---------- */
app.get('/healthz', (req, res) => res.send('ok'));

app.get('/', (req, res) =>
  res.send(views.home({ members: store.list('members'), shoutouts: store.list('shoutouts'), authed: req.authed }))
);

app.get('/about', (req, res) => res.send(views.about({ authed: req.authed, sent: 'sent' in req.query })));

app.post('/inquire', (req, res) => {
  if (req.body.website_confirm) return res.redirect('/about?sent#visit'); // honeypot
  const q = {
    name: clean(req.body.name, 120),
    business: clean(req.body.business, 160),
    email: clean(req.body.email, 160),
    phone: clean(req.body.phone, 40),
    industry: clean(req.body.industry, 120),
    message: clean(req.body.message, 2000),
  };
  if (q.name && q.email && q.business) store.add('inquiries', q);
  res.redirect('/about?sent#visit');
});

app.get('/members', (req, res) =>
  res.send(views.directory({ members: store.list('members'), authed: req.authed }))
);

/* ---------- member profiles (members only to add/edit) ---------- */
app.get('/members/new', requireMember, (req, res) => res.send(views.profileForm({ authed: true })));

function handleUpload(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err) req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 4 MB or smaller.' : 'Photo upload failed.';
    next();
  });
}

app.post('/members/new', requireMember, handleUpload, (req, res) => {
  const data = profileFrom(req.body);
  if (req.uploadError || !data.name || !data.business) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).send(
      views.profileForm({ member: data, authed: true, error: req.uploadError || 'Name and business are required.' })
    );
  }
  const rec = store.add('members', { ...data, photo: req.file ? req.file.filename : '' });
  res.redirect(`/members#m-${rec.id}`);
});

app.get('/members/:id/edit', requireMember, (req, res) => {
  const member = store.get('members', req.params.id);
  if (!member) return res.status(404).send(views.notFound({ authed: true }));
  res.send(views.profileForm({ member, authed: true }));
});

app.post('/members/:id/edit', requireMember, handleUpload, (req, res) => {
  const member = store.get('members', req.params.id);
  if (!member) return res.status(404).send(views.notFound({ authed: true }));
  const data = profileFrom(req.body);
  if (req.uploadError || !data.name || !data.business) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).send(
      views.profileForm({ member: { ...member, ...data }, authed: true, error: req.uploadError || 'Name and business are required.' })
    );
  }
  let photo = member.photo;
  if (req.file || req.body.removePhoto) {
    removeUpload(member.photo);
    photo = req.file ? req.file.filename : '';
  }
  store.update('members', member.id, { ...data, photo });
  res.redirect(`/members#m-${member.id}`);
});

app.post('/members/:id/delete', requireMember, (req, res) => {
  const rec = store.remove('members', req.params.id);
  if (rec) removeUpload(rec.photo);
  res.redirect('/portal');
});

/* ---------- shout-outs ---------- */
app.get('/shoutouts', (req, res) =>
  res.send(
    views.shoutouts({
      shoutouts: store.list('shoutouts'),
      members: store.list('members'),
      authed: req.authed,
      posted: 'posted' in req.query,
    })
  )
);

app.post('/shoutouts', (req, res) => {
  if (!req.authed) {
    if (tooManyAttempts(req.ip)) return res.status(429).send(views.gate({ error: 'Too many attempts. Please try again in 15 minutes.' }));
    if (!codeMatches(req.body.code)) {
      recordFailure(req.ip);
      return res.status(403).send(views.gate({ error: 'That access code was not recognized. Sign in, then post your shout-out.', next: '/shoutouts#post' }));
    }
    grantAccess(req, res);
  }
  const type = ['event', 'testimonial', 'shoutout'].includes(req.body.type) ? req.body.type : 'shoutout';
  const s = {
    type,
    author: clean(req.body.author, 120),
    title: clean(req.body.title, 140),
    message: clean(req.body.message, 3000),
    memberId: store.get('members', req.body.memberId) ? req.body.memberId : '',
    link: clean(req.body.link, 300),
    eventDate: type === 'event' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.eventDate) ? req.body.eventDate : '',
    eventLocation: type === 'event' ? clean(req.body.eventLocation, 160) : '',
  };
  if (s.author && s.title && s.message) store.add('shoutouts', s);
  res.redirect('/shoutouts?posted');
});

app.post('/shoutouts/:id/delete', requireMember, (req, res) => {
  store.remove('shoutouts', req.params.id);
  res.redirect('/shoutouts');
});

/* ---------- member portal ---------- */
app.get('/portal', (req, res) => {
  if (!req.authed) return res.send(views.gate({ next: safeNext(req.query.next) }));
  res.send(
    views.portal({
      members: store.list('members'),
      inquiries: store.list('inquiries'),
      shoutouts: store.list('shoutouts'),
    })
  );
});

app.post('/portal/login', (req, res) => {
  const next = safeNext(req.body.next);
  if (tooManyAttempts(req.ip)) return res.status(429).send(views.gate({ error: 'Too many attempts. Please try again in 15 minutes.', next }));
  if (!codeMatches(req.body.code)) {
    recordFailure(req.ip);
    return res.status(403).send(views.gate({ error: 'That access code was not recognized.', next }));
  }
  grantAccess(req, res);
  res.redirect(next);
});

app.post('/portal/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.redirect('/');
});

app.post('/portal/inquiries/:id/delete', requireMember, (req, res) => {
  store.remove('inquiries', req.params.id);
  res.redirect('/portal');
});

app.get('/portal/roster.csv', requireMember, (req, res) => {
  const cols = ['name', 'title', 'business', 'industry', 'publicEmail', 'publicPhone', 'privateEmail', 'privatePhone', 'website', 'linkedin', 'instagram', 'services'];
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // guard against spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = store
    .list('members')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => cols.map((c) => cell(m[c])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="10kb2b-roster.csv"');
  res.send([cols.join(','), ...rows].join('\n'));
});

app.use((req, res) => res.status(404).send(views.notFound({ authed: req.authed })));

app.listen(PORT, () => {
  console.log(`10kB2B site running on port ${PORT} (data dir: ${store.DATA_DIR})`);
  if (!process.env.PORTAL_CODE) console.log('PORTAL_CODE not set — using the default member access code.');
});
