/* Router, event wiring and boot for the Content Studio. */
(function (global) {
  'use strict';

  var S = global.Store;
  var DATA = null;

  var App = { contentClient: '', contentChannel: 'li', contentPillar: '', contentGroup: 'onboard' };
  global.App = App;

  function svg(paths) {
    return '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" width="17" height="17" aria-hidden="true">' + paths + '</svg>';
  }
  var ICON = {
    today: svg('<circle cx="10" cy="10" r="3.4"/><path d="M10 2.2v1.6M10 16.2v1.6M2.2 10h1.6M16.2 10h1.6M4.5 4.5l1.1 1.1M14.4 14.4l1.1 1.1M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1"/>'),
    brand: svg('<path d="M10 2.6l2.3 4.7 5.1.7-3.7 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.7-3.6 5.1-.7z"/>'),
    content: svg('<path d="M13.4 3.2l3.4 3.4-9 9-4.2.8.8-4.2z"/><path d="M11.6 5l3.4 3.4"/>'),
    outreach: svg('<path d="M3 10.4l14-6.2-4.6 13.4-2.3-5z"/><path d="M10.1 12.6L17 4.2"/>'),
    reference: svg('<circle cx="6.6" cy="7" r="2.4"/><circle cx="13.4" cy="7" r="2.4"/><path d="M2.6 16.4c0-2.3 1.8-3.6 4-3.6s4 1.3 4 3.6M9.4 16.4c0-2.3 1.8-3.6 4-3.6s4 1.3 4 3.6"/>'),
    news: svg('<rect x="3" y="3.6" width="14" height="12.8" rx="1.6"/><path d="M6 7.2h8M6 10h8M6 12.8h5"/>'),
    experience: svg('<path d="M10 16.6s-6-3.6-6-8.1A3.4 3.4 0 0 1 10 6.3a3.4 3.4 0 0 1 6 2.2c0 4.5-6 8.1-6 8.1z"/>'),
    photo: svg('<rect x="2.6" y="4.4" width="14.8" height="11.6" rx="1.6"/><circle cx="7.2" cy="8.6" r="1.5"/><path d="M17.4 13.2l-4-4-6.8 6.8"/>'),
    bell: svg('<path d="M5.4 13.6V9.2a4.6 4.6 0 0 1 9.2 0v4.4l1.4 1.8H4z"/><path d="M8.4 17.2a1.7 1.7 0 0 0 3.2 0"/>'),
    publish: svg('<rect x="3" y="4.2" width="14" height="12.6" rx="1.6"/><path d="M3 8h14M7 2.6v3M13 2.6v3M8 12.2l1.6 1.6 3-3.2"/>'),
    video: svg('<rect x="2.6" y="5" width="10.6" height="10" rx="1.6"/><path d="M13.2 8.6l4.2-2.4v7.6l-4.2-2.4z"/>'),
    settings: svg('<circle cx="10" cy="10" r="2.6"/><path d="M10 2.6l1 2.1 2.3-.5 1.2 2-1.5 1.8 1.5 1.8-1.2 2-2.3-.5-1 2.1-1-2.1-2.3.5-1.2-2L6.7 10 5.2 8.2l1.2-2 2.3.5z"/>')
  };

  var NAV = [
    { group: 'The brand', items: [
      { hash: '#/brand', icon: ICON.brand, label: 'Style guide' }
    ]},
    { group: 'Every morning', items: [
      { hash: '#/', icon: ICON.today, label: 'Today' }
    ]},
    { group: 'Serve clients', items: [
      { hash: '#/experience', icon: ICON.experience, label: 'Client experience' },
      { hash: '#/moments', icon: ICON.bell, label: 'Moments' }
    ]},
    { group: 'Reach people', items: [
      { hash: '#/outreach', icon: ICON.outreach, label: 'Outreach' }
    ]},
    { group: 'Say things', items: [
      { hash: '#/news', icon: ICON.news, label: 'Newsroom' },
      { hash: '#/content', icon: ICON.content, label: 'Content Studio' },
      { hash: '#/post', icon: ICON.photo, label: 'Post from photos' },
      { hash: '#/publish', icon: ICON.publish, label: 'Publishing' },
      { hash: '#/video', icon: ICON.video, label: 'Video editor' }
    ]},
    { group: 'Behind it', items: [
      { hash: '#/reference', icon: ICON.reference, label: 'Reference' },
      { hash: '#/settings', icon: ICON.settings, label: 'Settings' }
    ]}
  ];

  function boot() {
    var files = ['craft', 'brands', 'practice', 'coi', 'growth', 'news', 'experience', 'publishing', 'moments'];
    var dataReady = global.STUDIO_DATA
      ? Promise.resolve(global.STUDIO_DATA)
      : Promise.all(files.map(function (f) {
          return fetch('data/' + f + '.json').then(function (r) {
            if (!r.ok) throw new Error(f);
            return r.json();
          });
        })).then(function (loaded) {
          var d = {};
          files.forEach(function (f, i) { d[f] = loaded[i]; });
          return d;
        });

    dataReady.then(function (d) {
      DATA = d;
      global.DATA = d;
      global.Brand.useData(d);
      /* The shipped brand seeds this browser once. After that it belongs to whoever edits it,
         and a later load of the file never overwrites their work. */
      S.seedBrands(d.brands.brands);
      global.Brand.apply();
      applyStoredTheme();
      render();
      global.addEventListener('hashchange', render);
      S.subscribe(function () { render(); });
    }).catch(function () {
      document.getElementById('view').innerHTML =
        '<div class="card"><h2>The content files did not load</h2>' +
        '<p class="small muted">This site reads its library from the <code>data/</code> folder, and browsers block those reads when a page is opened straight from the file system. Serve it over http instead.</p></div>';
    });
  }

  function route() {
    return (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean);
  }
  function navHash() {
    var p = route();
    if (!p.length) return '#/';
    return '#/' + p[0];
  }

  var lastView = '';
  function render() {
    var p = route(), V = global.Views, html;
    var focus = captureFocus();
    /* The video editor holds a playing video, a canvas and possibly a recording in
       progress. Redrawing the page around it would destroy all three, so while you stay on
       the editor only the navigation is redrawn. */
    /* Screens that hold live media keep their page while you stay on them: the video
       editor (a playing video, possibly mid-export) and the post maker (your photos). */
    var ROOTS = { video: 've-root', post: 'pm-root' };
    if (lastView === 'video' && p[0] !== 'video' && global.VideoEdit && global.VideoEdit.busy()) {
      /* Leaving mid-export would throw the recording away. Stay, and say why. */
      toast('An export is running. Leave once it finishes, or the recording is lost.');
      history.replaceState(null, '', '#/video');
      return;
    }
    if (ROOTS[p[0]] && lastView === p[0] && document.getElementById(ROOTS[p[0]])) {
      renderBrandSwitcher();
      drawNav();
      return;
    }
    lastView = p[0] || '';
    try {
      switch (p[0]) {
        case 'news': html = global.Newsroom.view(p[1], p[2]); break;
        case 'experience': html = global.Experience.view(p[1]); break;
        case 'video': html = global.VideoEdit.view(); break;
        case 'post': html = global.PostMaker.view(); break;
        case 'publish': html = global.Publish.view(p[1]); break;
        case 'moments': html = global.Moments.view(p[1]); break;
        case undefined: html = V.today(); break;
        case 'brand': html = V.brand(p[1]); break;
        case 'content': html = V.content(p[1]); break;
        case 'outreach': html = V.outreach(p[1]); break;
        case 'reference': html = V.reference(); break;
        case 'settings': html = V.settings(); break;
        default: html = V.today();
      }
    } catch (e) {
      html = '<div class="card"><h2>Something went wrong drawing this screen</h2>' +
        '<p class="small muted">' + V.esc(e.message) + '</p>' +
        '<a class="btn" href="#/">Back to Today</a></div>';
    }
    document.getElementById('view').innerHTML = html;
    if (p[0] === 'video' && global.VideoEdit) global.VideoEdit.mount();
    if (p[0] === 'post' && global.PostMaker) global.PostMaker.mount();
    renderBrandSwitcher();
    drawNav();
    restoreFocus(focus);
  }

  function drawNav() {
    var here = navHash();
    document.getElementById('nav').innerHTML = NAV.map(function (g) {
      return '<div class="nav-group"><div class="nav-label">' + g.group + '</div>' +
        g.items.map(function (it) {
          return '<a class="nav-item' + (it.hash === here ? ' is-active' : '') + '" href="' + it.hash + '">' +
            '<span class="nav-ico">' + it.icon + '</span>' + it.label + '</a>';
        }).join('') + '</div>';
    }).join('');
  }
  App.render = function () { render(); };

  /* Redrawing the whole view on every change loses the caret, which makes a text field
     unusable. Remember where it was and put it back. */
  function captureFocus() {
    var el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.act) return null;
    if (!('value' in el)) return null;
    return { act: el.dataset.act, field: el.dataset.field || '', pr: el.dataset.pr || '',
             start: el.selectionStart, end: el.selectionEnd };
  }
  function restoreFocus(f) {
    if (!f) return;
    var sel = '[data-act="' + f.act + '"]' + (f.field ? '[data-field="' + f.field + '"]' : '') +
      (f.pr ? '[data-pr="' + f.pr + '"]' : '');
    var el = document.querySelector(sel);
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(f.start, f.end); } catch (e) { /* not every input type allows it */ }
  }


  /* Which brand you are working on, always visible. Posting as the wrong brand is the one
     mistake a multi-brand studio makes that a single-brand one cannot, so it is never more
     than a glance away. */
  function renderBrandSwitcher() {
    var host = document.getElementById('brand-switch');
    if (!host) return;
    var brands = S.brands(), active = S.activeBrand();
    if (!brands.length) { host.innerHTML = ''; return; }
    /* This studio serves one firm. The brand machinery stays underneath, because every
       module reads its voice and palette from it, but there is nothing to switch between. */
    if (global.STUDIO_ONLY !== false) { host.innerHTML = ''; return; }
    if (brands.length === 1) {
      host.innerHTML = '<div class="nav-label" style="padding-bottom:2px">Working on</div>' +
        '<div class="small" style="font-weight:650;padding:0 10px 4px">' + global.Views.esc(active.name) + '</div>';
      return;
    }
    host.innerHTML = '<div class="nav-label" style="padding-bottom:2px">Working on</div>' +
      '<select data-act="brand-switch-select" style="width:100%">' + brands.map(function (b) {
        return '<option value="' + b.id + '"' + (active && b.id === active.id ? ' selected' : '') + '>' +
          global.Views.esc(b.name) + '</option>';
      }).join('') + '</select>';
  }

  var toastTimer;
  App.toast = function (m) { toast(m); };
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3600);
  }

  function applyStoredTheme() {
    var v = '';
    try { v = localStorage.getItem('www.studio.theme') || ''; } catch (e) {}
    if (v) document.documentElement.setAttribute('data-theme', v);
    else document.documentElement.removeAttribute('data-theme');
  }

  /* Field edits are debounced so typing does not write on every keystroke. A button pressed
     inside that window would otherwise act on the value from before the edit, so every click
     flushes whatever is pending first. */
  var saveTimer, pendingSave = null;
  function deferSave(fn) {
    clearTimeout(saveTimer);
    pendingSave = fn;
    saveTimer = setTimeout(function () { pendingSave = null; fn(); }, 400);
  }
  function flushSave() {
    if (!pendingSave) return;
    clearTimeout(saveTimer);
    var fn = pendingSave; pendingSave = null; fn();
  }


  function pushBrandList(brandId, list, item) {
    var b = S.brand(brandId); if (!b) return;
    b.voice[list] = b.voice[list] || [];
    b.voice[list].push(item);
    S.save(); global.Brand.apply();
  }

  function addColor(brandId, hex, name, use) {
    var b = S.brand(brandId); if (!b) return;
    b.visual.colors = b.visual.colors || [];
    if (b.visual.colors.some(function (c) { return c.hex.toLowerCase() === hex.toLowerCase(); })) return;
    b.visual.colors.push({ hex: hex, name: name || '', use: use || '' });
    S.save(); global.Brand.apply();
  }

  /* Read a palette straight off the logo, in this browser, with no library and no upload.
     Quantise to a coarse grid so near identical pixels collapse into one swatch, drop the
     near-white and near-black that every logo is mostly made of, and keep what is left by
     frequency. It is not a design tool, it is a shortcut past typing six hex codes. */
  function palette(img, want) {
    var n = 160;
    var cv = document.createElement('canvas');
    var scale = Math.min(n / img.width, n / img.height, 1);
    cv.width = Math.max(1, Math.round(img.width * scale));
    cv.height = Math.max(1, Math.round(img.height * scale));
    var cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    var data;
    try { data = cx.getImageData(0, 0, cv.width, cv.height).data; }
    catch (e) { return []; }   /* a cross origin image taints the canvas; a file upload does not */

    var buckets = {};
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;                    /* transparent */
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max > 240 && min > 232) continue;               /* the white the logo sits on */
      if (max < 26) continue;                             /* near black */
      var k = (Math.round(r / 24) * 24) + ',' + (Math.round(g / 24) * 24) + ',' + (Math.round(b / 24) * 24);
      if (!buckets[k]) buckets[k] = { n: 0, r: 0, g: 0, b: 0 };
      var bk = buckets[k];
      bk.n++; bk.r += r; bk.g += g; bk.b += b;
    }
    return Object.keys(buckets).map(function (k) {
      var bk = buckets[k];
      return { n: bk.n, hex: rgbHex(bk.r / bk.n, bk.g / bk.n, bk.b / bk.n) };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, want || 5);
  }

  function rgbHex(r, g, b) {
    function h(v) { var x = Math.max(0, Math.min(255, Math.round(v))).toString(16); return x.length === 1 ? '0' + x : x; }
    return '#' + h(r) + h(g) + h(b);
  }

  /* ---------------- clicks ---------------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    var menu = e.target.closest('#menu-btn');
    if (menu) { document.querySelector('.sidebar').classList.toggle('open'); return; }
    if (e.target.closest('.nav-item') && innerWidth <= 900) {
      document.querySelector('.sidebar').classList.remove('open');
    }
    if (!el) return;
    flushSave();
    var act = el.dataset.act;

    if (act === 'copy') {
      var node = document.getElementById(el.dataset.target);
      if (!node) return;
      var text = node.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('Copied'); },
          function () { toast('Could not copy. Select it and copy by hand.'); });
      } else { toast('Select it and copy by hand.'); }
    }

    /* ---- brands ---- */
    else if (act === 'brand-new') {
      var bn = prompt('What is the brand called?');
      if (bn && bn.trim()) {
        var nb = global.Brand.blank(bn.trim());
        S.addBrand(nb);
        S.setActiveBrand(nb.id);
        global.Brand.apply();
        toast('Created. Fill in the style guide and everything else reads from it.');
        location.hash = '#/brand/identity';
      }
    }
    else if (act === 'brand-switch') {
      S.setActiveBrand(el.dataset.brand); global.Brand.apply();
      toast('Working on ' + (S.activeBrand() || {}).name);
    }
    else if (act === 'brand-remove') {
      var rb = S.brand(el.dataset.brand);
      if (rb && confirm('Delete ' + rb.name + '?\n\nIts style guide, library, calendar and queue all go with it. There is no undo.')) {
        S.removeBrand(rb.id); global.Brand.apply(); toast('Deleted');
      }
    }
    else if (act === 'brand-export') {
      var eb = S.brand(el.dataset.brand); if (!eb) return;
      var ebBlob = new Blob([JSON.stringify(eb, null, 2)], { type: 'application/json' });
      var ebA = document.createElement('a');
      ebA.href = URL.createObjectURL(ebBlob);
      ebA.download = eb.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-brand.json';
      ebA.click();
      setTimeout(function () { URL.revokeObjectURL(ebA.href); }, 1000);
    }
    else if (act === 'brand-add-principle') {
      var pn = (document.getElementById('np-name') || {}).value || '';
      var pd = (document.getElementById('np-detail') || {}).value || '';
      if (!pn.trim()) { toast('Give the principle a name'); return; }
      pushBrandList(el.dataset.brand, 'principles', { name: pn.trim(), detail: pd.trim() });
    }
    else if (act === 'brand-add-mechanic') {
      var mt = (document.getElementById('nm-text') || {}).value || '';
      if (!mt.trim()) return;
      pushBrandList(el.dataset.brand, 'mechanics', mt.trim());
    }
    else if (act === 'brand-add-banned') {
      var bw = (document.getElementById('nb-word') || {}).value || '';
      var bi = (document.getElementById('nb-instead') || {}).value || '';
      if (!bw.trim()) return;
      pushBrandList(el.dataset.brand, 'banned', { word: bw.trim(), instead: bi.trim() });
    }
    else if (act === 'brand-list-remove') {
      var lb = S.brand(el.dataset.brand); if (!lb) return;
      var list = el.dataset.list;
      lb.voice[list] = (lb.voice[list] || []).filter(function (_, i) { return i !== parseInt(el.dataset.i, 10); });
      S.save(); global.Brand.apply();
    }
    else if (act === 'brand-add-color') {
      var hx = ((document.getElementById('nc-hex') || {}).value || '').trim();
      if (!/^#?[0-9a-fA-F]{6}$/.test(hx)) { toast('A six digit hex, like #1d4d43'); return; }
      addColor(el.dataset.brand, hx.charAt(0) === '#' ? hx : '#' + hx,
        ((document.getElementById('nc-name') || {}).value || '').trim(),
        ((document.getElementById('nc-use') || {}).value || '').trim());
    }
    else if (act === 'brand-color-remove') {
      var cb = S.brand(el.dataset.brand); if (!cb) return;
      cb.visual.colors = (cb.visual.colors || []).filter(function (_, i) { return i !== parseInt(el.dataset.i, 10); });
      S.save(); global.Brand.apply();
    }
    else if (act === 'brand-add-font') {
      var fn = ((document.getElementById('nf-name') || {}).value || '').trim();
      if (!fn) return;
      var fb = S.brand(el.dataset.brand); if (!fb) return;
      fb.visual.fonts = fb.visual.fonts || [];
      fb.visual.fonts.push({ name: fn, use: ((document.getElementById('nf-use') || {}).value || '').trim() });
      S.save(); global.Brand.apply();
    }
    else if (act === 'brand-font-remove') {
      var xb = S.brand(el.dataset.brand); if (!xb) return;
      xb.visual.fonts = (xb.visual.fonts || []).filter(function (_, i) { return i !== parseInt(el.dataset.i, 10); });
      S.save(); global.Brand.apply();
    }
    else if (act === 'brand-logo-clear') {
      S.setBrandField(el.dataset.brand, 'visual', 'logoData', ''); global.Brand.apply();
    }
    else if (act === 'brand-pillar-add') {
      var pb = S.brand(el.dataset.brand); if (!pb) return;
      pb.pillars = pb.pillars || [];
      pb.pillars.push({ id: S.uid('pl'), name: 'New theme', job: '', reader: '', share: '' });
      S.save(); global.Brand.apply();
    }
    else if (act === 'brand-pillar-remove') {
      var qb = S.brand(el.dataset.brand); if (!qb) return;
      qb.pillars = (qb.pillars || []).filter(function (_, i) { return i !== parseInt(el.dataset.i, 10); });
      S.save(); global.Brand.apply();
    }

    /* ---- the board ---- */
    else if (act === 'pr-accept') {
      var cand = global.Outreach.candidates().filter(function (x) { return x.key === el.dataset.key; })[0];
      if (cand) {
        if (!cand.name) {
          var who = prompt('Who fills this lane? A name, and the firm if you have it.\n\n' + cand.role);
          if (!who || !who.trim()) return;
          cand.name = who.trim();
        }
        var rec = S.addProspect({
          name: cand.name, firm: cand.firm, role: cand.role, lane: cand.lane, kind: cand.kind,
          source: cand.source, why: cand.why, path: cand.path,
          referrer: cand.referrer, referrerId: cand.referrerId, email: cand.email || ''
        });
        S.dismiss(cand.key);
        if (cand.sequence) {
          S.startSequence(rec.id, cand.sequence);
          toast('Working ' + (cand.name || 'them') + '. First step is in the queue.');
          location.hash = '#/outreach/queue';
        } else {
          toast('Tracked. This one is a conversation, so nothing is queued.');
        }
      }
    }
    else if (act === 'pr-dismiss') { S.dismiss(el.dataset.key); toast('Off the board'); }
    else if (act === 'pr-sent') {
      var pr = S.prospect(el.dataset.pr);
      if (pr) {
        S.advanceSequence(pr.id, global.Outreach.dayOffsets(global.Outreach.sequence(pr.sequence)), { type: 'sent' });
        var after = S.prospect(pr.id);
        toast(after && after.nextDue ? 'Logged. Next step ' + S.friendlyDue(after.nextDue) : 'Logged. That was the last step.');
      }
    }
    else if (act === 'pr-replied') { S.stopSequence(el.dataset.pr, 'replied', 'They replied'); toast('Good. Take it from here yourself.'); }
    else if (act === 'pr-stop') { S.stopSequence(el.dataset.pr, 'stopped', ''); toast('Stopped'); }
    else if (act === 'pr-remove') {
      var gone = S.prospect(el.dataset.pr);
      if (gone && confirm('Remove ' + (gone.name || 'this person') + '?')) { S.removeProspect(gone.id); toast('Removed'); }
    }
    else if (act === 'pr-add') {
      var nm = prompt('Who are you adding?');
      if (nm && nm.trim()) {
        var role = prompt('What do they do? (CPA, estate attorney, owner, whatever fits)') || '';
        var added = S.addProspect({
          name: nm.trim(), role: role.trim(), lane: global.Outreach.guessLane(role),
          kind: 'coi', source: 'manual', why: 'Added by hand.', path: 'Whatever you know about them.'
        });
        S.startSequence(added.id, 'coi_cold');
        toast('Added and started on the cold sequence. Change it if that is wrong.');
        location.hash = '#/outreach/queue';
      }
    }

    /* ---- Gmail ---- */
    else if (act === 'gmail-connect') {
      global.Mail.connect().then(function () { toast('Gmail connected for this session'); render(); },
        function (err) { toast(err.message || 'Could not connect'); });
    }
    else if (act === 'gmail-disconnect') { global.Mail.disconnect(); toast('Disconnected'); render(); }
    else if (act === 'mail-draft' || act === 'mail-send') {
      var mp = S.prospect(el.dataset.pr);
      if (mp) {
        var mstep = global.Outreach.step(mp);
        var parsed = global.Mail.parse(mstep ? global.Outreach.merge(mstep.body, mp) : '');
        var sending = act === 'mail-send';
        if (sending && !confirm('Send this to ' + (mp.email || 'nobody') + ' now?\n\nIt leaves your mailbox immediately.')) return;
        el.disabled = true;
        (sending ? global.Mail.send(mp.email, parsed.subject, parsed.body)
                 : global.Mail.createDraft(mp.email, parsed.subject, parsed.body))
          .then(function (res) {
            S.advanceSequence(mp.id, global.Outreach.dayOffsets(global.Outreach.sequence(mp.sequence)),
              { type: sending ? 'sent' : 'drafted', note: (sending ? 'Sent' : 'Drafted') + ' through Gmail' });
            if (sending) toast('Sent, and the step is logged.');
            else {
              toast('Draft is in your Gmail. Read it and send it from there.');
              global.open(global.Mail.draftUrl(res), '_blank', 'noopener');
            }
            render();
          }, function (err) { el.disabled = false; toast(err.message || 'Gmail did not accept that'); });
      }
    }
    else if (act === 'mail-to') {
      e.preventDefault();
      var tp = S.prospect(el.dataset.pr);
      if (tp) {
        var tstep = global.Outreach.step(tp);
        var tparsed = global.Mail.parse(tstep ? global.Outreach.merge(tstep.body, tp) : '');
        global.location.href = global.Mail.mailto(tp.email, tparsed.subject, tparsed.body);
      }
    }

    /* ---- settings ---- */
    else if (act === 'clear-reference') {
      if (confirm('Remove the imported reference?\n\nThe board goes back to only what you have added by hand.')) {
        S.clearReference(); toast('Reference removed');
      }
    }
    else if (act === 'theme') {
      var v = el.dataset.theme;
      try { localStorage.setItem('www.studio.theme', v); } catch (err) {}
      applyStoredTheme();
    }
    else if (act === 'export') {
      var blob = new Blob([S.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'www-content-studio-' + S.iso(S.today()) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
    else if (act === 'reset') {
      if (confirm('Clear everything on this site, including the imported reference?')) {
        S.reset(); location.hash = '#/'; toast('Cleared');
      }
    }
  });

  /* ---------------- typing ---------------- */
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    if (act === 'operator') deferSave(function () { S.setOperator(el.dataset.field, el.value); });
    else if (act === 'brand-field') deferSave(function () {
      S.setBrandField(el.dataset.brand, el.dataset.group, el.dataset.key, el.value);
      global.Brand.apply();
    });
    else if (act === 'brand-pillar-field') deferSave(function () {
      var b = S.brand(el.dataset.brand); if (!b) return;
      var p = (b.pillars || [])[parseInt(el.dataset.i, 10)]; if (!p) return;
      p[el.dataset.key] = el.value; S.save(); global.Brand.apply();
    });
    else if (act === 'pr-email') deferSave(function () { S.updateProspect(el.dataset.pr, { email: el.value }); });
  });

  /* ---------------- selects and files ---------------- */
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    if (act === 'content-client') { App.contentClient = el.value; render(); }
    else if (act === 'content-channel') { App.contentChannel = el.value; App.contentPillar = ''; render(); }
    else if (act === 'content-pillar') { App.contentPillar = el.value; render(); }
    else if (act === 'content-group') { App.contentGroup = el.value; render(); }
    else if (act === 'brand-switch-select') {
      S.setActiveBrand(el.value); global.Brand.apply();
      toast('Working on ' + (S.activeBrand() || {}).name);
    }
    else if (act === 'brand-logo') {
      var lf = el.files && el.files[0]; if (!lf) return;
      var lr = new FileReader();
      lr.onload = function () {
        var img = new Image();
        img.onload = function () {
          S.setBrandField(el.dataset.brand, 'visual', 'logoData', lr.result);
          var found = palette(img, 5);
          found.forEach(function (c) { addColor(el.dataset.brand, c.hex, '', ''); });
          global.Brand.apply();
          toast(found.length
            ? 'Read ' + found.length + ' color' + (found.length === 1 ? '' : 's') + ' off the logo. Name them and say where each is used.'
            : 'Logo saved, but no usable colors came off it.');
        };
        img.onerror = function () { toast('That image could not be read'); };
        img.src = lr.result;
        el.value = '';
      };
      lr.readAsDataURL(lf);
    }
    else if (act === 'brand-guide-file') {
      var gf = el.files && el.files[0]; if (!gf) return;
      var gr = new FileReader();
      gr.onload = function () {
        S.setBrandField(el.dataset.brand, '', 'importedGuide', String(gr.result).slice(0, 60000));
        global.Brand.apply();
        toast('Loaded. It sits alongside the fields rather than being parsed into them.');
        el.value = '';
      };
      gr.readAsText(gf);
    }
    else if (act === 'brand-import') {
      var bf = el.files && el.files[0]; if (!bf) return;
      var br = new FileReader();
      br.onload = function () {
        try {
          var inc = JSON.parse(br.result);
          if (!inc || !inc.name) throw new Error('That file is not a brand export.');
          inc.id = S.uid('br');
          S.addBrand(inc);
          S.setActiveBrand(inc.id);
          global.Brand.apply();
          toast('Imported ' + inc.name);
          location.hash = '#/brand/identity';
        } catch (err) { toast(err.message || 'That file could not be read'); }
        el.value = '';
      };
      br.readAsText(bf);
    }
    else if (act === 'import-extract' || act === 'import') {
      var file = el.files && el.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          if (act === 'import-extract') {
            var n = S.importExtract(reader.result);
            toast('Imported ' + n.clients + ' household' + (n.clients === 1 ? '' : 's') + ' and ' + n.cois + ' COI' + (n.cois === 1 ? '' : 's'));
            location.hash = '#/reference';
          } else {
            S.importJSON(reader.result);
            location.hash = '#/';
            toast('Working state imported');
          }
        } catch (err) { toast(err.message || 'That file could not be read'); }
        el.value = '';
      };
      reader.readAsText(file);
    }
  });

  boot();
})(window);
