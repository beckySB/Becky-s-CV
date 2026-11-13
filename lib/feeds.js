/* Reads the public news sources named in data/news.json and turns them into one list.

   Three rules hold this together.

   1. The server only ever fetches URLs written in data/news.json. Nothing a visitor sends
      can name a URL, so this cannot be turned into a way to make the server fetch
      arbitrary addresses.
   2. Every source reports how it went. A feed that moves or starts refusing requests shows
      up as a named failure in the Studio, not as news that quietly stopped arriving.
   3. Nothing is stored. Results sit in memory for a short while so a busy morning does not
      hit the same government site fifty times, and they are gone on restart. */

'use strict';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 9000;
const PER_SOURCE = 25;
const UA = 'WWW-Content-Studio/1.0 (news reader; +https://wealthandwisdom.biz)';

/* ---------- small, tolerant XML reading ----------
   RSS and Atom are regular enough that a full XML parser is not worth a dependency.
   This reads what feeds actually send, including CDATA and the common entities. */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decode(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z#0-9]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}
function safeChar(code) {
  try { return String.fromCodePoint(code); } catch (e) { return ''; }
}
function unCdata(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}
/* Strip tags and collapse whitespace. A summary is for reading, not rendering, and the
   Studio never inserts feed text as HTML. */
function text(s) {
  return decode(unCdata(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const re = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}
function attr(block, name, attribute) {
  const re = new RegExp('<' + name + '\\s[^>]*' + attribute + '\\s*=\\s*"([^"]*)"', 'i');
  const m = block.match(re);
  return m ? decode(m[1]) : '';
}
function blocks(xml, name) {
  const re = new RegExp('<' + name + '(?:\\s[^>]*)?>[\\s\\S]*?</' + name + '>', 'gi');
  return xml.match(re) || [];
}

function isoDate(s) {
  if (!s) return '';
  const d = new Date(String(s).trim());
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
function clip(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
}

/* Only http and https links survive. A feed is outside our control, and a javascript:
   link in a title would otherwise be one click from running. */
function safeLink(u) {
  try {
    const url = new URL(String(u || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch (e) { return ''; }
}

function parseRss(xml) {
  return blocks(xml, 'item').map((b) => ({
    title: text(tag(b, 'title')),
    link: safeLink(text(tag(b, 'link')) || text(tag(b, 'guid'))),
    published: isoDate(text(tag(b, 'pubDate')) || text(tag(b, 'dc:date'))),
    summary: clip(text(tag(b, 'description')), 420)
  }));
}

function parseAtom(xml) {
  return blocks(xml, 'entry').map((b) => {
    const alt = (b.match(/<link\s[^>]*>/gi) || []).find((l) => /rel="alternate"/i.test(l) || !/rel=/i.test(l)) || '';
    const href = (alt.match(/href="([^"]*)"/i) || [])[1] || '';
    return {
      title: text(tag(b, 'title')),
      link: safeLink(decode(href)),
      published: isoDate(text(tag(b, 'published')) || text(tag(b, 'updated'))),
      summary: clip(text(tag(b, 'summary')) || text(tag(b, 'content')), 420)
    };
  });
}

/* The Federal Register's API is the cleanest primary source there is for rules: every
   proposed rule, final rule and notice from IRS, Treasury and the Labor Department's
   benefits agency, with its type stated, so "proposed" is never mistaken for "law". */
function parseFederalRegister(json) {
  const results = (json && Array.isArray(json.results)) ? json.results : [];
  return results.map((r) => ({
    title: text(r.title),
    link: safeLink(r.html_url),
    published: isoDate(r.publication_date),
    summary: clip(text(r.abstract || ''), 420),
    docType: text(r.type || ''),
    agencies: (r.agencies || []).map((a) => text(a.name || a.raw_name || '')).filter(Boolean)
  }));
}

function parse(kind, body) {
  if (kind === 'federalregister') return parseFederalRegister(JSON.parse(body));
  if (kind === 'atom') return parseAtom(body);
  if (kind === 'rss') {
    /* Some feeds labelled RSS are Atom underneath. Read whichever is actually there. */
    return /<entry[\s>]/i.test(body) && !/<item[\s>]/i.test(body) ? parseAtom(body) : parseRss(body);
  }
  throw new Error('Unknown feed kind: ' + kind);
}

async function readCapped(res) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return await res.text();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { try { reader.cancel(); } catch (e) {} throw new Error('Feed larger than 2 MB'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

async function fetchSource(src, fetchImpl) {
  const started = Date.now();
  try {
    const res = await fetchImpl(src.url, {
      headers: { 'User-Agent': UA, 'Accept': src.kind === 'federalregister' ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await readCapped(res);
    const items = parse(src.kind, body)
      .filter((it) => it.title && it.link)
      .slice(0, PER_SOURCE)
      .map((it) => Object.assign(it, {
        id: src.id + ':' + hash(it.link),
        sourceId: src.id,
        source: src.name,
        tier: src.tier,
        geo: src.geo || 'US'
      }));
    return { status: { id: src.id, name: src.name, ok: true, count: items.length, ms: Date.now() - started }, items };
  } catch (e) {
    const REASONS = { ENOTFOUND: 'Address not found', ECONNREFUSED: 'Connection refused', ECONNRESET: 'Connection reset',
      CERT_HAS_EXPIRED: 'Certificate expired', UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Certificate not trusted', EAI_AGAIN: 'DNS lookup failed' };
    const code = e && e.cause && e.cause.code;
    const reason = e && e.name === 'TimeoutError' ? 'Timed out after ' + (TIMEOUT_MS / 1000) + 's'
      : code ? 'Could not reach the site: ' + (REASONS[code] || code)
      : (e && e.message) || 'Failed';
    return { status: { id: src.id, name: src.name, ok: false, error: reason, ms: Date.now() - started }, items: [] };
  }
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* ---------- the cache ---------- */

const TTL_MS = 30 * 60 * 1000;
let cache = null;
let inflight = null;

async function collect(sources, fetchImpl) {
  const results = await Promise.all(sources.map((s) => fetchSource(s, fetchImpl)));
  const seen = new Set();
  const items = [];
  results.forEach((r) => r.items.forEach((it) => {
    if (seen.has(it.link)) return;
    seen.add(it.link);
    items.push(it);
  }));
  items.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  return { fetchedAt: new Date().toISOString(), items, sources: results.map((r) => r.status) };
}

/* One fetch at a time. If ten people open the newsroom at once, they share one round of
   requests rather than starting ten. */
async function getNews(sources, opts) {
  opts = opts || {};
  const fetchImpl = opts.fetch || globalThis.fetch;
  const now = Date.now();
  if (!opts.force && cache && now - cache.at < TTL_MS) return cache.value;
  if (inflight) return inflight;
  inflight = collect(sources, fetchImpl).then((value) => {
    cache = { at: Date.now(), value };
    return value;
  }).finally(() => { inflight = null; });
  return inflight;
}

function resetCache() { cache = null; inflight = null; }

module.exports = { parse, parseRss, parseAtom, parseFederalRegister, getNews, fetchSource, resetCache, safeLink, text };
