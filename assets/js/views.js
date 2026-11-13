/* Every screen in the Content Studio.

   The tab bodies here are the same ones the Operating System grew, moved across whole rather
   than rewritten, so the content and the behaviour are identical on both. What differs is the
   chrome around them: no household editing, no financials, no calculators. */
(function (global) {
  'use strict';

  var S = global.Store;
  var D;
  function useData(d) { D = d; }

  /* ---------------- helpers ---------------- */
  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function chip(label, tone) { return '<span class="chip ' + (tone || '') + '"><i class="dot"></i>' + esc(label) + '</span>'; }

  function empty(icon, title, body, action) {
    return '<div class="empty"><div class="empty-ico">' + icon + '</div>' +
      '<h2 style="margin-top:8px">' + esc(title) + '</h2>' +
      '<p class="lede" style="margin:6px auto 14px;max-width:44ch">' + esc(body) + '</p>' +
      (action || '') + '</div>';
  }

  function head(eyebrow, title, lede) {
    return '<div class="page-head"><div class="page-eyebrow">' + esc(eyebrow) + '</div>' +
      '<h1>' + esc(title) + '</h1>' +
      (lede ? '<p class="lede">' + esc(lede) + '</p>' : '') + '</div>';
  }

  /* Every generated piece has an audience. Classify it so the standard that applies to it
     is visible at the moment someone copies it, rather than buried in a setup prompt. */
  function audienceClass(audience) {
    var classes = D.practice.audienceClasses;
    for (var i = 0; i < classes.length; i++) {
      if (classes[i].applies.indexOf(audience) > -1) return classes[i];
    }
    return classes[classes.length - 1];
  }

  function audienceGate(audience) {
    var cls = audienceClass(audience);
    if (!cls.checks.length) {
      return '<p class="tiny muted" style="margin:8px 0 0">' + esc(cls.rule) + '</p>';
    }
    return '<details class="card card-quiet" style="margin:10px 0 0"><summary style="cursor:pointer;font-weight:600;font-size:12.5px">' +
      'Before this goes out</summary>' +
      '<p class="small" style="margin:8px 0 6px">' + esc(cls.rule) + '</p>' +
      '<ul class="bullets">' + cls.checks.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></details>';
  }

  function pieceHeader(name, audience, copyTarget) {
    var cls = audienceClass(audience);
    return '<div class="row-between"><div><h2 style="margin:0">' + esc(name) + '</h2>' +
      '<p class="small muted" style="margin:1px 0 0">Written for: ' + esc(audience) + '</p></div>' +
      '<div class="row">' + chip(cls.label, cls.tone) +
      '<button class="btn btn-sm" data-act="copy" data-target="' + copyTarget + '">Copy</button></div></div>';
  }

  function socialMeta(p) {
    var len = global.Social.lengthRead(p);
    return '<div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0 0">' +
      chip(global.Social.channelName(p.channel), 'info') +
      chip(global.Social.pillarName(p.pillar), 'idle') +
      chip(global.Social.segmentName(p.segment), 'idle') +
      chip(p.format, 'idle') +
      chip(len.label, len.tone) + '</div>';
  }

  function socialCard(p, idPrefix) {
    var tid = idPrefix + p.id;
    var h = global.Social.hook(p.body);
    return '<div class="card">' + pieceHeader(p.name, p.audience, tid) +
      socialMeta(p) +
      (p.channel === 'li'
        ? '<p class="tiny muted" style="margin:10px 0 2px">The line that shows before See more, ' + h.words + ' words</p>' +
          '<p class="small" style="margin:0 0 6px;font-weight:600">' + esc(h.text) + '</p>'
        : '') +
      '<pre class="prompt" id="' + tid + '">' + esc(global.Social.merge(p.body)) + '</pre>' +
      (p.visual ? '<p class="tiny muted" style="margin:8px 0 0"><strong>The image:</strong> ' + esc(p.visual) + '</p>' : '') +
      (p.note ? '<div class="callout" style="margin-top:10px"><strong>Why this one works.</strong> ' + esc(p.note) + '</div>' : '') +
      audienceGate(p.audience) + '</div>';
  }

  function tabSocial() {
    var SO = D.social;
    var ch = global.App.contentChannel || 'li';
    var pl = global.App.contentPillar || '';
    var meta = global.Social.channel(ch);
    var rows = global.Social.posts({ channel: ch, pillar: pl });

    return '<div class="callout brand" style="margin-bottom:14px"><strong>' + esc(SO.premise.split('.')[0]) + '.</strong> ' +
        esc(SO.premise.split('.').slice(1).join('.').trim()) + '</div>' +

      '<div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px">' +
        '<label class="field" style="max-width:280px;margin:0"><span class="field-l">Where it goes</span>' +
        '<select data-act="content-channel">' + SO.channels.map(function (c) {
          return '<option value="' + c.id + '"' + (c.id === ch ? ' selected' : '') + '>' + esc(c.name) + '</option>';
        }).join('') + '</select></label>' +
        '<label class="field" style="max-width:320px;margin:0"><span class="field-l">Which theme</span>' +
        '<select data-act="content-pillar"><option value="">Every theme</option>' + SO.pillars.map(function (p) {
          return '<option value="' + p.id + '"' + (p.id === pl ? ' selected' : '') + '>' + esc(p.name) + '</option>';
        }).join('') + '</select></label>' +
      '</div>' +

      (meta ? '<div class="card card-quiet"><h3>' + esc(meta.name) + '</h3>' +
        '<p class="small" style="margin:4px 0 8px">' + esc(meta.role) + '</p>' +
        '<p class="tiny muted" style="margin:0 0 8px"><strong>Cadence.</strong> ' + esc(meta.cadence) + '</p>' +
        '<ul class="bullets">' + meta.format.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' +
        (meta.engagement ? '<p class="tiny muted" style="margin:8px 0 0"><strong>After it posts.</strong> ' + esc(meta.engagement) + '</p>' : '') +
        '</div>' : '') +

      (pl ? (function () {
        var p = global.Social.pillar(pl);
        return p ? '<div class="card" style="border-color:var(--brand)"><h2>' + esc(p.name) + '</h2>' +
          '<p class="small" style="margin:4px 0 8px">' + esc(p.job) + '</p>' +
          '<p class="tiny muted" style="margin:0"><strong>Written for.</strong> ' + esc(p.reader) + '</p>' +
          '<p class="tiny muted" style="margin:4px 0 0"><strong>What it draws on.</strong> ' + esc(p.proof.join(', ')) + '</p>' +
          '<p class="tiny muted" style="margin:4px 0 0"><strong>Share of the calendar.</strong> ' + esc(p.share) + '</p></div>' : '';
      })() : '') +

      (rows.length
        ? rows.map(function (p) { return socialCard(p, 'so-'); }).join('')
        : empty('○', 'Nothing written for that combination yet',
            'Pick another theme, or write one. The pillar brief above says who it is for and what it has to do.'));
  }

  function tabCalendar() {
    var SO = D.social, W = SO.week, C = SO.cadence;
    var here = global.Social.currentWeek();
    var todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    return '<div class="callout brand" style="margin-bottom:14px"><strong>' + esc(W.heading) + '.</strong> ' + esc(W.note) + '</div>' +

      '<div class="grid g3" style="margin-bottom:6px">' +
      W.days.map(function (dy) {
        var isToday = dy.day === todayName;
        return '<div class="card' + (dy.posts ? '' : ' card-quiet') + '"' +
          (isToday ? ' style="border-color:var(--brand)"' : '') + '>' +
          '<div class="row-between"><h3 style="margin:0">' + esc(dy.day) + '</h3>' +
          (isToday ? chip('Today', 'good') : chip(dy.posts ? 'Post' : 'No post', dy.posts ? 'warn' : 'idle')) + '</div>' +
          '<p class="small" style="margin:6px 0 2px"><strong>' + esc(dy.role) + '</strong>' +
          (dy.format ? ' <span class="muted">' + esc(dy.format) + '</span>' : '') + '</p>' +
          '<p class="tiny muted" style="margin:4px 0 0">' + esc(dy.what) + '</p>' +
          '<p class="tiny" style="margin:8px 0 0;opacity:.8"><strong>Why.</strong> ' + esc(dy.why) + '</p>' +
          '<p class="tiny muted" style="margin:6px 0 0">' + dy.minutes + ' minutes</p></div>';
      }).join('') + '</div>' +

      '<div class="card" style="border-color:var(--alert)"><h2>' + esc(W.replyBlock.heading) + '</h2>' +
      '<p class="small" style="margin:4px 0 8px">' + esc(W.replyBlock.body) + '</p>' +
      '<div class="callout">' + esc(W.replyBlock.rule) + '</div></div>' +

      '<div class="card"><h2>Everywhere else</h2>' +
      '<div class="table-wrap"><table><thead><tr><th>Channel</th><th>How often</th><th>Why that much</th></tr></thead><tbody>' +
      W.cadenceElsewhere.map(function (x) {
        return '<tr><td><strong>' + esc(x.channel) + '</strong></td><td class="tiny">' + esc(x.what) + '</td>' +
          '<td class="tiny muted">' + esc(x.why) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      '<div class="section-title">' + esc(C.heading) + '</div>' +
      '<div class="card"><p class="small muted" style="margin:0 0 10px">' + esc(C.note) + '</p>' +
      '<div class="table-wrap"><table><thead><tr><th>What holds up</th><th>Detail</th><th>Where from</th></tr></thead><tbody>' +
      C.firm.map(function (f) {
        return '<tr><td><strong class="small">' + esc(f.finding) + '</strong></td>' +
          '<td class="tiny">' + esc(f.detail) + '</td><td class="tiny muted">' + esc(f.source) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<h3 style="margin:14px 0 6px">What does not hold up</h3>' +
      C.soft.map(function (x) {
        return '<div style="margin-bottom:9px"><strong class="small">' + esc(x.claim) + '</strong>' +
          '<p class="tiny muted" style="margin:1px 0 0">' + esc(x.reality) + '</p></div>';
      }).join('') +
      '<div class="callout" style="margin-top:6px">' + esc(C.forThisPractice) + '</div>' +
      '<p class="tiny muted" style="margin:10px 0 0">' + esc(W.honesty) + '</p></div>' +

      '<div class="section-title">' + esc(SO.calendar.heading) + '</div>' +
      '<div class="callout" style="margin-bottom:12px">' + esc(SO.calendar.note) + '</div>' +
      '<p class="tiny muted" style="margin:-4px 0 12px">' + esc(SO.calendar.videoNote) + '</p>' +
      SO.calendar.weeks.map(function (w) {
        var doc = w.document ? global.Social.post(w.document) : null;
        var vid = w.video ? global.Social.video(w.video) : null;
        var ig = (w.ig || []).map(global.Social.post).filter(Boolean);
        var isHere = w.n === here;
        return '<div class="card' + (isHere ? '' : ' card-quiet') + '"' + (isHere ? ' style="border-color:var(--brand)"' : '') + '>' +
          '<div class="row-between"><div class="row" style="gap:11px">' +
          '<span class="step-n">' + w.n + '</span><div><h3 style="margin:0">' + esc(w.theme) + '</h3>' +
          '<p class="tiny muted" style="margin:1px 0 0">' + esc(global.Social.pillarName(w.pillar)) + '</p></div></div>' +
          (isHere ? chip('You are here', 'good') : '') + '</div>' +
          '<div class="table-wrap" style="margin-top:10px"><table><tbody>' +
          '<tr><td style="width:90px"><strong class="tiny">Tuesday</strong><div class="tiny muted">Document</div></td>' +
          '<td class="tiny">' + esc(doc ? doc.name : 'Pick one from the library') + '</td></tr>' +
          '<tr><td><strong class="tiny">Wednesday</strong><div class="tiny muted">Video</div></td>' +
          '<td class="tiny">' + (vid ? '<a href="#/content/video">' + esc(vid.name) + '</a> <span class="muted">' + vid.seconds + 's</span>' : 'Pick one from the library') + '</td></tr>' +
          '<tr><td><strong class="tiny">Thursday</strong><div class="tiny muted">Live</div></td>' +
          '<td class="tiny">' + esc(w.live || '') + '</td></tr>' +
          (ig.length || w.email
            ? '<tr><td><strong class="tiny">Also</strong></td><td class="tiny">' +
              esc(ig.map(function (x) { return x.name; }).join(', ')) +
              (w.email ? (ig.length ? '. ' : '') + '<strong>Email.</strong> ' + esc(w.email) : '') + '</td></tr>'
            : '') +
          '</tbody></table></div></div>';
      }).join('') +

      '<div class="card"><h2>The live slot</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">Thursday is written that week from something that actually happened. It is what keeps the feed from reading like a content plan, and it is the first thing to protect when the week gets busy.</p>' +
      '<ul class="bullets">' + SO.calendar.liveSlotSources.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +

      '<div class="card"><h2>' + esc(SO.repurpose.heading) + '</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">' + esc(SO.repurpose.note) + '</p>' +
      SO.repurpose.chain.map(function (x) {
        return '<div class="row" style="gap:11px;align-items:flex-start;margin-bottom:10px">' +
          '<span class="step-n">' + esc(x.step) + '</span><div><strong class="small">' + esc(x.name) + '</strong>' +
          '<p class="small muted" style="margin:1px 0 0">' + esc(x.detail) + '</p></div></div>';
      }).join('') +
      '<div class="callout" style="margin-top:4px">' + esc(SO.repurpose.rule) + '</div></div>' +

      '<div class="card"><h2>' + esc(SO.metrics.heading) + '</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">' + esc(SO.metrics.note) + '</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Reading</th><th>What it tells you</th></tr></thead><tbody>' +
      SO.metrics.leading.concat(SO.metrics.lagging).map(function (m) {
        return '<tr><td><strong>' + esc(m.l) + '</strong></td><td class="tiny">' + esc(m.detail) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="callout" style="margin-top:10px">' + esc(SO.metrics.review) + '</div></div>';
  }

  /* The household and quarter are resolved by the studio itself and handed in, so these
     pieces merge from the same selection every other tab uses. */
  function tabEngage(c, sp) {
    var SO = D.social;
    var g = global.App.contentGroup || SO.engagementGroups[0].id;
    var rows = global.Social.engagement(g);

    return '<div class="callout brand" style="margin-bottom:14px"><strong>The relationship is the product.</strong> ' +
        'A client hears from most firms when something is being sold and when a statement is due. These are the pieces that go out the rest of the time, ' +
        'and they are most of what a client is describing when they tell somebody else what it is like to work with you.</div>' +

      '<label class="field" style="max-width:340px"><span class="field-l">Which part of the relationship</span>' +
      '<select data-act="content-group">' + SO.engagementGroups.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === g ? ' selected' : '') + '>' + esc(x.name) + '</option>';
      }).join('') + '</select></label>' +

      rows.map(function (e) {
        var tid = 'eg-' + e.id;
        return '<div class="card">' + pieceHeader(e.name, e.audience, tid) +
          '<p class="tiny muted" style="margin:8px 0 0"><strong>When it goes.</strong> ' + esc(e.when) + '</p>' +
          '<pre class="prompt" id="' + tid + '">' + esc(global.Social.merge(e.body, c, sp)) + '</pre>' +
          (e.note ? '<div class="callout" style="margin-top:10px">' + esc(e.note) + '</div>' : '') +
          audienceGate(e.audience) + '</div>';
      }).join('');
  }


  function tabVideo() {
    var V = D.social.video;
    return '<div class="callout brand" style="margin-bottom:14px"><strong>Why video.</strong> ' + esc(V.why) + '</div>' +

      '<div class="card" style="border-color:var(--alert)"><h2>The rules</h2>' +
      V.rules.map(function (r) {
        return '<div style="margin-bottom:10px"><strong class="small">' + esc(r.name) + '</strong>' +
          '<p class="small muted" style="margin:1px 0 0">' + esc(r.detail) + '</p></div>';
      }).join('') +
      '<div class="callout">' + esc(V.compliance) + '</div></div>' +

      '<div class="grid g2">' +
      '<div class="card"><h2>' + esc(V.setup.heading) + '</h2>' +
      '<p class="tiny muted" style="margin:2px 0 8px">' + esc(V.setup.note) + '</p>' +
      '<ul class="bullets">' + V.setup.kit.map(function (k) { return '<li>' + esc(k) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="card"><h2>The formats</h2>' +
      '<div class="table-wrap"><table><thead><tr><th>Format</th><th>When</th><th>Cost</th></tr></thead><tbody>' +
      V.formats.map(function (f) {
        return '<tr><td><strong class="tiny">' + esc(f.name) + '</strong></td><td class="tiny">' + esc(f.use) + '</td>' +
          '<td>' + chip(f.cost, f.cost === 'Low' ? 'good' : 'warn') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>' +

      '<div class="card" style="border-color:var(--brand)"><h2>' + esc(V.collaboration.heading) + '</h2>' +
      '<p class="small" style="margin:4px 0 10px">' + esc(V.collaboration.body) + '</p>' +
      '<ul class="bullets">' + V.collaboration.how.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul></div>' +

      '<div class="section-title">The library, ' + V.library.length + ' to record</div>' +
      V.library.map(function (v) {
        var fmt = V.formats.filter(function (f) { return f.id === v.format; })[0];
        return '<div class="card">' + pieceHeader(v.name, v.audience, 'vid-' + v.id) +
          '<div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0 0">' +
          chip(v.seconds + ' seconds', v.seconds <= 45 ? 'good' : 'idle') +
          chip(fmt ? fmt.name : v.format, 'info') +
          chip(global.Social.pillarName(v.pillar), 'idle') + '</div>' +
          '<p class="tiny muted" style="margin:10px 0 2px">The first three seconds, which is all a silent autoplay gives you</p>' +
          '<p class="small" style="margin:0 0 6px;font-weight:600">' + esc(v.hook) + '</p>' +
          '<pre class="prompt" id="vid-' + v.id + '">' + esc(v.script) + '</pre>' +
          '<div class="grid g2" style="margin-top:10px">' +
          '<div><p class="tiny muted" style="margin:0 0 3px">How to shoot it</p><p class="tiny" style="margin:0">' + esc(v.shot) + '</p></div>' +
          '<div><p class="tiny muted" style="margin:0 0 3px">The caption</p><p class="tiny" style="margin:0">' + esc(v.caption) + '</p></div></div>' +
          (v.note ? '<div class="callout" style="margin-top:10px">' + esc(v.note) + '</div>' : '') +
          audienceGate(v.audience) + '</div>';
      }).join('');
  }

  function tabProduction() {
    var P = D.social.production;
    return '<div class="callout brand" style="margin-bottom:14px"><strong>' + esc(P.heading) + '.</strong> ' + esc(P.note) + '</div>' +

      '<div class="card"><h2>The pipeline</h2>' +
      '<div class="table-wrap"><table><thead><tr><th></th><th>Stage</th><th>When</th><th>Who</th><th>What happens</th></tr></thead><tbody>' +
      P.pipeline.map(function (x) {
        return '<tr><td><span class="step-n">' + esc(x.n) + '</span></td>' +
          '<td><strong class="tiny">' + esc(x.stage) + '</strong></td>' +
          '<td class="tiny">' + esc(x.lead) + '</td><td class="tiny muted">' + esc(x.who) + '</td>' +
          '<td class="tiny">' + esc(x.detail) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="callout" style="margin-top:10px"><strong>How far ahead to run.</strong> ' + esc(P.weeksAhead) + '</div></div>' +

      '<div class="card"><h2>' + esc(P.batchDay.heading) + '</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">' + esc(P.batchDay.note) + '</p>' +
      '<ul class="bullets">' + P.batchDay.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +

      '<div class="card"><h2>' + esc(P.scheduling.heading) + '</h2>' +
      '<p class="small" style="margin:4px 0 12px">' + esc(P.scheduling.body) + '</p>' +
      P.scheduling.options.map(function (o) {
        return '<div class="card card-quiet" style="margin-bottom:8px"><div class="row-between">' +
          '<h3 style="margin:0">' + esc(o.name) + '</h3>' + chip(o.verdict.split('.')[0], o.tone) + '</div>' +
          '<p class="tiny muted" style="margin:6px 0 4px">' + esc(o.detail) + '</p>' +
          '<p class="tiny" style="margin:0"><strong>' + esc(o.verdict) + '</strong></p></div>';
      }).join('') +
      '<div class="callout" style="border-left-color:var(--alert);background:var(--alert-soft);margin-top:4px">' +
      esc(P.scheduling.never) + '</div></div>';
  }

  function tabVoice() {
    var SO = D.social;
    return '<div class="callout" style="border-left-color:var(--alert);background:var(--alert-soft);margin-bottom:14px">' +
      '<strong>' + esc(SO.compliance.heading) + '.</strong> ' + esc(SO.compliance.note) + '</div>' +

      '<div class="card"><h2>The rules everything is written under</h2>' +
      SO.compliance.rules.map(function (r) {
        return '<div style="margin-bottom:10px"><strong class="small">' + esc(r.name) + '</strong>' +
          '<p class="small muted" style="margin:1px 0 0">' + esc(r.detail) + '</p></div>';
      }).join('') +
      '<div class="callout" style="margin-top:4px"><strong>Read this list against the draft before it goes to review.</strong><ul class="bullets" style="margin-top:6px">' +
      SO.compliance.selfCheck.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>' +
      '<p class="tiny muted" style="margin:10px 0 0">' + esc(SO.compliance.footer) + '</p></div>' +

      '<div class="card" style="border-color:var(--brand)"><h2>' + esc(SO.voice.heading) + '</h2>' +
      '<p class="small muted" style="margin:4px 0 12px">' + esc(SO.voice.source) + '</p>' +
      '<div class="grid g2">' + SO.voice.principles.map(function (p) {
        return '<div class="card card-quiet"><h3>' + esc(p.name) + '</h3>' +
          '<p class="tiny muted" style="margin:6px 0 0">' + esc(p.detail) + '</p></div>';
      }).join('') + '</div></div>' +

      '<div class="card"><h2>The mechanics</h2>' +
      '<p class="small muted" style="margin:2px 0 8px">Small rules, applied every time. They are what make a body of work sound like one person wrote it.</p>' +
      '<ul class="bullets">' + SO.voice.mechanics.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>' +

      '<div class="card"><h2>Words to cut</h2>' +
      '<div class="table-wrap"><table><thead><tr><th>Never</th><th>Instead</th></tr></thead><tbody>' +
      SO.voice.banned.map(function (b) {
        return '<tr><td class="small"><strong>' + esc(b.word) + '</strong></td><td class="tiny">' + esc(b.instead) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      '<div class="grid g2">' +
      '<div class="card"><h2>How a piece opens</h2>' +
      '<p class="tiny muted" style="margin:2px 0 8px">' + esc(SO.voice.openings.note) + '</p>' +
      '<ul class="bullets">' + SO.voice.openings.patterns.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="card"><h2>How a piece closes</h2>' +
      '<p class="tiny muted" style="margin:2px 0 8px">Close on the reader\'s next move. Never on a link dropped without a reason.</p>' +
      '<ul class="bullets">' + SO.voice.closings.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>' +
      '</div>' +

      '<div class="section-title">The profiles</div>' +
      SO.profiles.map(function (pr) {
        return '<div class="card"><div class="row-between"><div><h2 style="margin:0">' + esc(pr.field) + '</h2>' +
          '<p class="small muted" style="margin:1px 0 0">' + esc(pr.channel) + '</p></div>' +
          '<button class="btn btn-sm" data-act="copy" data-target="pf-' + pr.id + '">Copy</button></div>' +
          '<p class="tiny muted" style="margin:8px 0 8px">' + esc(pr.guidance) + '</p>' +
          '<pre class="prompt" id="pf-' + pr.id + '">' + esc(pr.options.join('\n\n')) + '</pre></div>';
      }).join('') +

      '<div class="card"><h2>The placeholders</h2>' +
      '<p class="small muted" style="margin:2px 0 8px">What fills itself in and what a person has to fill by hand. The ones a person fills stay visible on purpose, so a half finished draft cannot be mistaken for a finished one.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Token</th><th>Fills with</th></tr></thead><tbody>' +
      SO.tokens.map(function (t) {
        return '<tr><td><code class="tiny">' + esc(t.token) + '</code></td><td class="tiny">' + esc(t.fills) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  function outreachTabs(mode) {
    return '<div class="tabs">' +
      ['connect:Who to reach this week', 'queue:Today\'s queue', 'people:Everyone you are working',
       'engage:Liking and commenting', 'sequences:The sequences', 'rules:Rules and training']
      .map(function (t) {
        var parts = t.split(':');
        return '<a class="tab' + (mode === parts[0] ? ' is-active' : '') + '" href="#/outreach/' + parts[0] + '">' +
          esc(parts[1]) + '</a>';
      }).join('') + '</div>';
  }

  /* The board. Ranked people standing next to the practice, each with the route in and the
     first message already written. */
  function tabConnect() {
    var O = D.outreach;
    var rows = global.Outreach.candidates();
    var top = rows.slice(0, 24);

    if (!rows.length) {
      return empty('○', 'Nothing on the board',
        'The board reads your own network: the professionals on your clients\' teams, the people around each household, the lanes nobody covers, and the signals you have recorded. Fill any of those in and names appear here.',
        '<a class="btn btn-primary btn-lg" href="#/clients">Open clients</a>' +
        '<a class="btn btn-lg" data-act="pr-add" href="#">Add somebody by hand</a>');
    }

    return '<div class="callout brand" style="margin-bottom:14px"><strong>' + esc(O.discovery.heading) + '.</strong> ' +
      esc(O.discovery.note) + '</div>' +

      '<div class="row-between" style="margin-bottom:12px">' +
      '<p class="small muted" style="margin:0">' + esc(O.discovery.weekly) + '</p>' +
      '<button class="btn btn-sm" data-act="pr-add">Add somebody by hand</button></div>' +

      top.map(function (c, i) {
        var d = c.draft;
        var draft = d ? global.Outreach.merge(d.body, c) : '';
        var open = draft ? global.Outreach.openTokens(draft) : [];
        var tid = 'cand-' + c.key;

        return '<div class="card">' +
          '<div class="row-between"><div class="row" style="gap:11px;align-items:flex-start">' +
          '<span class="step-n">' + (i + 1) + '</span>' +
          '<div><h2 style="margin:0">' + esc(c.headline) + '</h2>' +
          '<p class="small muted" style="margin:1px 0 0">' +
          esc([c.kind === 'lane' ? '' : c.role, c.firm].filter(Boolean).join(' · ') ||
              global.Outreach.sourceName(c.source)) + '</p></div></div>' +
          '<div class="row" style="gap:6px">' + chip(c.kindLabel, 'idle') + chip(c.scoreLabel, c.scoreTone) + '</div></div>' +

          '<div class="grid g2" style="margin-top:10px">' +
          '<div><p class="tiny muted" style="margin:0 0 3px">Why them</p>' +
          '<p class="small" style="margin:0">' + esc(c.why) + '</p></div>' +
          '<div><p class="tiny muted" style="margin:0 0 3px">The way in</p>' +
          '<p class="small" style="margin:0">' + esc(c.path) + '</p></div></div>' +

          (draft
            ? '<div class="row-between" style="margin:12px 0 4px">' +
              '<p class="tiny muted" style="margin:0"><strong>' + esc(d.name) + '</strong>, the first thing you would send</p>' +
              '<button class="btn btn-sm" data-act="copy" data-target="' + tid + '">Copy</button></div>' +
              '<pre class="prompt" id="' + tid + '">' + esc(draft) + '</pre>' +
              (open.length
                ? '<p class="tiny" style="margin:6px 0 0;color:var(--alert)"><strong>Fill these before it sends:</strong> ' +
                  esc(open.join('  ')) + '</p>'
                : '') +
              (d.note ? '<p class="tiny muted" style="margin:8px 0 0">' + esc(d.note) + '</p>' : '')
            : '<div class="callout" style="margin-top:12px">This one is a conversation rather than a message. ' +
              esc(c.path) + '</div>') +

          '<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">' +
          (c.sequence
            ? '<button class="btn btn-primary btn-sm" data-act="pr-accept" data-key="' + esc(c.key) + '">Start working them</button>'
            : '<button class="btn btn-sm" data-act="pr-accept" data-key="' + esc(c.key) + '">Add to the people you are working</button>') +
          '<button class="btn btn-ghost btn-sm" data-act="pr-dismiss" data-key="' + esc(c.key) + '">Not this one</button>' +
          '</div></div>';
      }).join('') +

      (rows.length > top.length
        ? '<p class="tiny muted" style="margin-top:8px">' + (rows.length - top.length) +
          ' more below the fold. Work the top five rather than the whole board.</p>' : '');
  }

  /* Today's sends. One card per person with the step that is due and the draft merged. */
  function tabQueue() {
    var q = global.Outreach.queue();
    var soon = global.Outreach.upcoming();

    if (!q.length && !soon.length) {
      return empty('✓', 'Nothing due',
        'Nobody has a step waiting. Open the board and start working two or three people.',
        '<a class="btn btn-primary btn-lg" href="#/outreach/connect">Open the board</a>');
    }

    return (q.length
      ? '<div class="section-title">Due now</div>' + q.map(queueCard).join('')
      : '<div class="callout">Nothing due today. Everything running is on a future date.</div>') +

      (soon.length
        ? '<div class="section-title">Coming up</div>' +
          soon.slice(0, 15).map(function (p) {
            var st = global.Outreach.step(p);
            var seq = global.Outreach.sequence(p.sequence);
            return '<div class="todo"><div class="todo-body">' +
              '<div class="todo-t">' + esc(p.name || 'Unnamed') + '</div>' +
              '<div class="todo-d">' + esc((seq ? seq.name : '') + (st ? ' · ' + st.name : '')) + '</div></div>' +
              '<div class="todo-d">' + esc(S.friendlyDue(p.nextDue)) + '</div></div>';
          }).join('')
        : '');
  }

  function queueCard(p) {
    var st = global.Outreach.step(p);
    var seq = global.Outreach.sequence(p.sequence);
    if (!st) return '';
    var draft = global.Outreach.merge(st.body, p);
    var open = global.Outreach.openTokens(draft);
    var tid = 'q-' + p.id;
    var internal = st.audience === 'Internal';

    return '<div class="card">' +
      '<div class="row-between"><div><h2 style="margin:0">' + esc(p.name || 'Unnamed') + '</h2>' +
      '<p class="small muted" style="margin:1px 0 0">' +
      esc([p.role, p.firm].filter(Boolean).join(' · ')) + '</p></div>' +
      '<div class="row">' + chip(S.friendlyDue(p.nextDue), (p.nextDue < S.iso(S.today())) ? 'alert' : 'warn') + '</div></div>' +

      '<p class="tiny muted" style="margin:8px 0 0">' + esc(seq ? seq.name : '') +
      ', step ' + ((p.stepIndex || 0) + 1) + ' of ' + (seq ? seq.steps.length : 1) + '</p>' +

      '<div class="row-between" style="margin:10px 0 4px">' +
      '<p class="small" style="margin:0"><strong>' + esc(st.name) + '</strong></p>' +
      (internal ? '' : '<button class="btn btn-sm" data-act="copy" data-target="' + tid + '">Copy</button>') + '</div>' +

      '<pre class="prompt" id="' + tid + '">' + esc(draft) + '</pre>' +

      (open.length && !internal
        ? '<p class="tiny" style="margin:6px 0 0;color:var(--alert)"><strong>Fill these before it sends:</strong> ' +
          esc(open.join('  ')) + '</p>'
        : '') +

      (st.ifNoReply
        ? '<div class="callout" style="margin-top:10px"><strong>If nothing comes back.</strong> ' + esc(st.ifNoReply) + '</div>'
        : '') +

      (st.channel === 'email' ? mailRow(p, draft) : '') +

      '<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-primary btn-sm" data-act="pr-sent" data-pr="' + p.id + '">' +
      (internal ? 'Done' : 'Sent') + '</button>' +
      '<button class="btn btn-sm" data-act="pr-replied" data-pr="' + p.id + '">They replied</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="pr-stop" data-pr="' + p.id + '">Stop here</button>' +
      '</div>' +

      audienceGate(st.audience) + '</div>';
  }

  /* The send row, only on email steps. Draft first by design: it lands in the person's own
     Gmail, where they read it and press send, so the message leaves through the firm's normal
     mail flow rather than out of a web page. */
  function mailRow(p, draft) {
    var parsed = global.Mail.parse(draft);
    var st = global.Mail.status();
    var to = p.email || '';
    var open = global.Outreach.openTokens(draft).length;

    return '<div class="card card-quiet" style="margin-top:12px">' +
      '<div class="row-between" style="align-items:flex-end;gap:10px;flex-wrap:wrap">' +
      '<label class="field" style="margin:0;flex:1;min-width:220px"><span class="field-l">Send to</span>' +
      '<input type="email" data-act="pr-email" data-pr="' + p.id + '" value="' + esc(to) + '" placeholder="their@email.com"></label>' +
      '<div><p class="tiny muted" style="margin:0 0 3px">Subject</p>' +
      '<p class="small" style="margin:0"><strong>' + esc(parsed.subject || 'None in this draft') + '</strong></p></div>' +
      '</div>' +

      (open
        ? '<div class="callout" style="border-left-color:var(--alert);background:var(--alert-soft);margin-top:10px">' +
          'This draft still has ' + open + ' placeholder' + (open === 1 ? '' : 's') +
          ' in it. Fill them in the text above before this goes anywhere.</div>'
        : '') +

      '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">' +
      (st.state === 'unconfigured'
        ? '<a class="btn btn-sm" href="#/settings">Set Gmail up</a>'
        : '<button class="btn btn-primary btn-sm" data-act="mail-draft" data-pr="' + p.id + '">Create a Gmail draft</button>' +
          '<button class="btn btn-sm" data-act="mail-send" data-pr="' + p.id + '">Send it now</button>') +
      '<a class="btn btn-ghost btn-sm" data-act="mail-to" data-pr="' + p.id + '" href="#">Open in my mail app</a>' +
      '</div>' +
      '<p class="tiny muted" style="margin:8px 0 0">A draft goes to your Gmail so you read it and press send yourself, ' +
      'which keeps it inside your normal mail flow and archiving. Either way the step is logged and the sequence moves on.</p>' +
      '</div>';
  }

  function tabPeople() {
    var all = S.prospects();
    if (!all.length) {
      return empty('○', 'Nobody yet',
        'People arrive here when you accept them off the board, or when you add one by hand.',
        '<a class="btn btn-primary btn-lg" href="#/outreach/connect">Open the board</a>');
    }
    var order = { working: 0, new: 1, replied: 2, done: 3, stopped: 4 };
    var rows = all.slice().sort(function (a, b) {
      return (order[a.status] || 9) - (order[b.status] || 9);
    });

    return '<div class="row-between" style="margin-bottom:10px">' +
      '<p class="small muted" style="margin:0">Everyone the practice is deliberately working, and where each of them stands.</p>' +
      '<button class="btn btn-sm" data-act="pr-add">Add somebody</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Who</th><th>Where they came from</th>' +
      '<th>Sequence</th><th>Next</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows.map(function (p) {
        var seq = global.Outreach.sequence(p.sequence);
        var st = global.Outreach.step(p);
        var tone = p.status === 'working' ? 'good' : p.status === 'replied' ? 'gold'
          : p.status === 'stopped' ? 'idle' : p.status === 'done' ? 'info' : 'warn';
        return '<tr><td><strong>' + esc(p.name || 'Unnamed') + '</strong>' +
          '<div class="tiny muted">' + esc([p.role, p.firm].filter(Boolean).join(' · ')) + '</div></td>' +
          '<td class="tiny">' + esc(global.Outreach.sourceName(p.source)) +
          (p.referrer ? '<div class="tiny muted">via ' + esc(p.referrer) + '</div>' : '') + '</td>' +
          '<td class="tiny">' + esc(seq ? seq.name : 'None') + '</td>' +
          '<td class="tiny">' + esc(p.nextDue ? S.friendlyDue(p.nextDue) + (st ? ', ' + st.name : '') : '') + '</td>' +
          '<td>' + chip(p.status, tone) + '</td>' +
          '<td><button class="btn btn-sm btn-ghost" data-act="pr-remove" data-pr="' + p.id + '">Remove</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function tabEngagePlay() {
    var E = D.outreach.engagementPlay;
    return '<div class="callout brand" style="margin-bottom:14px"><strong>' + esc(E.rule) + '</strong></div>' +

      '<div class="card"><h2>' + esc(E.heading) + '</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">' + esc(E.note) + '</p>' +
      '<p class="small" style="margin:0"><strong>Cadence.</strong> ' + esc(E.cadence) + '</p></div>' +

      '<div class="grid g2">' +
      '<div class="card"><h2>Who is worth engaging with</h2>' +
      E.who.map(function (w) {
        return '<div style="margin-bottom:9px"><strong class="small">' + esc(w.name) + '</strong>' +
          '<p class="tiny muted" style="margin:1px 0 0">' + esc(w.detail) + '</p></div>';
      }).join('') + '</div>' +
      '<div class="card" style="border-color:var(--alert)"><h2>Never</h2>' +
      '<ul class="bullets">' + E.never.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' +
      '</div>' +

      '<div class="section-title">The comments worth leaving</div>' +
      E.archetypes.map(function (a) {
        return '<div class="card"><div class="row-between"><div><h3 style="margin:0">' + esc(a.name) + '</h3>' +
          '<p class="tiny muted" style="margin:1px 0 0">' + esc(a.when) + '</p></div>' +
          '<button class="btn btn-sm" data-act="copy" data-target="ea-' + a.id + '">Copy</button></div>' +
          '<pre class="prompt" id="ea-' + a.id + '">' + esc(a.draft) + '</pre>' +
          '<p class="tiny muted" style="margin:8px 0 0">' + esc(a.note) + '</p></div>';
      }).join('') +

      '<div class="card"><h2>Liking</h2><p class="small" style="margin:4px 0 0">' + esc(E.liking) + '</p></div>';
  }

  function tabSequences() {
    return D.outreach.sequences.map(function (seq) {
      return '<div class="card"><h2>' + esc(seq.name) + '</h2>' +
        '<p class="small muted" style="margin:4px 0 2px"><strong>Who.</strong> ' + esc(seq.who) + '</p>' +
        '<p class="small muted" style="margin:0 0 10px"><strong>When.</strong> ' + esc(seq.when) + '</p>' +
        seq.steps.map(function (st, i) {
          return '<div class="card card-quiet" style="margin-bottom:8px">' +
            '<div class="row-between"><div class="row" style="gap:9px">' +
            '<span class="step-n">' + (i + 1) + '</span>' +
            '<div><strong class="small">' + esc(st.name) + '</strong>' +
            '<div class="tiny muted">Day ' + st.day + ' · ' + esc(st.channel) + '</div></div></div>' +
            chip(st.audience, audienceClass(st.audience).tone) + '</div>' +
            '<pre class="prompt" style="margin-top:8px">' + esc(st.body) + '</pre>' +
            (st.ifNoReply ? '<p class="tiny muted" style="margin:8px 0 0"><strong>If nothing comes back.</strong> ' +
              esc(st.ifNoReply) + '</p>' : '') + '</div>';
        }).join('') +
        (seq.note ? '<div class="callout" style="margin-top:4px">' + esc(seq.note) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function tabOutreachRules() {
    var O = D.outreach;
    return '<div class="card" style="border-color:var(--brand)"><h2>' + esc(O.reality.heading) + '</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">' + esc(O.reality.note) + '</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Channel</th><th></th><th>What that means</th><th>What it would take</th></tr></thead><tbody>' +
      O.reality.channels.map(function (c) {
        return '<tr><td><strong>' + esc(c.channel) + '</strong></td>' +
          '<td>' + chip(c.state, c.tone) + '</td>' +
          '<td class="tiny">' + esc(c.detail) + '</td>' +
          '<td class="tiny muted">' + esc(c.needs) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="callout" style="margin-top:12px"><strong>The position.</strong> ' + esc(O.reality.position) + '</div></div>' +

      '<div class="card" style="border-color:var(--alert)"><h2>' + esc(O.guardrails.heading) + '</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">' + esc(O.guardrails.note) + '</p>' +
      O.guardrails.rules.map(function (r) {
        return '<div style="margin-bottom:10px"><strong class="small">' + esc(r.name) + '</strong>' +
          '<p class="small muted" style="margin:1px 0 0">' + esc(r.detail) + '</p></div>';
      }).join('') + '</div>' +

      '<div class="card"><h2>' + esc(O.casualVoice.heading) + '</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">' + esc(O.casualVoice.note) + '</p>' +
      '<div class="grid g2">' + O.casualVoice.rules.map(function (r) {
        return '<div class="card card-quiet"><h3>' + esc(r.name) + '</h3>' +
          '<p class="tiny muted" style="margin:6px 0 0">' + esc(r.detail) + '</p></div>';
      }).join('') + '</div>' +
      '<div class="callout" style="margin-top:12px"><strong>Never appears in a message.</strong><ul class="bullets" style="margin-top:6px">' +
      O.casualVoice.never.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div></div>' +

      '<div class="section-title">' + esc(O.scheduling.heading) + '</div>' +
      '<div class="card"><p class="small muted" style="margin:0 0 10px">' + esc(O.scheduling.note) + '</p>' +
      O.scheduling.pieces.map(function (pc) {
        return '<div class="card card-quiet" style="margin-bottom:8px"><h3>' + esc(pc.name) + '</h3>' +
          '<pre class="prompt" style="margin-top:8px">' + esc(pc.body) + '</pre></div>';
      }).join('') + '</div>' +

      '<div class="card" style="border-color:var(--brand)"><h2>' + esc(O.training.heading) + '</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">' + esc(O.training.note) + '</p>' +
      '<div class="table-wrap"><table><thead><tr><th>When</th><th>What</th></tr></thead><tbody>' +
      O.training.daily.map(function (d) {
        return '<tr><td><strong class="tiny">' + esc(d.time) + '</strong></td><td class="tiny">' + esc(d.what) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<h3 style="margin:14px 0 4px">What good looks like</h3>' +
      '<ul class="bullets">' + O.training.whatGoodLooks.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>' +
      '<h3 style="margin:14px 0 4px">How it goes wrong</h3>' +
      O.training.failureModes.map(function (f) {
        return '<div style="margin-bottom:9px"><strong class="small">' + esc(f.name) + '</strong>' +
          '<p class="tiny muted" style="margin:1px 0 0">' + esc(f.detail) + '</p></div>';
      }).join('') +
      '<div class="callout" style="margin-top:6px"><strong>The quarterly self audit.</strong><ul class="bullets" style="margin-top:6px">' +
      O.training.selfAudit.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div></div>';
  }

  /* Gmail. Each person connects their own mailbox; there is no shared sending account, because
     a message that says it came from an advisor should have left that advisor's mailbox. */
  function gmailCard() {
    var G = D.outreach.gmail;
    var st = global.Mail.status();
    var cid = S.operator().gmailClientId || '';

    return '<div class="card"><div class="row-between"><h2 style="margin:0">' + esc(G.heading) + '</h2>' +
      chip(st.label, st.tone) + '</div>' +
      '<p class="small muted" style="margin:6px 0 10px">' + esc(G.note) + '</p>' +
      '<div class="callout"><strong>What it can reach.</strong> ' + esc(G.privacy) + '</div>' +

      '<label class="field" style="margin-top:12px"><span class="field-l">Google OAuth client ID</span>' +
      '<span class="field-h">Ends in .apps.googleusercontent.com. Not a secret: the authorised origins list on the Google side is what protects it.</span>' +
      '<input type="text" data-act="operator" data-field="gmailClientId" value="' + esc(cid) + '" placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"></label>' +

      '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">' +
      (st.state === 'connected'
        ? '<button class="btn btn-sm" data-act="gmail-disconnect">Disconnect</button>'
        : '<button class="btn btn-primary btn-sm" data-act="gmail-connect"' +
          (st.state === 'unconfigured' ? ' disabled' : '') + '>Connect Gmail</button>') +
      '</div>' +

      (st.state === 'unavailable'
        ? '<div class="callout" style="border-left-color:var(--alert);background:var(--alert-soft);margin-top:10px">' +
          'The Google sign-in script did not load. That is usually a blocked connection or an ad blocker. ' +
          'Everything else on the site works without it, and the queue falls back to your own mail client.</div>'
        : '') +

      '<details class="card card-quiet" style="margin:12px 0 0"><summary style="cursor:pointer;font-weight:600;font-size:12.5px">Setting it up, once</summary>' +
      '<p class="tiny muted" style="margin:10px 0 8px">This address is the one to authorise on the Google side: ' +
      '<code>' + esc(location.origin) + '</code></p>' +
      G.setup.map(function (x) {
        return '<div class="row" style="gap:11px;align-items:flex-start;margin-bottom:9px">' +
          '<span class="step-n">' + esc(x.n) + '</span><div><strong class="small">' + esc(x.name) + '</strong>' +
          '<p class="tiny muted" style="margin:1px 0 0">' + esc(x.detail) + '</p></div></div>';
      }).join('') +
      '<p class="tiny muted" style="margin:8px 0 0">' + esc(G.caveat) + '</p></details></div>';
  }


  /* ---------------- Brands ----------------
     The style guide is the product of this screen, and the two documents at the bottom are the
     point of it: a voice brief anybody can write from, and a spec somebody builds the Canva
     templates from. A form nobody can hand to a designer has not finished the job. */

  function brandTabs(mode) {
    return '<div class="tabs">' +
      ['identity:Who the brand is', 'voice:How it sounds', 'visual:How it looks',
       'pillars:What it writes about', 'handoff:The handoff']
      .map(function (t) {
        var parts = t.split(':');
        return '<a class="tab' + (mode === parts[0] ? ' is-active' : '') + '" href="#/brand/' + parts[0] + '">' +
          esc(parts[1]) + '</a>';
      }).join('') + '</div>';
  }

  function brand(which) {
    var mode = which || 'identity';
    var b = S.activeBrand();

    if (!b) {
      return head('Brands', 'Nothing set up yet', 'A brand is who you are posting as: the identity, the voice, the palette, and everything it has written.') +
        empty('○', 'No brands yet',
          'Create one and the studio starts filling in around it. You can build the style guide here, or paste one you already have.',
          '<button class="btn btn-primary btn-lg" data-act="brand-new">Create a brand</button>');
    }

    var body;
    if (mode === 'voice') body = brandVoice(b);
    else if (mode === 'visual') body = brandVisual(b);
    else if (mode === 'pillars') body = brandPillars(b);
    else if (mode === 'handoff') body = brandHandoff(b);
    else if (mode === 'all') body = brandList();
    else body = brandIdentity(b);

    return head('Brand', b.name, completeness(b).note) + brandTabs(mode) + body;
  }

  /* How much of the guide is actually filled in. Shown because a half built guide produces half
     built content and the gap is invisible otherwise. */
  function completeness(b) {
    var checks = [
      ['Positioning', !!b.identity.positioning],
      ['Who it is written to', !!b.identity.audience],
      ['The wedge', !!b.identity.wedge],
      ['Voice principles', (b.voice.principles || []).length >= 3],
      ['Mechanics', (b.voice.mechanics || []).length >= 1],
      ['Words to cut', (b.voice.banned || []).length >= 1],
      ['Colors', (b.visual.colors || []).length >= 1],
      ['Fonts', (b.visual.fonts || []).length >= 1],
      ['Content themes', (b.pillars || []).length >= 3],
      ['Who reviews', !!b.identity.reviewedBy]
    ];
    var done = checks.filter(function (c) { return c[1]; }).length;
    return {
      done: done, total: checks.length, checks: checks,
      note: done === checks.length
        ? 'The style guide is complete. Everything the studio writes reads from it.'
        : done + ' of ' + checks.length + ' parts of the style guide are filled in. The gaps show up as vaguer content rather than as errors, which is why they are listed here.'
    };
  }

  function brandField(b, group, key, label, hint, big) {
    var val = (group ? (b[group] || {})[key] : b[key]) || '';
    return '<label class="field"><span class="field-l">' + esc(label) + '</span>' +
      (hint ? '<span class="field-h">' + esc(hint) + '</span>' : '') +
      (big
        ? '<textarea rows="3" data-act="brand-field" data-brand="' + b.id + '" data-group="' + (group || '') + '" data-key="' + key + '">' + esc(val) + '</textarea>'
        : '<input type="text" data-act="brand-field" data-brand="' + b.id + '" data-group="' + (group || '') + '" data-key="' + key + '" value="' + esc(val) + '">') +
      '</label>';
  }

  function brandIdentity(b) {
    var c = completeness(b);
    return '<div class="card"><div class="row-between"><h2 style="margin:0">The style guide</h2>' +
      chip(c.done + ' of ' + c.total, c.done === c.total ? 'good' : 'warn') + '</div>' +
      '<div class="grid g2" style="margin-top:10px">' +
      c.checks.map(function (x) {
        return '<div class="row" style="gap:7px"><span style="color:' + (x[1] ? 'var(--good)' : 'var(--warn)') + '">' +
          (x[1] ? '✓' : '○') + '</span><span class="tiny' + (x[1] ? '' : ' muted') + '">' + esc(x[0]) + '</span></div>';
      }).join('') + '</div></div>' +

      '<div class="card"><h2>Who the brand is</h2>' +
      '<p class="small muted" style="margin:4px 0 12px">Everything the studio drafts reads from these six answers. Vague answers here are why most content sounds like anybody.</p>' +
      brandField(b, '', 'name', 'Brand name') +
      brandField(b, 'identity', 'positioning', 'Positioning, in one line',
        'What you do and for whom. Not a slogan.') +
      brandField(b, 'identity', 'offer', 'What you actually sell', 'In plain words, as a client would describe it to somebody else.', true) +
      brandField(b, 'identity', 'market', 'Market', 'Where you are, and how far you work.') +
      brandField(b, 'identity', 'audience', 'Who it is written to',
        'One person, described specifically enough that you would recognise them across a table. The sharper this is, the sharper everything downstream.', true) +
      brandField(b, 'identity', 'wedge', 'The one thing you say that nobody else does',
        'The thing your market gets wrong that you can prove in under a minute. This becomes your most reposted idea.', true) +
      brandField(b, 'identity', 'tagline', 'Tagline, if there is one') +
      brandField(b, 'identity', 'reviewedBy', 'Who reviews anything public',
        'The person or process every public piece routes through. Left blank, the studio still says nothing is approved, but it cannot name who approves it.') +
      '</div>' +

      '<div class="card"><h2>Start from something you already have</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">Paste an existing style guide and the studio keeps it alongside the fields above, so nothing is lost in translation. ' +
      'It does not try to parse a design heavy PDF into fields, because that goes wrong quietly. Copy the words out and paste them here instead.</p>' +
      '<label class="field"><span class="field-l">An existing guide, pasted</span>' +
      '<textarea rows="6" data-act="brand-field" data-brand="' + b.id + '" data-group="" data-key="importedGuide" placeholder="Paste the voice and tone section, the rules, whatever exists.">' +
      esc(b.importedGuide || '') + '</textarea></label>' +
      '<div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">' +
      '<label class="btn btn-sm" style="cursor:pointer">Load a .txt or .md file<input type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" data-act="brand-guide-file" data-brand="' + b.id + '" hidden></label>' +
      '<label class="btn btn-sm" style="cursor:pointer">Import a brand as JSON<input type="file" accept="application/json,.json" data-act="brand-import" hidden></label>' +
      '</div></div>';
  }

  function brandVoice(b) {
    var v = b.voice || {};
    return '<div class="callout brand" style="margin-bottom:14px"><strong>This is the part that does the work.</strong> ' +
      'A brand with three sharp voice principles and a list of banned words produces consistent content from anybody who writes for it. ' +
      'A brand with adjectives like professional and approachable produces nothing anyone can act on.</div>' +

      '<div class="card"><h2>Principles</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">Each one is an instruction a writer can follow, not an adjective. Three to seven of them.</p>' +
      (v.principles || []).map(function (p, i) {
        return '<div class="card card-quiet" style="margin-bottom:8px"><div class="row-between">' +
          '<strong class="small">' + esc(p.name || 'Unnamed') + '</strong>' +
          '<button class="btn btn-ghost btn-sm" data-act="brand-list-remove" data-brand="' + b.id + '" data-list="principles" data-i="' + i + '">Remove</button></div>' +
          '<p class="tiny muted" style="margin:4px 0 0">' + esc(p.detail || '') + '</p></div>';
      }).join('') +
      '<div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">' +
      '<label class="field" style="margin:0;flex:1;min-width:160px"><span class="field-l">The instruction</span>' +
      '<input type="text" id="np-name" placeholder="Write to one person"></label>' +
      '<label class="field" style="margin:0;flex:2;min-width:220px"><span class="field-l">What it means in practice</span>' +
      '<input type="text" id="np-detail" placeholder="Second person, singular. Not clients, not businesses. You."></label>' +
      '<button class="btn btn-sm" data-act="brand-add-principle" data-brand="' + b.id + '">Add</button></div></div>' +

      '<div class="card"><h2>Mechanics</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">The small rules applied every time. Punctuation, numbers, emoji, capitalisation of your own terms. These are what make a body of work sound like one person wrote it.</p>' +
      '<ul class="bullets">' + (v.mechanics || []).map(function (m, i) {
        return '<li>' + esc(m) + ' <button class="btn btn-ghost btn-sm" data-act="brand-list-remove" data-brand="' + b.id + '" data-list="mechanics" data-i="' + i + '">remove</button></li>';
      }).join('') + '</ul>' +
      '<div class="row" style="gap:8px;align-items:flex-end;margin-top:8px">' +
      '<label class="field" style="margin:0;flex:1"><span class="field-l">A rule</span>' +
      '<input type="text" id="nm-text" placeholder="No em dashes and no en dashes anywhere."></label>' +
      '<button class="btn btn-sm" data-act="brand-add-mechanic" data-brand="' + b.id + '">Add</button></div></div>' +

      '<div class="card" style="border-color:var(--alert)"><h2>Words that never appear</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">With what to write instead, because a ban without a replacement just produces a pause.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Never</th><th>Instead</th><th></th></tr></thead><tbody>' +
      (v.banned || []).map(function (x, i) {
        return '<tr><td class="small"><strong>' + esc(x.word) + '</strong></td><td class="tiny">' + esc(x.instead || '') + '</td>' +
          '<td><button class="btn btn-ghost btn-sm" data-act="brand-list-remove" data-brand="' + b.id + '" data-list="banned" data-i="' + i + '">remove</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">' +
      '<label class="field" style="margin:0;flex:1;min-width:150px"><span class="field-l">Never</span>' +
      '<input type="text" id="nb-word" placeholder="leverage, unlock, solutions"></label>' +
      '<label class="field" style="margin:0;flex:2;min-width:200px"><span class="field-l">Instead</span>' +
      '<input type="text" id="nb-instead" placeholder="Say what actually happens."></label>' +
      '<button class="btn btn-sm" data-act="brand-add-banned" data-brand="' + b.id + '">Add</button></div></div>';
  }

  function brandVisual(b) {
    var vis = b.visual || {};
    return '<div class="card"><h2>Colors</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">Upload the logo and the studio reads its palette straight off the image, in this browser. Nothing is uploaded anywhere.</p>' +
      '<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
      (vis.colors || []).map(function (c, i) {
        return '<div class="card card-quiet" style="margin:0;min-width:150px">' +
          '<div style="height:34px;border-radius:5px;background:' + esc(c.hex) + ';border:1px solid rgba(0,0,0,.14)"></div>' +
          '<p class="tiny" style="margin:7px 0 0"><strong>' + esc(c.hex) + '</strong></p>' +
          '<p class="tiny muted" style="margin:1px 0 0">' + esc(c.name || '') + '</p>' +
          (c.pms || c.cmyk || c.rgb
            ? '<p class="tiny muted" style="margin:4px 0 0;line-height:1.5">' +
              (c.pms ? 'PMS ' + esc(c.pms) + '<br>' : '') +
              (c.cmyk ? 'CMYK ' + esc(c.cmyk) + '<br>' : '') +
              (c.rgb ? 'RGB ' + esc(c.rgb) : '') + '</p>'
            : '') +
          (c.use ? '<p class="tiny muted" style="margin:3px 0 0">' + esc(c.use) + '</p>' : '') +
          '<button class="btn btn-ghost btn-sm" style="margin-top:6px" data-act="brand-color-remove" data-brand="' + b.id + '" data-i="' + i + '">Remove</button></div>';
      }).join('') + '</div>' +
      '<div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">' +
      '<label class="field" style="margin:0;width:110px"><span class="field-l">Hex</span>' +
      '<input type="text" id="nc-hex" placeholder="#1d4d43"></label>' +
      '<label class="field" style="margin:0;flex:1;min-width:130px"><span class="field-l">Name</span>' +
      '<input type="text" id="nc-name" placeholder="Brand green"></label>' +
      '<label class="field" style="margin:0;flex:2;min-width:180px"><span class="field-l">Where it is used</span>' +
      '<input type="text" id="nc-use" placeholder="The ground on type-only posts"></label>' +
      '<button class="btn btn-sm" data-act="brand-add-color" data-brand="' + b.id + '">Add</button>' +
      '<label class="btn btn-sm btn-primary" style="cursor:pointer">Read a palette off the logo' +
      '<input type="file" accept="image/*" data-act="brand-logo" data-brand="' + b.id + '" hidden></label>' +
      '</div>' +
      (vis.logoData
        ? '<div class="row" style="margin-top:12px;gap:10px;align-items:center">' +
          '<img src="' + esc(vis.logoData) + '" alt="" style="height:54px;width:auto;border-radius:6px;border:1px solid var(--line)">' +
          '<span class="tiny muted">Held in this browser only, and used to read the palette.</span>' +
          '<button class="btn btn-ghost btn-sm" data-act="brand-logo-clear" data-brand="' + b.id + '">Remove</button></div>'
        : '') +
      (vis.gradient
        ? '<div style="margin-top:14px">' +
          '<div style="height:34px;border-radius:5px;border:1px solid rgba(0,0,0,.14);background:linear-gradient(90deg,' +
          esc(vis.gradient.from) + ',' + esc(vis.gradient.to) + ')"></div>' +
          '<p class="tiny" style="margin:7px 0 0"><strong>' + esc(vis.gradient.name || 'Gradient') + '</strong>' +
          ' &middot; ' + esc(vis.gradient.from) + ' to ' + esc(vis.gradient.to) + '</p>' +
          (vis.gradient.use ? '<p class="tiny muted" style="margin:2px 0 0">' + esc(vis.gradient.use) + '</p>' : '') +
          '</div>'
        : '') +
      (vis.colorNote ? '<p class="tiny muted" style="margin:14px 0 0">' + esc(vis.colorNote) + '</p>' : '') +
      '</div>' +

      '<div class="card"><h2>Fonts</h2>' +
      '<ul class="bullets">' + (vis.fonts || []).map(function (f, i) {
        return '<li><strong>' + esc(f.name) + '</strong>' + (f.use ? '. ' + esc(f.use) : '') +
          ' <button class="btn btn-ghost btn-sm" data-act="brand-font-remove" data-brand="' + b.id + '" data-i="' + i + '">remove</button></li>';
      }).join('') + '</ul>' +
      '<div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">' +
      '<label class="field" style="margin:0;flex:1;min-width:140px"><span class="field-l">Font</span>' +
      '<input type="text" id="nf-name" placeholder="Cormorant Garamond"></label>' +
      '<label class="field" style="margin:0;flex:2;min-width:180px"><span class="field-l">Used for</span>' +
      '<input type="text" id="nf-use" placeholder="Headings and anything considered"></label>' +
      '<button class="btn btn-sm" data-act="brand-add-font" data-brand="' + b.id + '">Add</button></div>' +
      (vis.fontNote ? '<p class="tiny muted" style="margin:12px 0 0">' + esc(vis.fontNote) + '</p>' : '') +
      ((vis.fontSubstitutes || []).length
        ? '<div class="callout" style="margin-top:12px"><strong>Where the real face cannot go.</strong>' +
          '<ul class="bullets" style="margin-top:6px">' + vis.fontSubstitutes.map(function (f) {
            return '<li>Instead of <strong>' + esc(f.instead_of) + '</strong>, use <strong>' + esc(f.use) + '</strong>' +
              (f.why ? '. ' + esc(f.why) : '') + '</li>';
          }).join('') + '</ul></div>'
        : '') + '</div>' +

      (((vis.logoLockups || []).length || vis.exclusionZone || (vis.prohibited || []).length)
        ? '<div class="card"><h2>Using the logo</h2>' +
          ((vis.logoLockups || []).length
            ? '<ul class="bullets">' + vis.logoLockups.map(function (l) {
                /* A lockup may be written as a plain sentence or as {name, use, file}.
                   Both are reasonable things to type, so read both rather than
                   silently rendering an empty bullet for the one we did not expect. */
                if (typeof l === 'string') {
                  var cut = l.indexOf(':');
                  return cut > 0 && cut < 40
                    ? '<li><strong>' + esc(l.slice(0, cut)) + '</strong>' + esc(l.slice(cut)) + '</li>'
                    : '<li>' + esc(l) + '</li>';
                }
                return '<li><strong>' + esc(l.name || '') + '</strong>' + (l.use ? '. ' + esc(l.use) : '') +
                  (l.file ? ' <span class="tiny muted">' + esc(l.file) + '</span>' : '') + '</li>';
              }).join('') + '</ul>'
            : '') +
          (vis.exclusionZone
            ? '<p class="small" style="margin:10px 0 0"><strong>Clear space.</strong> ' + esc(vis.exclusionZone) + '</p>'
            : '') +
          ((vis.prohibited || []).length
            ? '<p class="small" style="margin:12px 0 4px"><strong>Never.</strong></p>' +
              '<ul class="bullets">' + vis.prohibited.map(function (x) {
                return '<li>' + esc(x) + '</li>';
              }).join('') + '</ul>'
            : '') + '</div>'
        : '') +

      '<div class="card"><h2>Imagery</h2>' +
      brandField(b, 'visual', 'logoNote', 'The logo, described', 'How it should appear, and how it should not.', true) +
      brandField(b, 'visual', 'imageDirection', 'Image direction',
        'What a photograph for this brand looks like, and the cliches to refuse. This is the instruction a designer actually needs.', true) +
      (vis.patterns ? '<p class="small" style="margin:10px 0 0"><strong>Patterns.</strong> ' + esc(vis.patterns) + '</p>' : '') +
      (vis.socialIcons ? '<p class="small" style="margin:8px 0 0"><strong>Social icons.</strong> ' + esc(vis.socialIcons) + '</p>' : '') +
      '</div>';
  }

  function brandPillars(b) {
    return '<div class="callout brand" style="margin-bottom:14px"><strong>Content themes.</strong> ' +
      'Between four and seven. Each one needs a job and a reader, or it turns into a topic nobody can write to twice.</div>' +
      (b.pillars || []).map(function (p, i) {
        return '<div class="card"><div class="row-between">' +
          '<input type="text" class="cname" style="font-weight:650" data-act="brand-pillar-field" data-brand="' + b.id + '" data-i="' + i + '" data-key="name" value="' + esc(p.name || '') + '">' +
          '<button class="btn btn-ghost btn-sm" data-act="brand-pillar-remove" data-brand="' + b.id + '" data-i="' + i + '">Remove</button></div>' +
          '<label class="field" style="margin-top:8px"><span class="field-l">What this theme is for</span>' +
          '<textarea rows="2" data-act="brand-pillar-field" data-brand="' + b.id + '" data-i="' + i + '" data-key="job">' + esc(p.job || '') + '</textarea></label>' +
          '<label class="field"><span class="field-l">Who it is written for</span>' +
          '<input type="text" data-act="brand-pillar-field" data-brand="' + b.id + '" data-i="' + i + '" data-key="reader" value="' + esc(p.reader || '') + '"></label>' +
          '<label class="field"><span class="field-l">Share of the calendar</span>' +
          '<input type="text" data-act="brand-pillar-field" data-brand="' + b.id + '" data-i="' + i + '" data-key="share" value="' + esc(p.share || '') + '"></label>' +
          '</div>';
      }).join('') +
      '<div class="row"><button class="btn" data-act="brand-pillar-add" data-brand="' + b.id + '">Add a theme</button></div>';
  }

  function brandHandoff(b) {
    var brief = global.Brand.voiceBrief(b);
    var spec = global.Brand.canvaSpec(b);
    return '<div class="callout brand" style="margin-bottom:14px"><strong>Two documents, and they are the point of this screen.</strong> ' +
      'The first is what you hand a writer, an agency or an assistant so they can work in this voice without asking a question. ' +
      'The second is what somebody builds the Canva templates from.</div>' +

      '<div class="card"><div class="row-between"><div><h2 style="margin:0">The voice brief</h2>' +
      '<p class="small muted" style="margin:1px 0 0">Everything above, as one page somebody can write from.</p></div>' +
      '<button class="btn btn-sm" data-act="copy" data-target="vb">Copy</button></div>' +
      '<pre class="prompt" id="vb">' + esc(brief) + '</pre></div>' +

      '<div class="card"><div class="row-between"><div><h2 style="margin:0">The Canva template spec</h2>' +
      '<p class="small muted" style="margin:1px 0 0">Four templates, with the data field names the studio would autofill later.</p></div>' +
      '<button class="btn btn-sm" data-act="copy" data-target="cs">Copy</button></div>' +
      '<pre class="prompt" id="cs">' + esc(spec) + '</pre>' +
      '<div class="callout" style="margin-top:10px"><strong>Why a spec and not a design.</strong> ' +
      'Canva\'s API does not design a post from a brief. It fills data fields in a template somebody built by hand, then exports it. ' +
      'So the templates get made once, properly, and the studio feeds them after that. Name the fields exactly as the spec says or the autofill will not find them.</div></div>' +

      '<div class="card"><h2>Take the brand with you</h2>' +
      '<p class="small muted" style="margin:4px 0 10px">The whole brand as one file: identity, voice, palette, themes and everything it has written. Import it on another machine, or keep it as the backup.</p>' +
      '<div class="row"><button class="btn" data-act="brand-export" data-brand="' + b.id + '">Export this brand</button></div></div>';
  }

  function brandList() {
    var active = S.activeBrand();
    return '<div class="row-between" style="margin-bottom:10px">' +
      '<p class="small muted" style="margin:0">Each brand keeps its own style guide, library, calendar, board and queue. Nothing is shared between them except the craft.</p>' +
      '<button class="btn btn-sm btn-primary" data-act="brand-new">Create a brand</button></div>' +
      '<div class="grid g2">' + S.brands().map(function (b) {
        var c = completeness(b);
        var isActive = active && b.id === active.id;
        return '<div class="card' + (isActive ? '' : ' card-quiet') + '"' + (isActive ? ' style="border-color:var(--brand)"' : '') + '>' +
          '<div class="row-between"><h3 style="margin:0">' + esc(b.name) + '</h3>' +
          (isActive ? chip('Working on this one', 'good') : '') + '</div>' +
          '<p class="tiny muted" style="margin:4px 0 0">' + esc(b.identity.positioning || 'No positioning set') + '</p>' +
          '<div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">' +
          chip(c.done + ' of ' + c.total + ' set up', c.done === c.total ? 'good' : 'warn') +
          chip((b.posts || []).length + ' posts', 'idle') +
          chip((b.videos || []).length + ' videos', 'idle') + '</div>' +
          '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">' +
          (isActive ? '' : '<button class="btn btn-sm" data-act="brand-switch" data-brand="' + b.id + '">Work on this one</button>') +
          '<button class="btn btn-ghost btn-sm" data-act="brand-remove" data-brand="' + b.id + '">Delete</button>' +
          '</div></div>';
      }).join('') + '</div>';
  }

  /* ---------------- Content Studio ---------------- */
  function content(which) {
    var mode = which || 'social';
    var list = S.clients();
    var sel = global.App.contentClient || (list[0] && list[0].id) || '';
    var c = S.client(sel);
    var sprint = c ? S.currentSprint(c) : null;

    var body;
    if (mode === 'calendar') body = tabCalendar();
    else if (mode === 'video') body = tabVideo();
    else if (mode === 'production') body = tabProduction();
    else if (mode === 'engage') body = tabEngage(c, sprint);
    else if (mode === 'voice') body = tabVoice();
    else body = tabSocial();

    var picker = (mode === 'engage')
      ? (list.length
          ? '<label class="field" style="max-width:340px"><span class="field-l">Merge which household</span>' +
            '<select data-act="content-client">' + list.map(function (x) {
              return '<option value="' + x.id + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(x.name) + '</option>';
            }).join('') + '</select>' +
            '<span class="helper">From the reference extract. Anything it did not carry shows as a visible marker rather than a guess.</span></label>'
          : '<div class="callout">No households imported, so these keep their placeholders. ' +
            '<a href="#/settings">Import an extract</a> and they fill themselves in.</div>')
      : '';

    return head('Content Studio', 'What the program says in public', D.social.blurb) +
      '<div class="tabs">' +
      ['social:Social posts', 'video:Video', 'calendar:The week and the quarter',
       'production:Making it ahead of time', 'engage:Client engagement',
       'voice:Voice, profiles and rules'].map(function (t) {
        var parts = t.split(':');
        return '<a class="tab' + (mode === parts[0] ? ' is-active' : '') + '" href="#/content/' + parts[0] + '">' +
          esc(parts[1]) + '</a>';
      }).join('') + '</div>' + picker + body;
  }

  /* ---------------- Outreach ---------------- */
  function outreach(which) {
    var mode = which || 'connect';
    var body;
    if (mode === 'queue') body = tabQueue();
    else if (mode === 'people') body = tabPeople();
    else if (mode === 'engage') body = tabEngagePlay();
    else if (mode === 'sequences') body = tabSequences();
    else if (mode === 'rules') body = tabOutreachRules();
    else body = tabConnect();
    return head('Outreach', D.outreach.subtitle, D.outreach.blurb) + outreachTabs(mode) + body;
  }

  /* ---------------- Today ----------------
     What the calendar says is due this week, what is waiting to go out, and the top of the
     board. Three questions, answered before anybody has to click. */
  function today() {
    var q = global.Outreach.queue();
    var wk = global.Social.thisWeek();
    var board = global.Outreach.candidates().slice(0, 5);
    var hour = new Date().getHours();
    var greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    var name = S.state.advisor.name ? ', ' + S.state.advisor.name.split(' ')[0] : '';

    return '<div class="hero"><div class="page-eyebrow">' +
      new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + '</div>' +
      '<h1 style="margin-bottom:4px">' + esc(greet + name) + '</h1>' +
      '<p class="lede">' + (q.length
        ? esc(q.length === 1 ? 'One message is waiting to go out.' : q.length + ' messages are waiting to go out.')
        : 'Nothing is waiting. Here is the week.') + '</p></div>' +

      '<div class="grid g3">' +
      '<div class="stat' + (q.length ? ' is-alert' : '') + '"><div class="stat-n">' + q.length + '</div><div class="stat-l">Waiting to send</div></div>' +
      '<div class="stat"><div class="stat-n">' + (wk ? wk.pieces : 0) + '</div><div class="stat-l">Pieces due this week</div></div>' +
      '<div class="stat"><div class="stat-n">' + global.Outreach.candidates().length + '</div><div class="stat-l">On the board</div></div>' +
      '</div>' +
      (global.Experience ? global.Experience.todayCard() : '') +
      (global.Moments ? global.Moments.todayCard() : '') +

      (!S.hasReference()
        ? '<div class="callout brand" style="margin-top:14px"><strong>No reference imported yet.</strong> ' +
          'The board ranks the people standing next to the households you serve, and it needs the extract from the ' +
          'Operating System to see them. Without it you can still publish, and you can still work anybody you add by hand. ' +
          '<a href="#/settings">Import one</a>.</div>'
        : '') +

      (q.length
        ? '<div class="section-title">Waiting to go out</div>' +
          q.slice(0, 6).map(function (p) {
            var st = global.Outreach.step(p);
            return '<a class="todo" style="text-decoration:none;color:inherit" href="#/outreach/queue">' +
              '<div class="todo-body"><div class="todo-t">' + esc(p.name || 'Unnamed') + '</div>' +
              '<div class="todo-d">' + esc(st ? st.name : '') + '</div></div>' +
              '<div class="todo-d">' + esc(S.friendlyDue(p.nextDue)) + '</div></a>';
          }).join('')
        : '') +

      (wk
        ? '<div class="section-title">This week in the calendar</div>' +
          '<a class="card" style="text-decoration:none;color:inherit;display:block" href="#/content/calendar">' +
          '<div class="row-between"><div class="row" style="gap:11px">' +
          '<span class="step-n">' + wk.n + '</span><div><h3 style="margin:0">' + esc(wk.theme) + '</h3>' +
          '<p class="tiny muted" style="margin:1px 0 0">Week ' + wk.n + ' of the quarter, ' + wk.pieces + ' pieces scheduled</p></div></div>' +
          chip('Open the calendar', 'idle') + '</div></a>'
        : '') +

      (board.length
        ? '<div class="section-title">Top of the board</div>' +
          board.map(function (c) {
            return '<a class="todo" style="text-decoration:none;color:inherit" href="#/outreach/connect">' +
              '<div class="todo-body"><div class="todo-t">' + esc(c.headline) + '</div>' +
              '<div class="todo-d">' + esc(c.why) + '</div></div>' +
              '<div class="todo-d">' + esc(c.kindLabel) + '</div></a>';
          }).join('')
        : '');
  }

  /* ---------------- Reference ----------------
     What came across from the Operating System, shown plainly so anybody can see exactly what
     this site holds about a household, which is a short list and no money at all. */
  function reference() {
    var r = S.reference();
    if (!S.hasReference()) {
      return head('Reference', 'What the drafts merge from', 'Nothing imported yet.') +
        empty('○', 'No extract loaded',
          'The Operating System exports a contact and relationship extract: household names, professional teams, the people around each household, centres of influence, recent signals, and the quarter\'s three priorities. No financials. Import one and the board fills up.',
          '<a class="btn btn-primary btn-lg" href="#/settings">Import an extract</a>');
    }
    return head('Reference', 'What the drafts merge from',
      'Imported ' + S.friendlyDate(r.importedAt) + '. Read only here: the Operating System stays the source of truth, and nothing on this site writes back to it.') +

      '<div class="callout brand" style="margin-bottom:14px"><strong>What this site holds, and what it does not.</strong> ' +
      'Names, professional teams, the people around each household, centres of influence, recent signals and the quarter\'s three priorities. ' +
      'No revenue, no margins, no net worth, no debt, no valuation. That is by construction in the export, not a setting anybody can change here.</div>' +

      '<div class="section-title">Households, ' + r.clients.length + '</div>' +
      r.clients.map(function (c) {
        return '<div class="card"><div class="row-between"><div><h3 style="margin:0">' + esc(c.name) + '</h3>' +
          '<p class="tiny muted" style="margin:1px 0 0">' + esc([c.entity, c.industry].filter(Boolean).join(' · ')) + '</p></div>' +
          (c.sprint ? chip(c.sprint.quarter, 'idle') : '') + '</div>' +
          '<div class="grid g2" style="margin-top:10px">' +
          '<div><p class="tiny muted" style="margin:0 0 3px">Professional team</p><ul class="bullets">' +
          ((c.team || []).length
            ? c.team.map(function (m) { return '<li>' + esc(m.name) + (m.role ? ', ' + esc(m.role) : '') +
                (m.firm ? ' <span class="muted">' + esc(m.firm) + '</span>' : '') + '</li>'; }).join('')
            : '<li class="muted">None recorded</li>') + '</ul></div>' +
          '<div><p class="tiny muted" style="margin:0 0 3px">Around the household</p><ul class="bullets">' +
          ((c.people || []).length
            ? c.people.map(function (pp) { return '<li>' + esc(pp.name) + (pp.role ? ', ' + esc(pp.role) : '') + '</li>'; }).join('')
            : '<li class="muted">None recorded</li>') + '</ul></div></div>' +
          ((c.signals || []).length
            ? '<p class="tiny muted" style="margin:10px 0 3px">Recent signals</p><ul class="bullets">' +
              c.signals.map(function (sg) {
                var ev = global.Growth.eventType(sg.type);
                return '<li>' + esc((ev ? ev.name : 'Signal') + ' · ' + S.friendlyDate(sg.date)) + '</li>';
              }).join('') + '</ul>'
            : '') + '</div>';
      }).join('') +

      '<div class="section-title">Centres of influence, ' + r.cois.length + '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Who</th><th>Lane</th><th>Firm</th><th>Status</th></tr></thead><tbody>' +
      r.cois.map(function (x) {
        return '<tr><td><strong>' + esc(x.name || 'Unnamed') + '</strong></td>' +
          '<td class="tiny">' + esc(global.COI.laneName(x.lane)) + '</td>' +
          '<td class="tiny">' + esc(x.firm || '') + '</td>' +
          '<td class="tiny">' + esc(x.status || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------------- Settings ---------------- */
  function settings() {
    var r = S.reference();
    return head('Settings', 'Your setup',
      'This site stores what you are working in this browser. It holds no client financial detail, by design.') +

      '<div class="card"><h2>You</h2>' +
      '<p class="small muted" style="margin:4px 0 12px">Your own name, used to sign the drafts. The firm and the reviewer on any piece come from whichever brand you are working on, not from here.</p>' +
      '<label class="field" style="max-width:320px"><span class="field-l">Your name</span>' +
      '<input type="text" data-act="operator" data-field="name" value="' + esc(S.operator().name || '') + '" placeholder="Becky"></label>' +
      '<div class="row" style="margin-top:10px"><a class="btn btn-sm" href="#/brand">Open the brand style guide</a></div></div>' +

      '<div class="card" style="border-color:var(--brand)"><div class="row-between"><h2 style="margin:0">Reference from the Operating System</h2>' +
      chip(S.hasReference() ? 'Imported ' + S.friendlyDate(r.importedAt) : 'Nothing imported', S.hasReference() ? 'good' : 'warn') + '</div>' +
      '<p class="small muted" style="margin:6px 0 10px">The board ranks people standing next to the households you serve, so it needs to know who they are. ' +
      'In the Operating System use <strong>Export for the Content Studio</strong> on its Settings screen, then load the file here.</p>' +
      '<div class="callout"><strong>What the extract carries.</strong> Household and company names, the professional team, the people around each household, ' +
      'centres of influence, recent signals, and the quarter\'s three priorities. <strong>It carries no financials at all</strong>: no revenue, margins, net worth, debt or valuation. ' +
      'That is enforced by the export rather than by anything on this side.</div>' +
      '<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">' +
      '<label class="btn btn-primary" style="cursor:pointer">Import an extract<input type="file" accept="application/json,.json" data-act="import-extract" hidden></label>' +
      (S.hasReference()
        ? '<a class="btn" href="#/reference">See what came across</a>' +
          '<button class="btn btn-ghost" data-act="clear-reference">Remove it</button>'
        : '') +
      '</div>' +
      (S.hasReference()
        ? '<p class="tiny muted" style="margin:10px 0 0">' + r.clients.length + ' household' + (r.clients.length === 1 ? '' : 's') +
          ' and ' + r.cois.length + ' centre' + (r.cois.length === 1 ? '' : 's') + ' of influence. ' +
          'Re-import whenever the Operating System has moved on; it replaces what is here rather than merging.</p>'
        : '') + '</div>' +

      gmailCard() +

      '<div class="card"><h2>Your working state</h2>' +
      '<p class="small muted">The people you are working, their sequence state, and what you have turned down. Export to move it to another machine.</p>' +
      '<div class="row"><button class="btn" data-act="export">Export</button>' +
      '<label class="btn" style="cursor:pointer">Import<input type="file" accept="application/json,.json" data-act="import" hidden></label></div></div>' +

      '<div class="card"><h2>Appearance</h2>' +
      '<div class="row"><button class="btn btn-sm" data-act="theme" data-theme="light">Light</button>' +
      '<button class="btn btn-sm" data-act="theme" data-theme="dark">Dark</button>' +
      '<button class="btn btn-sm" data-act="theme" data-theme="">Match my system</button></div></div>' +

      '<div class="card"><h2>Start over</h2>' +
      '<p class="small muted">Clears everything on this site, including the imported reference. There is no undo.</p>' +
      '<button class="btn btn-danger" data-act="reset">Clear everything</button></div>';
  }

  global.Views = {
    useData: useData, esc: esc,
    today: today, content: content, outreach: outreach, brand: brand,
    reference: reference, settings: settings
  };
})(window);
