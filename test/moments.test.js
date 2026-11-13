'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { createMoments, classify, mentions, splitTitle } = require('../lib/moments');
const playbook = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'moments.json'), 'utf8'));
const occasions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'experience.json'), 'utf8')).milestones.occasions;

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'www-moments-'));
const rss = (items) => '<?xml version="1.0"?><rss><channel>' + items.map((i) =>
  '<item><title>' + i.title + '</title><link>' + i.link + '</link><pubDate>' + new Date(i.date || Date.now()).toUTCString() + '</pubDate>' +
  '<description>' + (i.desc || '') + '</description><source url="https://x">' + (i.source || '') + '</source></item>').join('') + '</channel></rss>';

function make(over) {
  const dir = tmp();
  const calls = [];
  const opts = Object.assign({
    env: { DATA_DIR: dir, SITE_PASSWORD: 'pw', MOMENTS_DELAY_MS: '0' }, root: dir, playbook: playbook.moments ? playbook : null, occasions,
    format: { type: 'json_schema' },
    fetch: async (url) => {
      calls.push(url);
      const q = new URL(url).searchParams.get('q') || '';
      if (/news\.google\.com/.test(url) && /"Jane Doucet"/.test(q)) return new Response(rss([
        { title: 'Jane Doucet named to CityBusiness Women of the Year - New Orleans CityBusiness', link: 'https://news.example/1', source: 'New Orleans CityBusiness' },
        { title: 'Jane Doucet, 91, of Shreveport passed away - Legacy', link: 'https://news.example/2', source: 'Legacy' }
      ]));
      if (/news\.google\.com/.test(url) && /"Doucet Marine"/.test(q)) return new Response(rss([
        { title: 'Doucet Marine wins Port of New Orleans dredging contract - Biz New Orleans', link: 'https://news.example/3', source: 'Biz New Orleans' }
      ]));
      if (/bizneworleans/.test(url)) return new Response(rss([{ title: 'Ribbon cutting for Doucet Marine yard in Harvey', link: 'https://news.example/4' }, { title: 'Unrelated story', link: 'https://news.example/5' }]));
      if (/news\.google\.com/.test(url)) return new Response(rss([]));
      return new Response('nope', { status: 503 });
    }
  }, over || {});
  return { m: createMoments(opts), calls, dir };
}

test('keywords sort a find, and sad news wins a tie', () => {
  const pb = playbook.moments;
  assert.strictEqual(classify('Jane Doucet named to Women of the Year list', pb), 'award');
  assert.strictEqual(classify('Doucet Marine wins Port contract, expands yard', pb), 'business-win');
  assert.strictEqual(classify('Founder honored at memorial service after he passed away', pb), 'loss');
  assert.strictEqual(classify('Company sued after layoffs; owner was named to board', pb), 'trouble');
  assert.strictEqual(classify('A story about Jane', pb), 'mention');
  assert.ok(mentions('Congrats to JANE DOUCÉT today', 'Jane Doucet'));
  assert.ok(!mentions('Janet Doucette', 'Jane Doucet'));
  assert.deepStrictEqual(splitTitle('Big news for owners - Biz New Orleans'), { title: 'Big news for owners', source: 'Biz New Orleans' });
});

test('every moment has a response for every relationship, and linked occasions exist', () => {
  const ids = new Set(occasions.map((o) => o.id));
  playbook.moments.forEach((m) => {
    ['tier1', 'tier2', 'tier3', 'coi', 'prospect'].forEach((a) => assert.ok(m.respond[a], m.id + ' ' + a));
    if (m.occasion) assert.ok(ids.has(m.occasion), m.id);
    if (m.sensitivity === 'sensitive') assert.strictEqual(m.publicResponse, false, m.id + ' must never be public');
  });
});

test('the watch list holds only what it needs', () => {
  const { m } = make();
  assert.throws(() => m.upsert([{ name: 'Jane' }]), /first and last name/);
  const [c] = m.upsert([{ name: '  Jane   Doucet ', company: 'Doucet Marine', city: 'Harvey', audience: 'tier1', watchCompany: 'yes', also: 'Doucet Marine Services; x', netWorth: '9,000,000', notes: 'secret' }]);
  assert.strictEqual(c.name, 'Jane Doucet');
  assert.deepStrictEqual(c.also, ['Doucet Marine Services']);
  assert.ok(!('netWorth' in c) && !('notes' in c), 'nothing else is kept');
  m.upsert([{ name: 'Jane Doucet', company: 'Doucet Marine', audience: 'coi' }]);
  assert.strictEqual(m.contacts().length, 1, 'same person and company updates rather than duplicates');
  assert.strictEqual(m.contacts()[0].audience, 'coi');
  const q = m.queries(m.contacts()[0]).map((x) => new URL(x.url).searchParams.get('q'));
  assert.match(q[0], /^"Jane Doucet" \("Doucet Marine" OR "Harvey" OR Louisiana\) when:14d$/);
});

test('a scan with Claude: the other Jane is dropped, the rest become moments, and nothing repeats', async () => {
  const seen = [];
  const client = { beta: { messages: { parse: async (req) => {
    seen.push(req);
    const items = req.messages[0].content.split('\n\n').map((block, i) => {
      if (/Shreveport/.test(block)) return { i, aboutThem: 'no', moment: 'loss', summary: 'A different Jane Doucet.', detail: '' };
      if (/Women of the Year/.test(block)) return { i, aboutThem: 'yes', moment: 'award', summary: 'Named a Woman of the Year.', detail: 'the CityBusiness Women of the Year honor' };
      if (/dredging/.test(block)) return { i, aboutThem: 'yes', moment: 'business-win', summary: 'Won a Port contract.', detail: 'the Port of New Orleans dredging contract' };
      return { i, aboutThem: 'unsure', moment: 'business-win', summary: 'An opening.', detail: '' };
    });
    return { stop_reason: 'end_turn', parsed_output: { items }, usage: {} };
  } } } };
  const { m } = make({ client });
  m.upsert([{ name: 'Jane Doucet', company: 'Doucet Marine', city: 'Harvey', audience: 'tier1', watchCompany: true }]);
  const r = await m.scan('test');
  assert.strictEqual(r.log.triage, 'claude');
  assert.strictEqual(seen[0].model, 'claude-opus-5-5');
  assert.deepStrictEqual(seen[0].fallbacks, 'default');
  const a = m.alerts();
  assert.deepStrictEqual(a.map((x) => x.moment).sort(), ['award', 'business-win', 'business-win']);
  assert.ok(!a.some((x) => /Shreveport/.test(x.title)), 'the other Jane Doucet is not an alert');
  const award = a.find((x) => x.moment === 'award');
  assert.strictEqual(award.source, 'New Orleans CityBusiness');
  assert.strictEqual(award.title, 'Jane Doucet named to CityBusiness Women of the Year');
  assert.strictEqual(award.detail, 'the CityBusiness Women of the Year honor');
  assert.ok(!a.some((x) => x.title === 'Unrelated story'), 'local news must name someone on the list');

  await m.scan('again');
  assert.strictEqual(m.alerts().length, 3, 'a second scan does not repeat what it found');
  m.act(award.id, 'done', { what: 'Note and framed article' });
  assert.strictEqual(m.status().counts.done, 1);
});

test('without Claude, keywords sort it and a loss is never called a celebration', async () => {
  const { m } = make();
  m.upsert([{ name: 'Jane Doucet', company: 'Doucet Marine', audience: 'tier2' }]);
  const r = await m.scan('test');
  assert.strictEqual(r.log.triage, 'keywords');
  const loss = m.alerts().find((x) => /passed away/.test(x.title));
  assert.strictEqual(loss.moment, 'loss');
  assert.strictEqual(loss.sure, 'likely');
  await assert.rejects(m.draft({ alertId: loss.id }), /ANTHROPIC_API_KEY/);
});

test('when nothing can be read, it tries again in an hour, not tomorrow', async () => {
  let clock = Date.parse('2026-11-13T14:00:00Z');
  const { m } = make({ now: () => clock, fetch: async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }); } });
  m.upsert([{ name: 'Jane Doucet', company: 'Doucet Marine' }]);
  assert.strictEqual(m.due(), true);
  const r = await m.scan('test');
  assert.match(r.log.errors[0], /ENOTFOUND/);
  assert.strictEqual(m.status().lastScan, null);
  assert.strictEqual(m.due(), false);
  clock += 3600000;
  assert.strictEqual(m.due(), true);
});

test('a draft follows the playbook, and sensitive moments get no public comment', async () => {
  let req;
  const client = { beta: { messages: { parse: async (r) => { req = r; return { stop_reason: 'end_turn', parsed_output: { note: 'Dear Jane,', callOpener: '', comment: 'So sorry', gift: '', door: 'Later.', cautions: [] }, usage: { input_tokens: 10, output_tokens: 5 } }; } } } };
  const { m } = make({ client });
  const out = await m.draft({ name: 'Jane Doucet', audience: 'coi', moment: 'loss', detail: 'her father', voiceBrief: 'VOICE' });
  assert.strictEqual(out.result.comment, '', 'no public comment on a loss, whatever came back');
  const brief = req.messages[0].content;
  assert.match(brief, /Relationship: Center of influence/);
  assert.match(brief, /heard in person/);
  assert.match(brief, /Becky calls within 1 business day|A handwritten note/);
  assert.match(req.system[0].text, /no contractions/);
  assert.match(req.system[0].text, /VOICE/);
  await assert.rejects(m.draft({ name: 'Jane Doucet', moment: 'nope' }), /Unknown moment/);
});

test('the server keeps the watch list behind the password and the request header', async (t) => {
  const dir = tmp();
  const start = (env) => new Promise((resolve, reject) => {
    const port = 22000 + Math.floor(Math.random() * 2000);
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({ PATH: process.env.PATH, PORT: String(port), DATA_DIR: dir }, env), stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => { if (/listening/.test(String(d))) resolve({ p, base: 'http://127.0.0.1:' + port }); });
    p.on('error', reject);
    setTimeout(() => reject(new Error('server did not start')), 5000);
  });
  const open = await start({});
  t.after(() => open.p.kill());
  assert.strictEqual((await (await fetch(open.base + '/api/moments/status')).json()).enabled, false);
  assert.strictEqual((await fetch(open.base + '/api/moments/contacts')).status, 503);

  const s = await start({ SITE_PASSWORD: 'pw', MOMENTS_SEARCH: 'off' });
  t.after(() => s.p.kill());
  const auth = { Authorization: 'Basic ' + Buffer.from('www:pw').toString('base64') };
  const body = JSON.stringify({ contacts: [{ name: 'Jane Doucet', company: 'Doucet Marine', audience: 'tier1' }] });
  assert.strictEqual((await fetch(s.base + '/api/moments/contacts', { method: 'POST', headers: auth, body })).status, 403);
  const ok = await fetch(s.base + '/api/moments/contacts', { method: 'POST', headers: Object.assign({ 'X-Studio-Request': '1' }, auth), body });
  assert.strictEqual(ok.status, 200);
  const list = await (await fetch(s.base + '/api/moments/contacts', { headers: auth })).json();
  assert.strictEqual(list.contacts[0].name, 'Jane Doucet');
  const d = await fetch(s.base + '/api/moments/draft', { method: 'POST', headers: Object.assign({ 'X-Studio-Request': '1' }, auth), body: JSON.stringify({ name: 'Jane Doucet', moment: 'award' }) });
  assert.strictEqual(d.status, 503);
  assert.match((await d.json()).error, /ANTHROPIC_API_KEY/);
});

test('kid and grandkid news is sorted into its own moments', () => {
  const pb = playbook.moments;
  assert.strictEqual(classify('So proud of our granddaughter Claire, who signed with LSU today', pb), 'college');
  assert.strictEqual(classify('We welcomed our first grandson, Luc, on Tuesday', pb), 'newborn');
  assert.strictEqual(classify('Thomas earned his Eagle Scout rank this weekend', pb), 'achievement');
  assert.strictEqual(classify('Congratulations to the Class of 2027 graduates', pb), 'graduation');
  const newborn = pb.find((m) => m.id === 'newborn');
  assert.match(newborn.gift, /rattle/i);
  assert.match(pb.find((m) => m.id === 'college').gift, /hat or sweatshirt/i);
  assert.ok(playbook.limits.some((l) => /never searched/.test(l)), 'children are never searched');
});

test('Instagram: their own big news becomes a moment, everyday posts do not, and tags are caught', async () => {
  const reader = {
    account: 'womenworthandwealth',
    discover: async (u) => {
      assert.strictEqual(u, 'doucetmarine');
      return [
        { caption: 'Happy Friday! 20 percent off all rope this week.', link: 'https://instagram.com/p/a', published: new Date().toISOString(), username: 'doucetmarine' },
        { caption: 'Ribbon cutting Saturday at our new Kenner location. Thank you to everyone who got us here.', link: 'https://instagram.com/p/b', published: new Date().toISOString(), username: 'doucetmarine' }
      ];
    },
    tagged: async () => [
      { caption: 'Great evening with @womenworthandwealth at the Expo', link: 'https://instagram.com/p/c', published: new Date().toISOString(), username: 'ThibodeauxCo' }
    ]
  };
  const { m } = make({ instagram: () => reader, fetch: async () => new Response(rss([])) });
  const [c] = m.upsert([{ name: 'Jane Doucet', company: 'Doucet Marine', instagram: 'https://www.instagram.com/DoucetMarine/' }]);
  assert.strictEqual(c.instagram, 'doucetmarine');
  assert.strictEqual(m.status().instagram, 'womenworthandwealth');
  const r = await m.scan('test');
  assert.strictEqual(r.log.instagram, 2);
  const a = m.alerts();
  assert.ok(!a.some((x) => /rope/.test(x.title)), 'an everyday post is not an alert');
  const win = a.find((x) => /Ribbon cutting/.test(x.title));
  assert.strictEqual(win.moment, 'business-win');
  assert.strictEqual(win.sure, 'yes');
  assert.strictEqual(win.source, 'Instagram @doucetmarine');
  const tag = a.find((x) => x.moment === 'tagged');
  assert.strictEqual(tag.contact.name, '@ThibodeauxCo');
  assert.strictEqual(tag.contact.audience, 'prospect');
});

test('a pasted post is read, matched to the watch list, and stored nowhere', async () => {
  const client = { beta: { messages: { parse: async (req) => {
    assert.match(JSON.stringify(req.messages[0].content), /signed with LSU/);
    return { stop_reason: 'end_turn', parsed_output: { person: 'Jane Doucet', company: '', moment: 'college', detail: 'Claire, signing with LSU', summary: 'Her granddaughter signed with LSU.' } };
  } } } };
  const { m, dir } = make({ client });
  m.upsert([{ name: 'Jane Doucet', company: 'Doucet Marine', audience: 'tier1' }]);
  const before = fs.readFileSync(path.join(dir, 'moments', 'state.json'), 'utf8');
  const r = await m.readPost({ text: 'So proud of our granddaughter Claire, who signed with LSU today. Geaux Tigers.' });
  assert.deepStrictEqual([r.person, r.moment, r.audience, r.matched, r.sortedBy], ['Jane Doucet', 'college', 'tier1', true, 'claude']);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'moments', 'state.json'), 'utf8'), before, 'nothing about the post is saved');

  const { m: plain } = make();
  plain.upsert([{ name: 'Paul Landry', company: 'Landry CPA', audience: 'coi' }]);
  const k = await plain.readPost({ text: 'Proud to share that Landry CPA has opened a new office on Veterans, with a ribbon cutting this week.' });
  assert.deepStrictEqual([k.person, k.moment, k.audience, k.sortedBy], ['Paul Landry', 'business-win', 'coi', 'keywords']);
  await assert.rejects(plain.readPost({ text: 'hi' }), /Paste the text/);
});

test('a real post: an honor seen on Facebook, drafted under a $25 gift limit', async () => {
  const post = 'Mindy Nunez Airhart is with Justin Airhart and 2 others. Thank you The Advocate and NOLA.com! So proud to be in the first cohort of LA Innovators! ' +
    'SSE Steel Fabrication: We are deeply honored that SSE Steel Fabrication has been recognized as one of the 15 inaugural Louisiana Innovates honorees by Georges Media Group.';
  let req;
  const client = { beta: { messages: { parse: async (r) => { req = r; return { stop_reason: 'end_turn', parsed_output: { note: 'x', callOpener: '', comment: 'y', gift: 'z', door: 'd', cautions: [] }, usage: {} }; } } } };
  const { m } = make({ client: null });
  m.upsert([{ name: 'Mindy Nunez Airhart', company: 'SSE Steel Fabrication', audience: 'coi' }]);
  const read = await m.readPost({ text: post });
  assert.deepStrictEqual([read.moment, read.person, read.audience], ['award', 'Mindy Nunez Airhart', 'coi']);
  assert.deepStrictEqual(m.setSettings({ giftLimit: 25 }), { giftLimit: 25 });
  assert.throws(() => m.setSettings({ giftLimit: -5 }), /0 to 1,000/);

  const { m: d } = make({ client });
  d.setSettings({ giftLimit: 25 });
  await d.draft({ name: 'Mindy Nunez Airhart', company: 'SSE Steel Fabrication', audience: 'coi', moment: 'award', detail: 'the inaugural Louisiana Innovates honor',
    seen: 'post', platform: 'Facebook', summary: 'SSE Steel Fabrication was named one of 15 inaugural Louisiana Innovates honorees.', postText: post });
  const brief = req.messages[0].content;
  assert.match(brief, /\$25 per gift/);
  assert.match(brief, /Seen on their own public post on Facebook/);
  assert.doesNotMatch(brief, /heard in person/);
  assert.doesNotMatch(brief, /\{\{/, 'no unfilled placeholders reach Claude');
  assert.match(brief, /their own post, wherever they shared it/);
});
