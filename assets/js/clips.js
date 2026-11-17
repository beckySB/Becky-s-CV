/* The clip maker: one long recording in, a set of branded vertical clips out.

   Drop in a recording and the Studio does the rest on its server: it transcribes the audio
   there, Claude chooses the moments under the brand's style guide, and each clip is cut and
   dressed in the brand. This screen uploads the file, shows the work as it happens, and then
   lays the clips out to be watched, edited, downloaded or saved to Drive.

   Nothing here posts anything. Every clip carries what a person should check first.

   The page keeps itself on screen while you are on it, and redraws only when something has
   actually changed and you are not in the middle of watching a clip or typing in one. */
(function (global) {
  'use strict';

  var CL = { status: null, jobs: null, offline: false, error: '', poll: null, sig: '', upload: null, busy: {}, edits: {}, form: null, driveOn: false };
  var KEY = 'www.studio.clips.form';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function chip(label, tone) { return '<span class="chip ' + (tone || '') + '"><i class="dot"></i>' + esc(label) + '</span>'; }
  function toast(m) { if (global.App && global.App.toast) global.App.toast(m); }
  function $(id) { return document.getElementById(id); }
  function brand() { return global.Store && global.Store.activeBrand ? global.Store.activeBrand() : null; }
  function size(b) { return b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : Math.round(b / 1e6) + ' MB'; }
  function mmss(t) { t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function when(iso) { return iso ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : ''; }

  function api(path, body, raw) {
    var opts = { credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.method = 'POST'; opts.headers['X-Studio-Request'] = '1';
      if (raw) { opts.headers['Content-Type'] = 'application/octet-stream'; opts.body = body; }
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    return fetch('api/clips/' + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /* ---------------- what the brand's style guide says ---------------- */

  function colour(b, re) {
    var c = ((b.visual && b.visual.colors) || []).filter(function (x) { return re.test(x.name || ''); })[0];
    return c ? c.hex : '';
  }
  function lockup(b) {
    var v = b.visual || {};
    if (v.lockup && v.lockup.wordmark) return v.lockup;
    /* No lockup in the style guide: the name itself, with any ampersand set apart. */
    return { eyebrow: '', wordmark: String(b.name || '').split(/\s+/).filter(Boolean).slice(0, 5) };
  }
  function defaults() {
    var b = brand() || {}, id = b.identity || {};
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}')[b.id] || {}; } catch (e) { saved = {}; }
    return {
      who: saved.who !== undefined ? saved.who : (id.attributionShort || id.advisor || ''),
      role: saved.role !== undefined ? saved.role : (id.videoRole || ''),
      count: saved.count || 20,
      direction: saved.direction || '',
      endLine: saved.endLine !== undefined ? saved.endLine : (id.videoEndLine || (id.website ? 'Visit ' + id.website : '')),
      endSub: saved.endSub !== undefined ? saved.endSub : (id.videoSubline || ''),
      endSmall: saved.endSmall !== undefined ? saved.endSmall : (id.videoSmallPrint || '')
    };
  }
  function remember() {
    var b = brand(); if (!b || !CL.form) return;
    try { var all = JSON.parse(localStorage.getItem(KEY) || '{}'); all[b.id] = CL.form; localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* private window */ }
  }
  function settings() {
    var b = brand() || {}, f = CL.form, D = global.DATA || {};
    var classes = (D.practice && D.practice.audienceClasses) || [];
    var rules = ((classes[0] && classes[0].checks) || []).concat((D.practice && D.practice.standingRules) || []);
    var lk = lockup(b);
    return {
      who: f.who, role: f.role, count: Number(f.count) || 20, direction: f.direction,
      endLine: f.endLine, endSub: f.endSub, endSmall: f.endSmall,
      brandName: b.name || '',
      voiceBrief: global.Brand && global.Brand.voiceBrief ? global.Brand.voiceBrief(b) : '',
      guardrails: rules,
      themes: (b.pillars || []).map(function (p) { return { name: p.name, job: p.job }; }),
      look: {
        ground: colour(b, /green|primary|navy|blue/i) || ((b.visual && b.visual.colors && b.visual.colors.filter(function (c) { return c.primary; })[0]) || {}).hex,
        deep: colour(b, /deep/i), accent: colour(b, /gold/i), cream: colour(b, /^cream/i),
        tagline: (b.identity && b.identity.tagline) || '', eyebrow: lk.eyebrow || '', wordmark: lk.wordmark
      }
    };
  }

  /* ---------------- loading ---------------- */

  function load() {
    if (CL.loading) return;
    CL.loading = true;
    api('status').then(function (st) {
      CL.status = st; CL.offline = false;
      return st.enabled ? api('jobs') : { jobs: [] };
    }).then(function (j) { CL.jobs = j.jobs; CL.error = ''; })
      .catch(function (e) { if (!CL.status) CL.offline = true; else CL.error = e.message; })
      .then(function () {
        CL.loading = false;
        draw(false);
        clearTimeout(CL.poll);
        var live = (CL.jobs || []).some(function (j) { return ['queued', 'listening', 'choosing', 'rendering'].indexOf(j.stage) >= 0; });
        if (onPage() && (live || CL.upload)) CL.poll = setTimeout(load, live ? 4000 : 8000);
      });
    if (!CL.driveAsked) {
      CL.driveAsked = true;
      fetch('api/social/status', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (st) { CL.driveOn = !!(st && st.google && !st.google.needsReconnect); draw(true); }).catch(function () {});
    }
  }
  function onPage() { return (location.hash || '').indexOf('#/clips') === 0; }

  /* ---------------- uploading ---------------- */

  function begin(file) {
    if (!file || CL.upload) return;
    if (!/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) { CL.error = 'Choose a video file: MP4, MOV, M4V, WebM or MKV.'; draw(true); return; }
    if (CL.status && file.size > CL.status.maxBytes) { CL.error = 'That recording is over 6 GB. Export a smaller copy and try again.'; draw(true); return; }
    CL.error = ''; remember();
    var up = CL.upload = { name: file.name, bytes: file.size, sent: 0, id: '', failed: 0 };
    draw(true);
    api('jobs', { name: file.name, bytes: file.size, settings: settings() }).then(function (r) {
      up.id = r.job.id;
      var step = (CL.status && CL.status.chunkBytes) || 16 * 1024 * 1024;
      function next() {
        if (up.sent >= file.size) return api('jobs/' + up.id + '/start', {});
        return api('jobs/' + up.id + '/chunk?offset=' + up.sent, file.slice(up.sent, Math.min(file.size, up.sent + step)), true).then(function (r) {
          up.sent = r.received; up.failed = 0; bar(); return next();
        }, function (e) {
          /* A dropped connection is normal on a long upload. Try the same piece again a few
             times before giving up; the server says where the upload really stands. */
          if (e.status && e.status < 500 && e.status !== 408) throw e;
          if (++up.failed > 6) throw new Error('The connection kept dropping. Check the internet and upload again.');
          return new Promise(function (ok) { setTimeout(ok, 1500 * up.failed); }).then(next);
        });
      }
      return next();
    }).then(function () { CL.upload = null; toast('Uploaded. The Studio is working on it now; you can close this tab.'); load(); })
      .catch(function (e) {
        var id = up.id; CL.upload = null; CL.error = 'The upload stopped: ' + e.message;
        if (id) api('jobs/' + id + '/delete', {}).catch(function () {}).then(load); else draw(true);
      });
  }
  function bar() {
    var up = CL.upload, el = $('cl-up-bar'), t = $('cl-up-text');
    if (!up || !el) return;
    el.style.width = (up.sent / up.bytes * 100).toFixed(1) + '%';
    if (t) t.textContent = size(up.sent) + ' of ' + size(up.bytes);
  }

  /* ---------------- the page ---------------- */

  function field(k, label, hint, ph, wide) {
    return '<label class="field"' + (wide ? ' style="grid-column:1/-1"' : '') + '><span class="field-l">' + esc(label) + '</span>' +
      (hint ? '<span class="field-h">' + esc(hint) + '</span>' : '') +
      '<input type="text" data-cl="form" data-k="' + k + '" value="' + esc(CL.form[k]) + '" placeholder="' + esc(ph || '') + '"></label>';
  }

  function setup() {
    var st = CL.status, need = [];
    if (!st.ffmpeg) need.push('The video tools are missing on this server. Redeploy the Studio from the repository, which installs them.');
    if (!st.claude) need.push('Set ANTHROPIC_API_KEY in Railway, Variables, so Claude can choose the moments. Without it a recording is transcribed and then waits.');
    if (!st.persistent) need.push('Attach a Railway volume, or recordings and clips are lost on every deploy.');
    return need.length ? '<div class="callout warn" style="margin-bottom:14px"><strong>Before the first recording.</strong><ul class="bullets" style="margin:6px 0 0">' + need.map(function (n) { return '<li class="small">' + esc(n) + '</li>'; }).join('') + '</ul></div>' : '';
  }

  function uploadCard() {
    var up = CL.upload, st = CL.status;
    if (up) {
      return '<div class="card"><h3 style="margin-top:0">Uploading ' + esc(up.name) + '</h3>' +
        '<div class="ve-bar"><i id="cl-up-bar" style="width:' + (up.sent / up.bytes * 100).toFixed(1) + '%"></i></div>' +
        '<p class="small muted" style="margin:8px 0 0"><span id="cl-up-text">' + size(up.sent) + ' of ' + size(up.bytes) + '</span>. Keep this tab open until the upload finishes. After that the work continues without it.</p></div>';
    }
    return '<div class="card"><h3 style="margin-top:0">A new recording</h3>' +
      '<div class="cl-drop" id="cl-drop"><p style="margin:0"><strong>Drop a recording here</strong>, or <label class="cl-pick">choose one<input type="file" id="cl-file" accept="video/*,.mov,.mp4,.m4v,.webm,.mkv" hidden></label>.</p>' +
      '<p class="tiny muted" style="margin:6px 0 0">A conversation, an interview, a talk. Up to two hours and 6 GB' + (st.freeBytes ? '; ' + size(st.freeBytes) + ' free on the Studio' : '') + '. It is transcribed on the Studio\'s own server and never sent to a transcription service.</p></div>' +
      '<div class="cl-grid" style="margin-top:14px">' +
      field('who', 'Who is on screen', 'Left to right, as they sit. Shown for the first few seconds of every clip. Leave empty for no name card.', 'Becky Gustafson & Amy Landry') +
      field('role', 'The line under the names', '', 'Co-hosts · Women Worth & Wealth') +
      '<label class="field"><span class="field-l">How many clips, at most</span><span class="field-h">Fewer come back if the recording does not hold that many good ones.</span>' +
      '<input type="number" min="1" max="30" data-cl="form" data-k="count" value="' + esc(CL.form.count) + '"></label>' +
      field('endLine', 'The button on the end card', '', 'Apply at wealthandwisdom.biz') +
      field('endSub', 'The gold line on the end card', '', 'Wealth Wednesdays · Jan to Apr 2027 · New Orleans') +
      field('endSmall', 'Small print on the end card', '', 'An educational program. Not financial, tax, or legal advice.') +
      '<label class="field" style="grid-column:1/-1"><span class="field-l">Direction for the edit, optional</span><span class="field-h">Anything the editor should know: what to favour, what to leave out, who must not be named.</span>' +
      '<textarea rows="2" data-cl="form" data-k="direction" placeholder="Favour the stories. Leave out the part about pricing.">' + esc(CL.form.direction) + '</textarea></label></div>' +
      '<p class="tiny muted" style="margin:10px 0 0">The look, the voice, the themes and the rules come from the <a href="#/brand">style guide</a>. The standard is fixed: high end, warm and polished.</p></div>';
  }

  var TONE = { uploading: 'info', queued: 'idle', listening: 'info', choosing: 'info', rendering: 'info', done: 'good', failed: 'alert', waiting: 'warn' };
  var STEPS = [['listening', 'Listen'], ['choosing', 'Choose'], ['rendering', 'Render'], ['done', 'Ready']];

  function progress(j) {
    var at = STEPS.map(function (s) { return s[0]; }).indexOf(j.stage);
    if (j.stage === 'queued') at = -1;
    return '<div class="cl-steps">' + STEPS.map(function (s, i) {
      var cls = at > i || j.stage === 'done' ? 'is-done' : at === i ? 'is-now' : '';
      return '<span class="cl-step ' + cls + '">' + esc(s[1]) + '</span>';
    }).join('') + '</div>' + (j.detail ? '<p class="small muted" style="margin:10px 0 0">' + esc(j.detail) + '</p>' : '');
  }

  function clipCard(j, c) {
    var key = j.id + '-' + c.n, e = CL.edits[key] || {}, busy = CL.busy[key];
    var hook = e.hook !== undefined ? e.hook : c.hook, cap = e.caption !== undefined ? e.caption : c.caption;
    var dirty = (e.hook !== undefined && e.hook !== c.hook) || (e.caption !== undefined && e.caption !== c.caption);
    var src = 'api/clips/jobs/' + j.id + '/clips/' + c.n + '.mp4';
    var media = c.status === 'ready'
      ? '<video class="cl-video" controls playsinline preload="metadata" src="' + src + '?v=' + c.version + '#t=0.6"></video>'
      : '<div class="cl-video cl-wait"><span class="small">' + (c.status === 'failed' ? 'This clip could not be rendered.' : c.status === 'rendering' ? 'Rendering…' : 'Waiting to render') + '</span></div>';
    return '<article class="cl-clip">' + media + '<div class="cl-body">' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">' + (c.theme ? chip(c.theme, 'gold') : '') + chip(Math.round(c.seconds) + ' seconds', 'idle') +
      (c.flags.length ? chip(c.flags.length === 1 ? '1 thing to check' : c.flags.length + ' things to check', 'warn') : chip('Nothing flagged', 'good')) +
      (c.drive ? '<a class="chip good" href="' + esc(c.drive.link) + '" target="_blank" rel="noopener"><i class="dot"></i>In Drive</a>' : '') + '</div>' +
      '<h3 class="cl-title">' + esc(c.title) + '</h3>' +
      '<p class="tiny muted" style="margin:0 0 10px">From ' + c.from.map(function (r) { return mmss(r[0]) + ' to ' + mmss(r[1]); }).join(', then ') + (c.speaking ? '. ' + esc(c.speaking) : '') + '</p>' +
      (c.status === 'failed' ? '<p class="small" style="color:var(--alert)">' + esc(c.error) + '</p>' : '') +
      (c.flags.length ? '<div class="callout warn cl-flags"><strong class="small">Check before posting</strong><ul class="bullets" style="margin:4px 0 0">' + c.flags.map(function (f) { return '<li class="small">' + esc(f) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<label class="field"><span class="field-l">The hook on screen</span><input type="text" maxlength="110" data-cl="hook" data-key="' + key + '" value="' + esc(hook) + '"></label>' +
      '<label class="field"><span class="field-l">Caption</span><textarea rows="6" data-cl="caption" data-key="' + key + '">' + esc(cap) + '</textarea></label>' +
      (global.Newsroom && global.Newsroom.checkChips ? '<div class="nr-checks">' + global.Newsroom.checkChips(cap, false) + '</div>' : '') +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">' +
      (dirty ? '<button class="btn btn-primary btn-sm" data-cl="save" data-id="' + j.id + '" data-n="' + c.n + '"' + (busy ? ' disabled' : '') + '>' + (e.hook !== undefined && e.hook !== c.hook ? 'Save and render again' : 'Save the caption') + '</button>' : '') +
      '<button class="btn btn-sm" data-cl="copy" data-key="' + key + '">Copy the caption</button>' +
      (c.status === 'ready' ? '<a class="btn btn-sm" href="' + src + '?download=1">Download</a>' +
        (CL.driveOn && !c.drive ? '<button class="btn btn-sm" data-cl="drive" data-id="' + j.id + '" data-n="' + c.n + '"' + (busy ? ' disabled' : '') + '>' + (busy === 'drive' ? 'Saving…' : 'Save to Drive') + '</button>' : '') : '') +
      '</div><details class="cl-said"><summary class="tiny">What is said</summary><p class="small muted">' + esc(c.transcript) + '</p></details></div></article>';
  }

  function jobCard(j) {
    var ready = j.clips.filter(function (c) { return c.status === 'ready'; });
    var unsaved = ready.filter(function (c) { return !c.drive; }).length;
    var flagged = ready.filter(function (c) { return c.flags.length; }).length;
    var busy = CL.busy[j.id];
    var head = '<div class="cl-jobhead"><div><h2 class="cl-jobname">' + esc(j.name) + '</h2>' +
      '<p class="tiny muted" style="margin:2px 0 0">' + esc(when(j.createdAt)) + (j.source ? ', ' + mmss(j.source.duration) + ' long' : '') + ', ' + size(j.bytes) + (j.speakers ? '. ' + esc(j.speakers) : '') + '</p></div>' +
      '<div>' + chip(j.stageLabel, TONE[j.stage]) + '</div></div>';
    var body = '';
    if (j.stage === 'failed' || j.stage === 'waiting') body += '<div class="callout ' + (j.stage === 'failed' ? 'alert' : 'warn') + '">' + esc(j.error) + '</div>' +
      '<p style="margin:12px 0 0"><button class="btn btn-primary btn-sm" data-cl="retry" data-id="' + j.id + '">Try again from where it stopped</button></p>';
    else if (j.stage !== 'done') body += progress(j);
    (j.notes || []).forEach(function (n) { body += '<p class="small muted">' + esc(n) + '</p>'; });
    if (j.stage === 'done') {
      body += '<p class="small" style="margin:0 0 12px"><strong>' + ready.length + (ready.length === 1 ? ' clip is' : ' clips are') + ' ready.</strong> ' +
        (flagged ? flagged + (flagged === 1 ? ' has' : ' have') + ' something to check before posting. ' : '') + 'Nothing is posted from here: watch each one, then download it or save it to Drive.</p>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
        (CL.driveOn ? '<button class="btn btn-primary btn-sm" data-cl="driveall" data-id="' + j.id + '"' + (busy || !unsaved ? ' disabled' : '') + '>' + (busy === 'drive' ? 'Saving to Google Drive…' : unsaved ? 'Save all ' + unsaved + ' to Google Drive' : 'All saved to Google Drive') + '</button>'
          : '<a class="btn btn-sm" href="#/publish/connections">Connect Google Drive</a>') +
        '<a class="btn btn-sm" href="api/clips/jobs/' + j.id + '/notes.txt">Download captions and review notes</a>' +
        (j.sourceKept ? '<button class="btn btn-ghost btn-sm" data-cl="dropsource" data-id="' + j.id + '">Delete the recording, keep the clips</button>' : '') + '</div>';
    }
    if (j.clips.length) body += '<div class="cl-clips">' + j.clips.map(function (c) { return clipCard(j, c); }).join('') + '</div>';
    var removable = ['done', 'failed', 'waiting', 'queued', 'uploading'].indexOf(j.stage) >= 0;
    return '<section class="card cl-job">' + head + body +
      (removable ? '<p style="margin:16px 0 0"><button class="btn btn-ghost btn-sm" data-cl="delete" data-id="' + j.id + '">Delete this recording and its clips</button></p>' : '') + '</section>';
  }

  function inner() {
    if (CL.offline) return '<div class="callout warn"><strong>The clip maker needs the hosted Studio.</strong> Recordings are transcribed, cut and rendered on the server.</div>';
    if (!CL.status) return '<p class="small muted">Loading…</p>';
    if (!CL.status.enabled) return '<div class="callout warn"><strong>The clip maker is off.</strong> It needs SITE_PASSWORD set in Railway, because recordings are of real people.</div>';
    var mine = CL.upload ? CL.upload.id : '';
    var jobs = (CL.jobs || []).filter(function (j) { return j.id !== mine && j.stage !== 'uploading'; });
    return setup() + (CL.error ? '<div class="callout alert" style="margin-bottom:14px">' + esc(CL.error) + '</div>' : '') + uploadCard() + jobs.map(jobCard).join('');
  }

  /* Redraw only when something changed, and never under someone watching or typing. */
  function draw(force) {
    var root = $('cl-root'); if (!root) return;
    var html = inner();
    if (!force && html === CL.sig) return;
    var a = document.activeElement;
    var typing = a && root.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'file';
    var watching = Array.prototype.some.call(root.querySelectorAll('video'), function (v) { return !v.paused && !v.ended; });
    if (!force && (typing || watching)) return;
    if (typing && force) { CL.pending = true; return; }
    var y = global.scrollY;
    CL.sig = html; root.innerHTML = html;
    global.scrollTo(0, y);
    var drop = $('cl-drop');
    if (drop) {
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
      drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); begin(e.dataTransfer.files[0]); });
    }
  }

  function view() {
    if (!CL.form) CL.form = defaults();
    setTimeout(function () { CL.sig = ''; draw(true); load(); }, 0);
    return '<div class="page-head"><div class="page-eyebrow">Content Studio</div><h1>Clip maker</h1>' +
      '<p class="lede">One long recording in, a set of finished vertical clips out. The Studio listens to it, chooses the moments worth sharing, and dresses each one in the brand: the logo, the hook, the names, the captions and the end card.</p></div>' +
      '<div id="cl-root"><p class="small muted">Loading…</p></div>';
  }

  /* ---------------- events ---------------- */

  function job(id) { return (CL.jobs || []).filter(function (j) { return j.id === id; })[0]; }
  function swap(j) { CL.jobs = (CL.jobs || []).map(function (x) { return x.id === j.id ? j : x; }); }

  document.addEventListener('input', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-cl]'); if (!el) return;
    var k = el.dataset.cl;
    if (k === 'form') { CL.form[el.dataset.k] = el.value; remember(); }
    else if (k === 'hook' || k === 'caption') { (CL.edits[el.dataset.key] = CL.edits[el.dataset.key] || {})[k] = el.value; }
  });
  document.addEventListener('focusout', function (ev) {
    if (!ev.target.closest || !ev.target.closest('#cl-root')) return;
    /* Show the Save button, and catch up on anything that changed while typing. */
    setTimeout(function () { draw(false); }, 150);
  });
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.id === 'cl-file') begin(ev.target.files[0]);
  });

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-cl]'); if (!el || /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    var k = el.dataset.cl, id = el.dataset.id, n = Number(el.dataset.n) || 0, key = id + '-' + n;
    var fail = function (e) { CL.error = e.message; };
    if (k === 'copy') {
      var parts = el.dataset.key.split('-'), j0 = job(parts[0]), c0 = j0 && j0.clips.filter(function (c) { return c.n === Number(parts[1]); })[0];
      var e0 = CL.edits[el.dataset.key] || {};
      var t = e0.caption !== undefined ? e0.caption : (c0 ? c0.caption : '');
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast('Caption copied.'); }, function () { toast('Could not copy. Select the caption and copy it by hand.'); });
      return;
    }
    if (k === 'save') {
      var e = CL.edits[key] || {};
      CL.busy[key] = 'save'; draw(true);
      api('jobs/' + id + '/clips/' + n, e).then(function (r) { swap(r.job); delete CL.edits[key]; toast(e.hook !== undefined ? 'Saved. Rendering that clip again.' : 'Caption saved.'); CL.error = ''; }, fail)
        .then(function () { delete CL.busy[key]; draw(true); load(); });
    } else if (k === 'drive' || k === 'driveall') {
      var bk = k === 'drive' ? key : id;
      CL.busy[bk] = 'drive'; draw(true);
      api('jobs/' + id + '/drive', { n: n }).then(function (r) { swap(r.job); CL.error = ''; toast(r.saved === 1 ? 'Saved to Google Drive.' : r.saved + ' clips and the review notes saved to Google Drive.'); }, fail)
        .then(function () { delete CL.busy[bk]; draw(true); });
    } else if (k === 'retry') {
      api('jobs/' + id + '/retry', {}).then(function (r) { swap(r.job); CL.error = ''; toast('Trying again.'); }, fail).then(function () { draw(true); load(); });
    } else if (k === 'dropsource') {
      if (!global.confirm('Delete the original recording from the Studio? The finished clips stay. You will not be able to change a hook and render again.')) return;
      api('jobs/' + id + '/drop-source', {}).then(function (r) { swap(r.job); }, fail).then(function () { draw(true); });
    } else if (k === 'delete') {
      if (!global.confirm('Delete this recording and every clip made from it? Clips already saved to Drive stay in Drive.')) return;
      api('jobs/' + id + '/delete', {}).then(function () { CL.jobs = (CL.jobs || []).filter(function (j) { return j.id !== id; }); CL.error = ''; }, fail).then(function () { draw(true); });
    }
  });

  global.Clips = { view: view, busy: function () { return !!CL.upload; }, _state: CL, _settings: settings };
})(window);
