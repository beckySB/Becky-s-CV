/* Moments: what just happened to the people who matter most, and how to respond.

   The server reads the news once a morning for everyone on the watch list. This screen shows
   what it found, each with the playbook's response for that person's tier or relationship,
   the lines to use and avoid, the planning question it opens for later, and, with Claude,
   a drafted note. Logging a moment heard in person drafts the same way and stores nothing. */
(function (global) {
  'use strict';

  var MO = { status: null, alerts: null, contacts: null, loading: false, offline: false, error: '', filter: 'new',
             drafts: {}, drafting: {}, log: { name: '', company: '', audience: 'tier1', moment: 'award', detail: '', post: '', read: null, reading: false }, importText: '', poll: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function chip(label, tone) { return '<span class="chip ' + (tone || '') + '"><i class="dot"></i>' + esc(label) + '</span>'; }
  function toast(m) { if (global.App && global.App.toast) global.App.toast(m); }
  function P() { return (global.DATA && global.DATA.moments) || { moments: [], audiences: [], rules: [], limits: [], kinds: {} }; }
  function moment(id) { return P().moments.filter(function (m) { return m.id === id; })[0]; }
  function audienceName(id) { var a = P().audiences.filter(function (x) { return x.id === id; })[0]; return a ? a.name : id; }
  function occasion(id) { var d = global.DATA && global.DATA.experience; return d && id ? d.milestones.occasions.filter(function (o) { return o.id === id; })[0] : null; }
  function rerender() { if ((location.hash || '').indexOf('#/moments') === 0 && global.App) global.App.render(); }
  var KIND_TONE = { celebrate: 'good', business: 'info', support: 'warn', caution: 'alert' };
  var DONE = ['Note sent', 'Called', 'Gift sent', 'Commented publicly', 'Attended', 'Read only, nothing sent', 'Something else'];

  function when(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }
  function day(iso) { return iso ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso)) : ''; }

  function api(path, body) {
    var opts = { credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.headers['X-Studio-Request'] = '1'; opts.body = JSON.stringify(body); }
    return fetch('api/moments/' + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; });
    });
  }
  function offline(e) { return /Failed to fetch|NetworkError|Load failed|HTTP 404/.test(e.message); }

  function load() {
    if (MO.loading) return;
    MO.loading = true;
    api('status').then(function (st) {
      MO.status = st; MO.offline = false;
      if (!st.enabled) return null;
      return Promise.all([api('alerts'), api('contacts')]).then(function (r) { MO.alerts = r[0].alerts; MO.contacts = r[1].contacts; });
    }).catch(function (e) { if (offline(e)) MO.offline = true; else MO.error = e.message; })
      .then(function () {
        MO.loading = false;
        clearTimeout(MO.poll);
        if (MO.status && MO.status.scanning) MO.poll = setTimeout(load, 4000);
        rerender();
      });
  }

  /* ---------------- the playbook, filled in ---------------- */

  function fill(line, a) {
    return line.replace(/\{\{(\w+)\}\}/g, function (_, k) {
      var v = { detail: a.detail, company: a.contact && a.contact.company, source: a.source, years: '' }[k];
      return v ? v : '[' + k + ']';
    });
  }

  function limit() { var st = MO.status; return st && st.settings && st.settings.giftLimit != null ? st.settings.giftLimit : null; }
  function playbookBlock(m, audience, a) {
    var occ = occasion(m.occasion);
    return '<div class="mo-play">' +
      '<p class="small" style="margin:0 0 6px"><strong>What to do.</strong> ' + esc(m.respond[audience] || m.respond.tier1) + '</p>' +
      '<p class="small muted" style="margin:0 0 6px"><strong>When.</strong> ' + esc(m.timing) + '</p>' +
      (m.gift ? '<p class="small muted" style="margin:0 0 6px"><strong>Gift or gesture.</strong> ' + esc(m.gift) +
        (limit() != null ? ' <strong>Firm limit: $' + limit() + ' per gift</strong>, engraving, framing and shipping included. Scale it down to fit, or send the note alone.' : (occ ? ' Ceiling: ' + esc(occ.ceiling) + '.' : '')) + '</p>' : '') +
      '<div class="mo-cols"><div><div class="tiny muted mo-h">Say</div><ul class="bullets">' + m.say.map(function (l) { return '<li class="small">' + esc(fill(l, a || {})) + '</li>'; }).join('') + '</ul></div>' +
      '<div><div class="tiny muted mo-h">Never</div><ul class="bullets">' + m.avoid.map(function (l) { return '<li class="small">' + esc(l) + '</li>'; }).join('') + '</ul></div></div>' +
      '<p class="small" style="margin:8px 0 0"><strong>For the next meeting, not the note.</strong> ' + esc(m.door) + '</p>' +
      '<p class="tiny muted" style="margin:6px 0 0">Log in Redtail: ' + esc(m.log) + (m.publicResponse ? '' : ' No public comment, like or share.') + '</p></div>';
  }

  function draftBlock(key) {
    var d = MO.drafts[key];
    if (!d) return '';
    if (d.error) return '<div class="callout alert" style="margin-top:10px">' + esc(d.error) + '</div>';
    var r = d.result, out = '<div class="cx-out" style="margin-top:10px">';
    var box = function (id, label, text) {
      if (!text) return '';
      return '<div class="cx-outbox"><div class="row-between"><strong class="small">' + esc(label) + '</strong><button class="btn btn-sm" data-act="copy" data-target="' + id + '">Copy</button></div>' +
        (global.Newsroom ? global.Newsroom.checkChips(text, true) : '') + '<div class="nr-pre" id="' + id + '">' + esc(text) + '</div></div>';
    };
    out += box('mo-note-' + key, 'The note', r.note) + box('mo-call-' + key, 'Opening the call', r.callOpener) + box('mo-com-' + key, 'Public comment', r.comment);
    if (r.gift) out += '<p class="small" style="margin:8px 0 0"><strong>Gift.</strong> ' + esc(r.gift) + '</p>';
    if (r.door) out += '<p class="small" style="margin:6px 0 0"><strong>For the next meeting.</strong> ' + esc(r.door) + '</p>';
    if (r.cautions && r.cautions.length) out += '<ul class="bullets" style="margin-top:6px">' + r.cautions.map(function (c) { return '<li class="small">' + esc(c) + '</li>'; }).join('') + '</ul>';
    return out + '</div><p class="tiny muted" style="margin:6px 0 0">Drafted by ' + esc(d.model) + '. Read it, make it yours, and write it by hand.</p>';
  }

  function voiceBrief() {
    var b = global.Store && global.Store.activeBrand ? global.Store.activeBrand() : null;
    return (global.Brand && global.Brand.voiceBrief && b) ? global.Brand.voiceBrief(b) : '';
  }

  function runDraft(key, body) {
    MO.drafting[key] = true; delete MO.drafts[key]; rerender();
    body.voiceBrief = voiceBrief();
    api('draft', body).then(function (j) { MO.drafts[key] = j; })
      .catch(function (e) { MO.drafts[key] = { error: offline(e) ? 'Drafting needs the hosted Studio.' : e.message }; })
      .then(function () { MO.drafting[key] = false; rerender(); });
  }

  /* ---------------- views ---------------- */

  var TABS = [['alerts', 'What happened'], ['watch', 'Watch list'], ['playbook', 'Playbook'], ['log', 'Log one']];

  function view(tab) {
    tab = TABS.some(function (t) { return t[0] === tab; }) ? tab : 'alerts';
    if (!MO.status && !MO.offline && !MO.loading) load();
    var head = '<div class="page-head"><div class="page-eyebrow">Client experience</div><h1>Moments</h1>' +
      '<p class="lede">When something big happens to a client, a center of influence or a prospect, you hear about it the same morning, with how to respond: what to send, what to say, what never to say, and the planning question it opens for later.</p></div>' +
      '<div class="tabs" role="tablist">' + TABS.map(function (t) {
        return '<a class="tab' + (t[0] === tab ? ' is-active' : '') + '" href="#/moments/' + t[0] + '">' + t[1] + '</a>';
      }).join('') + '</div>';
    if (tab === 'playbook') return head + playbookView();
    if (tab === 'log') return head + logView();
    if (MO.offline) return head + '<div class="callout warn"><strong>Moments needs the hosted Studio.</strong> The news is read on the server every morning, with the laptop closed. The Playbook and Log one tabs work here.</div>';
    if (!MO.status) return head + '<p class="small muted">Loading…</p>';
    if (!MO.status.enabled) return head + '<div class="callout warn"><strong>Moments is off.</strong> It needs SITE_PASSWORD set in Railway, because the watch list names the firm\'s clients.</div>';
    return head + (MO.error ? '<div class="callout alert" style="margin-bottom:12px">' + esc(MO.error) + '</div>' : '') + (tab === 'watch' ? watchView() : alertsView());
  }

  function scanLine() {
    var st = MO.status, l = st.lastLog;
    return '<div class="row-between" style="margin-bottom:12px"><p class="small muted" style="margin:0">' +
      (st.scanning ? 'Reading the news now…' : st.lastScan ? 'Last read ' + esc(when(st.lastScan)) + ' Central' + (l ? ': ' + l.queries + ' searches, ' + l.feeds + ' local feeds, ' + l.alerts + ' new, sorted by ' + (l.triage === 'claude' ? 'Claude' : 'keywords') + '.' : '.') : 'Not read yet.') +
      ' It reads again each morning after ' + (st.scanHour > 12 ? st.scanHour - 12 + ' PM' : st.scanHour + ' AM') + ' Central.' +
      (st.instagram ? ' Instagram is read through @' + esc(st.instagram) + '.' : ' <a href="#/publish/connections">Connect Instagram</a> to read your contacts\' business accounts and posts that tag the firm.') + '</p>' +
      '<button class="btn btn-sm" data-mo="scan"' + (st.scanning || !st.contacts ? ' disabled' : '') + '>Read the news now</button></div>' +
      (l && l.errors && l.errors.length ? '<p class="tiny" style="color:var(--warn);margin:-6px 0 12px">Could not read: ' + esc(l.errors.slice(0, 4).join('; ')) + '</p>' : '') +
      (!st.persistent ? '<div class="callout warn" style="margin-bottom:12px">The watch list is stored inside the app, so a deploy empties it. Attach a Railway volume (see Publishing, Connections, step 1).</div>' : '');
  }

  function alertsView() {
    var st = MO.status;
    if (!st.contacts) return '<div class="card"><h3 style="margin-top:0">Start with the watch list</h3><p class="small muted">Add your Tier 1 families, your core centers of influence and the prospects you most want. Twenty to fifty people is the right size to start. <a href="#/moments/watch">Watch list</a></p></div>';
    var list = (MO.alerts || []).filter(function (a) { return MO.filter === 'all' || (MO.filter === 'new' ? a.status === 'new' : a.status !== 'new'); });
    var counts = st.counts || {};
    return scanLine() +
      '<div class="row" style="gap:6px;margin-bottom:12px">' + [['new', 'New (' + (counts.new || 0) + ')'], ['handled', 'Handled'], ['all', 'All']].map(function (f) {
        return '<button class="btn btn-sm' + (MO.filter === f[0] ? ' btn-primary' : '') + '" data-mo="filter" data-v="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div>' +
      (list.length ? list.map(alertCard).join('') : '<p class="small muted">' + (MO.filter === 'new' ? 'Nothing new. That is most mornings.' : 'Nothing here yet.') + '</p>');
  }

  function alertCard(a) {
    var m = moment(a.moment) || moment('mention');
    var key = a.id;
    var sure = a.sure === 'yes' ? chip('About them', 'good') : a.sure === 'likely' ? chip('Names them', 'info') : chip('Check it is them', 'warn');
    var occ = occasion(m.occasion);
    var handled = a.status !== 'new';
    return '<div class="card mo-alert' + (handled ? ' is-handled' : '') + '">' +
      '<div class="row-between"><div><strong>' + esc(a.contact.name) + '</strong>' + (a.contact.company ? ' <span class="small muted">' + esc(a.contact.company) + '</span>' : '') + '</div>' +
      '<div class="row" style="gap:6px">' + chip(audienceName(a.contact.audience), 'idle') + chip(m.name, KIND_TONE[m.kind]) + sure + '</div></div>' +
      '<p style="margin:8px 0 2px"><a href="' + esc(a.link) + '" target="_blank" rel="noopener noreferrer">' + esc(a.title) + '</a></p>' +
      '<p class="tiny muted" style="margin:0 0 8px">' + esc([a.source, day(a.published)].filter(Boolean).join(', ')) + ' &middot; found ' + esc(when(a.foundAt)) + '</p>' +
      (a.gist ? '<p class="small" style="margin:0 0 8px">' + esc(a.gist) + '</p>' : '') +
      (a.sure !== 'yes' ? '<p class="tiny" style="color:var(--warn);margin:0 0 8px">Read it before doing anything. A shared name is the most common mistake this makes.</p>' : '') +
      (handled ? '<p class="small muted" style="margin:0">' + esc({ done: 'Handled', dismissed: 'Dismissed', notthem: 'Not them' }[a.status]) + (a.handled ? ': ' + esc(a.handled) : '') + ', ' + esc(when(a.handledAt)) + '. <button class="btn btn-ghost btn-sm" data-mo="reopen" data-id="' + esc(a.id) + '">Reopen</button></p>'
        : playbookBlock(m, a.contact.audience, a) +
          '<div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">' +
          (MO.status.triage ? '<button class="btn btn-primary btn-sm" data-mo="draft" data-id="' + esc(a.id) + '"' + (MO.drafting[key] ? ' disabled' : '') + '>' + (MO.drafting[key] ? 'Drafting…' : 'Draft the note') + '</button>' : '') +
          (occ && (a.moment !== 'business-win' || /open|ribbon|location/i.test(a.title)) ? '<button class="btn btn-sm" data-mo="card" data-occ="' + esc(occ.id) + '">Write the card: ' + esc(occ.name) + '</button>' : '') +
          '<select data-mo="what" data-id="' + esc(a.id) + '" aria-label="What was done">' + DONE.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('') + '</select>' +
          '<button class="btn btn-sm" data-mo="done" data-id="' + esc(a.id) + '">Mark handled</button>' +
          '<button class="btn btn-ghost btn-sm" data-mo="notthem" data-id="' + esc(a.id) + '">Not them</button>' +
          '<button class="btn btn-ghost btn-sm" data-mo="dismiss" data-id="' + esc(a.id) + '">Dismiss</button></div>' +
          draftBlock(key)) +
      '</div>';
  }

  function watchView() {
    var c = MO.contacts || [];
    var aud = P().audiences;
    var sel = function (v, id) { return '<select data-mo="audience" data-id="' + esc(id) + '">' + aud.map(function (a) { return '<option value="' + a.id + '"' + (a.id === v ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('') + '</select>'; };
    return '<div class="callout brand" style="margin-bottom:12px"><strong>A name, a company, a city and a relationship. Nothing else.</strong> ' + esc(P().principle) + '</div>' +
      scanLine() +
      '<div class="card"><h3 style="margin-top:0">' + c.length + ' ' + (c.length === 1 ? 'person' : 'people') + ' on the list</h3>' +
      (c.length ? '<div style="overflow-x:auto"><table class="table"><thead><tr><th>Name</th><th>Company</th><th>City</th><th>Instagram</th><th>Relationship</th><th>Watch the company too</th><th></th></tr></thead><tbody>' +
        c.map(function (p) {
          return '<tr><td class="small"><strong>' + esc(p.name) + '</strong>' + (p.also.length ? '<div class="tiny muted">also ' + esc(p.also.join(', ')) + '</div>' : '') + '</td><td class="small">' + esc(p.company) + '</td><td class="small">' + esc(p.city) + '</td><td class="small">' + (p.instagram ? '@' + esc(p.instagram) : '') + '</td>' +
            '<td>' + sel(p.audience, p.id) + '</td><td><input type="checkbox" data-mo="watchco" data-id="' + esc(p.id) + '"' + (p.watchCompany ? ' checked' : '') + (p.company ? '' : ' disabled') + ' aria-label="Watch the company"></td>' +
            '<td><button class="btn btn-ghost btn-sm" data-mo="remove" data-id="' + esc(p.id) + '">Remove</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="small muted">Nobody yet.</p>') + '</div>' +

      '<div class="card"><h3 style="margin-top:0">Add someone</h3><div class="cx-fields">' +
      '<label class="field" style="margin:0"><span class="field-l">Full name</span><input type="text" id="mo-add-name" placeholder="As it would appear in the news"></label>' +
      '<label class="field" style="margin:0"><span class="field-l">Company</span><input type="text" id="mo-add-company"></label>' +
      '<label class="field" style="margin:0"><span class="field-l">City</span><input type="text" id="mo-add-city" placeholder="Metairie"></label>' +
      '<label class="field" style="margin:0"><span class="field-l">Relationship</span><select id="mo-add-audience">' + aud.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field" style="margin:0"><span class="field-l">Business Instagram, optional</span><input type="text" id="mo-add-instagram" placeholder="@doucetmarine"></label>' +
      '<label class="field" style="margin:0"><span class="field-l">Also known as, optional</span><input type="text" id="mo-add-also" placeholder="A maiden name, or a second business; separate with ;"></label></div>' +
      '<label class="check-row"><input type="checkbox" id="mo-add-watchco"><span class="small">Watch the company\'s news too. Best for owners whose company name is distinctive.</span></label>' +
      '<button class="btn btn-primary btn-sm" data-mo="add">Add to the watch list</button></div>' +

      '<div class="card"><h3 style="margin-top:0">Add many at once</h3><p class="small muted">One person per line: name, company, city, relationship, and a business Instagram if they have one. Relationship is 1, 2 or 3 for the client tier, COI, or prospect. Export the list from Redtail and paste the columns here.</p>' +
      '<textarea rows="5" data-mo="import" style="width:100%" placeholder="Jane Doucet, Doucet Marine, Harvey, 1&#10;Paul Landry, Landry CPA, Metairie, COI, @landrycpa">' + esc(MO.importText) + '</textarea>' +
      '<button class="btn btn-sm" data-mo="doimport" style="margin-top:8px">Add these</button></div>' +

      '<div class="card"><h3 style="margin-top:0">What it can and cannot see</h3><ul class="bullets">' + P().limits.map(function (l) { return '<li class="small">' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<p class="tiny muted" style="margin:8px 0 0">' + (MO.status.search ? 'To search, each name is sent to Google News with its company or city. Google sees the search, not that the person is a client. ' : 'Google News searches are off (MOMENTS_SEARCH=off); only the local business feeds are read. ') +
      (MO.status.triage ? 'What it finds is sorted by Claude through the Anthropic API, with the name and the headline only.' : 'Set ANTHROPIC_API_KEY to have Claude sort the finds and draft the notes.') + '</p></div>';
  }

  function playbookView() {
    var p = P(), groups = Object.keys(p.kinds);
    return (MO.status && MO.status.enabled ? '<div class="card"><h3 style="margin-top:0">The firm\'s gift limit</h3><p class="small muted" style="margin-top:-4px">One number every gift suggestion and draft must fit under, engraving, framing and shipping included. It overrides the ceilings in the playbook. Set it from the firm\'s written gift policy.</p>' +
      '<div class="row" style="gap:8px"><label class="field" style="margin:0"><span class="field-l">Per gift, in dollars</span><input type="number" min="0" max="1000" step="1" id="mo-gift-limit" value="' + (limit() != null ? limit() : '') + '" placeholder="No limit set" style="width:140px"></label>' +
      '<button class="btn btn-sm btn-primary" data-mo="setlimit" style="align-self:flex-end">Save</button></div></div>' : '') +
      '<div class="card"><h3 style="margin-top:0">The rules</h3><ul class="bullets">' + p.rules.map(function (r) { return '<li class="small">' + esc(r) + '</li>'; }).join('') + '</ul></div>' +
      groups.map(function (k) {
        var ms = p.moments.filter(function (m) { return m.kind === k; });
        return '<div class="section-title">' + esc(p.kinds[k]) + '</div>' + ms.map(function (m) {
          return '<details class="card mo-pb"><summary><strong>' + esc(m.name) + '</strong> ' + chip(m.sensitivity === 'public' ? 'Public' : m.sensitivity === 'private' ? 'Private' : 'Sensitive', m.sensitivity === 'public' ? 'good' : m.sensitivity === 'private' ? 'info' : 'alert') + '</summary>' +
            '<div style="overflow-x:auto;margin-top:10px"><table class="table"><tbody>' + p.audiences.map(function (a) {
              return '<tr><td class="small" style="width:30%"><strong>' + esc(a.name) + '</strong></td><td class="small">' + esc(m.respond[a.id]) + '</td></tr>';
            }).join('') + '</tbody></table></div>' + playbookBlock(m, null, null).replace(/<p class="small" style="margin:0 0 6px"><strong>What to do\.<\/strong>[^<]*<\/p>/, '') + '</details>';
        }).join('');
      }).join('');
  }

  function logView() {
    var L = MO.log, p = P();
    var m = moment(L.moment) || p.moments[0];
    var canDraft = MO.status ? MO.status.triage : false;
    var R = L.read;
    return '<div class="callout brand" style="margin-bottom:12px">For what you see on LinkedIn or Facebook, and what you hear in person: a new grandchild, a college decision, a new role, an illness, a loss. Nothing typed or pasted here is saved. Log what you did in Redtail.</div>' +
      '<div class="card"><h3 style="margin-top:0">Saw it on social media</h3>' +
      '<p class="small muted" style="margin-top:-4px">LinkedIn and personal Facebook let no app read other people\'s posts. Take a screenshot of the post, or copy its text, and it is read the same way as the news: who, which moment, and the detail worth naming. The screenshot is sent to Claude to be read and is not kept.</p>' +
      '<textarea rows="3" data-mo="log" data-k="post" style="width:100%" placeholder="Paste the text of the post, or paste a screenshot here">' + esc(L.post) + '</textarea>' +
      '<div class="row" style="gap:8px;margin-top:8px;align-items:center">' +
      '<label class="btn btn-sm">Add a screenshot<input type="file" accept="image/*" data-mo="shot" hidden></label>' +
      (L.shot ? '<span class="mo-shot"><img src="data:image/jpeg;base64,' + L.shot + '" alt="The screenshot"><button class="btn btn-ghost btn-sm" data-mo="clearshot">Remove</button></span>' : '') +
      '<button class="btn btn-sm btn-primary" data-mo="readpost"' + (L.reading ? ' disabled' : '') + '>' + (L.reading ? 'Reading…' : 'Read it') + '</button></div>' +
      (R ? '<div class="small" style="margin-top:8px">' + (R.error ? '<span style="color:var(--alert)">' + esc(R.error) + '</span>'
        : esc(R.summary || 'Read by keywords.') + ' ' + (R.matched ? chip('On the watch list', 'good') : chip('Not on the watch list', 'warn') + (R.person ? ' <button class="btn btn-ghost btn-sm" data-mo="watchadd">Add ' + esc(R.person) + ' to the watch list</button>' : '')) +
          (R.postText ? '<div class="tiny muted" style="margin-top:6px">Read as: ' + esc(R.postText) + '</div>' : '')) + '</div>' : '') + '</div>' +
      '<div class="card"><div class="cx-fields">' +
      '<label class="field" style="margin:0"><span class="field-l">Who</span><input type="text" data-mo="log" data-k="name" value="' + esc(L.name) + '" placeholder="First and last name"></label>' +
      '<label class="field" style="margin:0"><span class="field-l">Company, optional</span><input type="text" data-mo="log" data-k="company" value="' + esc(L.company) + '"></label>' +
      '<label class="field" style="margin:0"><span class="field-l">Relationship</span><select data-mo="logsel" data-k="audience">' + p.audiences.map(function (a) { return '<option value="' + a.id + '"' + (a.id === L.audience ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field" style="margin:0"><span class="field-l">What happened</span><select data-mo="logsel" data-k="moment">' + p.moments.filter(function (x) { return x.id !== 'mention'; }).map(function (x) { return '<option value="' + x.id + '"' + (x.id === L.moment ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="field" style="margin-top:10px"><span class="field-l">The one specific detail</span><input type="text" data-mo="log" data-k="detail" value="' + esc(L.detail) + '" placeholder="Their daughter Claire, born Tuesday"></label>' +
      '</div>' +
      '<div class="card"><div class="row-between"><h3 style="margin:0">' + esc(m.name) + ', for ' + esc(audienceName(L.audience)) + '</h3>' + chip(p.kinds[m.kind], KIND_TONE[m.kind]) + '</div>' +
      playbookBlock(m, L.audience, { detail: L.detail, contact: { company: L.company }, source: '' }) +
      '<div class="row" style="gap:8px;margin-top:12px">' +
      (canDraft ? '<button class="btn btn-primary btn-sm" data-mo="logdraft"' + (MO.drafting.log ? ' disabled' : '') + '>' + (MO.drafting.log ? 'Drafting…' : 'Draft the note') + '</button>' : '<span class="small muted">' + (MO.offline ? 'Drafting needs the hosted Studio.' : 'Drafting needs ANTHROPIC_API_KEY.') + '</span>') +
      (occasion(m.occasion) ? '<button class="btn btn-sm" data-mo="card" data-occ="' + esc(m.occasion) + '">Write the card: ' + esc(occasion(m.occasion).name) + '</button>' : '') + '</div>' +
      draftBlock('log') + '</div>';
  }

  /* On Today: a count, filled in when the server answers. */
  function todayCard() {
    setTimeout(function () {
      var el = document.getElementById('mo-today'); if (!el) return;
      api('status').then(function (st) {
        if (!st.enabled) { el.innerHTML = ''; return; }
        var n = (st.counts && st.counts.new) || 0;
        el.innerHTML = '<div class="callout ' + (n ? 'good' : 'brand') + '" style="margin-top:14px"><strong>' + (n ? (n === 1 ? 'One moment' : n + ' moments') + ' to respond to.' : 'No new moments.') + '</strong> ' +
          (st.contacts ? 'Watching ' + st.contacts + (st.contacts === 1 ? ' person' : ' people') + '. ' : 'The watch list is empty. ') + '<a href="#/moments">' + (n ? 'See them' : 'Moments') + '</a></div>';
      }).catch(function () { el.innerHTML = ''; });
    }, 0);
    return '<div id="mo-today"></div>';
  }

  /* ---------------- events ---------------- */

  function parseImport(text) {
    var map = { '1': 'tier1', 'tier 1': 'tier1', 'tier1': 'tier1', 'vip': 'tier1', '2': 'tier2', 'tier 2': 'tier2', 'tier2': 'tier2', '3': 'tier3', 'tier 3': 'tier3', 'tier3': 'tier3', 'coi': 'coi', 'center of influence': 'coi', 'prospect': 'prospect' };
    return String(text || '').split(/\r?\n/).map(function (l) { return l.split(/\t|,/).map(function (x) { return x.trim(); }); })
      .filter(function (r) { return r[0] && /\s/.test(r[0]) && !/^name$/i.test(r[0]); })
      .map(function (r) { return { name: r[0], company: r[1] || '', city: r[2] || '', audience: map[(r[3] || '').toLowerCase()] || 'tier1', instagram: r[4] || '' }; });
  }

  function save(contacts, msg) {
    return api('contacts', { contacts: contacts }).then(function () { if (msg) toast(msg); return api('contacts'); })
      .then(function (j) { MO.contacts = j.contacts; MO.status.contacts = j.contacts.length; MO.error = ''; rerender(); })
      .catch(function (e) { MO.error = e.message; rerender(); });
  }

  document.addEventListener('input', function (e) {
    var el = e.target.closest && e.target.closest('[data-mo]'); if (!el) return;
    if (el.dataset.mo === 'log') { MO.log[el.dataset.k] = el.value; }
    else if (el.dataset.mo === 'import') MO.importText = el.value;
  });
  /* A phone screenshot is large. Shrink it to 1600 pixels on the long side, as a JPEG,
     before it goes anywhere. */
  function takeShot(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      MO.log.shot = c.toDataURL('image/jpeg', 0.85).split(',')[1]; MO.log.read = null;
      URL.revokeObjectURL(url); rerender();
    };
    img.onerror = function () { MO.log.read = { error: 'That image could not be opened. Try a PNG or JPEG screenshot.' }; URL.revokeObjectURL(url); rerender(); };
    img.src = url;
  }
  document.addEventListener('paste', function (e) {
    var el = e.target.closest && e.target.closest('[data-mo="log"][data-k="post"]'); if (!el) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { e.preventDefault(); takeShot(items[i].getAsFile()); return; }
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest && e.target.closest('[data-mo]'); if (!el) return;
    var k = el.dataset.mo;
    if (k === 'shot') { takeShot(el.files && el.files[0]); el.value = ''; return; }
    if (k === 'logsel') { MO.log[el.dataset.k] = el.value; delete MO.drafts.log; rerender(); }
    else if (k === 'audience') save([{ id: el.dataset.id, name: (MO.contacts.filter(function (c) { return c.id === el.dataset.id; })[0] || {}).name, audience: el.value }], 'Saved.');
    else if (k === 'watchco') save([{ id: el.dataset.id, name: (MO.contacts.filter(function (c) { return c.id === el.dataset.id; })[0] || {}).name, watchCompany: el.checked }], 'Saved.');
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-mo]'); if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
    var k = el.dataset.mo, id = el.dataset.id;
    var v = function (x) { var n = document.getElementById(x); return n ? (n.type === 'checkbox' ? n.checked : n.value) : ''; };
    if (k === 'filter') { MO.filter = el.dataset.v; rerender(); }
    else if (k === 'readpost') {
      if ((MO.log.post || '').trim().length < 15 && !MO.log.shot) { MO.log.read = { error: 'Paste the text of the post, or add a screenshot, first.' }; return rerender(); }
      MO.log.reading = true; rerender();
      api('read-post', { text: MO.log.post, image: MO.log.shot ? { media_type: 'image/jpeg', data: MO.log.shot } : undefined }).then(function (r) {
        MO.log.read = r;
        if (r.person) MO.log.name = r.person;
        if (r.company) MO.log.company = r.company;
        if (r.audience) MO.log.audience = r.audience;
        if (r.moment && r.moment !== 'mention') MO.log.moment = r.moment;
        if (r.detail) MO.log.detail = r.detail;
        delete MO.drafts.log;
      }).catch(function (x) { MO.log.read = { error: offline(x) ? 'Reading a post needs the hosted Studio.' : x.message }; })
        .then(function () { MO.log.reading = false; rerender(); });
    }
    else if (k === 'clearshot') { MO.log.shot = ''; rerender(); }
    else if (k === 'watchadd') {
      var R = MO.log.read || {};
      api('contacts', { contacts: [{ name: R.person, company: R.company || '', audience: MO.log.audience }] })
        .then(function () { R.matched = true; toast(R.person + ' is on the watch list. Set the relationship there if it is not ' + audienceName(MO.log.audience) + '.'); MO.contacts = null; rerender(); })
        .catch(function (x) { MO.log.read = Object.assign({}, R, { error: x.message }); rerender(); });
    }
    else if (k === 'setlimit') {
      var val = v('mo-gift-limit');
      api('settings', { giftLimit: val === '' ? null : Number(val) }).then(function (j) { MO.status.settings = j.settings; toast(j.settings.giftLimit == null ? 'No gift limit set.' : 'Gift limit: $' + j.settings.giftLimit + ' per gift.'); rerender(); })
        .catch(function (x) { MO.error = x.message; rerender(); });
    }
    else if (k === 'scan') {
      api('scan', {}).then(function () { MO.status.scanning = true; toast('Reading the news. It takes a minute or two.'); rerender(); setTimeout(load, 3000); })
        .catch(function (x) { MO.error = x.message; rerender(); });
    } else if (k === 'add') {
      save([{ name: v('mo-add-name'), company: v('mo-add-company'), city: v('mo-add-city'), audience: v('mo-add-audience'), also: v('mo-add-also'), instagram: v('mo-add-instagram'), watchCompany: v('mo-add-watchco') }], 'Added. It is read with the next morning\'s news.');
    } else if (k === 'doimport') {
      var rows = parseImport(MO.importText);
      if (!rows.length) { MO.error = 'No lines with a first and last name were found.'; return rerender(); }
      save(rows, rows.length + (rows.length === 1 ? ' person' : ' people') + ' added.').then(function () { MO.importText = ''; rerender(); });
    } else if (k === 'remove') {
      if (!global.confirm('Take this person off the watch list? Their new alerts go too.')) return;
      api('contacts/' + id + '/delete', {}).then(load).catch(function (x) { MO.error = x.message; rerender(); });
    } else if (k === 'draft') runDraft(id, { alertId: id });
    else if (k === 'logdraft') {
      if (!MO.log.name.trim()) { MO.drafts.log = { error: 'Say who it is for.' }; return rerender(); }
      var RP = MO.log.read && !MO.log.read.error ? MO.log.read : null;
      runDraft('log', { name: MO.log.name, company: MO.log.company, audience: MO.log.audience, moment: MO.log.moment, detail: MO.log.detail,
        seen: RP ? 'post' : 'heard', summary: RP ? RP.summary : '', postText: RP ? (RP.postText || MO.log.post) : '', platform: RP ? (RP.platform || '') : '' });
    } else if (k === 'card') {
      if (global.Experience && global.Experience._state) global.Experience._state.occasion = el.dataset.occ;
      location.hash = '#/experience/milestones';
    } else if (k === 'done' || k === 'notthem' || k === 'dismiss' || k === 'reopen') {
      var sel = document.querySelector('select[data-mo="what"][data-id="' + id + '"]');
      api('alerts/' + id + '/' + k, { what: k === 'done' && sel ? sel.value : '' }).then(function () {
        toast({ done: 'Handled. Log it in Redtail.', notthem: 'Marked not them.', dismiss: 'Dismissed.', reopen: 'Reopened.' }[k]);
        load();
      }).catch(function (x) { MO.error = x.message; rerender(); });
    }
  });

  global.Moments = { view: view, todayCard: todayCard, _state: MO, _parseImport: parseImport, _fill: fill };
})(window);
