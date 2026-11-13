/* Moments: notice when something big happens to the people who matter most to the firm,
   and say how to respond.

   Once a day it reads the news for each name on a short watch list: a Google News search
   per person and company, and the local business press. What it finds is sorted into the
   moments in data/moments.json (an award, a new role, a big contract, a sale, a loss), each
   with its own response by tier, what to say, what never to say, and the planning question
   it opens for later.

   What it keeps: the watch list (a name, a company, a city, the kind of relationship and a
   tier; nothing about anyone's money) and what it found, for 180 days. Redtail stays the
   record of what was done.

   With ANTHROPIC_API_KEY set, Claude reads each find to say whether it is really about this
   person, which moment it is, and the one specific detail a note should name; and drafts
   the note on request. Without it, keywords do the sorting and the playbook's lines do the
   writing. */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const feeds = require('./feeds');

const MODEL = 'claude-opus-5-5';
const AUDIENCES = ['tier1', 'tier2', 'tier3', 'coi', 'prospect'];
const STATUSES = ['new', 'done', 'dismissed', 'notthem'];
/* Sad or risky news wins any tie: calling a loss a celebration is the worst mistake this
   could make, and a missed celebration is the cheapest. */
const FIRST = ['loss', 'trouble', 'hardship', 'sale'];
const KEEP_DAYS = 180;
const MAX_CONTACTS = 250;

function jsonFile(file, fresh) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let state = fresh();
  try { state = Object.assign(fresh(), JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch (e) {
    if (e.code !== 'ENOENT') {
      const aside = file + '.unreadable-' + Date.now();
      try { fs.renameSync(file, aside); } catch (x) { /* nothing to move */ }
      console.error('moments state was unreadable, moved to ' + aside + ':', e.message);
    }
  }
  return {
    get state() { return state; },
    save() { const tmp = file + '.tmp-' + process.pid; fs.writeFileSync(tmp, JSON.stringify(state, null, 1)); fs.renameSync(tmp, file); }
  };
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 20);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function mentions(text, phrase) {
  const p = norm(phrase);
  if (p.length < 3) return false;
  return new RegExp('(^|[^a-z0-9])' + esc(p) + '([^a-z0-9]|$)').test(norm(text));
}
/* Google News titles end in " - Publisher". */
function splitTitle(t) {
  const m = /^(.*\S)\s+[-–—]\s+([^-–—]{2,80})$/.exec(String(t || ''));
  return m ? { title: m[1], source: m[2] } : { title: String(t || ''), source: '' };
}

/* Fill a playbook line with what is known; leave a plain bracket where nothing is. */
function fillLine(line, v) {
  return String(line).replace(/\{\{(\w+)\}\}/g, (_, k) => (v && v[k]) ? v[k] : ({ source: 'the news', company: '[their company]', detail: '[the detail]', years: '[years]' }[k] || '[' + k + ']'));
}

function classify(text, playbook) {
  const t = norm(text);
  const hits = (m) => m.signals.filter((s) => new RegExp('(^|[^a-z0-9])' + esc(norm(s))).test(t)).length;
  for (const id of FIRST) {
    const m = playbook.find((x) => x.id === id);
    if (m && hits(m) > 0) return id;
  }
  let best = 'mention', score = 0;
  playbook.forEach((m) => { if (FIRST.indexOf(m.id) >= 0 || m.id === 'mention') return; const h = hits(m); if (h > score) { score = h; best = m.id; } });
  return best;
}

function cleanContact(given, existing) {
  /* An update changes only the fields it carries. */
  const c = Object.assign({}, existing || {});
  Object.keys(given || {}).forEach((k) => { if (given[k] !== undefined) c[k] = given[k]; });
  const s = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const out = {
    id: (existing && existing.id) || (c.id && /^[a-f0-9]{12}$/.test(c.id) ? c.id : crypto.randomBytes(6).toString('hex')),
    name: s(c.name, 120),
    company: s(c.company, 160),
    city: s(c.city, 80),
    also: (Array.isArray(c.also) ? c.also : String(c.also || '').split(/[;|]/)).map((x) => s(x, 120)).filter((x) => x.length >= 3).slice(0, 4),
    audience: AUDIENCES.indexOf(c.audience) >= 0 ? c.audience : 'tier1',
    watchCompany: c.watchCompany === true || c.watchCompany === 'true' || c.watchCompany === 'yes',
    /* A business or creator Instagram account: read through the firm's own connected account. */
    instagram: (/^[A-Za-z0-9._]{1,30}$/.test(String(c.instagram || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, ''))
      ? String(c.instagram).trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '').toLowerCase() : ''),
    addedAt: (existing && existing.addedAt) || new Date().toISOString()
  };
  if (out.name.length < 3 || !/\s/.test(out.name)) throw Object.assign(new Error('Each person needs a first and last name.'), { status: 400 });
  return out;
}

function createMoments(opts) {
  const env = opts.env || process.env;
  const playbookData = opts.playbook;
  const playbook = playbookData.moments;
  const occasions = (opts.occasions || []);
  const fetchFn = opts.fetch || global.fetch;
  const now = opts.now || (() => Date.now());
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const dir = env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || path.join(opts.root, '.data');
  const db = jsonFile(path.join(dir, 'moments', 'state.json'), () => ({ version: 1, contacts: [], alerts: [], seen: {}, lastScan: null, scans: [] }));
  const S = () => db.state;
  const cfg = {
    gated: !!env.SITE_PASSWORD || env.MOMENTS_ALLOW_OPEN === '1',
    search: env.MOMENTS_SEARCH !== 'off',
    hasKey: !!env.ANTHROPIC_API_KEY,
    persistent: !!(env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH),
    timezone: 'America/Chicago',
    scanHour: Number(env.MOMENTS_SCAN_HOUR) || 6,
    delayMs: env.MOMENTS_DELAY_MS != null ? Number(env.MOMENTS_DELAY_MS) : 1200
  };
  /* Instagram, when the firm's account is connected in Publishing. */
  const instagram = opts.instagram || (() => null);
  let client = opts.client || null;
  function claude() {
    if (client) return client;
    if (!cfg.hasKey) return null;
    const m = require('@anthropic-ai/sdk');
    client = new (m.default || m)();
    return client;
  }
  let jsonFormat = opts.format || null;
  function format(schema) {
    if (opts.format) return opts.format;
    if (!jsonFormat) { try { jsonFormat = require('@anthropic-ai/sdk/helpers/json-schema').jsonSchemaOutputFormat; } catch (e) { jsonFormat = (s) => ({ type: 'json_schema', schema: s }); } }
    return jsonFormat(schema);
  }
  let scanning = false;

  /* ---------- the watch list ---------- */

  function contacts() { return S().contacts.slice().sort((a, b) => a.name.localeCompare(b.name)); }
  function upsert(list) {
    if (!Array.isArray(list) || !list.length) throw Object.assign(new Error('Nothing to add.'), { status: 400 });
    const added = [];
    list.forEach((c) => {
      const prev = S().contacts.find((x) => (c.id && x.id === c.id) || (norm(x.name) === norm(c.name) && norm(x.company) === norm(c.company)));
      const clean = cleanContact(c, prev);
      if (prev) Object.assign(prev, clean); else {
        if (S().contacts.length >= MAX_CONTACTS) throw Object.assign(new Error('The watch list holds ' + MAX_CONTACTS + ' people at most. Keep it to the people who matter most.'), { status: 400 });
        S().contacts.push(clean);
      }
      added.push(clean);
    });
    db.save();
    return added;
  }
  function remove(id) {
    S().contacts = S().contacts.filter((c) => c.id !== id);
    S().alerts = S().alerts.filter((a) => !(a.contactId === id && a.status === 'new'));
    db.save();
  }

  /* ---------- reading the news ---------- */

  function queries(c) {
    if (!cfg.search) return [];
    const q = (s) => 'https://news.google.com/rss/search?' + new URLSearchParams({ q: s + ' when:14d', hl: 'en-US', gl: 'US', ceid: 'US:en' }).toString();
    const ctx = [c.company, c.city].filter(Boolean).map((x) => '"' + x + '"');
    const out = [{ url: q('"' + c.name + '"' + (ctx.length ? ' (' + ctx.concat(['Louisiana']).join(' OR ') + ')' : '')), via: 'person' }];
    if (c.watchCompany && c.company) out.push({ url: q('"' + c.company + '"'), via: 'company' });
    c.also.forEach((a) => out.push({ url: q('"' + a + '"' + (c.city ? ' "' + c.city + '"' : '')), via: 'also' }));
    return out;
  }

  async function read(url) {
    const r = await fetchFn(url, { headers: { 'User-Agent': 'WWW-Studio/1.0 (news reader)', Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const xml = await r.text();
    return feeds.parseRss(xml).map((it, i) => {
      const src = (xml.match(/<item>[\s\S]*?<\/item>/g) || [])[i] || '';
      const named = (src.match(/<source[^>]*>([^<]*)<\/source>/) || [])[1] || '';
      const t = splitTitle(it.title);
      return Object.assign(it, { title: t.title, source: feeds.text(named) || t.source });
    });
  }

  function candidate(c, it, via, sourceName) {
    const text = it.title + ' ' + (it.summary || '');
    const strength = (via === 'instagram' || via === 'tagged') ? 'own'
      : mentions(text, c.name) ? 'name'
      : (c.company && mentions(text, c.company)) ? 'company'
      : c.also.some((a) => mentions(text, a)) ? 'also'
      : via === 'local' ? null : 'search';
    if (!strength) return null;
    return { contact: c, title: it.title, link: it.link, source: it.source || sourceName || '', published: it.published || null, summary: it.summary || '', via, strength };
  }
  function postItem(p) {
    const cap = String(p.caption || '').replace(/\s+/g, ' ').trim();
    const first = cap.split(/(?<=[.!?])\s/)[0] || cap;
    return { title: (first.length > 140 ? first.slice(0, 137) + '...' : first) || '(a post with no caption)', link: p.link, published: p.published, summary: cap.slice(0, 600), source: 'Instagram @' + p.username };
  }

  async function triage(cands) {
    const cl = claude();
    if (!cl || !cands.length) return null;
    const ids = playbook.map((m) => m.id);
    const schema = {
      type: 'object', additionalProperties: false, required: ['items'],
      properties: { items: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['i', 'aboutThem', 'moment', 'summary', 'detail'],
        properties: {
          i: { type: 'integer' },
          aboutThem: { type: 'string', enum: ['yes', 'no', 'unsure'] },
          moment: { type: 'string', enum: ids },
          summary: { type: 'string', description: 'One plain sentence: what happened to this person or their company.' },
          detail: { type: 'string', description: 'The one specific thing a congratulations or condolence note would name, in a few words. Empty if none.' }
        } } } }
    };
    const list = playbook.map((m) => '- ' + m.id + ': ' + m.name).join('\n');
    const items = cands.map((c, i) => [
      'Item ' + i,
      'Person: ' + c.contact.name + (c.contact.company ? ', ' + c.contact.company : '') + (c.contact.city ? ', ' + c.contact.city : ''),
      'Headline: ' + c.title,
      'Source: ' + (c.source || 'unknown') + (c.published ? ', ' + c.published.slice(0, 10) : ''),
      (c.via === 'instagram' ? 'This is a post from their own Instagram account.\n' : c.via === 'tagged' ? 'This is an Instagram post by them that tags the firm.\n' : '') +
      'Snippet: ' + (c.summary || '(none)')
    ].join('\n')).join('\n\n');
    const msg = await cl.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: format(schema) },
      system: [{ type: 'text', cache_control: { type: 'ephemeral' }, text: [
        'You sort news items for a financial planner who wants to notice when something big happens to clients, centers of influence and prospects, so she can congratulate or support them.',
        'For each item decide:',
        '- aboutThem: "yes" only if the item is plainly about this person or their company; "no" if it is about someone else with the same name, or only mentions them in passing; "unsure" if you cannot tell from the headline and snippet.',
        '- moment: which of these it is. When an item is sad or risky (a death, a lawsuit, layoffs, a disaster, a sale not yet announced by them), choose that moment even if the item is also positive. Use "mention" when nothing else fits.',
        list,
        '- summary: one plain sentence.',
        '- detail: the one specific thing a note would name, such as "the Port of New Orleans contract" or "the CityBusiness Women of the Year honor". Never a dollar figure.',
        '- Posts from their own accounts: everyday posts (a sale, a menu, a product, a holiday greeting, a job listing) are "mention". Only real news about them, their family or their company counts as anything else.',
        '- A post that tags the firm is "tagged" unless it is bigger news, such as an opening.',
        'Use only what the headline and snippet say. Do not guess.'
      ].join('\n') }],
      messages: [{ role: 'user', content: items }]
    });
    if (msg.stop_reason === 'refusal') return null;
    const out = msg.parsed_output || (() => { try { return JSON.parse((msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch (e) { return null; } })();
    return out && Array.isArray(out.items) ? out.items : null;
  }

  async function scan(why) {
    if (scanning) return { started: false, reason: 'A scan is already running.' };
    if (!cfg.gated) return { started: false, reason: 'Moments is off until SITE_PASSWORD is set.' };
    scanning = true;
    const log = { at: new Date(now()).toISOString(), why: why || 'scheduled', queries: 0, feeds: 0, candidates: 0, alerts: 0, errors: [], failed: 0, triage: 'keywords' };
    try {
      const people = S().contacts.slice();
      const found = [];
      const seenNow = new Set();
      const add = (cand) => {
        if (!cand) return;
        const key = hash(cand.contact.id + '|' + norm(cand.title));
        if (S().seen[key] || seenNow.has(key)) return;
        if (cand.published && Date.parse(cand.published) < now() - 21 * 86400000) return;
        seenNow.add(key);
        found.push(Object.assign(cand, { key }));
      };
      for (const c of people) {
        for (const q of queries(c)) {
          log.queries++;
          try { (await read(q.url)).forEach((it) => add(candidate(c, it, q.via))); }
          catch (e) { log.failed++; if (log.errors.length < 8) log.errors.push(c.name + ': ' + (e.cause && e.cause.code ? e.cause.code : e.message)); }
          if (cfg.delayMs) await sleep(cfg.delayMs);
        }
      }
      const ig = (() => { try { return instagram(); } catch (e) { return null; } })();
      log.instagram = ig ? 0 : null;
      if (ig) {
        for (const c of people.filter((x) => x.instagram)) {
          log.instagram++;
          try { (await ig.discover(c.instagram)).forEach((p) => add(candidate(c, postItem(p), 'instagram'))); }
          catch (e) { log.failed++; if (log.errors.length < 8) log.errors.push('Instagram @' + c.instagram + ': ' + e.message); }
          if (cfg.delayMs) await sleep(cfg.delayMs);
        }
        log.instagram++;
        try {
          (await ig.tagged()).forEach((p) => {
            const u = String(p.username || '').toLowerCase();
            const c = people.find((x) => x.instagram && x.instagram === u) ||
              { id: 'tag-' + u, name: '@' + (p.username || 'someone'), company: '', city: '', also: [], audience: 'prospect', instagram: u };
            add(candidate(c, postItem(p), 'tagged'));
          });
        } catch (e) { log.failed++; if (log.errors.length < 8) log.errors.push('Instagram tags: ' + e.message); }
      }
      for (const f of (playbookData.localFeeds || [])) {
        log.feeds++;
        try {
          const items = await read(f.url);
          items.forEach((it) => people.forEach((c) => add(candidate(c, it, 'local', f.name))));
        } catch (e) { log.failed++; if (log.errors.length < 8) log.errors.push(f.name + ': ' + (e.cause && e.cause.code ? e.cause.code : e.message)); }
      }
      log.candidates = found.length;

      let verdicts = null;
      try {
        if (found.length) verdicts = await triage(found.slice(0, 40));
        if (verdicts) log.triage = 'claude';
      } catch (e) { log.errors.push('Claude could not sort the finds (' + (e.message || e) + '); keywords sorted them instead.'); }

      found.forEach((c, i) => {
        S().seen[c.key] = now();
        const v = verdicts ? verdicts.find((x) => x.i === i) : null;
        if (v && v.aboutThem === 'no') return;
        if (!v && c.strength === 'search' && verdicts) return;
        let moment = v && playbook.some((m) => m.id === v.moment) ? v.moment : classify(c.title + ' ' + c.summary, playbook);
        if (c.via === 'tagged' && moment === 'mention') moment = 'tagged';
        /* Their own feed is mostly everyday posts. Only news makes an alert. */
        if (c.via === 'instagram' && (moment === 'mention' || moment === 'tagged')) return;
        S().alerts.push({
          id: crypto.randomBytes(6).toString('hex'),
          contactId: c.contact.id, via: c.via,
          contact: { name: c.contact.name, company: c.contact.company, audience: c.contact.audience },
          moment, title: c.title, link: c.link, source: c.source, published: c.published, summary: c.summary.slice(0, 400),
          detail: v ? String(v.detail || '').slice(0, 200) : '',
          gist: v ? String(v.summary || '').slice(0, 300) : '',
          sure: c.strength === 'own' ? 'yes' : v ? v.aboutThem : (c.strength === 'name' ? 'likely' : 'unsure'),
          sortedBy: v ? 'claude' : 'keywords',
          status: 'new', foundAt: new Date(now()).toISOString()
        });
        log.alerts++;
      });
      const cutoff = now() - KEEP_DAYS * 86400000;
      S().alerts = S().alerts.filter((a) => a.status === 'new' || Date.parse(a.foundAt) > cutoff);
      Object.keys(S().seen).forEach((k) => { if (S().seen[k] < cutoff) delete S().seen[k]; });
      /* Nothing could be read at all: try again in an hour rather than tomorrow. */
      const total = log.queries + log.feeds + (log.instagram || 0);
      if (total && log.failed === total) S().retryAt = now() + 3600000;
      else { S().lastScan = log.at; S().retryAt = null; }
      S().scans = [log].concat(S().scans || []).slice(0, 20);
      db.save();
      return { started: true, log };
    } finally { scanning = false; }
  }

  /* ---------- alerts ---------- */

  function alerts() {
    const order = { new: 0, done: 1, dismissed: 2, notthem: 3 };
    return S().alerts.slice().sort((a, b) => (order[a.status] - order[b.status]) || (Date.parse(b.foundAt) - Date.parse(a.foundAt)));
  }
  function act(id, action, body) {
    const a = S().alerts.find((x) => x.id === id);
    if (!a) throw Object.assign(new Error('That alert is gone.'), { status: 404 });
    const map = { done: 'done', dismiss: 'dismissed', notthem: 'notthem', reopen: 'new' };
    if (!map[action]) throw Object.assign(new Error('Unknown action.'), { status: 404 });
    a.status = map[action];
    a.handledAt = action === 'reopen' ? null : new Date(now()).toISOString();
    a.handled = action === 'done' ? String((body || {}).what || '').slice(0, 200) : '';
    db.save();
    return a;
  }

  /* ---------- writing the response ---------- */

  const NOTE_SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['note', 'callOpener', 'comment', 'gift', 'door', 'cautions'],
    properties: {
      note: { type: 'string', description: 'The handwritten note, ready to copy onto a card. Greeting, two to four short sentences, sign off.' },
      callOpener: { type: 'string', description: 'The first two sentences of a phone call or voicemail. Empty if the playbook does not call for a call.' },
      comment: { type: 'string', description: 'A public LinkedIn comment of one or two sentences, or empty when a public response is not appropriate.' },
      gift: { type: 'string', description: 'The gesture or gift, fitted to the specifics, within the playbook and the gift ceiling. Empty if none.' },
      door: { type: 'string', description: 'The planning question this opens, phrased as a question to ask at the next scheduled meeting. Never advice.' },
      cautions: { type: 'array', items: { type: 'string' }, description: 'What to check before sending.' }
    }
  };

  async function draft(input) {
    let a = null, contact, momentId, detail, article;
    if (input.alertId) {
      a = S().alerts.find((x) => x.id === input.alertId);
      if (!a) throw Object.assign(new Error('That alert is gone.'), { status: 404 });
      contact = a.contact; momentId = a.moment; detail = a.detail;
      article = { title: a.title, source: a.source, summary: a.gist || a.summary, published: a.published };
    } else {
      /* Logged by hand: nothing about it is stored. */
      const s = (v, n) => String(v == null ? '' : v).slice(0, n);
      contact = { name: s(input.name, 120), company: s(input.company, 160), audience: AUDIENCES.indexOf(input.audience) >= 0 ? input.audience : 'tier1' };
      momentId = s(input.moment, 40); detail = s(input.detail, 400); article = null;
      /* Seen on their own public post, pasted or screenshotted into Log one. */
      if (input.seen === 'post') article = { post: true, title: s(input.summary, 400), source: s(input.platform, 40) || 'their social media', summary: s(input.postText, 1500) };
    }
    const m = playbook.find((x) => x.id === momentId);
    if (!m) throw Object.assign(new Error('Unknown moment.'), { status: 400 });
    if (!contact.name) throw Object.assign(new Error('Say who it is for.'), { status: 400 });
    const occ = m.occasion ? occasions.find((o) => o.id === m.occasion) : null;
    const cl = claude();
    if (!cl) throw Object.assign(new Error('Drafting needs ANTHROPIC_API_KEY in Railway. The playbook lines above work without it.'), { status: 503 });

    const audienceName = (playbookData.audiences.find((x) => x.id === contact.audience) || {}).name || contact.audience;
    const brief = [
      'Who: ' + contact.name + (contact.company ? ', ' + contact.company : '') + '. Relationship: ' + audienceName + '.',
      'The moment: ' + m.name + '. Sensitivity: ' + m.sensitivity + '. Public response appropriate: ' + (m.publicResponse ? 'yes' : 'no') + '.',
      'What to do for this relationship: ' + m.respond[contact.audience],
      'Timing: ' + m.timing,
      'Gift guidance: ' + (m.gift || 'none') + (occ ? ' Occasion gift: ' + occ.gift + ', ceiling ' + occ.ceiling + '.' : ''),
      settings().giftLimit != null ? 'THE FIRM\'S GIFT LIMIT: $' + settings().giftLimit + ' per gift, engraving, framing and shipping included. This overrides every ceiling above. If the playbook gift would cost more, suggest a version that fits under it, or the note alone, and say which.' : '',
      'Lines in the house voice (adapt; a bracket means the fact is not known, so write around it): ' + m.say.map((l) => fillLine(l, { detail, company: contact.company, source: article && !article.post ? article.source : '' })).join(' / '),
      'Never: ' + m.avoid.join(' / '),
      'The planning question for later: ' + m.door,
      occ && occ.note ? 'The firm\'s template for this occasion, to adapt rather than copy:\n' + occ.note : '',
      article && article.post ? 'Seen on their own public post on ' + article.source + '. It is public and they shared it themselves, so it is fine to say you saw it and to congratulate them on it. What it says: ' + (article.title || '') + (article.summary ? ' The post: ' + article.summary : '')
        : article ? 'What was published: "' + article.title + '"' + (article.source ? ' (' + article.source + (article.published ? ', ' + article.published.slice(0, 10) : '') + ')' : '') + '. ' + (article.summary || '')
        : 'This was heard in person, not published. Do not refer to any article or post.',
      detail ? 'The specific detail to name: ' + detail : '',
      input.extra ? 'From the advisor: ' + String(input.extra).slice(0, 600) : ''
    ].filter(Boolean).join('\n');

    const msg = await cl.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: format(NOTE_SCHEMA) },
      system: [{ type: 'text', cache_control: { type: 'ephemeral' }, text: [
        'You write the personal response the hosts of Women Worth & Wealth send when something big happens to someone in the program\'s world: a participant, a sponsor or partner, or a woman who has shown interest.',
        'Write as Becky, in the first person, unless the details name Amy. Warm, specific, brief. It must read as a person who noticed, never as a firm that monitors.',
        '',
        'THE BRAND VOICE. Follow it exactly. This is client correspondence: no contractions.',
        String(input.voiceBrief || '').slice(0, 24000),
        '',
        'RULES',
        '- Nothing in a note, call or comment is advice. No mention of accounts, money, investments, insurance, taxes, fees or the firm\'s services. The planning question goes in "door", for a later meeting, and never in the note.',
        '- For a prospect or a center of influence, congratulations are the whole message. No meeting request.',
        '- For sad or sensitive news, never say how it was learned, never comment publicly, and keep it short.',
        '- If the item was published and is good news, it is fine to name where it was seen.',
        '- Use only the facts given. Never invent a detail, a name, a number or a quote. If a detail is missing, write around it.',
        '- No dollar figures. No exclamation marks. One question mark at most.',
        '- Gifts must fit the gift guidance and the ceiling given, and the firm\'s gift limit when one is stated, with an honest rough cost; say to log it in Redtail.',
        '- For a child or grandchild, the note goes to the parent or grandparent. The one exception is an achievement note, which is addressed to the young person and passed on by the parent. Never anything about money to or about a child.'
      ].join('\n') }],
      messages: [{ role: 'user', content: brief }]
    });
    if (msg.stop_reason === 'refusal') throw Object.assign(new Error('The model declined this one. Use the playbook lines.'), { status: 422 });
    const out = msg.parsed_output;
    if (!out) throw Object.assign(new Error('The draft did not come back in the expected shape. Try again.'), { status: 502 });
    if (!m.publicResponse) out.comment = '';
    const u = msg.usage || {};
    return { model: msg.model || MODEL, result: out, usage: { input: u.input_tokens || 0, output: u.output_tokens || 0 } };
  }

  /* ---------- a pasted post ----------
     LinkedIn and personal Facebook cannot be read by any app. When big news shows up there,
     paste it: it is read like a find, matched to the watch list, and nothing is stored. */
  const SHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  async function readPost(input) {
    input = input || {};
    const text = String(input.text || '').slice(0, 6000).trim();
    const shot = input.image && typeof input.image === 'object' ? input.image : null;
    if (shot) {
      if (SHOT_TYPES.indexOf(shot.media_type) < 0 || typeof shot.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(shot.data) || shot.data.length > 6 * 1024 * 1024) {
        throw Object.assign(new Error('The screenshot was not a readable JPEG, PNG or WebP under about 4 MB.'), { status: 400 });
      }
    }
    if (!shot && text.length < 15) throw Object.assign(new Error('Paste the text of the post, or add a screenshot of it.'), { status: 400 });
    const people = S().contacts;
    const namedIn = (t) => people.filter((c) => mentions(t, c.name) || (c.company && mentions(t, c.company)));
    let named = namedIn(text);
    const cl = claude();
    if (shot && !cl) throw Object.assign(new Error('Reading a screenshot needs ANTHROPIC_API_KEY in Railway. Paste the text of the post instead.'), { status: 503 });
    let out = null;
    if (cl) {
      const ids = playbook.map((m) => m.id);
      const schema = { type: 'object', additionalProperties: false, required: ['person', 'company', 'moment', 'detail', 'summary', 'postText', 'platform'],
        properties: {
          person: { type: 'string', description: 'The adult this news is about or who posted it: the client, parent or grandparent. Their full name as written, or empty.' },
          company: { type: 'string', description: 'Their company, if the post names it.' },
          moment: { type: 'string', enum: ids },
          detail: { type: 'string', description: 'The one specific thing a note would name, such as "their granddaughter Claire, born Tuesday" or "Tulane, class of 2030". Never a dollar figure.' },
          summary: { type: 'string', description: 'One plain sentence of what happened.' },
          postText: { type: 'string', description: 'The words of the post as you read them, short, for the advisor to check. Leave out reaction counts and comments.' },
          platform: { type: 'string', enum: ['Facebook', 'LinkedIn', 'Instagram', 'other'], description: 'Where the post is, if the screenshot or text shows it.' }
        } };
      const content = [];
      if (shot) content.push({ type: 'image', source: { type: 'base64', media_type: shot.media_type, data: shot.data } });
      content.push({ type: 'text', text: (people.length ? 'Names on her watch list: ' + people.map((c) => c.name + (c.company ? ' (' + c.company + ')' : '')).join('; ') + '\n\n' : '') +
        (text ? 'THE POST\n' + text : 'The post is in the screenshot above.') });
      const msg = await cl.beta.messages.parse({
        model: MODEL, max_tokens: 2000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'medium', format: format(schema) },
        system: [{ type: 'text', cache_control: { type: 'ephemeral' }, text: [
          'A financial planner shares a social media post by someone she knows: pasted text, a screenshot, or both. Say who it is about, which of these moments it is, the one specific detail a congratulations or condolence note would name, and one plain sentence of what happened.',
          '- In a screenshot, read the post itself. Ignore the app around it, reaction and comment counts, and any other post that is only partly visible.',
          '- When someone shares another post, such as their company\'s, the person is the one who shared it and the news is in the shared post.',
          '- Never identify anyone from a face. Use names only as the text shows them.',
          '- Sad or risky news wins over good news. Use only what the post says.',
          playbook.map((m) => '- ' + m.id + ': ' + m.name).join('\n')
        ].join('\n') }],
        messages: [{ role: 'user', content }]
      });
      if (msg.stop_reason !== 'refusal' && msg.parsed_output) out = Object.assign({ sortedBy: 'claude' }, msg.parsed_output);
      if (out) named = named.concat(namedIn(out.postText + ' ' + out.person + ' ' + out.company).filter((c) => named.indexOf(c) < 0));
    }
    if (!out) out = { sortedBy: 'keywords', person: named[0] ? named[0].name : '', company: named[0] ? named[0].company : '', moment: classify(text, playbook), detail: '', summary: '', postText: '', platform: '' };
    const match = people.find((c) => out.person && norm(c.name) === norm(out.person)) || named[0] || null;
    if (match) { out.person = match.name; out.company = out.company || match.company; }
    out.audience = match ? match.audience : null;
    out.matched = !!match;
    if (!playbook.some((m) => m.id === out.moment)) out.moment = 'mention';
    return out;
  }

  /* ---------- the firm's gift limit ----------
     One number, set by the firm, that every gift suggestion has to fit under, engraving and
     shipping included. When it is lower than a playbook gift, the draft scales the gesture
     down rather than going over. */
  function settings() { return Object.assign({ giftLimit: Number(env.GIFT_LIMIT) || null }, S().settings || {}); }
  function setSettings(b) {
    const n = b && b.giftLimit === null ? null : Math.round(Number(b && b.giftLimit));
    if (n !== null && !(n >= 0 && n <= 1000)) throw Object.assign(new Error('The gift limit is a dollar amount from 0 to 1,000.'), { status: 400 });
    S().settings = Object.assign({}, S().settings || {}, { giftLimit: n });
    db.save();
    return settings();
  }

  /* ---------- the daily run ---------- */

  function centralHour() {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(now()))) % 24;
  }
  function due() {
    if (!S().contacts.length) return false;
    if (S().retryAt) return now() >= S().retryAt;
    const last = S().lastScan ? Date.parse(S().lastScan) : 0;
    return now() - last > 20 * 3600000 && centralHour() >= cfg.scanHour;
  }
  let timer = null;
  function start() {
    if (timer || !cfg.gated) return;
    timer = setInterval(() => { if (due()) scan('scheduled').catch((e) => console.error('moments scan failed:', e)); }, 10 * 60000);
    if (timer.unref) timer.unref();
  }

  function status() {
    const counts = { new: 0, done: 0, dismissed: 0, notthem: 0 };
    S().alerts.forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1; });
    return {
      enabled: cfg.gated, search: cfg.search, instagram: (() => { try { const r = instagram(); return r ? r.account : null; } catch (e) { return null; } })(), triage: cfg.hasKey || !!opts.client, persistent: cfg.persistent,
      scanHour: cfg.scanHour, scanning, lastScan: S().lastScan, lastLog: (S().scans || [])[0] || null,
      contacts: S().contacts.length, counts, settings: settings()
    };
  }

  return { cfg, status, contacts, upsert, remove, scan, alerts, act, draft, readPost, settings, setSettings, start, due, classify: (t) => classify(t, playbook), queries, _db: db };
}

module.exports = { createMoments, classify, mentions, splitTitle, cleanContact, AUDIENCES, STATUSES, MODEL };
