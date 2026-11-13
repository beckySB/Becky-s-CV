/* Client experience: the program's service standard, the client year, the next-generation track,
   milestones and gifts, correspondence, events and the weekly rhythm, in one place.

   Built from two firm documents: the Client Retention, Appreciation and Acquisition Plan
   and the Operations and Client Experience Manual.

   Both make Redtail the system of record, so this holds the program, not the clients.
   The card composer keeps what is typed into it only until the page is closed, and every
   screen points back to Redtail for the record. That also keeps the line drawn earlier:
   this site holds no client financial data. */
(function (global) {
  'use strict';

  var CX = { occasion: 'birthday', fields: {}, tpl: '', week: '' };

  function D() { return (global.DATA && global.DATA.experience) || null; }
  function brand() { return global.Store && global.Store.activeBrand ? global.Store.activeBrand() : null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function chip(label, tone) { return '<span class="chip ' + (tone || '') + '"><i class="dot"></i>' + esc(label) + '</span>'; }
  function rerender() { if (global.App && global.App.render) global.App.render(); }
  function checks(text, formal) {
    return global.Newsroom && global.Newsroom.checkChips ? '<div class="nr-checks">' + global.Newsroom.checkChips(text, formal) + '</div>' : '';
  }
  function stored(k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function advisor() {
    var b = brand(), id = (b && b.identity) || {};
    var full = id.advisor || '';
    return { full: full, first: full.split(' ')[0] || '' };
  }

  /* Fill what is known. Leave what is not as a visible prompt, never as a blank. */
  var LABELS = {
    first: 'First name(s) on the card', detail: 'One specific detail, from the last conversation', business: 'Business name',
    years: 'Years', founded: 'Founding date', closed: 'Closing date', location: 'Location', date: 'Date of the event',
    child: "Child's name", graduate: "Graduate's name", school: 'School', couple: 'Names of the couple', name: 'Who the family lost',
    matters: 'What matters, in their words (Redtail)', heir: "Heir's first name",
    student: "Student's first name", young: "The young person's first name", achievement: 'What they did, in a few words',
    milestone: 'The milestone (their first job at ..., their first home)'
  };
  function fill(text, values) {
    var a = advisor();
    return String(text || '').replace(/\{\{(\w+)\}\}/g, function (m, k) {
      if (k === 'advisorFirst') return a.first || '[advisor]';
      if (k === 'advisor') return a.full || '[advisor]';
      if (k === 'maddie') return 'Maddie';
      var v = values && values[k] ? String(values[k]).trim() : '';
      return v || '[' + (LABELS[k] || k) + ']';
    });
  }

  function isoWeek(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return d.getUTCFullYear() + '-W' + String(Math.ceil(((d - y) / 86400000 + 1) / 7)).padStart(2, '0');
  }

  function currentPhase() {
    var t = new Date().toISOString().slice(0, 10);
    var r = D().rollout;
    var cur = r.find(function (p) { return t >= p.start && t <= p.end; });
    if (cur) return { p: cur, state: 'now' };
    var next = r.find(function (p) { return t < p.start; });
    return next ? { p: next, state: 'next' } : null;
  }

  /* ---------------- tabs ---------------- */

  var TABS = [['standard', 'The standard'], ['year', 'The client year'], ['generations', 'Generations'], ['milestones', 'Milestones and gifts'],
              ['letters', 'Correspondence'], ['events', 'Events'], ['week', 'This week'], ['redtail', 'Redtail'], ['decisions', 'Decisions']];

  function view(tab) {
    var d = D();
    if (!d) return '<div class="card"><h2>The client experience file did not load</h2><p class="small muted">data/experience.json is missing.</p></div>';
    tab = TABS.some(function (t) { return t[0] === tab; }) ? tab : 'standard';
    var head = '<div class="page-head"><div class="page-eyebrow">Client experience</div><h1>The experience every family remembers</h1>' +
      '<p class="lede">The service standard, the client year, the next generation, milestones, correspondence and events, from the firm\'s own plan and manual. ' +
      'Speed, memory, anticipation, access and belonging, made routine.</p></div>' +
      '<div class="callout brand" style="margin-bottom:6px"><strong>Redtail holds the record.</strong> ' + esc(d.principle) + '</div>' +
      '<p class="tiny muted" style="margin:6px 0 0">From ' + srcLink(d.sources.plan) + ' and ' + srcLink(d.sources.manual) + '. Targets are proposals until the Phase 0 baseline.</p>' +
      '<div class="tabs" role="tablist">' + TABS.map(function (t) {
        return '<a class="tab' + (t[0] === tab ? ' is-active' : '') + '" href="#/experience/' + t[0] + '">' + t[1] + '</a>';
      }).join('') + '</div>';
    var body = { standard: standardView, year: yearView, generations: generationsView, milestones: milestonesView,
                 letters: lettersView, events: eventsView, week: weekView, redtail: redtailView, decisions: decisionsView }[tab]();
    return head + body;
  }

  function srcLink(s) { return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + '</a>'; }
  function table(head, rows) {
    return '<div style="overflow-x:auto"><table class="table"><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td class="small">' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  }

  /* ---------------- the standard ---------------- */

  function standardView() {
    var d = D(), cp = currentPhase();
    return (cp ? '<div class="card"><div class="row-between"><div><h3 style="margin:0">' + (cp.state === 'now' ? 'Now: ' : 'Next: ') + esc(cp.p.phase) + '</h3>' +
        '<p class="tiny muted" style="margin:4px 0 0">' + esc(cp.p.start) + ' to ' + esc(cp.p.end) + '</p></div>' + chip('90-day rollout', 'info') + '</div>' +
        '<p class="small" style="margin:10px 0 4px">' + esc(cp.p.work) + '</p><p class="small" style="margin:0"><strong>Gate.</strong> ' + esc(cp.p.gate) + '</p></div>' : '') +
      '<div class="card"><h2 style="margin-top:0">Five signatures</h2><p class="small muted" style="margin-top:-2px">Spoil is speed, memory, anticipation and access first. Gifts are the smallest part of it.</p>' +
      '<div class="cx-sigs">' + d.signatures.map(function (s, i) {
        return '<div class="cx-sig"><div class="cx-sig-n">' + (i + 1) + '</div><div><strong>' + esc(s.name) + '</strong><p class="small" style="margin:2px 0 0">' + esc(s.detail) + '</p></div></div>';
      }).join('') + '</div></div>' +
      '<div class="card"><h2 style="margin-top:0">Who gets what</h2>' +
      table(['Tier', 'Who', 'Criteria', 'Service model'], d.tiers.map(function (t) {
        return ['<strong>' + t.n + '. ' + esc(t.name) + '</strong>', esc(t.who), esc(t.criteria), esc(t.model)];
      })) +
      '<h3 style="margin:16px 0 6px">Overlay tags, on any tier</h3><ul class="bullets">' +
      d.tags.map(function (t) { return '<li><strong>' + esc(t.name) + '.</strong> ' + esc(t.rule) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="card"><h2 style="margin-top:0">Targets</h2>' + table(['Measure', 'Proposed target', 'Review'], d.targets.map(function (t) { return [esc(t.metric), esc(t.target), esc(t.review)]; })) + '</div>' +
      '<div class="card"><h2 style="margin-top:0">Capacity is the binding limit</h2><ul class="bullets">' + d.capacity.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="card"><h3 style="margin-top:0">Rules that hold everywhere</h3><ul class="bullets">' + d.guardrails.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>';
  }

  /* ---------------- the client year ---------------- */

  function yearView() {
    var d = D(), m = new Date().getMonth() + 1;
    return '<div class="card"><h2 style="margin-top:0">The practice year</h2><p class="small muted" style="margin-top:-2px">This month and next are highlighted. Maddie puts the whole year on Becky\'s calendar in December.</p>' +
      '<div style="overflow-x:auto"><table class="table"><thead><tr><th>Month</th><th>What happens</th><th>Deliverable</th></tr></thead><tbody>' +
      d.annual.map(function (a) {
        var on = a.m === m, nx = a.m === (m % 12) + 1;
        return '<tr class="' + (on ? 'cx-now' : nx ? 'cx-next' : '') + '"><td class="small" style="white-space:nowrap"><strong>' + MONTHS[a.m - 1] + '</strong>' +
          (on ? '<br>' + chip('Now', 'good') : nx ? '<br>' + chip('Next', 'info') : '') + '</td><td class="small">' + esc(a.event) + '</td><td class="small">' + esc(a.deliverable) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      '<div class="card"><h2 style="margin-top:0">A retainer family\'s first year</h2><ol class="cx-arc">' +
      d.clientYear.map(function (c) { return '<li><span class="cx-arc-m">Month ' + c.month + '</span><span class="small">' + esc(c.event) + '</span></li>'; }).join('') +
      '</ol><p class="tiny muted" style="margin:8px 0 0">Family and business events override the calendar. Maddie flags them to Becky the same day.</p></div>' +
      '<div class="card"><h2 style="margin-top:0">The 90-day sprint clock, per family</h2>' +
      table(['When', 'Action'], d.sprint.map(function (s) { return ['<strong>' + esc(s.when) + '</strong>', esc(s.action)]; })) + '</div>';
  }

  /* ---------------- generations ---------------- */

  function generationsView() {
    var g = D().generations;
    return '<div class="card"><h2 style="margin-top:0">From one generation to the next</h2><p class="small">' + esc(g.why) + '</p>' +
      '<div class="cx-stages">' + g.stages.map(function (s, i) {
        return '<div class="cx-stage' + (s.extension ? ' is-ext' : '') + '"><div class="cx-stage-n">' + (i + 1) + '</div><div><strong>' + esc(s.stage) + '</strong>' +
          (s.extension ? ' ' + chip('Proposed, not in the plan yet', 'warn') : '') +
          '<p class="tiny muted" style="margin:2px 0 4px">' + esc(s.who) + '</p><p class="small" style="margin:0">' + esc(s.experience) + '</p></div></div>';
      }).join('') + '</div></div>' +
      '<div class="callout warn" style="margin-bottom:14px"><strong>Boundaries.</strong><ul class="bullets" style="margin-top:6px">' +
      g.boundaries.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div>' +
      g.materials.map(function (m) {
        var id = 'cx-mat-' + m.id, text = fill(m.body, {});
        return '<div class="card"><div class="row-between"><div><h3 style="margin:0">' + esc(m.name) + '</h3><p class="tiny muted" style="margin:2px 0 0">' + esc(m.when) + '</p></div>' +
          '<button class="btn btn-sm" data-act="copy" data-target="' + id + '">Copy</button></div>' +
          (m.formal ? checks(m.body, true) : '') +
          '<p class="small muted">' + esc(m.note) + '</p><div class="nr-pre" id="' + id + '">' + esc(text) + '</div></div>';
      }).join('');
  }

  /* ---------------- milestones and the composer ---------------- */

  function composer() {
    var oc = D().milestones.occasions;
    var o = oc.find(function (x) { return x.id === CX.occasion; }) || oc[0];
    var f = CX.fields;
    var fields = o.fields.concat(o.engraving ? ['matters', 'date'] : []).filter(function (k, i, a) { return a.indexOf(k) === i; });
    var note = fill(o.note, f);
    var engraving = o.engraving ? fill(o.engraving, f) : '';
    var prov = o.engraving ? fill('{{date}}\n' + o.name + '\n{{matters}}', f) : '';
    var log = 'Milestone: ' + o.name + ' | Date: ' + (f.date || '[date]') + ' | Sent: ' + o.gift + ' | Amount: $[amount] | Approved by: ' + (advisor().first || '[advisor]');
    return '<div class="card"><h2 style="margin-top:0">Write a card</h2>' +
      '<p class="small muted" style="margin-top:-2px">Pick the occasion, add the one specific detail, and the note, the engraving and the provenance card follow the house rules. ' +
      '<strong>Nothing typed here is saved.</strong> Log what was sent in Redtail.</p>' +
      '<label class="field"><span class="field-l">Occasion</span><select data-cx="occasion">' +
      oc.map(function (x) { return '<option value="' + x.id + '"' + (x.id === o.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin:-2px 0 10px">' + chip(o.tier, 'info') + chip(o.ceiling, 'idle') + chip(o.gift, 'idle') + '</div>' +
      '<p class="small" style="margin:0 0 10px"><strong>Timing.</strong> ' + esc(o.timing) + '</p>' +
      (o.cautions ? '<div class="callout warn" style="margin-bottom:12px"><ul class="bullets" style="margin:0">' + o.cautions.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="cx-fields">' + fields.map(function (k) {
        return '<label class="field" style="margin:0"><span class="field-l">' + esc(LABELS[k] || k) + '</span>' +
          '<input type="text" data-cx="field" data-k="' + k + '" value="' + esc(f[k] || '') + '"></label>';
      }).join('') + '</div>' +
      '<div class="cx-out">' +
      out('cx-note', 'The handwritten note', note, true) +
      (engraving ? out('cx-engr', 'Engraving (client confirms wording in writing first)', engraving, true) : '') +
      (prov ? out('cx-prov', 'Provenance card, in the box', prov, true) : '') +
      out('cx-log', 'Redtail milestone log', log, false) + '</div></div>';
  }
  function out(id, label, text, formal) {
    return '<div class="cx-outbox"><div class="row-between"><strong class="small">' + esc(label) + '</strong>' +
      '<button class="btn btn-sm" data-act="copy" data-target="' + id + '">Copy</button></div>' +
      (formal ? checks(text.replace(/\[[^\]]+\]/g, 'x'), true) : '') +
      '<div class="nr-pre" id="' + id + '">' + esc(text) + '</div></div>';
  }

  function milestonesView() {
    var m = D().milestones;
    return composer() +
      '<div class="card"><h2 style="margin-top:0">Milestone catalog</h2><p class="small muted" style="margin-top:-2px">' + esc(m.budget) + '</p>' +
      table(['Milestone', 'Tier', 'Gesture', 'Ceiling a year'], m.catalog.map(function (c) { return [esc(c.milestone), esc(c.tier), esc(c.gesture), esc(c.ceiling)]; })) + '</div>' +
      '<div class="card"><h2 style="margin-top:0">Heirloom gifts</h2><p class="small"><strong>The test.</strong> ' + esc(m.test) + '</p>' +
      table(['Milestone', 'Heirloom', 'Indicative price', ''], m.heirlooms.map(function (h) { return [esc(h.milestone), esc(h.item), esc(h.price), h.note ? '<span class="tiny muted">' + esc(h.note) + '</span>' : '']; })) +
      '<h3 style="margin:16px 0 6px">Engraving standard</h3><ul class="bullets">' + m.engraving.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="callout warn" style="margin-bottom:14px"><strong>Before anything is ordered.</strong><ul class="bullets" style="margin-top:6px">' +
      m.guardrails.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>';
  }

  /* ---------------- correspondence ---------------- */

  function packet() {
    var t = D().templates;
    var lines = ['COMPLIANCE SUBMISSION: CLIENT CORRESPONDENCE TEMPLATES', 'Women Worth & Wealth. Prepared ' + new Date().toISOString().slice(0, 10) + '.',
      'Submitted as one packet, per the operations manual. Placeholders in {{braces}} are filled per client in Redtail; nothing else changes without resubmission.', ''];
    t.forEach(function (x, i) {
      lines.push((i + 1) + '. ' + x.name + (x.firstBatch ? ' (first batch)' : ''));
      lines.push('Used: ' + x.when + '. Sent by: ' + x.owner + '.');
      if (x.subject) lines.push('Subject: ' + x.subject);
      lines.push('', x.body, '', '----', '');
    });
    return lines.join('\n');
  }

  function lettersView() {
    var t = D().templates;
    var groups = [];
    t.forEach(function (x) { if (groups.indexOf(x.group) < 0) groups.push(x.group); });
    return '<div class="card"><div class="row-between"><div><h2 style="margin:0">Correspondence templates</h2>' +
      '<p class="small muted" style="margin:4px 0 0">' + t.length + ' templates. The six marked first batch are the ones the manual says to clear before launch. All are drafts until compliance clears them.</p></div>' +
      '<button class="btn btn-primary btn-sm" data-act="copy" data-target="cx-packet">Copy the compliance packet</button></div>' +
      '<pre id="cx-packet" hidden>' + esc(packet()) + '</pre></div>' +
      groups.map(function (g) {
        return '<div class="section-title">' + esc(g) + '</div>' + t.filter(function (x) { return x.group === g; }).map(function (x) {
          var id = 'cx-t-' + x.id;
          var text = (x.subject ? 'Subject: ' + x.subject + '\n\n' : '') + x.body;
          return '<div class="card"><div class="row-between"><div><h3 style="margin:0">' + esc(x.name) + ' ' + (x.firstBatch ? chip('First batch', 'warn') : '') + '</h3>' +
            '<p class="tiny muted" style="margin:2px 0 0">' + esc(x.when) + ' &middot; ' + esc(x.owner) + '</p></div>' +
            '<button class="btn btn-sm" data-act="copy" data-target="' + id + '">Copy</button></div>' +
            checks(text, x.formal) + '<div class="nr-pre" id="' + id + '">' + esc(text) + '</div></div>';
        }).join('');
      }).join('');
  }

  /* ---------------- events ---------------- */

  function eventsView() {
    var d = D(), m = new Date().getMonth() + 1;
    var upcoming = [];
    for (var k = 0; k < 4; k++) {
      var mm = ((m - 1 + k) % 12) + 1;
      d.events.forEach(function (e) { if (e.months.indexOf(mm) >= 0 && !upcoming.some(function (u) { return u.e.id === e.id; })) upcoming.push({ e: e, m: mm }); });
    }
    return '<div class="card"><h2 style="margin-top:0">Coming up</h2>' +
      (upcoming.length ? '<ul class="bullets">' + upcoming.map(function (u) {
        return '<li><strong>' + MONTHS[u.m - 1] + ':</strong> ' + esc(u.e.name) + ' <span class="muted small">(' + esc(u.e.audience) + ')</span>' +
          (u.e.newsroom ? ' <a class="small" href="#/news/briefings">Pick a Newsroom briefing as the topic</a>' : '') + '</li>';
      }).join('') + '</ul>' : '<p class="small muted">Nothing scheduled in the next four months.</p>') +
      '<p class="tiny muted" style="margin:6px 0 0">Invitations go out 30 days ahead, so an event two months away is already on this week\'s list.</p></div>' +
      d.events.map(function (e) {
        var id = 'cx-inv-' + e.id;
        var text = e.invite ? 'Subject: ' + e.invite.subject + '\n\n' + fill(e.invite.body, {}) : '';
        return '<div class="card"><h3 style="margin:0">' + esc(e.name) + '</h3><p class="tiny muted" style="margin:2px 0 8px">' + esc(e.timing) + ' &middot; ' + esc(e.owner) + '</p>' +
          '<p class="small" style="margin:0 0 4px"><strong>Who.</strong> ' + esc(e.audience) + '</p>' +
          '<p class="small" style="margin:0 0 4px"><strong>Format.</strong> ' + esc(e.format) + '</p>' +
          '<p class="small" style="margin:0"><strong>Why.</strong> ' + esc(e.purpose) + '</p>' +
          (e.invite ? '<details class="cx-details"><summary class="small">The invitation</summary>' +
            '<div class="row-between" style="margin-top:8px">' + checks(e.invite.subject + '\n' + e.invite.body, true) +
            '<button class="btn btn-sm" data-act="copy" data-target="' + id + '">Copy</button></div><div class="nr-pre" id="' + id + '">' + esc(text) + '</div></details>' : '') +
          '</div>';
      }).join('') +
      '<div class="card"><h3 style="margin-top:0">How every event runs</h3><ol class="small">' + d.eventRules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ol></div>';
  }

  /* ---------------- this week: huddle and scorecard ----------------
     Saved in this browser only, and only as counts and ticks. No client is named here. */

  function weekKey() { return CX.week || (CX.week = isoWeek(new Date())); }
  function huddleState() { try { return JSON.parse(stored('www.cx.huddle.' + weekKey(), '{}')); } catch (e) { return {}; } }
  function scoreState() { try { return JSON.parse(stored('www.cx.score.' + weekKey(), '{}')); } catch (e) { return {}; } }

  function rag(s, v) {
    if (v === '' || v == null || isNaN(+v)) return '';
    v = +v;
    if (s.kind === 'pct') return v >= s.target ? 'good' : v >= s.target - 10 ? 'warn' : 'alert';
    if (s.kind === 'zero') return v === 0 ? 'good' : v <= 2 ? 'warn' : 'alert';
    if (s.kind === 'max') return v <= s.target ? 'good' : v <= s.target + 2 ? 'warn' : 'alert';
    if (s.kind === 'range') return v >= s.min && v <= s.max ? 'good' : v >= s.min - 1 ? 'warn' : 'alert';
    return '';
  }
  function targetText(s) {
    return s.kind === 'pct' ? s.target + '%' : s.kind === 'zero' ? '0' : s.kind === 'max' ? 'Under ' + s.target : s.min + ' to ' + s.max;
  }
  function scoreText() {
    var st = scoreState(), d = D();
    var L = ['Women Worth & Wealth weekly scorecard, ' + weekKey(), ''];
    d.scorecard.forEach(function (s) {
      var v = st[s.id], r = rag(s, v);
      L.push((r === 'good' ? 'GREEN ' : r === 'warn' ? 'YELLOW' : r === 'alert' ? 'RED   ' : '----- ') + '  ' + s.measure + ': ' + (v === undefined || v === '' ? 'not entered' : v + (s.kind === 'pct' ? '%' : '')) + ' (target ' + targetText(s) + ')');
    });
    L.push('', 'What broke: ' + (st.broke || 'Nothing broke.'), 'What I fixed: ' + (st.fixed || ''), 'What needs Becky: ' + (st.needs || ''));
    return L.join('\n');
  }

  function weekView() {
    var d = D(), h = huddleState(), st = scoreState();
    var done = d.huddle.filter(function (x, i) { return h[i]; }).length;
    return '<div class="card"><div class="row-between"><div><h2 style="margin:0">Monday: Client Care Huddle</h2>' +
      '<p class="small muted" style="margin:4px 0 0">30 minutes on the seven Redtail smart lists. Tick each one once it has been worked. ' + done + ' of ' + d.huddle.length + ' done for ' + esc(weekKey()) + '.</p></div></div>' +
      d.huddle.map(function (x, i) {
        return '<label class="check-row' + (h[i] ? ' done' : '') + '"><input type="checkbox" data-cx="huddle" data-i="' + i + '"' + (h[i] ? ' checked' : '') + '><span class="check-txt small">' + esc(x) + '</span></label>';
      }).join('') + '</div>' +
      '<div class="card"><div class="row-between"><div><h2 style="margin:0">Friday: the scorecard</h2>' +
      '<p class="small muted" style="margin:4px 0 0">Numbers from Redtail, by noon. Becky should be able to read it in 90 seconds.</p></div>' +
      '<button class="btn btn-primary btn-sm" data-act="copy" data-target="cx-score">Copy for Becky</button></div>' +
      '<div style="overflow-x:auto"><table class="table"><thead><tr><th>Measure</th><th>Target</th><th>This week</th><th></th></tr></thead><tbody>' +
      d.scorecard.map(function (s) {
        var v = st[s.id] == null ? '' : st[s.id], r = rag(s, v);
        return '<tr><td class="small">' + esc(s.measure) + '</td><td class="small">' + esc(targetText(s)) + '</td>' +
          '<td><input type="number" min="0" data-cx="score" data-id="' + s.id + '" value="' + esc(v) + '" style="width:84px"></td>' +
          '<td id="cx-rag-' + s.id + '">' + (r ? chip(r === 'good' ? 'Green' : r === 'warn' ? 'Yellow' : 'Red', r) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      ['broke:What broke', 'fixed:What Maddie fixed', 'needs:What needs Becky'].map(function (p) {
        var k = p.split(':');
        return '<label class="field" style="margin-top:10px"><span class="field-l">' + k[1] + '</span><input type="text" data-cx="score" data-id="' + k[0] + '" value="' + esc(st[k[0]] || '') + '"></label>';
      }).join('') +
      '<pre id="cx-score" hidden>' + esc(scoreText()) + '</pre>' +
      '<p class="tiny muted" style="margin:8px 0 0">Kept in this browser for this week only, as counts. No client is named.</p></div>';
  }

  /* ---------------- redtail and decisions ---------------- */

  function redtailView() {
    var r = D().redtail;
    return '<div class="callout warn" style="margin-bottom:14px">' + esc(r.note) + ' Build households, fields, tags, smart lists and workflows in that order, and automate nothing until the data is clean.</div>' +
      '<div class="card"><h2 style="margin-top:0">Custom fields on every household</h2><ul class="bullets">' + r.fields.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' +
      '<p class="tiny muted" style="margin:6px 0 0">Keep health and other sensitive detail out of notes unless a plan requires it.</p></div>' +
      '<div class="card"><h2 style="margin-top:0">Smart lists, reviewed every Monday</h2><ul class="bullets">' + D().huddle.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="card"><h2 style="margin-top:0">Workflows</h2>' + table(['Workflow', 'Trigger', 'Steps', 'Owner'], r.workflows.map(function (w) { return ['<strong>' + esc(w.name) + '</strong>', esc(w.trigger), esc(w.steps), esc(w.owner)]; })) + '</div>';
  }

  function decisionsView() {
    var d = D();
    return '<div class="card"><h2 style="margin-top:0">What has to be decided before this runs</h2>' +
      '<p class="small muted" style="margin-top:-2px">From the open decisions in both documents. Each one is short to decide and blocks something specific.</p>' +
      table(['Decision', 'Owner', 'Source'], d.decisions.map(function (x) {
        return [esc(x.item), esc(x.owner), esc(x.src === 'plan' ? 'Retention plan' : 'Operations manual')];
      })) + '</div>' +
      '<div class="card"><h3 style="margin-top:0">The 90-day rollout</h3>' + table(['Phase', 'Dates', 'Gate'], d.rollout.map(function (p) {
        return ['<strong>' + esc(p.phase) + '</strong><br><span class="tiny">' + esc(p.work) + '</span>', esc(p.start + ' to ' + p.end), esc(p.gate)];
      })) + '</div>';
  }

  /* ---------------- Today ---------------- */

  function todayCard() {
    var d = D();
    if (!d) return '';
    var cp = currentPhase(), m = new Date().getMonth() + 1;
    var a = d.annual.find(function (x) { return x.m === m; });
    var dow = new Date().getDay();
    return '<div class="section-title">Client experience</div><div class="card">' +
      (cp ? '<p class="small" style="margin:0 0 6px"><strong>' + (cp.state === 'now' ? 'Rollout now: ' : 'Rollout next: ') + esc(cp.p.phase) + '.</strong> ' + esc(cp.p.gate) + '</p>' : '') +
      (a ? '<p class="small" style="margin:0 0 6px"><strong>' + MONTHS[m - 1] + '.</strong> ' + esc(a.event) + '</p>' : '') +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">' +
      (dow === 1 ? '<a class="btn btn-sm btn-primary" href="#/experience/week">Run the Monday huddle</a>' : '') +
      (dow === 5 ? '<a class="btn btn-sm btn-primary" href="#/experience/week">Build the Friday scorecard</a>' : '') +
      '<a class="btn btn-sm" href="#/experience/milestones">Write a card</a><a class="btn btn-sm" href="#/experience/events">Events</a>' +
      '<a class="btn btn-sm" href="#/experience/decisions">' + d.decisions.length + ' open decisions</a></div></div>';
  }

  /* ---------------- events ---------------- */

  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-cx]');
    if (!el) return;
    var k = el.dataset.cx;
    if (k === 'occasion') { CX.occasion = el.value; rerender(); }
    else if (k === 'huddle') {
      var h = huddleState(); h[el.dataset.i] = el.checked; store('www.cx.huddle.' + weekKey(), JSON.stringify(h)); rerender();
    }
  });
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-cx]');
    if (!el) return;
    var k = el.dataset.cx;
    if (k === 'field') {
      CX.fields[el.dataset.k] = el.value;
      /* Update the outputs in place so the caret stays in the field. */
      var tmp = document.createElement('div');
      tmp.innerHTML = composer();
      var fresh = tmp.querySelector('.cx-out'), cur = document.querySelector('.cx-out');
      if (fresh && cur) cur.innerHTML = fresh.innerHTML;
    } else if (k === 'score') {
      var st = scoreState(); st[el.dataset.id] = el.value; store('www.cx.score.' + weekKey(), JSON.stringify(st));
      var s = D().scorecard.find(function (x) { return x.id === el.dataset.id; });
      var cell = document.getElementById('cx-rag-' + el.dataset.id);
      if (s && cell) { var r = rag(s, el.value); cell.innerHTML = r ? chip(r === 'good' ? 'Green' : r === 'warn' ? 'Yellow' : 'Red', r) : ''; }
      var pre = document.getElementById('cx-score'); if (pre) pre.textContent = scoreText();
    }
  });

  global.Experience = { view: view, todayCard: todayCard, _fill: fill, _rag: rag, _isoWeek: isoWeek, _state: CX };
})(window);
