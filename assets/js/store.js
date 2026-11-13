/* The Content Studio's own storage.

   This is a separate system from the Operating System on purpose. The Operating System holds
   real client financial detail: revenue, margins, net worth, debt, valuations. The people who
   run posting and outreach need this site every day and have no business seeing any of that.

   So the seam between them is a one way, filtered handoff. The Operating System exports a
   contact and relationship extract, this reads it, and that extract carries no financials by
   construction. What arrives is reference: names, professional teams, the people around a
   household, centres of influence, recent signals, and the quarter's three priorities. The
   studio never writes back, and the Operating System stays the source of truth for all of it.

   What this site owns is its own: the people it is working, their sequence state, what has been
   turned down, and the advisor's own settings. */
(function (global) {
  'use strict';

  var KEY = 'www.studio.v1';
  var listeners = [];

  /* Working state hangs off a brand, because two brands worked at once must not share a queue,
     a board, or an imported network. Only the operator's own settings are account wide. */
  var blank = {
    version: 2,
    operator: { name: '', gmailClientId: '' },
    brands: [],
    activeBrandId: '',
    work: {}   /* brandId -> { prospects, dismissed, reference } */
  };

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(blank);
      return migrate(Object.assign(clone(blank), JSON.parse(raw)));
    } catch (e) { return clone(blank); }
  }

  /* Version 1 held one unnamed brand's work at the top level. Lift it into the first brand's
     slot rather than discard it: somebody has a queue running in there. */
  function migrate(st) {
    if (st.version >= 2) return st;
    var carried = {
      prospects: st.prospects || [],
      dismissed: st.dismissed || [],
      reference: st.reference || { clients: [], cois: [], importedAt: '', from: '' }
    };
    st.version = 2;
    st.operator = { name: (st.advisor && st.advisor.name) || '', gmailClientId: (st.advisor && st.advisor.gmailClientId) || '' };
    st.brands = st.brands || [];
    st.work = st.work || {};
    st.pendingCarry = carried;   /* attached to the seeded brand once the brand data has loaded */
    delete st.prospects; delete st.dismissed; delete st.reference; delete st.advisor;
    return st;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* private mode or blocked storage: the session still works, it just will not persist */ }
    listeners.forEach(function (fn) { fn(state); });
  }

  function uid(p) { return (p || 'id') + '_' + Math.random().toString(36).slice(2, 9); }

  /* ---------- dates, the same helpers the shared modules expect ---------- */
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function iso(d) { return new Date(d).toISOString().slice(0, 10); }
  function parse(s) { if (!s) return null; var d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : d; }
  function daysUntil(s) { var d = parse(s); return d === null ? null : Math.round((d - today()) / 86400000); }
  function friendlyDate(s) {
    var d = parse(s); if (!d) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function friendlyDue(s) {
    var n = daysUntil(s);
    if (n === null) return '';
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'a day late';
    return n < 0 ? Math.abs(n) + ' days late' : 'due in ' + n + ' days';
  }

  /* ---------- the import ----------
     Anything that is not the shape this expects is refused rather than half loaded, because a
     partial reference is worse than none: the board would silently rank on a fraction of the
     network and nobody would know. */
  function importExtract(text) {
    var d = JSON.parse(text);
    if (!d || d.kind !== 'ewp.studio.extract') {
      throw new Error('That is not a Studio extract. Use Export for the Content Studio in the Operating System, not the full snapshot.');
    }
    if (!Array.isArray(d.clients) || !Array.isArray(d.cois)) {
      throw new Error('That extract is missing its households or its centres of influence.');
    }
    work().reference = {
      clients: d.clients, cois: d.cois,
      importedAt: iso(today()), from: d.from || 'the Operating System'
    };
    if (d.advisor && d.advisor.name && !state.operator.name) state.operator.name = d.advisor.name;
    save();
    return { clients: d.clients.length, cois: d.cois.length };
  }

  function clearReference() {
    work().reference = { clients: [], cois: [], importedAt: '', from: '' };
    save();
  }

  /* The active brand's working slot, created on first use. */
  function work() {
    var id = state.activeBrandId;
    if (!id) return { prospects: [], dismissed: [], reference: { clients: [], cois: [], importedAt: '', from: '' } };
    if (!state.work[id]) {
      state.work[id] = { prospects: [], dismissed: [],
                         reference: { clients: [], cois: [], importedAt: '', from: '' } };
    }
    return state.work[id];
  }

  /* social.js, outreach.js and mail.js all read state.advisor for a name, a firm and the Gmail
     client id. They are shared with the Operating System and should not have to learn that a
     brand exists, so advisor stays readable as a computed view: the operator's own name and key,
     and the active brand as the firm. Read only by design, which is why every writer below goes
     through setOperator or updateBrand instead. */
  function defineAdvisorView(st) {
    Object.defineProperty(st, 'advisor', {
      configurable: true,
      enumerable: false,
      get: function () {
        var b = api.activeBrand() || {};
        return {
          name: st.operator.name || '',
          firm: b.name || '',
          gmailClientId: st.operator.gmailClientId || ''
        };
      }
    });
  }

  var api = {
    state: state,
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    save: save,
    uid: uid,

    /* ---------- brands ---------- */
    brands: function () { return state.brands; },
    brand: function (id) { return state.brands.filter(function (b) { return b.id === id; })[0] || null; },
    activeBrand: function () { return api.brand(state.activeBrandId) || state.brands[0] || null; },
    setActiveBrand: function (id) {
      if (!api.brand(id)) return null;
      state.activeBrandId = id; save();
      return api.activeBrand();
    },
    addBrand: function (rec) {
      state.brands.push(rec);
      if (!state.activeBrandId) state.activeBrandId = rec.id;
      save();
      return rec;
    },
    updateBrand: function (id, patch) {
      var b = api.brand(id); if (!b) return null;
      Object.assign(b, patch); save(); return b;
    },
    /* Reaches into a nested group such as identity or visual without clobbering its siblings. */
    setBrandField: function (id, group, key, value) {
      var b = api.brand(id); if (!b) return null;
      if (group) { b[group] = b[group] || {}; b[group][key] = value; }
      else { b[key] = value; }
      save(); return b;
    },
    removeBrand: function (id) {
      state.brands = state.brands.filter(function (b) { return b.id !== id; });
      delete state.work[id];
      if (state.activeBrandId === id) state.activeBrandId = (state.brands[0] || {}).id || '';
      save();
    },

    /* Seeded once from data/brands.json, then owned by this browser. A brand the operator has
       edited is never overwritten by a later load of the shipped file. */
    seedBrands: function (shipped) {
      if (state.brands.length) return false;
      state.brands = JSON.parse(JSON.stringify(shipped));
      state.activeBrandId = (state.brands[0] || {}).id || '';
      if (state.pendingCarry && state.activeBrandId) {
        state.work[state.activeBrandId] = state.pendingCarry;
        delete state.pendingCarry;
      }
      save();
      return true;
    },

    /* ---------- the operator ---------- */
    operator: function () { return state.operator; },
    setOperator: function (key, value) { state.operator[key] = value; save(); },

    /* ---------- reference, read only ---------- */
    clients: function () { return work().reference.clients; },
    client: function (id) { return api.clients().filter(function (c) { return c.id === id; })[0] || null; },
    cois: function () { return work().reference.cois; },
    coi: function (id) { return api.cois().filter(function (c) { return c.id === id; })[0] || null; },
    reference: function () { return work().reference; },
    hasReference: function () { var r = work().reference; return !!(r.clients.length || r.cois.length); },
    importExtract: importExtract,
    clearReference: clearReference,

    currentSprint: function (c) { return (c && c.sprint) || null; },
    sprint: function (clientId) { var c = api.client(clientId); return (c && c.sprint) || null; },

    /* ---------- prospects, per brand ---------- */
    prospects: function () { return work().prospects; },
    prospect: function (id) { return work().prospects.filter(function (x) { return x.id === id; })[0] || null; },
    addProspect: function (rec) {
      var p = Object.assign({
        id: uid('pr'), name: '', firm: '', role: '', lane: '', kind: 'coi',
        city: '', email: '', linkedin: '', phone: '',
        source: 'manual', why: '', path: '', referrer: '', referrerId: '',
        status: 'new', sequence: '', stepIndex: 0, startedAt: '', nextDue: '',
        addedAt: iso(today()), notes: '', log: []
      }, rec);
      work().prospects.push(p); save();
      return p;
    },
    updateProspect: function (id, patch) {
      var p = api.prospect(id); if (!p) return null;
      Object.assign(p, patch); save(); return p;
    },
    removeProspect: function (id) {
      work().prospects = work().prospects.filter(function (x) { return x.id !== id; });
      save();
    },

    startSequence: function (id, sequenceId) {
      var p = api.prospect(id); if (!p) return null;
      p.sequence = sequenceId; p.stepIndex = 0;
      p.startedAt = iso(today()); p.nextDue = iso(today()); p.status = 'working';
      save(); return p;
    },

    advanceSequence: function (id, dayOffsets, entry) {
      var p = api.prospect(id); if (!p) return null;
      p.log = p.log || [];
      p.log.push(Object.assign({ id: uid('o'), date: iso(today()), type: 'sent', note: '' }, entry || {}));
      p.stepIndex = (p.stepIndex || 0) + 1;
      if (!dayOffsets || p.stepIndex >= dayOffsets.length) {
        p.nextDue = ''; p.status = 'done';
      } else {
        var base = parse(p.startedAt) || today();
        var d = new Date(base);
        d.setDate(d.getDate() + (dayOffsets[p.stepIndex] || 0));
        p.nextDue = iso(d < today() ? today() : d);
      }
      p.lastTouch = iso(today());
      save(); return p;
    },

    stopSequence: function (id, status, note) {
      var p = api.prospect(id); if (!p) return null;
      p.log = p.log || [];
      p.log.push({ id: uid('o'), date: iso(today()), type: status || 'stopped', note: note || '' });
      p.status = status || 'stopped'; p.nextDue = '';
      save(); return p;
    },

    /* ---------- suggestions turned down, per brand ---------- */
    dismissed: function () { return work().dismissed; },
    dismiss: function (key) { var w = work(); if (w.dismissed.indexOf(key) === -1) { w.dismissed.push(key); save(); } },
    undismiss: function (key) {
      var w = work();
      w.dismissed = w.dismissed.filter(function (k) { return k !== key; }); save();
    },

    exportJSON: function () { return JSON.stringify(state, null, 2); },
    importJSON: function (text) { state = migrate(Object.assign(clone(blank), JSON.parse(text))); defineAdvisorView(state); api.state = state; save(); },
    reset: function () { state = clone(blank); defineAdvisorView(state); api.state = state; save(); },

    iso: iso, today: today, daysUntil: daysUntil,
    friendlyDate: friendlyDate, friendlyDue: friendlyDue
  };

  defineAdvisorView(state);

  global.Store = api;
})(window);
