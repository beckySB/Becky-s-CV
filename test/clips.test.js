'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { createClips, sentencesFrom, build } = require('../lib/clips');
const { validate, systemPrompt, userPrompt } = require('../lib/clips/plan');
const art = require('../lib/clips/art');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'www-clips-')); }

/* A recording's words: sentences of five words, half a second a word, a pause between. */
function speech(n) {
  const words = [];
  let t = 1;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < 5; i++) { words.push({ s: t, e: t + 0.4, w: (i === 0 ? 'And' : 'word') + (i === 4 ? '.' : '') }); t += 0.5; }
    t += 0.6;
  }
  return words;
}

test('words become sentences, and a clip is cut on words with captions timed to them', () => {
  const words = speech(12);
  const S = sentencesFrom(words);
  assert.strictEqual(S.length, 12);
  assert.strictEqual(S[3].text, 'And word word word word.');
  const b = build(words, S, [{ from: 2, to: 4 }], [{ heard: 'word word', meant: 'worth' }]);
  assert.strictEqual(b.ranges.length, 1);
  assert.ok(b.ranges[0][0] < S[2].start && b.ranges[0][0] > S[1].end, 'starts just before its first word, after the sentence before');
  assert.ok(b.ranges[0][1] > S[4].end - 0.01 && b.ranges[0][1] < S[5].start, 'ends just after its last word, before the next sentence');
  assert.ok(b.cues.every((c) => c.start >= 0 && c.end > c.start && c.end <= b.seconds + 0.01), 'captions sit inside the clip');
  assert.match(b.cues[0].text, /^And worth/, 'the first caption is capitalised and a misheard phrase is corrected');
  assert.ok(!/word word/.test(b.transcript));

  const two = build(words, S, [{ from: 0, to: 1 }, { from: 6, to: 7 }], []);
  assert.strictEqual(two.ranges.length, 2);
  const firstLen = two.ranges[0][1] - two.ranges[0][0];
  assert.ok(two.cues.some((c) => c.start >= firstLen - 0.01), 'captions of the second range are timed after the first');
});

test('the clip plan is held to the transcript: real sentences, sensible lengths, no dashes', () => {
  const S = sentencesFrom(speech(40));
  const out = validate({
    speakers: 'Two hosts',
    corrections: [{ heard: 'milk', meant: 'women' }, { heard: 'same', meant: 'Same' }, { heard: '', meant: 'x' }],
    clips: [
      { title: 'Late one', theme: 'The room', hook: 'A good line — really', ranges: [{ from: 20, to: 27 }], caption: 'Warm – and short.', flags: ['Check it'], speaking: '' },
      { title: 'Too short', theme: '', hook: 'Hi', ranges: [{ from: 1, to: 1 }], caption: '', flags: [], speaking: '' },
      { title: 'Not real', theme: '', hook: 'Hi', ranges: [{ from: 38, to: 99 }], caption: '', flags: [], speaking: '' },
      { title: 'Early, touching ranges', theme: '', hook: 'First', ranges: [{ from: 5, to: 8 }, { from: 2, to: 4 }], caption: 'x', flags: [], speaking: '' }
    ]
  }, S, 10);
  assert.deepStrictEqual(out.clips.map((c) => c.title), ['Early, touching ranges', 'Late one'], 'in the order spoken; the short and the invented are dropped');
  assert.deepStrictEqual(out.clips[0].ranges, [{ from: 2, to: 8 }], 'ranges that touch are one range');
  assert.ok(!/[–—]/.test(JSON.stringify(out)), 'no dashes survive');
  assert.deepStrictEqual(out.corrections, [{ heard: 'milk', meant: 'women' }]);
});

test('the editor is briefed with the style guide, the rules and the standard', () => {
  const sys = systemPrompt({ brandName: 'Women Worth & Wealth', voiceBrief: 'VOICE BRIEF HERE', guardrails: ['Never tie worth to income'], themes: [{ name: 'The room', job: 'Why the cohort works' }] });
  assert.match(sys, /High end, warm and polished/);
  assert.match(sys, /VOICE BRIEF HERE/);
  assert.match(sys, /Never tie worth to income/);
  assert.match(sys, /The room: Why the cohort works/);
  assert.match(sys, /never guess from style/);
  const user = userPrompt({ name: 'talk.mov', duration: 600, count: 18, who: 'Becky and Amy', direction: 'Favour stories', sentences: [{ id: 0, start: 1, end: 4, text: 'Good morning.' }] });
  assert.match(user, /Choose up to 18 clips/);
  assert.match(user, /\[0\] 0:01 to 0:04 {2}Good morning\./);
});

test('the overlays draw in the brand, at full frame', () => {
  const size = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];
  const look = art.lookFrom({ ground: '#123D32', accent: 'not a colour', tagline: 'Own your worth.' });
  assert.strictEqual(look.ground, '#123d32');
  assert.strictEqual(look.accent, '#c9a86a', 'a bad colour falls back to the brand default');
  for (const png of [art.bug(look), art.title(look, 'The room', 'It is time. Honestly, it is overdue.'), art.lower(look, 'Becky Gustafson & Amy Landry', 'Co-hosts'), art.caption(look, 'Good morning.'), art.end(look, { line: 'Apply at wealthandwisdom.biz' })]) {
    assert.strictEqual(png.slice(1, 4).toString(), 'PNG');
    assert.deepStrictEqual(size(png), [1080, 1920]);
  }
});

function make(extra) {
  const dir = tmp();
  const rendered = [];
  const words = speech(40);
  const clips = createClips(Object.assign({
    env: { DATA_DIR: dir, SITE_PASSWORD: 'pw' }, root: dir,
    tools: async () => ({ ffmpeg: true, zscale: true }),
    probe: async () => ({ duration: 140, width: 1080, height: 1920, hdr: false }),
    extractAudio: async (src, pcm) => fs.writeFileSync(pcm, 'audio'),
    transcriber: async () => ({ words, model: 'test' }),
    planner: async (input) => {
      const S = input.sentences;
      return validate({ speakers: '', corrections: [], clips: [
        { title: 'First clip', theme: 'The room', hook: 'One', ranges: [{ from: 0, to: 6 }], caption: 'Caption one', flags: ['A family story.'], speaking: '' },
        { title: 'Second clip', theme: 'The room', hook: 'Two', ranges: [{ from: 10, to: 16 }], caption: 'Caption two', flags: [], speaking: '' }
      ] }, S, input.count);
    },
    renderer: async ({ clip, out }) => { rendered.push(clip.n + ':' + clip.hook); fs.writeFileSync(out, 'video ' + clip.n + ' ' + clip.hook); }
  }, extra || {}));
  return { clips, dir, rendered };
}
async function settle(clips) { for (let i = 0; i < 400 && !clips._idle(); i++) await new Promise((r) => setTimeout(r, 10)); }
function upload(clips, name) {
  const body = Buffer.alloc(3000, 1);
  const job = clips.create({ name: name || 'launch talk.mov', bytes: body.length, settings: { who: 'Becky & Amy', count: 20, brandName: 'W', voiceBrief: 'brief', look: { ground: '#123d32' } } });
  assert.deepStrictEqual(clips.chunk(job.id, 0, body.subarray(0, 2000)), { received: 2000, bytes: 3000 });
  assert.deepStrictEqual(clips.chunk(job.id, 0, body.subarray(0, 2000)), { received: 2000, bytes: 3000 }, 'a piece sent twice is not written twice');
  assert.throws(() => clips.start(job.id), /not finished/);
  clips.chunk(job.id, 2000, body.subarray(2000));
  clips.start(job.id);
  return job.id;
}

test('a recording goes from upload to finished clips, and an edited hook renders that clip again', async () => {
  const { clips, rendered } = make();
  assert.throws(() => clips.create({ name: 'notes.pdf', bytes: 10 }), /Upload a video file/);
  const id = upload(clips);
  await settle(clips);
  let j = clips.get(id);
  assert.strictEqual(j.stage, 'done');
  assert.deepStrictEqual(j.clips.map((c) => [c.n, c.status, c.fileName]), [[1, 'ready', '01-first-clip.mp4'], [2, 'ready', '02-second-clip.mp4']]);
  assert.ok(!('voiceBrief' in j.settings), 'the style guide text is not sent back to the browser');
  assert.match(clips.sheet(id), /CHECK BEFORE POSTING\n- A family story\./);

  clips.update(id, 2, { caption: 'A warmer caption — here' });
  assert.strictEqual(clips.get(id).clips[1].caption, 'A warmer caption ,  here'.replace(' ,  ', ' ,  '));
  assert.strictEqual(rendered.length, 2, 'a caption edit renders nothing');
  clips.update(id, 2, { hook: 'A better hook' });
  await settle(clips);
  j = clips.get(id);
  assert.deepStrictEqual(rendered, ['1:One', '2:Two', '2:A better hook']);
  assert.strictEqual(j.clips[1].version, 2);
  assert.strictEqual(fs.readFileSync(clips.clipPath(id, 2).path, 'utf8'), 'video 2 A better hook');

  clips.dropSource(id);
  assert.throws(() => clips.update(id, 1, { hook: 'Again' }), /recording was deleted/);
  clips.remove(id);
  assert.throws(() => clips.get(id), /no longer here/);
});

test('clips are saved to Drive once each, with the review notes alongside', async () => {
  const saved = [];
  const { clips } = make({ saveToDrive: async (f) => { saved.push(f.name + ' ' + f.mimeType); return { file: { link: 'https://drive/' + saved.length }, folder: { name: 'Studio', link: 'https://drive/folder' } }; } });
  const id = upload(clips);
  await settle(clips);
  assert.strictEqual((await clips.drive(id, 1)).saved, 1);
  const all = await clips.drive(id, 0);
  assert.strictEqual(all.saved, 1, 'the one already in Drive is not sent again');
  assert.deepStrictEqual(saved, ['launch-talk 01-first-clip.mp4 video/mp4', 'launch-talk 02-second-clip.mp4 video/mp4', 'launch-talk captions and review notes.txt text/plain']);
  await assert.rejects(clips.drive(id, 0), /already in Drive/);
});

test('without a Claude key the transcript is kept and the job waits; a restart with the key finishes it', async () => {
  const dir = tmp();
  const words = speech(40);
  const base = { env: { DATA_DIR: dir, SITE_PASSWORD: 'pw' }, root: dir, tools: async () => ({ ffmpeg: true, zscale: false }),
    probe: async () => ({ duration: 140, width: 1920, height: 1080, hdr: true }), extractAudio: async (s, p) => fs.writeFileSync(p, 'a'),
    renderer: async ({ out }) => fs.writeFileSync(out, 'v') };
  let heard = 0;
  const first = createClips(Object.assign({ transcriber: async () => { heard++; return { words, model: 't' }; } }, base));
  const id = upload(first);
  await settle(first);
  assert.strictEqual(first.get(id).stage, 'waiting');
  assert.match(first.get(id).error, /ANTHROPIC_API_KEY/);
  assert.match(first.get(id).notes.join(' '), /HDR/);

  const second = createClips(Object.assign({ transcriber: async () => { heard++; return { words, model: 't' }; },
    planner: async (input) => validate({ clips: [{ title: 'Only', theme: '', hook: 'One', ranges: [{ from: 0, to: 6 }], caption: 'c', flags: [], speaking: '' }], corrections: [], speakers: '' }, input.sentences, 5) }, base));
  await new Promise((r) => setTimeout(r, 30));
  await settle(second);
  assert.strictEqual(second.get(id).stage, 'done');
  assert.strictEqual(heard, 1, 'the recording is not transcribed twice');

  let fails = 1;
  const third = createClips(Object.assign({}, base, { env: { DATA_DIR: tmp(), SITE_PASSWORD: 'pw' }, transcriber: async () => ({ words, model: 't' }),
    planner: async (input) => { if (fails-- > 0) throw new Error('the line dropped'); return validate({ clips: [{ title: 'Only', theme: '', hook: 'One', ranges: [{ from: 0, to: 6 }], caption: 'c', flags: [], speaking: '' }], corrections: [], speakers: '' }, input.sentences, 5); } }));
  const id3 = upload(third);
  await settle(third);
  assert.strictEqual(third.get(id3).stage, 'failed');
  assert.match(third.get(id3).error, /the line dropped/);
  third.retry(id3);
  await settle(third);
  assert.strictEqual(third.get(id3).stage, 'done', 'trying again picks up at the stage that failed');
});

test('the server: the clip maker needs the password and the request header', async (t) => {
  const dir = tmp();
  const port = 24000 + Math.floor(Math.random() * 2000);
  const s = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dir, SITE_PASSWORD: 'pw' }, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => { if (/listening/.test(String(d))) resolve({ p, base: 'http://127.0.0.1:' + port }); });
    p.on('error', reject);
    setTimeout(() => reject(new Error('server did not start')), 5000);
  });
  t.after(() => s.p.kill());
  const auth = { Authorization: 'Basic ' + Buffer.from('www:pw').toString('base64') };
  assert.strictEqual((await fetch(s.base + '/api/clips/jobs')).status, 401);
  const body = JSON.stringify({ name: 'talk.mp4', bytes: 10, settings: {} });
  assert.strictEqual((await fetch(s.base + '/api/clips/jobs', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body })).status, 403);
  const made = await (await fetch(s.base + '/api/clips/jobs', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'X-Studio-Request': '1' }, auth), body })).json();
  assert.strictEqual(made.job.stage, 'uploading');
  const piece = await fetch(s.base + '/api/clips/jobs/' + made.job.id + '/chunk?offset=0', { method: 'POST', headers: Object.assign({ 'X-Studio-Request': '1' }, auth), body: Buffer.alloc(10, 1) });
  assert.deepStrictEqual(await piece.json(), { received: 10, bytes: 10 });
  assert.strictEqual((await fetch(s.base + '/api/clips/jobs/' + made.job.id + '/clips/1.mp4', { headers: auth })).status, 404);
  assert.strictEqual((await fetch(s.base + '/api/clips/jobs/../../etc', { headers: auth })).status, 404);
});

test('the clip plan is asked for over a stream, and read back against the transcript', async () => {
  const { plan } = require('../lib/clips/plan');
  const S = sentencesFrom(speech(40)).map((x) => ({ id: x.id, start: x.start, end: x.end, text: x.text }));
  let sent = null;
  const answer = { clips: [{ title: 'One', theme: 'The room', hook: 'A line', ranges: [{ from: 0, to: 6 }], caption: 'c', flags: [], speaking: '' }], corrections: [], speakers: 'Two hosts' };
  const client = { beta: { messages: {
    parse: () => { throw new Error('a long plan must not be sent without streaming'); },
    stream: (params) => { sent = params; return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'm', content: [{ type: 'text', text: JSON.stringify(answer) }], usage: { input_tokens: 5, output_tokens: 7 } }) }; }
  } } };
  const out = await plan({ sentences: S, count: 20, brandName: 'W', voiceBrief: 'brief' }, { client, format: { type: 'json_schema', schema: {} } });
  assert.strictEqual(out.clips.length, 1);
  assert.strictEqual(out.speakers, 'Two hosts');
  assert.ok(sent.max_tokens > 21333, 'large enough that the SDK requires streaming, which is why it is streamed');
  assert.match(sent.system[0].text, /High end, warm and polished/);
});
