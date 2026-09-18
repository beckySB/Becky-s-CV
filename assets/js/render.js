/* Renders the CV from window.CV. No dependencies, no build step. */

(function () {
  'use strict';

  const C = window.CV;
  const $ = (id) => document.getElementById(id);

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  };

  /* Renders one {v, note} field as a definition row. A field with no value is
     simply not rendered — a CV shows what is true, not what is missing. */
  function field(dl, label, f) {
    if (!f || f.v === null || f.v === undefined || f.v === '') return;
    const row = el('div', 'row');
    row.appendChild(el('dt', null, label));
    row.appendChild(el('dd', null, f.v));
    if (f.note) row.appendChild(el('p', 'note', f.note));
    dl.appendChild(row);
  }

  /* =================================================================== */
  /*  MASTHEAD & HERO                                                     */
  /* =================================================================== */

  $('mh-name').textContent = C.bio.legalName;
  $('mh-practice').textContent = C.bio.practice;

  $('hero-eyebrow').textContent = C.bio.practice + ' · ' + C.bio.positioning;
  $('hero-name').textContent = C.bio.name;
  $('hero-marks').textContent = C.credentials.map((c) => c.mark).join('  ·  ');
  $('hero-lede').textContent = C.bio.lede;
  C.bio.body.forEach((para) => $('hero-bio').appendChild(el('p', null, para)));
  $('hero-quote').textContent = '“' + C.bio.pullQuote + '”';

  const g = $('glance');
  C.glance.forEach(function (row) {
    g.appendChild(el('dt', null, row[0]));
    const d = el('dd');
    d.appendChild(el('strong', null, row[1]));
    if (row[2]) d.appendChild(el('small', null, row[2]));
    g.appendChild(d);
  });

  /* =================================================================== */
  /*  CREDENTIALS & LICENSING                                             */
  /* =================================================================== */

  $('cred-note').textContent = C.credentialNote;

  const marks = $('marks');
  C.credentials.forEach(function (c) {
    const li = el('li');
    li.appendChild(el('span', 'mark-abbr', c.mark));
    li.appendChild(el('span', 'mark-name', c.name));
    marks.appendChild(li);
  });

  const ed = $('education');
  field(ed, 'Degree', C.education.masters);
  field(ed, 'Executive education', C.education.executive);

  const lic = $('licensing');
  field(lic, 'FINRA licences', C.licensing.finraSeries);
  field(lic, 'Insurance licence states', C.licensing.insuranceStates);
  field(lic, 'Securities registration states', C.licensing.securitiesStates);
  field(lic, 'IAR registration basis', C.licensing.iarBasis);
  field(lic, 'Current affiliation', C.licensing.currentlyAffiliated);
  field(lic, 'Contract territory', C.licensing.territory);

  /* The licence footprint gets its own block: thirteen state names do not
     belong squeezed into a right-aligned table cell. */
  const L = C.licenceStates;
  const fp = $('footprint');
  const fpHead = el('p', 'fp-count');
  fpHead.appendChild(el('strong', null, String(1 + L.nonResident.length)));
  fpHead.appendChild(document.createTextNode(' states, licensed and registered'));
  fp.appendChild(fpHead);

  const fpList = el('ul', 'fp-states');
  const resident = el('li', 'is-resident');
  resident.appendChild(document.createTextNode(L.resident));
  resident.appendChild(el('span', 'fp-tag', 'resident'));
  fpList.appendChild(resident);
  L.nonResident.forEach((s) => fpList.appendChild(el('li', null, s)));
  fp.appendChild(fpList);
  if (L.covers) fp.appendChild(el('p', 'fp-covers', L.covers));
  fp.appendChild(el('p', 'fp-note', L.note));

  /* =================================================================== */
  /*  PRACTICE & EXPERIENCE                                               */
  /* =================================================================== */

  $('practice-note').textContent = C.practiceNote;

  const car = $('career');
  field(car, 'First registered', C.career.registered);
  field(car, 'Years in the industry', C.career.years);
  field(car, 'Registration history', C.career.history);
  field(car, 'Current role', C.career.role);
  field(car, 'Current contract effective', C.career.contractEffective);

  const firm = $('firm');
  field(firm, 'Practice', C.firm.name);
  field(firm, 'Position', C.firm.position);
  field(firm, 'Model', C.firm.model);
  field(firm, 'Who it serves', C.firm.clients);
  field(firm, 'Based in', C.firm.location);

  const specs = $('specialisations');
  C.specialisations.forEach(function (s) {
    const li = el('li');
    li.appendChild(document.createTextNode(s.name));
    if (s.note) li.appendChild(el('span', 'spec-note', s.note));
    specs.appendChild(li);
  });

  const team = $('team');
  C.team.forEach(function (t) {
    const c = el('div', 'card');
    c.appendChild(el('h4', null, t.name));
    c.appendChild(el('span', 'role', t.role));
    c.appendChild(el('p', null, t.note));
    team.appendChild(c);
  });

  const oba = $('oba');
  oba.appendChild(el('p', 'oba-framing', C.oba.framing));
  C.oba.items.forEach(function (o) {
    const c = el('div', 'card');
    c.appendChild(el('h4', null, o.name));
    c.appendChild(el('span', 'role', o.role));
    c.appendChild(el('p', null, o.what));
    c.appendChild(el('p', 'status', o.status));
    oba.appendChild(c);
  });

  /* =================================================================== */
  /*  METHOD                                                              */
  /* =================================================================== */

  $('method-title').textContent = C.method.title;
  $('method-note').textContent = C.method.note;

  const pil = $('pillars');
  C.method.pillars.forEach(function (p) {
    const li = el('li');
    li.appendChild(el('span', 'p-name', p.name));
    li.appendChild(el('span', 'p-what', p.what));
    pil.appendChild(li);
  });
  C.method.body.forEach((p) => $('method-body').appendChild(el('p', null, p)));

  /* =================================================================== */
  /*  RECOGNITION                                                         */
  /* =================================================================== */

  const R = C.recognition;
  $('rec-note').textContent = R.note;

  const recList = function (hostId, items) {
    const host = $(hostId);
    items.forEach(function (r) {
      const li = el('li', r.scope === 'firm' ? 'is-firm' : null);
      li.appendChild(el('span', 'rec-year', r.year));
      const body = el('div', 'rec-body');
      body.appendChild(el('span', 'rec-title', r.title));
      if (r.ranked) body.appendChild(el('sup', 'rec-mark', '†'));
      if (r.scope === 'firm') body.appendChild(el('span', 'rec-scope', 'firm'));
      if (r.detail) body.appendChild(el('span', 'rec-detail', r.detail));
      li.appendChild(body);
      host.appendChild(li);
    });
  };
  recList('rec-rankings', R.rankings);
  recList('rec-speaking', R.speaking);
  recList('rec-leadership', R.leadership);
  $('rec-disclosure').textContent = '† ' + R.rankingDisclosure;

  /* =================================================================== */
  /*  VISION                                                              */
  /* =================================================================== */

  $('vision-q').textContent = C.vision.question;
  C.vision.paragraphs.forEach((p) => $('vision-body').appendChild(el('p', null, p)));

  /* =================================================================== */
  /*  CONTACT & FOOT                                                      */
  /* =================================================================== */

  const con = $('contact-rows');
  field(con, 'Email', C.contact.email);
  field(con, 'Phone', C.contact.phone);
  field(con, 'Location', C.contact.location);
  field(con, 'Practice', C.contact.practice);

  const idd = $('identifiers');
  field(idd, 'Legal name', C.identifiers.legalName);
  field(idd, 'Known as', C.identifiers.knownAs);
  field(idd, 'CRD number', C.identifiers.crd);
  field(idd, 'Designations held', C.identifiers.designations);

  $('foot-disclosure').textContent = C.meta.note;
  $('foot-meta').textContent = C.meta.subject + ' — curriculum vitae, ' + C.meta.asOf + '.';

  /* =================================================================== */
  /*  THEME                                                               */
  /* =================================================================== */

  const root = document.documentElement;
  let stored = null;
  try { stored = localStorage.getItem('cv.theme'); } catch (e) { /* private mode */ }
  if (stored) root.setAttribute('data-theme', stored);

  $('theme-toggle').addEventListener('click', function () {
    const cur = root.getAttribute('data-theme');
    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = cur ? (cur === 'dark' ? 'light' : 'dark') : (sysDark ? 'light' : 'dark');
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('cv.theme', next); } catch (e) { /* ignore */ }
  });
})();
