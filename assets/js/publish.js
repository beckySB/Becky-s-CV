/* Publishing: the queue that posts to LinkedIn, Facebook and Instagram.

   A post arrives as a draft (from Post from photos, today). Someone reads it, edits it,
   picks a slot and approves it; the server posts it at that time and keeps the record.
   Nothing here posts on its own: approval is the step that says yes.

   All times are shown and entered in Central time, whatever the computer's clock says,
   because that is when the posts land for the people who read them. */
(function (global) {
  'use strict';

  var NAMES = { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram' };
  var ORDER = ['linkedin', 'facebook', 'instagram'];
  var LIMITS = { linkedin: 3000, facebook: 5000, instagram: 2200 };
  var STATUS = {
    draft: ['Draft', 'idle'], scheduled: ['Approved and scheduled', 'info'], publishing: ['Posting now', 'info'],
    published: ['Posted', 'good'], partial: ['Partly posted', 'warn'], failed: ['Failed', 'alert'],
    check: ['Check the accounts', 'alert'], cancelled: ['Cancelled', 'idle']
  };
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var PB = { status: null, posts: null, loading: false, error: '', offline: false, edit: {}, busy: {}, poll: null, flash: '' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function chip(label, tone) { return '<span class="chip ' + (tone || '') + '"><i class="dot"></i>' + esc(label) + '</span>'; }
  function toast(m) { if (global.App && global.App.toast) global.App.toast(m); }
  function cfg() { return (global.DATA && global.DATA.publishing) || { timezone: 'America/Chicago', timezoneLabel: 'Central', slots: [], rules: [] }; }
  function rerender() { if ((location.hash || '').indexOf('#/publish') === 0 && global.App) global.App.render(); }

  /* ---------------- Central time, from any computer ---------------- */

  function parts(ts) {
    var o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: cfg().timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
      .formatToParts(new Date(ts)).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function offset(ts) { var p = parts(ts); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ts / 60000) * 60000; }
  /* A wall-clock time in Central, as a moment. Checked twice so a DST change is handled. */
  function fromWall(y, m, d, hh, mm) {
    var guess = Date.UTC(y, m - 1, d, hh, mm);
    var t = guess - offset(guess);
    return guess - offset(t);
  }
  function toInput(iso) {
    if (!iso) return '';
    var p = parts(Date.parse(iso));
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
  }
  function fromInput(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v || '');
    return m ? new Date(fromWall(+m[1], +m[2], +m[3], +m[4], +m[5])).toISOString() : null;
  }
  function when(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: cfg().timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      .format(new Date(iso)) + ' ' + (cfg().timezoneLabel || '');
  }

  /* The next weekly slot that takes at least one of this post's platforms, at least ten
     minutes out, with nothing else already approved within half an hour of it. */
  function nextSlot(platforms, exceptId) {
    var taken = (PB.posts || []).filter(function (p) { return p.id !== exceptId && (p.status === 'scheduled' || p.status === 'publishing'); })
      .map(function (p) { return Date.parse(p.scheduledAt); });
    var now = Date.now(), start = parts(now);
    for (var k = 0; k < 28; k++) {
      var noon = fromWall(+start.year, +start.month, +start.day, 12, 0) + k * 86400000;
      var p = parts(noon);
      var dow = DAYS.indexOf(p.weekday);
      var hits = (cfg().slots || []).filter(function (s) {
        return DAYS.indexOf(s.day) === dow && s.platforms.some(function (x) { return platforms.indexOf(x) >= 0; });
      }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
      for (var i = 0; i < hits.length; i++) {
        var hm = hits[i].time.split(':');
        var t = fromWall(+p.year, +p.month, +p.day, +hm[0], +hm[1]);
        if (t < now + 10 * 60000) continue;
        if (taken.some(function (x) { return Math.abs(x - t) < 30 * 60000; })) continue;
        return { at: new Date(t).toISOString(), slot: hits[i] };
      }
    }
    return null;
  }

  /* ---------------- talking to the server ---------------- */

  function api(path, body) {
    var opts = { credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.headers['X-Studio-Request'] = '1'; opts.body = JSON.stringify(body); }
    return fetch('api/social/' + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.problems = j.problems; e.status = r.status; throw e; }
        return j;
      });
    });
  }

  function load() {
    if (PB.loading) return;
    PB.loading = true;
    api('status').then(function (st) {
      PB.status = st; PB.offline = false;
      return st.enabled ? api('posts').then(function (j) { PB.posts = j.posts; }) : null;
    }).catch(function (e) {
      if (/Failed to fetch|NetworkError|Load failed|HTTP 404/.test(e.message)) PB.offline = true;
      else PB.error = e.message;
    }).then(function () {
      PB.loading = false;
      var live = (PB.posts || []).some(function (p) { return p.status === 'publishing' || (p.status === 'scheduled' && Date.parse(p.scheduledAt) <= Date.now() + 60000); });
      clearTimeout(PB.poll);
      if (live) PB.poll = setTimeout(refresh, 4000);
      rerender();
    });
  }
  function refresh() { load(); }

  /* Called by Post from photos with finished JPEGs. */
  function queue(post) {
    return api('posts', post).then(function (j) {
      PB.posts = null;
      PB.flash = 'The post is in the queue as a draft. Read it, pick a slot and approve it.';
      return j.post;
    });
  }

  function editOf(p) {
    if (!PB.edit[p.id]) PB.edit[p.id] = { platforms: p.platforms.slice(), captions: Object.assign({}, p.captions), altText: (p.altText || []).slice(), when: toInput(p.scheduledAt), dirty: false };
    return PB.edit[p.id];
  }

  function act(id, action, body, confirmText) {
    if (confirmText && !global.confirm(confirmText)) return;
    PB.busy[id] = true; PB.error = ''; rerender();
    var send = function () { return api('posts/' + id + '/' + action, body || {}); };
    var e = PB.edit[id];
    /* Approving saves the edits first, so what is approved is what is on the screen. */
    var chain = (e && e.dirty && (action === 'approve' || action === 'update'))
      ? api('posts/' + id + '/update', { platforms: e.platforms, captions: e.captions, altText: e.altText }).then(function () { e.dirty = false; return action === 'update' ? null : send(); })
      : send();
    chain.then(function () {
      if (action !== 'update' || !e) delete PB.edit[id];
      toast({ approve: 'Approved and scheduled.', update: 'Saved.', unapprove: 'Back to draft. It will not post.', cancel: 'Cancelled.', retry: 'Posting what is missing now.', mark: 'Marked as posted.', delete: 'Deleted.' }[action] || 'Done.');
    }).catch(function (err) {
      PB.error = err.problems && err.problems.length ? '' : err.message;
      PB.problems = PB.problems || {};
      PB.problems[id] = err.problems || [err.message];
    }).then(function () { PB.busy[id] = false; refresh(); });
  }

  /* ---------------- views ---------------- */

  var TABS = [['queue', 'Queue'], ['history', 'Posted'], ['schedule', 'Schedule'], ['connections', 'Connections']];

  function view(tab) {
    tab = TABS.some(function (t) { return t[0] === tab; }) ? tab : 'queue';
    if (!PB.status && !PB.offline && !PB.loading) load();
    var head = '<div class="page-head"><div class="page-eyebrow">Content Studio</div><h1>Publishing</h1>' +
      '<p class="lede">The queue that posts to LinkedIn, Facebook and Instagram on the weekly schedule. Nothing goes out until you approve it for a time, and every post is logged with the exact text that went out.</p></div>' +
      '<div class="tabs" role="tablist">' + TABS.map(function (t) {
        return '<a class="tab' + (t[0] === tab ? ' is-active' : '') + '" href="#/publish/' + t[0] + '">' + t[1] + '</a>';
      }).join('') + '</div>';
    if (PB.offline) {
      return head + '<div class="callout warn"><strong>Publishing needs the hosted Studio.</strong> This copy has no server behind it, and posting runs on the server so it happens on time with the laptop closed. Open the Studio at its Railway address.</div>' +
        (tab === 'schedule' ? scheduleView() : '');
    }
    if (!PB.status) return head + '<p class="small muted">Loading…</p>';
    var st = PB.status;
    var top = (PB.flash ? '<div class="callout good" style="margin-bottom:12px">' + esc(PB.flash) + '</div>' : '') +
      (PB.error ? '<div class="callout alert" style="margin-bottom:12px">' + esc(PB.error) + '</div>' : '') +
      (!st.enabled ? '<div class="callout warn" style="margin-bottom:12px"><strong>Publishing is off.</strong> It needs SITE_PASSWORD set in Railway, because it posts for the firm in public. See Connections.</div>' : '') +
      reconnectBanner(st);
    PB.flash = '';
    var body = { queue: queueView, history: historyView, schedule: scheduleView, connections: connectionsView }[tab]();
    return head + top + body;
  }

  function reconnectBanner(st) {
    var out = [];
    if (st.linkedin && (st.linkedin.expired || st.linkedin.needsReconnect)) out.push('LinkedIn needs reconnecting before anything else posts there.');
    else if (st.linkedin && st.linkedin.daysLeft <= 10) out.push('The LinkedIn connection runs out in ' + st.linkedin.daysLeft + ' days. LinkedIn allows no automatic renewal, so reconnect it before then.');
    if (st.meta && st.meta.needsReconnect) out.push('Facebook and Instagram need reconnecting.');
    if (st.enabled && !st.storage.persistent) out.push('The queue is stored inside the app, so a deploy empties it. Add a Railway volume (Connections, step 1).');
    return out.length ? '<div class="callout warn" style="margin-bottom:12px">' + out.map(esc).join('<br>') + ' <a href="#/publish/connections">Connections</a></div>' : '';
  }

  function thumbs(p) {
    return '<div class="pb-thumbs">' + p.images.map(function (im, i) {
      return '<a href="api/social/image/' + esc(im.id) + '" target="_blank" rel="noopener" title="Image ' + (i + 1) + ', ' + im.width + ' by ' + im.height + '"><img src="api/social/image/' + esc(im.id) + '" alt="Image ' + (i + 1) + '" loading="lazy"></a>';
    }).join('') + '</div>';
  }

  function queueView() {
    if (!PB.status.enabled) return '';
    if (!PB.posts) return '<p class="small muted">Loading the queue…</p>';
    var live = PB.posts.filter(function (p) { return ['draft', 'scheduled', 'publishing', 'check', 'failed', 'partial'].indexOf(p.status) >= 0; });
    var order = { check: 0, failed: 1, partial: 1, publishing: 2, scheduled: 3, draft: 4 };
    live.sort(function (a, b) { return (order[a.status] - order[b.status]) || ((Date.parse(a.scheduledAt || a.createdAt)) - Date.parse(b.scheduledAt || b.createdAt)); });
    if (!live.length) {
      return '<div class="card"><h3 style="margin-top:0">The queue is empty</h3><p class="small muted">Make a post in <a href="#/post">Post from photos</a> and choose Send to Publishing. It arrives here as a draft.</p></div>';
    }
    var next = PB.posts.filter(function (p) { return p.status === 'scheduled'; }).sort(function (a, b) { return Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt); })[0];
    return (next ? '<p class="small muted" style="margin:0 0 12px">Next out: <strong>' + esc(next.title || 'Untitled') + '</strong>, ' + esc(when(next.scheduledAt)) + '.</p>' : '') +
      live.map(postCard).join('');
  }

  function postCard(p) {
    var draft = p.status === 'draft';
    var e = editOf(p);
    var s = STATUS[p.status] || [p.status, 'idle'];
    var busy = !!PB.busy[p.id];
    var probs = (PB.problems || {})[p.id];
    var ready = PB.status.ready || {};
    var plats = draft ? e.platforms : p.platforms;

    var out = '<div class="card pb-post" data-post="' + esc(p.id) + '">' +
      '<div class="row-between"><div><h3 style="margin:0">' + esc(p.title || 'Untitled post') + '</h3>' +
      '<p class="tiny muted" style="margin:2px 0 0">' + chip(s[0], s[1]) + ' ' +
      (p.scheduledAt && p.status !== 'draft' ? esc(when(p.scheduledAt)) : 'Made ' + esc(when(p.createdAt))) +
      (p.approvedBy ? ' &middot; approved by ' + esc(p.approvedBy) : '') + '</p></div></div>' +
      thumbs(p);

    (p.notes || []).forEach(function (n) { out += '<div class="callout alert" style="margin:10px 0">' + esc(n) + '</div>'; });
    if (probs && probs.length) out += '<div class="callout alert" style="margin:10px 0"><strong>Not approved yet.</strong><ul class="bullets" style="margin-top:6px">' + probs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

    out += '<div class="row" style="gap:14px;margin:10px 0">' + ORDER.map(function (k) {
      var on = plats.indexOf(k) >= 0;
      return draft
        ? '<label class="check-row" style="margin:0"><input type="checkbox" data-pb="platform" data-id="' + esc(p.id) + '" data-k="' + k + '"' + (on ? ' checked' : '') + '><span class="small">' + NAMES[k] + (ready[k] ? '' : ' <span class="tiny muted">(not connected)</span>') + '</span></label>'
        : (on ? resultChip(p, k) : '');
    }).join('') + '</div>';

    plats.forEach(function (k) {
      var text = draft ? (e.captions[k] || '') : (p.captions[k] || '');
      out += '<div class="cx-outbox"><div class="row-between"><strong class="small">' + NAMES[k] + '</strong>' +
        '<span class="tiny muted" data-pb-count="' + esc(p.id) + '-' + k + '">' + text.length.toLocaleString() + ' of ' + LIMITS[k].toLocaleString() + '</span></div>' +
        (global.Newsroom ? '<div data-pb-checks="' + esc(p.id) + '-' + k + '">' + global.Newsroom.checkChips(text) + '</div>' : '') +
        (draft ? '<textarea rows="' + Math.min(12, 3 + Math.ceil(text.length / 90)) + '" data-pb="caption" data-id="' + esc(p.id) + '" data-k="' + k + '" style="width:100%;margin-top:6px">' + esc(text) + '</textarea>'
               : '<div class="nr-pre">' + esc(text) + '</div>') +
        (k === 'linkedin' ? '<p class="tiny muted" style="margin:4px 0 0">Brackets, asterisks and the like post as typed. #words become LinkedIn hashtags.</p>' : '') +
        '</div>';
    });

    if (p.firstComment) out += '<p class="tiny muted" style="margin:8px 0 0">First comment, to add by hand after it posts: ' + esc(p.firstComment) + '</p>';

    out += '<div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">';
    if (draft) {
      out += '<label class="field" style="margin:0"><span class="field-l">When, ' + esc(cfg().timezoneLabel) + ' time</span>' +
        '<input type="datetime-local" data-pb="when" data-id="' + esc(p.id) + '" value="' + esc(e.when) + '"></label>' +
        '<button class="btn btn-sm" data-pb="slot" data-id="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>Next open slot</button>' +
        '<button class="btn btn-primary btn-sm" data-pb="approve" data-id="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>Approve for this time</button>' +
        '<button class="btn btn-sm" data-pb="now" data-id="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>Approve and post now</button>' +
        '<button class="btn btn-ghost btn-sm" data-pb="save" data-id="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>Save</button>' +
        '<button class="btn btn-ghost btn-sm" data-pb="delete" data-id="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>Delete</button>';
      if (e.slotLabel) out += '<p class="tiny muted" style="flex-basis:100%;margin:0">' + esc(e.slotLabel) + '</p>';
    } else if (p.status === 'scheduled') {
      out += '<button class="btn btn-sm" data-pb="unapprove" data-id="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>Back to draft</button>' +
        '<button class="btn btn-ghost btn-sm" data-pb="cancel" data-id="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>Cancel</button>';
    } else if (['failed', 'partial', 'check'].indexOf(p.status) >= 0) {
      out += '<button class="btn btn-primary btn-sm" data-pb="retry" data-id="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>Post what is missing</button>';
      p.platforms.forEach(function (k) {
        if (!(p.results[k] && p.results[k].ok)) out += '<button class="btn btn-ghost btn-sm" data-pb="mark" data-id="' + esc(p.id) + '" data-k="' + k + '"' + (busy ? ' disabled' : '') + '>It is already on ' + NAMES[k] + '</button>';
      });
    } else if (p.status === 'publishing') {
      out += '<span class="small muted">Posting. This page checks again every few seconds.</span>';
    }
    return out + '</div></div>';
  }

  function resultChip(p, k) {
    var r = p.results && p.results[k];
    if (!r) return chip(NAMES[k], 'idle');
    if (r.ok) return r.url ? '<a class="chip good" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer"><i class="dot"></i>' + NAMES[k] + ': view</a>' : chip(NAMES[k] + (r.manual ? ': marked posted' : ': posted'), 'good');
    return '<span class="chip alert" title="' + esc(r.error) + '"><i class="dot"></i>' + NAMES[k] + ' failed</span><span class="tiny" style="color:var(--alert);flex-basis:100%">' + esc(r.error) + '</span>';
  }

  function historyView() {
    if (!PB.status.enabled) return '';
    if (!PB.posts) return '<p class="small muted">Loading…</p>';
    var done = PB.posts.filter(function (p) { return p.status === 'published' || p.status === 'cancelled'; });
    return '<div class="row-between" style="margin-bottom:12px"><p class="small muted" style="margin:0">Posted and cancelled posts stay here for the record. A posted post cannot be deleted from the Studio.</p>' +
      '<a class="btn btn-sm" href="api/social/log.csv" download>Download the publish log</a></div>' +
      (done.length ? done.map(function (p) {
        var s = STATUS[p.status];
        return '<div class="card pb-post"><div class="row-between"><strong>' + esc(p.title || 'Untitled post') + '</strong>' + chip(s[0], s[1]) + '</div>' +
          '<p class="tiny muted" style="margin:4px 0 8px">' + esc(when(p.publishedAt || p.scheduledAt || p.createdAt)) + (p.approvedBy ? ' &middot; approved by ' + esc(p.approvedBy) : '') + '</p>' +
          thumbs(p) + '<div class="row" style="gap:8px;margin-top:8px">' + p.platforms.map(function (k) { return resultChip(p, k); }).join('') +
          (p.status === 'cancelled' ? '<button class="btn btn-ghost btn-sm" data-pb="delete" data-id="' + esc(p.id) + '">Delete</button>' : '') + '</div></div>';
      }).join('') : '<p class="small muted">Nothing posted from the Studio yet.</p>');
  }

  function scheduleView() {
    var c = cfg();
    var rows = (c.slots || []).map(function (s) {
      return '<tr><td class="small">' + esc(s.day) + '</td><td class="small">' + esc(s.time) + ' ' + esc(c.timezoneLabel) + '</td><td class="small">' +
        s.platforms.map(function (k) { return NAMES[k]; }).join(', ') + '</td><td class="small">' + esc(s.label) + '</td></tr>';
    }).join('');
    var upcoming = PB.posts ? PB.posts.filter(function (p) { return p.status === 'scheduled'; }).sort(function (a, b) { return Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt); }) : [];
    return '<div class="card"><h3 style="margin-top:0">The weekly slots</h3><p class="small muted">' + esc(c.note) + '</p>' +
      '<div style="overflow-x:auto"><table class="table"><thead><tr><th>Day</th><th>Time</th><th>Where</th><th>What goes there</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin:8px 0 0">The slots live in data/publishing.json. Next open slot on a draft picks from these.</p></div>' +
      '<div class="card"><h3 style="margin-top:0">The rules</h3><ul class="bullets">' + (c.rules || []).map(function (r) { return '<li class="small">' + esc(r) + '</li>'; }).join('') + '</ul></div>' +
      (PB.posts ? '<div class="card"><h3 style="margin-top:0">Coming up</h3>' + (upcoming.length ? '<ul class="bullets">' + upcoming.map(function (p) {
        return '<li class="small"><strong>' + esc(when(p.scheduledAt)) + '</strong>: ' + esc(p.title || 'Untitled') + ' (' + p.platforms.map(function (k) { return NAMES[k]; }).join(', ') + ')</li>';
      }).join('') + '</ul>' : '<p class="small muted" style="margin:0">Nothing approved yet.</p>') + '</div>' : '');
  }

  function step(done, title, body) {
    return '<div class="pb-step"><div>' + chip(done ? 'Done' : 'To do', done ? 'good' : 'warn') + '</div><div><strong class="small">' + title + '</strong><div class="small muted">' + body + '</div></div></div>';
  }
  function code(s) { return '<code>' + esc(s) + '</code>'; }

  function connectionsView() {
    var st = PB.status;
    var miss = st.missing.join(' ');
    var li = st.linkedin, m = st.meta;

    var setup = '<div class="card"><h3 style="margin-top:0">1. The Studio</h3>' +
      step(!/SITE_PASSWORD/.test(miss), 'A password on the site', 'Set ' + code('SITE_PASSWORD') + ' in Railway, Variables. Publishing never runs on an open site.') +
      step(!/SOCIAL_TOKEN_KEY/.test(miss), 'A key that seals the stored tokens', st.keySource === 'volume' ? 'Made for you and kept on the volume. Nothing to do.' : st.keySource === 'railway' ? 'Set in Railway as ' + code('SOCIAL_TOKEN_KEY') + '. If it changes, reconnect both accounts.' : 'Made for you once the volume below is attached. Or set ' + code('SOCIAL_TOKEN_KEY') + ' in Railway to a long random string.') +
      step(!/PUBLIC_URL/.test(miss), 'The site\'s address', 'Railway usually fills this in. If not, set ' + code('PUBLIC_URL') + ' to ' + code('https://www-content-studio-production.up.railway.app') + '.' + (st.publicUrl ? ' Now: ' + code(st.publicUrl) + '.' : '')) +
      step(st.storage.persistent, 'Somewhere the queue survives a deploy', 'In Railway, right-click the service, Attach volume, mount path ' + code('/data') + '. Railway tells the Studio where it is. Without it the queue and the log start empty after every deploy.') +
      '<p class="tiny muted" style="margin:8px 0 0">Keys and secrets go into Railway, Variables. Never paste them into a chat or an email.</p></div>';

    var liCard = '<div class="card"><h3 style="margin-top:0">2. LinkedIn, your personal profile</h3>' +
      (li ? '<p class="small">' + chip(li.expired || li.needsReconnect ? 'Reconnect' : 'Connected', li.expired || li.needsReconnect ? 'alert' : (li.daysLeft <= 10 ? 'warn' : 'good')) + ' as <strong>' + esc(li.name) + '</strong>. ' +
          (li.expired ? 'The connection has expired.' : 'Good for ' + li.daysLeft + ' more days; LinkedIn allows no automatic renewal, so reconnect before then.') + '</p>' : '') +
      (st.canConnect.linkedin
        ? '<a class="btn btn-primary btn-sm" href="auth/linkedin/start">' + (li ? 'Reconnect LinkedIn' : 'Connect LinkedIn') + '</a>' + (li ? ' <button class="btn btn-ghost btn-sm" data-pb="disconnect" data-k="linkedin">Disconnect</button>' : '')
        : '<ol class="small pb-ol">' +
          '<li>At ' + code('linkedin.com/developers/apps') + ', Create app. App name: Women Worth & Wealth Studio. LinkedIn Page: the Women Worth & Wealth company page (an app must be tied to one; it posts as you, not the page). Upload the Women Worth & Wealth logo.</li>' +
          '<li>On the Products tab, request <strong>Sign In with LinkedIn using OpenID Connect</strong> and <strong>Share on LinkedIn</strong>. Both are self-serve.</li>' +
          '<li>On the Auth tab, under Authorized redirect URLs, add ' + code(st.redirects.linkedin || 'https://www-content-studio-production.up.railway.app/auth/linkedin/callback') + '.</li>' +
          '<li>Copy the Client ID and Primary Client Secret into Railway as ' + code('LINKEDIN_CLIENT_ID') + ' and ' + code('LINKEDIN_CLIENT_SECRET') + '. Railway redeploys, and a Connect button appears here.</li></ol>' +
          (st.apps.linkedin ? '<p class="small muted">The app keys are set. ' + esc(st.missing.length ? 'Finish step 1 first.' : '') + '</p>' : '')) +
      '<p class="tiny muted" style="margin:8px 0 0">Posting as the Women Worth & Wealth company page needs LinkedIn\'s Community Management API, which LinkedIn approves case by case. Ask for it later if the page should post on its own; the personal profile is where the reach is.</p></div>';

    var pages = m ? (m.pages || []) : [];
    var page = pages.filter(function (p) { return p.id === m.pageId; })[0];
    var metaCard = '<div class="card"><h3 style="margin-top:0">3. Facebook Page and Instagram</h3>' +
      (m ? '<p class="small">' + chip(m.needsReconnect ? 'Reconnect' : 'Connected', m.needsReconnect ? 'alert' : 'good') + ' through <strong>' + esc(m.userName) + '</strong>.</p>' +
          (pages.length > 1 ? '<label class="field"><span class="field-l">Post to this Page</span><select data-pb="page">' + (page ? '' : '<option value="">Choose the Women Worth & Wealth Page</option>') + pages.map(function (p) {
            return '<option value="' + esc(p.id) + '"' + (p.id === m.pageId ? ' selected' : '') + '>' + esc(p.name) + (p.ig ? ' (Instagram @' + esc(p.ig.username) + ')' : '') + '</option>';
          }).join('') + '</select></label>' : '') +
          (page ? '<p class="small">Facebook: <strong>' + esc(page.name) + '</strong>. Instagram: ' + (page.ig ? '<strong>@' + esc(page.ig.username) + '</strong>' : '<span style="color:var(--alert)">no professional Instagram account is linked to this Page. In the Instagram app, switch the account to Business, then link it to the Page under Linked accounts, and reconnect.</span>') + '</p>' : '')
        : '') +
      (st.canConnect.meta
        ? '<a class="btn btn-primary btn-sm" href="auth/meta/start">' + (m ? 'Reconnect Facebook and Instagram' : 'Connect Facebook and Instagram') + '</a>' + (m ? ' <button class="btn btn-ghost btn-sm" data-pb="disconnect" data-k="meta">Disconnect</button>' : '') +
          '<p class="tiny muted" style="margin:8px 0 0">When Facebook asks, choose the Women Worth & Wealth Page and its Instagram account, and allow every permission it lists.</p>'
        : '<ol class="small pb-ol">' +
          '<li>Make the Women Worth & Wealth Instagram a Business account and link it to the Women Worth & Wealth Facebook Page (Instagram app, Settings, Account type and tools; then the Page\'s Linked accounts).</li>' +
          '<li>At ' + code('developers.facebook.com/apps') + ', Create app, type Business, owned by the Women Worth & Wealth Business portfolio. Add the products <strong>Facebook Login for Business</strong> and <strong>Instagram</strong> (the API setup with Facebook Login).</li>' +
          '<li>In Facebook Login for Business, Settings, add the Valid OAuth Redirect URI ' + code(st.redirects.meta || 'https://www-content-studio-production.up.railway.app/auth/meta/callback') + '.</li>' +
          '<li>Copy the App ID and App Secret (App settings, Basic) into Railway as ' + code('META_APP_ID') + ' and ' + code('META_APP_SECRET') + '.</li>' +
          '<li>While the app is in development mode it works for people with a role on the app, which includes you, so posting can start right away. Business verification and app review are only needed to switch it to Live; Meta asks for the firm\'s legal name, address and a document, plus a short screen recording of this page.</li></ol>' +
          (st.apps.meta ? '<p class="small muted">The app keys are set. ' + esc(st.missing.length ? 'Finish step 1 first.' : '') + '</p>' : '')) +
      '</div>';

    return (st.lastConnectError ? '<div class="callout alert" style="margin-bottom:12px"><strong>The last connection attempt failed.</strong> ' + esc(st.lastConnectError) + '</div>' : '') +
      setup + liCard + metaCard +
      '<div class="card"><h3 style="margin-top:0">4. The record</h3><p class="small muted" style="margin:0">Every attempt is logged with the time, the platform, the link or the error, who approved it, the exact text, and a fingerprint of each image. Download it from the Posted tab. If the firm captures social accounts with an archiving service, connect the accounts there too; this log is a backstop, not a replacement.</p></div>';
  }

  /* ---------------- events ---------------- */

  function post(id) { return (PB.posts || []).filter(function (p) { return p.id === id; })[0]; }

  document.addEventListener('input', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-pb]'); if (!el) return;
    var p = post(el.dataset.id); if (!p) return;
    var e = editOf(p);
    if (el.dataset.pb === 'caption') {
      e.captions[el.dataset.k] = el.value; e.dirty = true;
      var key = p.id + '-' + el.dataset.k;
      var n = document.querySelector('[data-pb-count="' + key + '"]');
      if (n) { n.textContent = el.value.length.toLocaleString() + ' of ' + LIMITS[el.dataset.k].toLocaleString(); n.style.color = el.value.length > LIMITS[el.dataset.k] ? 'var(--alert)' : ''; }
      var c = document.querySelector('[data-pb-checks="' + key + '"]');
      if (c && global.Newsroom) c.innerHTML = global.Newsroom.checkChips(el.value);
    } else if (el.dataset.pb === 'when') { e.when = el.value; e.slotLabel = ''; }
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-pb]'); if (!el) return;
    if (el.dataset.pb === 'page') {
      api('page', { pageId: el.value }).then(function (st) { PB.status = st; toast('Page chosen.'); rerender(); }).catch(function (e) { PB.error = e.message; rerender(); });
      return;
    }
    var p = post(el.dataset.id); if (!p) return;
    var e = editOf(p);
    if (el.dataset.pb === 'platform') {
      e.platforms = ORDER.filter(function (k) { return k === el.dataset.k ? el.checked : e.platforms.indexOf(k) >= 0; });
      e.dirty = true; rerender();
    }
  });

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-pb]'); if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
    var k = el.dataset.pb, id = el.dataset.id, p = id ? post(id) : null;
    if (k === 'disconnect') {
      if (!global.confirm('Disconnect ' + (el.dataset.k === 'linkedin' ? 'LinkedIn' : 'Facebook and Instagram') + '? Approved posts for it will fail until you reconnect.')) return;
      api('disconnect', { platform: el.dataset.k }).then(function (st) { PB.status = st; rerender(); }).catch(function (e) { PB.error = e.message; rerender(); });
      return;
    }
    if (!p) return;
    var e = editOf(p);
    if (PB.problems) delete PB.problems[id];
    if (k === 'slot') {
      var s = nextSlot(e.platforms, id);
      if (!s) { toast('No open slot in the next four weeks for these platforms.'); return; }
      e.when = toInput(s.at); e.slotLabel = 'Slot: ' + s.slot.label + ', ' + when(s.at) + '.';
      rerender();
    } else if (k === 'approve') {
      var at = fromInput(e.when);
      if (!at) { PB.problems = PB.problems || {}; PB.problems[id] = ['Pick a time, or use Next open slot.']; rerender(); return; }
      if (Date.parse(at) < Date.now() - 60000) { PB.problems = PB.problems || {}; PB.problems[id] = ['That time has passed. Pick a later one, or use Approve and post now.']; rerender(); return; }
      act(id, 'approve', { scheduledAt: at });
    } else if (k === 'now') {
      act(id, 'approve', { scheduledAt: new Date().toISOString() }, 'Post this now to ' + e.platforms.map(function (x) { return NAMES[x]; }).join(', ') + '?');
    } else if (k === 'save') act(id, 'update');
    else if (k === 'unapprove') act(id, 'unapprove');
    else if (k === 'cancel') act(id, 'cancel', {}, 'Cancel this post? It stays in Posted as cancelled.');
    else if (k === 'delete') act(id, 'delete', {}, 'Delete this post and its images?');
    else if (k === 'retry') act(id, 'retry', {}, 'Post to the platforms that are missing it now?');
    else if (k === 'mark') act(id, 'mark', { platform: el.dataset.k }, 'Only do this after looking at ' + NAMES[el.dataset.k] + ' and seeing the post there. Mark it posted?');
  });

  global.Publish = { view: view, queue: queue, refresh: refresh, _state: PB, _nextSlot: nextSlot, _fromInput: fromInput, _toInput: toInput };
})(window);
