'use strict';
const test = require('node:test');
const assert = require('node:assert');
const feeds = require('../lib/feeds');

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Fed holds rates &amp; issues statement]]></title><link>https://www.federalreserve.gov/a.htm</link>
<pubDate>Wed, 05 Nov 2026 19:00:00 GMT</pubDate><description><![CDATA[<p>The Committee decided to <b>maintain</b> the target range.</p>]]></description></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>nonsense</pubDate></item>
<item><title>Entities &#8217;n&#x2019; things</title><guid>https://example.gov/b</guid></item>
</channel></rss>`;

const ATOM = `<feed><entry><title>Atom one</title><link rel="alternate" href="https://lailluminator.com/x/"/>
<updated>2026-11-10T12:00:00Z</updated><summary>Summary here</summary></entry></feed>`;

test('RSS: CDATA, entities, tags stripped, dates normalised', () => {
  const items = feeds.parse('rss', RSS);
  assert.strictEqual(items[0].title, 'Fed holds rates & issues statement');
  assert.strictEqual(items[0].summary, 'The Committee decided to maintain the target range.');
  assert.strictEqual(items[0].published, '2026-11-05T19:00:00.000Z');
  assert.strictEqual(items[2].title, 'Entities ’n’ things');
  assert.strictEqual(items[2].link, 'https://example.gov/b', 'falls back to guid');
});

test('a javascript: link from a feed never survives', () => {
  const items = feeds.parse('rss', RSS);
  assert.strictEqual(items[1].link, '');
  assert.strictEqual(items[1].published, '');
});

test('Atom, and Atom served under an RSS label', () => {
  for (const kind of ['atom', 'rss']) {
    const items = feeds.parse(kind, ATOM);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].link, 'https://lailluminator.com/x/');
  }
});

test('Federal Register JSON keeps the document type', () => {
  const items = feeds.parse('federalregister', JSON.stringify({ results: [
    { title: 'Catch-up contributions', abstract: 'Final regulations.', html_url: 'https://www.federalregister.gov/d/1', publication_date: '2026-11-03', type: 'Rule', agencies: [{ name: 'Internal Revenue Service' }] }
  ] }));
  assert.strictEqual(items[0].docType, 'Rule');
  assert.deepStrictEqual(items[0].agencies, ['Internal Revenue Service']);
});

function fakeFetch(map) {
  return async (url) => {
    const r = map[url];
    if (r instanceof Error) throw r;
    if (!r) return { ok: false, status: 404 };
    return { ok: r.status ? r.status < 400 : true, status: r.status || 200, text: async () => r.body, body: null };
  };
}

test('every source reports how it went, and failures are named', async () => {
  feeds.resetCache();
  const timeout = new Error('slow'); timeout.name = 'TimeoutError';
  const out = await feeds.getNews([
    { id: 'a', name: 'Good', kind: 'rss', url: 'u1', tier: 'primary' },
    { id: 'b', name: 'Refuses', kind: 'rss', url: 'u2', tier: 'primary' },
    { id: 'c', name: 'Slow', kind: 'rss', url: 'u3', tier: 'primary' },
    { id: 'd', name: 'Same story', kind: 'atom', url: 'u4', tier: 'newsroom' }
  ], { fetch: fakeFetch({ u1: { body: RSS }, u2: { status: 403, body: '' }, u3: timeout, u4: { body: ATOM } }) });
  const st = Object.fromEntries(out.sources.map((s) => [s.id, s]));
  assert.strictEqual(st.a.ok, true);
  assert.strictEqual(st.b.error, 'HTTP 403');
  assert.match(st.c.error, /Timed out/);
  assert.ok(out.items.every((i) => i.link), 'items without a usable link are dropped');
  assert.strictEqual(out.items[0].title, 'Atom one', 'newest first');
});

test('results are cached, and one fetch is shared', async () => {
  feeds.resetCache();
  let calls = 0;
  const f = async () => { calls++; return { ok: true, status: 200, text: async () => RSS, body: null }; };
  const src = [{ id: 'a', name: 'A', kind: 'rss', url: 'u', tier: 'primary' }];
  await Promise.all([feeds.getNews(src, { fetch: f }), feeds.getNews(src, { fetch: f })]);
  await feeds.getNews(src, { fetch: f });
  assert.strictEqual(calls, 1);
  await feeds.getNews(src, { fetch: f, force: true });
  assert.strictEqual(calls, 2);
});
