/* The clip maker: one long recording in, a set of branded vertical clips out.

   A recording is uploaded in pieces and kept on the volume. From there the work runs on the
   server, one recording at a time, so the person who uploaded it can close the tab:

     1. listen    the audio is pulled out and transcribed here, word by word
     2. choose    Claude picks the moments, under the brand's style guide and the rules
     3. render    each clip is cut, colour-corrected, and dressed in the brand

   Nothing is published by any of this. Clips wait to be watched, edited, downloaded or saved
   to Drive, and every one carries its own list of what a person should check first.

   Each job lives in its own folder: the recording, the words, the plan, and the clips. A
   job interrupted by a deploy picks up where it stopped, because every stage leaves its
   result on disk before the next one starts. */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const art = require('./art');

const MAX_BYTES = 6 * 1024 * 1024 * 1024;
const MAX_CHUNK = 40 * 1024 * 1024;
const MAX_MINUTES = 120;
const TITLE_S = 3, LOWER_AT = 1, LOWER_S = 5, END_S = 3;
const TONEMAP = 'zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';
const VIDEO_TYPES = /\.(mp4|mov|m4v|webm|mkv)$/i;
const STAGES = { uploading: 'Uploading', queued: 'Waiting its turn', listening: 'Listening to the recording', choosing: 'Choosing the moments', rendering: 'Rendering the clips', done: 'Ready', failed: 'Stopped', waiting: 'Waiting for setup' };

class ClipError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

const text = (v, max) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max);
const slug = (s) => String(s || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'clip';

/* ---------- from words to sentences, and from sentences to captions ---------- */

function sentencesFrom(words) {
  const out = [];
  let from = 0;
  const push = (to) => {
    if (to < from) return;
    out.push({ id: out.length, from, to, start: words[from].s, end: words[to].e, text: words.slice(from, to + 1).map((w) => w.w).join(' ') });
    from = to + 1;
  };
  words.forEach((w, i) => {
    const next = words[i + 1];
    const stop = /[.?!]["')\]]?$/.test(w.w);
    const gap = next ? next.s - w.e : 9;
    const long = i - from >= 34 && /[,;:]$/.test(w.w);
    if (stop || gap > 1.2 || long || !next) push(i);
  });
  return out;
}

const LEAD = new Set(['yes.', 'yes,', 'right.', 'right,', 'absolutely.', 'yeah.', 'yeah,', 'definitely.', 'okay.', 'ok.', 'mm-hmm.']);
const TAIL = new Set(['and', 'and,', 'but', 'but,', 'so', 'so,', 'yeah.', 'yeah,', 'um', 'uh']);

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function corrector(corrections) {
  const rules = (corrections || []).map((c) => [new RegExp('(^|[^\\p{L}\\p{N}])' + escapeRe(c.heard).replace(/\s+/g, '\\s+') + '(?![\\p{L}\\p{N}])', 'giu'), c.meant]);
  return (t) => rules.reduce((s, [re, to]) => s.replace(re, (m, pre) => pre + to), t);
}

/* A clip's cut points and caption track, from the words inside its sentence ranges. Times in
   `ranges` are seconds in the recording; times in `cues` are seconds in the finished clip. */
function build(words, sentences, sentenceRanges, corrections) {
  const fix = corrector(corrections);
  const ranges = [], cues = [];
  let clipT = 0;
  sentenceRanges.forEach((r) => {
    let ws = words.slice(sentences[r.from].from, sentences[r.to].to + 1).map((w, i) => Object.assign({ i: sentences[r.from].from + i }, w));
    while (ws.length > 1 && LEAD.has(ws[0].w.toLowerCase())) ws = ws.slice(1);
    while (ws.length > 1 && TAIL.has(ws[ws.length - 1].w.toLowerCase())) ws = ws.slice(0, -1);
    if (!ws.length) return;
    const prev = words[ws[0].i - 1], next = words[ws[ws.length - 1].i + 1];
    const start = Math.max(0, prev ? Math.max(ws[0].s - 0.2, prev.e + 0.02) : ws[0].s - 0.2);
    const lastE = ws[ws.length - 1].e;
    const end = Math.max(lastE + 0.05, Math.min(lastE + 0.35, next ? next.s - 0.02 : lastE + 0.35));
    ranges.push([Math.round(start * 1000) / 1000, Math.round(end * 1000) / 1000]);
    let chunk = [];
    ws.forEach((w, i) => {
      chunk.push(w);
      const nx = ws[i + 1];
      const gap = nx ? nx.s - w.e : 9;
      const punct = /[.?!,]$/.test(w.w);
      if (chunk.length >= 6 || w.e - chunk[0].s > 2.6 || (punct && chunk.length >= 2) || gap > 0.7 || !nx) {
        const endAt = Math.min(nx && gap < 0.8 ? nx.s : w.e + 0.25, end);
        const t = fix(chunk.map((x) => x.w).join(' ')).replace(/[,;]$/, '').trim();
        if (t) cues.push({ start: Math.round((chunk[0].s - start + clipT) * 1000) / 1000, end: Math.round((endAt - start + clipT) * 1000) / 1000, text: t });
        chunk = [];
      }
    });
    clipT += end - start;
  });
  if (cues.length) cues[0].text = cues[0].text.charAt(0).toUpperCase() + cues[0].text.slice(1);
  return { ranges, cues, seconds: Math.round(clipT * 100) / 100, transcript: fix(cues.map((c) => c.text).join(' ')) };
}

/* ---------- running ffmpeg ---------- */

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { if (out.length < 4e6) out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    p.on('error', (e) => reject(new Error(cmd + ' could not be started: ' + e.message)));
    p.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(cmd + ' stopped with an error: ' + (err.trim().split('\n').slice(-3).join(' ') || 'code ' + code))));
    if (opts && opts.onChild) opts.onChild(p);
  });
}

async function tools() {
  const t = { ffmpeg: false, zscale: false };
  try { const f = await run('ffmpeg', ['-hide_banner', '-filters']); t.ffmpeg = true; t.zscale = /\bzscale\b/.test(f) && /\btonemap\b/.test(f); } catch (e) { /* not installed */ }
  try { await run('ffprobe', ['-version']); } catch (e) { t.ffmpeg = false; }
  return t;
}

async function probe(file) {
  const j = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  if (!v) throw new ClipError('That file has no video in it.');
  if (!a) throw new ClipError('That file has no sound in it, so there is nothing to transcribe.');
  return {
    duration: Number(j.format && j.format.duration) || 0, width: v.width, height: v.height,
    hdr: /arib-std-b67|smpte2084/.test(v.color_transfer || '')
  };
}

/* ---------- the service ---------- */

function createClips(opts) {
  const env = opts.env || process.env;
  const volume = env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || '';
  const root = path.join(volume || path.join(opts.root, '.data'), 'clips');
  const cfg = {
    dir: root, persistent: !!volume,
    gated: !!env.SITE_PASSWORD || env.SOCIAL_ALLOW_OPEN === '1',
    hasKey: !!env.ANTHROPIC_API_KEY || !!opts.planner,
    model: env.CLIPS_WHISPER_MODEL || ''
  };
  const now = opts.now || (() => Date.now());
  const transcriber = opts.transcriber || ((pcm, o) => require('./transcribe').transcribe(pcm, o));
  const planner = opts.planner || ((input) => require('./plan').plan(input));
  const renderer = opts.renderer || renderClip;
  const prober = opts.probe || probe;
  const extractAudio = opts.extractAudio || ((src, pcm) => run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', pcm]));
  fs.mkdirSync(root, { recursive: true });

  const jobs = new Map();
  const queue = [];
  let working = false, kit = null;

  const jdir = (id) => { if (!/^[a-f0-9]{16}$/.test(id)) throw new ClipError('Not found', 404); return path.join(root, id); };
  const file = (job, name) => path.join(jdir(job.id), name);
  function save(job) {
    const tmp = file(job, 'job.json.tmp');
    fs.writeFileSync(tmp, JSON.stringify(job, null, 1));
    fs.renameSync(tmp, file(job, 'job.json'));
  }
  function note(job, line) {
    job.log = (job.log || []).concat(new Date(now()).toISOString().slice(11, 19) + ' ' + line).slice(-40);
  }
  function stage(job, s, detail) { job.stage = s; job.detail = detail || ''; job.updatedAt = new Date(now()).toISOString(); save(job); }

  /* Pick up what a restart interrupted. */
  for (const id of fs.readdirSync(root)) {
    try {
      const job = JSON.parse(fs.readFileSync(path.join(root, id, 'job.json'), 'utf8'));
      /* An upload nobody finished: a closed tab, a lost connection. Clear it after a day. */
      if (job.stage === 'uploading' && now() - Date.parse(job.updatedAt || job.createdAt) > 24 * 3600 * 1000) { fs.rmSync(path.join(root, id), { recursive: true, force: true }); continue; }
      jobs.set(job.id, job);
      if (['queued', 'listening', 'choosing', 'rendering'].indexOf(job.stage) >= 0 || (job.stage === 'waiting' && cfg.hasKey)) {
        (job.clips || []).forEach((c) => { if (c.status === 'rendering') c.status = 'pending'; });
        note(job, 'picked up after a restart');
        job.stage = 'queued'; queue.push(job.id);
      }
    } catch (e) { /* not a job folder */ }
  }

  function free() {
    try { const s = fs.statfsSync(root); return s.bavail * s.bsize; } catch (e) { return null; }
  }

  function view(job) {
    return {
      id: job.id, name: job.name, createdAt: job.createdAt, updatedAt: job.updatedAt,
      stage: job.stage, stageLabel: STAGES[job.stage] || job.stage, detail: job.detail || '', error: job.error || '',
      bytes: job.bytes, received: job.received, source: job.source || null, sourceKept: fs.existsSync(file(job, 'source')),
      settings: { who: job.settings.who, role: job.settings.role, count: job.settings.count, direction: job.settings.direction },
      speakers: job.speakers || '', notes: job.notes || [],
      clips: (job.clips || []).map((c) => ({
        n: c.n, title: c.title, theme: c.theme, hook: c.hook, caption: c.caption, flags: c.flags, speaking: c.speaking,
        seconds: c.seconds, from: c.ranges, transcript: c.transcript, status: c.status, error: c.error || '', bytes: c.bytes || 0,
        version: c.version || 0, edited: !!c.edited, drive: c.drive || null, fileName: c.fileName
      }))
    };
  }

  function get(id) { const j = jobs.get(id); if (!j) throw new ClipError('That recording is no longer here.', 404); return j; }

  function create(input) {
    const name = text(input.name, 160) || 'recording';
    if (!VIDEO_TYPES.test(name)) throw new ClipError('Upload a video file: MP4, MOV, M4V, WebM or MKV.', 415);
    const bytes = Number(input.bytes);
    if (!(bytes > 0)) throw new ClipError('The file was empty.');
    if (bytes > MAX_BYTES) throw new ClipError('The recording is over 6 GB. Export a smaller copy and try again.', 413);
    const room = free();
    if (room !== null && bytes * 1.6 > room) {
      throw new ClipError('There is not enough room on the Studio\'s storage for this recording and its clips (' + Math.round(room / 1e8) / 10 + ' GB free). Delete an older recording here first, or make the Railway volume larger.', 507);
    }
    const s = input.settings || {};
    const job = {
      id: crypto.randomBytes(8).toString('hex'), name, bytes, received: 0,
      createdAt: new Date(now()).toISOString(), updatedAt: new Date(now()).toISOString(), stage: 'uploading', detail: '',
      settings: {
        who: text(s.who, 120), role: text(s.role, 120),
        count: Math.min(30, Math.max(1, Math.round(Number(s.count)) || 20)),
        direction: text(s.direction, 1200),
        brandName: text(s.brandName, 120), voiceBrief: text(s.voiceBrief, 24000),
        guardrails: (Array.isArray(s.guardrails) ? s.guardrails : []).map((g) => text(g, 400)).filter(Boolean).slice(0, 40),
        themes: (Array.isArray(s.themes) ? s.themes : []).map((t) => ({ name: text(t && t.name, 60), job: text(t && t.job, 300) })).filter((t) => t.name).slice(0, 12),
        look: art.lookFrom(s.look || {}),
        endLine: text(s.endLine, 60), endSub: text(s.endSub, 80), endSmall: text(s.endSmall, 220)
      },
      clips: [], log: []
    };
    fs.mkdirSync(jdir(job.id), { recursive: true });
    jobs.set(job.id, job); save(job);
    return job;
  }

  function chunk(id, offset, buf) {
    const job = get(id);
    if (job.stage !== 'uploading') throw new ClipError('That recording has already been uploaded.', 409);
    if (!Buffer.isBuffer(buf) || !buf.length || buf.length > MAX_CHUNK) throw new ClipError('That piece of the upload was empty or too large.', 413);
    /* Pieces arrive in order. A piece sent twice (a retry after a dropped connection) is
       answered with where the upload really stands, so the browser carries on from there. */
    if (offset !== job.received) return { received: job.received, bytes: job.bytes };
    if (job.received + buf.length > job.bytes) throw new ClipError('More arrived than the file holds.', 400);
    fs.appendFileSync(file(job, 'source'), buf);
    job.received += buf.length;
    if (job.received === job.bytes || job.received % (200 * 1024 * 1024) < buf.length) save(job);
    return { received: job.received, bytes: job.bytes };
  }

  function start(id) {
    const job = get(id);
    if (job.stage !== 'uploading') return job;
    if (job.received !== job.bytes) throw new ClipError('The upload is not finished: ' + job.received + ' of ' + job.bytes + ' bytes arrived.', 409);
    stage(job, 'queued'); queue.push(job.id); kick();
    return job;
  }

  function remove(id) {
    const job = get(id);
    if (job.stage !== 'uploading' && job.stage !== 'done' && job.stage !== 'failed' && job.stage !== 'waiting' && job.stage !== 'queued') {
      throw new ClipError('That recording is being worked on. Wait for it to finish, then delete it.', 409);
    }
    const i = queue.indexOf(id); if (i >= 0) queue.splice(i, 1);
    jobs.delete(id);
    fs.rmSync(jdir(id), { recursive: true, force: true });
  }

  /* A job that stopped keeps everything it had finished. Trying again starts at the stage
     that failed, not at the beginning. */
  function retry(id) {
    const job = get(id);
    if (job.stage !== 'failed' && job.stage !== 'waiting') throw new ClipError('That recording did not stop, so there is nothing to try again.', 409);
    (job.clips || []).forEach((c) => { if (c.status !== 'ready') c.status = 'pending'; });
    job.error = ''; note(job, 'tried again');
    stage(job, 'queued'); queue.push(job.id); kick();
    return job;
  }

  function dropSource(id) {
    const job = get(id);
    if (job.stage !== 'done') throw new ClipError('Keep the recording until its clips are finished.', 409);
    fs.rmSync(file(job, 'source'), { force: true });
    fs.rmSync(file(job, 'audio.pcm'), { force: true });
    return job;
  }

  /* ---------- the work ---------- */

  function kick() {
    if (working || !queue.length) return;
    working = true;
    const job = jobs.get(queue.shift());
    Promise.resolve().then(() => job ? work(job) : null).catch((e) => {
      if (job) {
        job.error = e && e.message ? e.message : String(e);
        note(job, 'stopped: ' + job.error);
        console.error('clips: ' + job.id + ' stopped:', job.error);
        stage(job, e && e.waiting ? 'waiting' : 'failed', '');
      }
    }).then(() => { working = false; kick(); });
  }

  async function work(job) {
    job.error = '';
    if (!kit) kit = opts.tools ? await opts.tools() : await tools();
    if (!kit.ffmpeg) throw new Error('ffmpeg is not installed on this server, so video cannot be cut here. On Railway it comes from nixpacks.toml in the repository; redeploy and try again.');
    const src = file(job, 'source');
    const wordsFile = file(job, 'words.json'), planFile = file(job, 'plan.json');

    if (!job.source) {
      stage(job, 'listening', 'Reading the file');
      job.source = await prober(src);
      if (job.source.duration > MAX_MINUTES * 60) throw new Error('The recording is over ' + MAX_MINUTES + ' minutes. Split it in two and upload each half.');
      if (job.source.duration < 20) throw new Error('The recording is under 20 seconds, which is already a clip.');
      job.notes = [];
      if (job.source.hdr && !kit.zscale) job.notes.push('This recording is HDR and the server cannot convert it, so colours may look flat.');
      save(job);
    }

    if (!fs.existsSync(wordsFile)) {
      if (!fs.existsSync(src)) throw new Error('The recording is no longer on the server. Upload it again.');
      const mins = Math.max(1, Math.round(job.source.duration / 60));
      stage(job, 'listening', 'Transcribing ' + mins + ' minutes of audio on this server. This takes about as long as the recording itself, and a little longer the first time while the model downloads. You can close this tab.');
      const pcm = file(job, 'audio.pcm');
      await extractAudio(src, pcm);
      const t = await transcriber(pcm, { cacheDir: path.join(root, '..', 'models'), model: cfg.model, log: (l) => { note(job, l); save(job); } });
      fs.rmSync(pcm, { force: true });
      if (!t.words || t.words.length < 30) throw new Error('Almost no speech was found in this recording.');
      fs.writeFileSync(wordsFile, JSON.stringify(t.words));
      note(job, t.words.length + ' words transcribed with ' + t.model);
    }
    const words = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
    const sentences = sentencesFrom(words);

    if (!fs.existsSync(planFile)) {
      if (!cfg.hasKey) throw Object.assign(new Error('The transcript is done. Choosing the moments needs Claude: set ANTHROPIC_API_KEY in Railway, Variables. The Studio picks this recording up again when it restarts.'), { waiting: true });
      stage(job, 'choosing', 'Claude is reading the transcript against the style guide');
      const s = job.settings;
      const p = await planner({
        name: job.name, duration: job.source.duration, count: s.count, who: s.who, direction: s.direction,
        brandName: s.brandName, voiceBrief: s.voiceBrief, guardrails: s.guardrails, themes: s.themes,
        sentences: sentences.map((x) => ({ id: x.id, start: x.start, end: x.end, text: x.text }))
      });
      fs.writeFileSync(planFile, JSON.stringify(p));
      note(job, p.clips.length + ' clips chosen' + (p.model ? ' by ' + p.model : ''));
    }
    if (!job.clips.length) {
      const p = JSON.parse(fs.readFileSync(planFile, 'utf8'));
      job.speakers = p.speakers || '';
      job.corrections = p.corrections || [];
      const base = slug(job.name);
      job.clips = p.clips.map((c, i) => {
        const b = build(words, sentences, c.ranges, job.corrections);
        const n = i + 1;
        return {
          n, title: c.title, theme: c.theme, hook: c.hook, caption: c.caption, flags: c.flags, speaking: c.speaking,
          sentences: c.ranges, ranges: b.ranges, cues: b.cues, seconds: b.seconds, transcript: b.transcript,
          status: 'pending', version: 0, fileName: String(n).padStart(2, '0') + '-' + slug(c.title) + '.mp4', base
        };
      }).filter((c) => c.cues.length && c.seconds >= 8);
      save(job);
    }

    const todo = job.clips.filter((c) => c.status !== 'ready');
    for (const c of todo) {
      stage(job, 'rendering', 'Clip ' + c.n + ' of ' + job.clips.length + ': ' + c.title);
      await renderOne(job, c);
    }
    const failed = job.clips.filter((c) => c.status === 'failed').length;
    note(job, (job.clips.length - failed) + ' clips ready' + (failed ? ', ' + failed + ' failed' : ''));
    stage(job, 'done', '');
  }

  async function renderOne(job, c) {
    c.status = 'rendering'; c.error = ''; save(job);
    try {
      const out = file(job, 'clip-' + c.n + '.mp4');
      await renderer({ job, clip: c, src: file(job, 'source'), out, work: file(job, 'work-' + c.n), zscale: kit && kit.zscale });
      c.bytes = fs.statSync(out).size;
      c.version = (c.version || 0) + 1;
      c.status = 'ready'; c.drive = null;
    } catch (e) {
      c.status = 'failed'; c.error = e && e.message ? e.message : String(e);
      note(job, 'clip ' + c.n + ' failed: ' + c.error);
    }
    save(job);
  }

  /* Change a clip's words. The hook and the theme are on the picture, so changing them
     means rendering that clip again; the caption is only text. */
  function update(id, n, input) {
    const job = get(id);
    const c = (job.clips || []).find((x) => x.n === n);
    if (!c) throw new ClipError('That clip is no longer here.', 404);
    if (job.stage !== 'done') throw new ClipError('Wait for the clips to finish rendering before editing one.', 409);
    const noDash = (s) => s.replace(/[–—]/g, ', ');
    let redraw = false;
    if (input.caption !== undefined) { c.caption = noDash(text(input.caption, 2200)); c.edited = true; }
    if (input.hook !== undefined) { const h = noDash(text(input.hook, 110)); if (h && h !== c.hook) { c.hook = h; redraw = true; c.edited = true; } }
    if (input.theme !== undefined) { const t = noDash(text(input.theme, 40)); if (t !== c.theme) { c.theme = t; redraw = true; c.edited = true; } }
    if (redraw) {
      if (!fs.existsSync(file(job, 'source'))) throw new ClipError('The recording was deleted to save room, so this clip cannot be rendered again. The caption can still be edited.', 409);
      c.status = 'pending'; stage(job, 'queued'); queue.push(job.id); kick();
    } else save(job);
    return job;
  }

  function clipPath(id, n) {
    const job = get(id);
    const c = (job.clips || []).find((x) => x.n === n);
    if (!c || c.status !== 'ready') throw new ClipError('That clip is not ready.', 404);
    return { path: file(job, 'clip-' + n + '.mp4'), name: c.fileName, bytes: c.bytes };
  }

  function sheet(job) {
    const L = [job.name + ': clips for review', '', 'Nothing here is approved. Each clip needs a person to watch it and to check what is listed under it before it is posted.', ''];
    const mmss = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    job.clips.filter((c) => c.status === 'ready').forEach((c) => {
      L.push('==== ' + c.fileName + ' ====', 'Title: ' + c.title, 'Theme: ' + (c.theme || ''), 'Hook on screen: ' + c.hook,
        'From the recording: ' + c.ranges.map((r) => mmss(r[0]) + ' to ' + mmss(r[1])).join(', ') + ' (' + Math.round(c.seconds) + ' seconds)', '', 'CAPTION', c.caption, '');
      if (c.flags && c.flags.length) L.push('CHECK BEFORE POSTING', ...c.flags.map((f) => '- ' + f), '');
      L.push('WHAT IS SAID', c.transcript, '', '');
    });
    return L.join('\n');
  }

  async function drive(id, n) {
    const job = get(id);
    if (!opts.saveToDrive) throw new ClipError('Google Drive is not available on this server.', 503);
    const list = job.clips.filter((c) => c.status === 'ready' && (n ? c.n === n : !c.drive));
    if (!list.length) throw new ClipError(n ? 'That clip is not ready.' : 'Every finished clip is already in Drive.', 409);
    let folder = null;
    for (const c of list) {
      const r = await opts.saveToDrive({ name: c.base + ' ' + c.fileName, mimeType: 'video/mp4', bytes: fs.readFileSync(file(job, 'clip-' + c.n + '.mp4')) });
      c.drive = { link: r.file.link, at: new Date(now()).toISOString() }; folder = r.folder;
      save(job);
    }
    if (!n) {
      try { await opts.saveToDrive({ name: slug(job.name) + ' captions and review notes.txt', mimeType: 'text/plain', bytes: Buffer.from(sheet(job), 'utf8') }); }
      catch (e) { note(job, 'the review notes could not be saved to Drive: ' + (e && e.message)); save(job); }
    }
    return { saved: list.length, folder };
  }

  setImmediate(kick);

  return {
    cfg, create, chunk, start, remove, retry, dropSource, update, clipPath, drive, sheet: (id) => sheet(get(id)),
    get: (id) => view(get(id)),
    list: () => Array.from(jobs.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(view),
    async status() {
      if (!kit) kit = opts.tools ? await opts.tools() : await tools();
      return { enabled: cfg.gated, persistent: cfg.persistent, ffmpeg: kit.ffmpeg, colour: kit.zscale, claude: cfg.hasKey, freeBytes: free(), working, queued: queue.length, maxBytes: MAX_BYTES, chunkBytes: 16 * 1024 * 1024 };
    },
    _idle: () => !working && !queue.length
  };
}

/* ---------- one clip ---------- */

async function renderClip({ job, clip, src, out, work, zscale }) {
  const s = job.settings;
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  try {
    const w = (name, buf) => { const p = path.join(work, name); fs.writeFileSync(p, buf); return p; };
    const bug = w('bug.png', art.bug(s.look));
    const title = w('title.png', art.title(s.look, clip.theme, clip.hook));
    const who = s.who ? w('lower.png', art.lower(s.look, s.who, s.role)) : null;
    const end = w('end.png', art.end(s.look, { sub: s.endSub, line: s.endLine, small: s.endSmall }));
    const blank = path.join(work, 'blank.png');
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1920,format=rgba', '-frames:v', '1', blank]);

    /* 1. The footage: each range cut, colour-corrected, fitted to the vertical frame, joined. */
    const footage = path.join(work, 'footage.mkv');
    const fit = (job.source.hdr && zscale ? TONEMAP + ',' : '') + 'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,fps=30,format=yuv420p,setpts=PTS-STARTPTS';
    let args = ['-v', 'error', '-y'], fc = '';
    clip.ranges.forEach(([a, b]) => { args = args.concat(['-ss', a.toFixed(3), '-t', (b - a).toFixed(3), '-i', src]); });
    clip.ranges.forEach((r, i) => { fc += '[' + i + ':v:0]' + fit + '[v' + i + '];[' + i + ':a:0]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,afade=t=in:d=0.04,areverse,afade=t=in:d=0.08,areverse[a' + i + '];'; });
    fc += clip.ranges.map((r, i) => '[v' + i + '][a' + i + ']').join('') + 'concat=n=' + clip.ranges.length + ':v=1:a=1[v][a]';
    await run('ffmpeg', args.concat(['-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-max_muxing_queue_size', '99999', footage]));
    const dur = clip.ranges.reduce((t, [a, b]) => t + (b - a), 0);

    /* 2. The caption track: one PNG per caption, a transparent frame in the gaps. */
    const lines = [];
    let t = 0;
    clip.cues.forEach((q, i) => {
      const a = Math.max(t, q.start), b = Math.min(dur, q.end);
      if (b <= a) return;
      if (a > t) lines.push("file '" + blank + "'", 'duration ' + (a - t).toFixed(3));
      lines.push("file '" + w('cap' + String(i).padStart(3, '0') + '.png', art.caption(s.look, q.text)) + "'", 'duration ' + (b - a).toFixed(3));
      t = b;
    });
    if (t < dur) lines.push("file '" + blank + "'", 'duration ' + (dur - t).toFixed(3));
    lines.push("file '" + blank + "'");
    const caps = path.join(work, 'caps.txt');
    fs.writeFileSync(caps, lines.join('\n') + '\n');

    /* 3. The brand on top, then the end card. */
    const inputs = ['-i', footage, '-f', 'concat', '-safe', '0', '-i', caps, '-loop', '1', '-t', String(TITLE_S), '-i', title, '-loop', '1', '-t', String(END_S), '-i', end, '-i', bug];
    let g = '[4:v]format=rgba[bug];[0:v][bug]overlay=0:0[v0];[1:v]format=rgba,fps=30,setpts=PTS-STARTPTS[caps];[v0][caps]overlay=0:0:shortest=1[v1];' +
      '[2:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=' + (TITLE_S - 0.4).toFixed(2) + ':d=0.4:alpha=1[title];[v1][title]overlay=0:0:eof_action=pass[v2];';
    let last = 'v2';
    if (who) {
      inputs.push('-loop', '1', '-t', String(LOWER_S), '-i', who);
      g += '[5:v]format=rgba,fade=t=in:st=0:d=0.35:alpha=1,fade=t=out:st=' + (LOWER_S - 0.35).toFixed(2) + ':d=0.35:alpha=1,setpts=PTS+' + LOWER_AT + '/TB[lower];[v2][lower]overlay=0:0:eof_action=pass[v3];';
      last = 'v3';
    }
    g += '[' + last + ']format=yuv420p,setsar=1[main];[3:v]format=rgba,fps=30,fade=t=in:st=0:d=0.3,format=yuv420p,setsar=1[endv];' +
      '[0:a]afade=t=out:st=' + Math.max(0, dur - 0.25).toFixed(2) + ':d=0.25[a0];anullsrc=r=48000:cl=stereo,atrim=0:' + END_S + '[a1];[main][a0][endv][a1]concat=n=2:v=1:a=1[v][a]';
    const tmp = out + '.part.mp4';
    await run('ffmpeg', ['-v', 'error', '-y'].concat(inputs, ['-filter_complex', g, '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'faster', '-crf', '20', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-c:a', 'aac', '-b:a', '160k', '-max_muxing_queue_size', '99999', '-movflags', '+faststart', tmp]));
    fs.renameSync(tmp, out);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { createClips, sentencesFrom, build, renderClip, ClipError, STAGES };
