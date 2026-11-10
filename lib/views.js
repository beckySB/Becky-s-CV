const cfg = require('./config');

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const nl2p = (s) =>
  esc(s)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

const safeUrl = (u) => {
  if (!u) return '';
  const url = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    return new URL(url).href;
  } catch {
    return '';
  }
};

const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const fmtDate = (d) =>
  d
    ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

/* ---------- Next meeting: second Tuesday of the month, 11:30 AM Central ---------- */
function secondTuesday(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (2 - first.getUTCDay() + 7) % 7; // 2 = Tuesday
  return new Date(Date.UTC(year, month, 1 + offset + 7));
}
function nextMeeting(now = new Date()) {
  // Compare in New Orleans local date terms.
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  let y = local.getFullYear();
  let m = local.getMonth();
  for (let i = 0; i < 3; i++) {
    const d = secondTuesday(y, m);
    const meetingLocal = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 0); // through end of lunch
    if (meetingLocal >= local) return d;
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return secondTuesday(y, m);
}
const nextMeetingLabel = () =>
  nextMeeting().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

/* ---------- Layout ---------- */
const NAV = [
  ['/', 'Home'],
  ['/about', 'About'],
  ['/members', 'Member Directory'],
  ['/shoutouts', 'Shout-Outs'],
];

function layout({ title, active, body, authed, description }) {
  const navLinks = NAV.map(
    ([href, label]) =>
      `<a href="${href}" class="${active === href ? 'active' : ''}">${label}</a>`
  ).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} · ${cfg.name}` : `${cfg.name} · ${cfg.tagline}`)}</title>
<meta name="description" content="${esc(
    description ||
      'A collective of established Greater New Orleans business owners — founded by alumni of the Goldman Sachs 10,000 Small Businesses program — meeting monthly to share connections and grow revenue together.'
  )}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='%230e0d0b'/><text x='32' y='42' font-family='Georgia' font-size='26' font-weight='700' text-anchor='middle' fill='%23c9a24b'>10k</text></svg>">
</head>
<body>
<header class="site-header" id="top">
  <div class="wrap header-inner">
    <a href="/" class="brand" aria-label="${esc(cfg.name)} home">
      <span class="brand-mark">10k</span>
      <span class="brand-text"><strong>${esc(cfg.name)}</strong><small>${esc(cfg.tagline)}</small></span>
    </a>
    <button class="nav-toggle" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>
    <nav class="site-nav">
      ${navLinks}
      <a href="/portal" class="btn btn-gold btn-sm ${active === '/portal' ? 'active' : ''}">
        ${authed ? 'Member Portal' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg> Member Portal'}
      </a>
    </nav>
  </div>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <div class="brand footer-brand"><span class="brand-mark">10k</span><span class="brand-text"><strong>${esc(cfg.name)}</strong><small>${esc(cfg.tagline)}</small></span></div>
      <p class="muted">Established business owners pouring into our clients — and into each other.</p>
    </div>
    <div>
      <h4>We Meet</h4>
      <p>${esc(cfg.meeting.cadence)}<br>${esc(cfg.meeting.time)} · Lunch<br><span class="muted">${esc(cfg.meeting.venue)}</span></p>
    </div>
    <div>
      <h4>Explore</h4>
      <p>${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join('<br>')}<br><a href="/portal">Member Portal</a></p>
    </div>
  </div>
  <div class="wrap footer-base">
    <span>© ${new Date().getFullYear()} ${esc(cfg.name)}. Greater New Orleans, Louisiana.</span>
    <span class="muted">Founded by alumni of the Goldman Sachs 10,000 Small Businesses program. Not affiliated with or endorsed by Goldman Sachs.</span>
  </div>
</footer>
<script src="/js/main.js" defer></script>
</body>
</html>`;
}

/* ---------- Shared bits ---------- */
const meetingCard = (extra = '') => `
<div class="meeting-card">
  <span class="eyebrow">Next Gathering</span>
  <div class="meeting-date">${esc(nextMeetingLabel())}</div>
  <div class="meeting-time">${esc(cfg.meeting.time)} · Lunch</div>
  <p class="muted">${esc(cfg.meeting.cadence)}<br>${esc(cfg.meeting.venue)}</p>
  ${extra}
</div>`;

const avatar = (m, size = '') =>
  m.photo
    ? `<img class="avatar ${size}" src="/uploads/${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy">`
    : `<div class="avatar avatar-initials ${size}" aria-hidden="true">${esc(initials(m.name))}</div>`;

function memberCard(m, { privateView = false } = {}) {
  const site = safeUrl(m.website);
  const li = safeUrl(m.linkedin);
  const ig = safeUrl(m.instagram);
  const contact = [
    m.publicEmail && `<a href="mailto:${esc(m.publicEmail)}">${esc(m.publicEmail)}</a>`,
    m.publicPhone && `<a href="tel:${esc(m.publicPhone.replace(/[^\d+]/g, ''))}">${esc(m.publicPhone)}</a>`,
    site && `<a href="${esc(site)}" target="_blank" rel="noopener">${esc(site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`,
  ].filter(Boolean);
  const socials = [
    li && `<a href="${esc(li)}" target="_blank" rel="noopener">LinkedIn</a>`,
    ig && `<a href="${esc(ig)}" target="_blank" rel="noopener">Instagram</a>`,
  ].filter(Boolean);
  const priv = privateView
    ? [
        m.privatePhone && `<div><span class="label">Direct cell</span> <a href="tel:${esc(m.privatePhone.replace(/[^\d+]/g, ''))}">${esc(m.privatePhone)}</a></div>`,
        m.privateEmail && `<div><span class="label">Direct email</span> <a href="mailto:${esc(m.privateEmail)}">${esc(m.privateEmail)}</a></div>`,
        m.privateNotes && `<div><span class="label">Note to members</span> ${esc(m.privateNotes)}</div>`,
      ].filter(Boolean)
    : [];
  return `
<article class="member-card" data-search="${esc([m.name, m.business, m.industry, m.title, m.services].join(' ').toLowerCase())}" data-industry="${esc(m.industry)}">
  <div class="member-head">
    ${avatar(m)}
    <div>
      <h3>${esc(m.name)}</h3>
      <div class="member-title">${esc([m.title, m.business].filter(Boolean).join(', '))}</div>
      ${m.industry ? `<span class="tag">${esc(m.industry)}</span>` : ''}
    </div>
  </div>
  ${m.bio ? `<div class="member-bio clamp">${nl2p(m.bio)}</div>` : ''}
  ${m.services ? `<div class="member-ref"><span class="label">A great referral for me is…</span> ${esc(m.services)}</div>` : ''}
  ${contact.length ? `<div class="member-contact">${contact.join('')}</div>` : ''}
  ${socials.length ? `<div class="member-social">${socials.join(' · ')}</div>` : ''}
  ${priv.length ? `<div class="member-private"><span class="eyebrow">Members only</span>${priv.join('')}</div>` : ''}
  ${privateView ? `<div class="member-actions"><a href="/members/${esc(m.id)}/edit" class="link-gold">Edit profile</a></div>` : ''}
</article>`;
}

const typeLabel = { event: 'Event', testimonial: 'Testimonial', shoutout: 'Shout-Out' };

function shoutCard(s, members, { canDelete = false } = {}) {
  const about = s.memberId && members.find((m) => m.id === s.memberId);
  const link = safeUrl(s.link);
  return `
<article class="shout-card shout-${esc(s.type)}" data-type="${esc(s.type)}">
  <div class="shout-top">
    <span class="tag tag-${esc(s.type)}">${typeLabel[s.type] || 'Shout-Out'}</span>
    <span class="muted small">${esc(fmtDate(s.createdAt))}</span>
  </div>
  ${s.type === 'testimonial' ? '<div class="quote-mark">“</div>' : ''}
  <h3>${esc(s.title)}</h3>
  ${s.type === 'event' && s.eventDate ? `<div class="event-when">${esc(fmtDate(s.eventDate))}${s.eventLocation ? ` · ${esc(s.eventLocation)}` : ''}</div>` : ''}
  <div class="shout-body">${nl2p(s.message)}</div>
  ${about ? `<div class="shout-about">For <a href="/members#m-${esc(about.id)}">${esc(about.name)}${about.business ? `, ${esc(about.business)}` : ''}</a></div>` : ''}
  ${link ? `<a class="link-gold" href="${esc(link)}" target="_blank" rel="noopener">Learn more →</a>` : ''}
  <div class="shout-author">— ${esc(s.author)}</div>
  ${canDelete ? `<form method="post" action="/shoutouts/${esc(s.id)}/delete" class="inline-form" onsubmit="return confirm('Remove this post?')"><button class="btn-text">Remove</button></form>` : ''}
</article>`;
}

/* ---------- Pages ---------- */
function home({ members, shoutouts, authed }) {
  const m = cfg.media;
  const featured = shoutouts.slice(-3).reverse();
  const body = `
<section class="hero">
  <div class="hero-media">
    <div class="hero-poster" style="background-image:url('${m.heroPoster}')"></div>
    <video class="hero-video" autoplay muted loop playsinline preload="metadata" poster="${m.heroPoster}">
      ${m.heroVideo.map((src) => `<source src="${esc(src)}" type="video/mp4">`).join('')}
    </video>
    <div class="hero-shade"></div>
  </div>
  <div class="wrap hero-content">
    <span class="eyebrow eyebrow-light">Greater New Orleans · Est. by Goldman Sachs 10,000 Small Businesses Alumni</span>
    <h1>Business owners who grow <em>together.</em></h1>
    <p class="lead">${esc(cfg.name)} is a collective of established, proven business owners who gather every month to share connections, open doors, and drive real revenue into one another's companies.</p>
    <div class="hero-actions">
      <a href="/about" class="btn btn-gold">Discover Our Story</a>
      <a href="/members" class="btn btn-outline-light">Meet the Members</a>
    </div>
    <div class="hero-meta">
      <div><strong>2nd Tuesday</strong><span>Every month</span></div>
      <div><strong>11:30 AM</strong><span>Seated lunch</span></div>
      <div><strong>${members.length || '—'}</strong><span>Member businesses</span></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap split">
    <div class="reveal">
      <span class="eyebrow">Our Focus</span>
      <h2>A name for everyone in the room.</h2>
      <p>We are not a casual networking mixer. Every seat at our table belongs to an owner with systems, operations, and a track record of success — and every member leaves knowing exactly who to send business to, and who is sending business back.</p>
      <p>Our shared goal is simple and ambitious: to help one another become some of the most respected and most successful businesses in the Greater New Orleans area.</p>
      <a href="/about" class="link-gold">How we work →</a>
    </div>
    <div class="img-stack reveal">
      <img src="${m.table}" alt="Business owners in discussion around a table" loading="lazy">
      <img src="${m.dining}" alt="Elegant restaurant table setting" loading="lazy" class="img-offset">
    </div>
  </div>
</section>

<section class="section section-dark">
  <div class="wrap">
    <div class="section-head center reveal">
      <span class="eyebrow">What We Stand For</span>
      <h2>Professionalism. Generosity. Growth.</h2>
    </div>
    <div class="pillars">
      <div class="pillar reveal"><div class="pillar-num">01</div><h3>Proven Owners</h3><p>Established businesses with real systems and operations in place — built to sustain and built to scale.</p></div>
      <div class="pillar reveal"><div class="pillar-num">02</div><h3>Pour Into Clients</h3><p>We treat every referral like our own client. Your customers are in excellent hands with anyone at this table.</p></div>
      <div class="pillar reveal"><div class="pillar-num">03</div><h3>Take Care of Each Other</h3><p>Warm introductions, honest counsel, and accountability. We champion one another's businesses as our own.</p></div>
      <div class="pillar reveal"><div class="pillar-num">04</div><h3>Grow Dramatically</h3><p>Revenue is the measure. We share connections with intention — to move every member's business forward.</p></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap split split-rev">
    <div class="photo-frame reveal"><img src="${m.restaurant}" alt="Warm, upscale New Orleans–style dining room" loading="lazy"></div>
    <div class="reveal">
      <span class="eyebrow">The Table</span>
      <h2>Lunch, every second Tuesday.</h2>
      <p>We gather over a seated lunch at one of the city's restaurants — because in New Orleans, the best business has always been done around a good table.</p>
      ${meetingCard('<a href="/portal" class="btn btn-dark btn-sm">Members: venue details</a>')}
    </div>
  </div>
</section>

${
  featured.length
    ? `<section class="section section-tan">
  <div class="wrap">
    <div class="section-head reveal"><span class="eyebrow">From the Community</span><h2>Recent shout-outs</h2></div>
    <div class="shout-grid">${featured.map((s) => shoutCard(s, members)).join('')}</div>
    <div class="center mt"><a href="/shoutouts" class="btn btn-dark">See all shout-outs</a></div>
  </div>
</section>`
    : ''
}

<section class="cta-band">
  <div class="cta-bg" style="background-image:url('${m.handshake}')"></div>
  <div class="wrap cta-inner reveal">
    <h2>Looking for a trusted business in Greater New Orleans?</h2>
    <p>Browse our member directory — every listing is an established owner who takes care of their clients.</p>
    <div class="hero-actions center-actions">
      <a href="/members" class="btn btn-gold">Browse the Directory</a>
      <a href="/about#visit" class="btn btn-outline-light">Inquire About Visiting</a>
    </div>
  </div>
</section>`;
  return layout({ active: '/', body, authed });
}

function about({ authed, sent }) {
  const m = cfg.media;
  const body = `
<section class="page-hero" style="--bg:url('${m.team}')">
  <div class="wrap"><span class="eyebrow eyebrow-light">About ${esc(cfg.name)}</span><h1>Built by proven owners.<br><em>Expanded by exceptional ones.</em></h1></div>
</section>

<section class="section">
  <div class="wrap split">
    <div class="reveal">
      <span class="eyebrow">Our Story</span>
      <h2>Rooted in the Goldman Sachs 10,000 Small Businesses program.</h2>
      <p>${esc(cfg.name)} was founded by a group of New Orleans–area business owners who completed the Goldman Sachs 10,000 Small Businesses program — a rigorous growth-focused curriculum for established companies.</p>
      <p>That shared experience is our foundation. It is proof that our founding members run businesses with the systems, operations, and leadership in place not only to sustain a strong company, but to scale it.</p>
      <p>Since then, the group has grown to welcome other outstanding business owners from across the Greater New Orleans area who share that same standard of excellence.</p>
    </div>
    <div class="stat-panel reveal">
      <div class="stat"><strong>10K</strong><span>Founded by Goldman Sachs 10,000 Small Businesses alumni</span></div>
      <div class="stat"><strong>Monthly</strong><span>Second Tuesday · 11:30 AM · seated lunch</span></div>
      <div class="stat"><strong>1 Goal</strong><span>Bring real revenue into one another's businesses</span></div>
    </div>
  </div>
</section>

<section class="section section-tan">
  <div class="wrap">
    <div class="section-head center reveal"><span class="eyebrow">How It Works</span><h2>Every meeting has a purpose.</h2></div>
    <div class="steps">
      <div class="step reveal"><span class="step-n">1</span><h3>Gather</h3><p>We sit down together for lunch on the second Tuesday of each month at 11:30 AM.</p></div>
      <div class="step reveal"><span class="step-n">2</span><h3>Share</h3><p>Members share wins, needs, and the specific introductions that would move their business forward.</p></div>
      <div class="step reveal"><span class="step-n">3</span><h3>Connect</h3><p>We make warm, intentional introductions — a name for everyone in the room.</p></div>
      <div class="step reveal"><span class="step-n">4</span><h3>Grow</h3><p>We follow through, take care of each other's clients, and celebrate the revenue that follows.</p></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head center reveal"><span class="eyebrow">Who We Are</span><h2>The standard at our table</h2></div>
    <div class="values">
      <div class="value reveal"><h3>Established</h3><p>Members operate established businesses with proven track records of success.</p></div>
      <div class="value reveal"><h3>Professional</h3><p>We show up prepared, follow through on every introduction, and represent each other well.</p></div>
      <div class="value reveal"><h3>Generous</h3><p>We pour into our clients and into one another — giving first, without keeping score.</p></div>
      <div class="value reveal"><h3>Ambitious</h3><p>We intend to be among the leading businesses in Greater New Orleans — together.</p></div>
      <div class="value reveal"><h3>Trusted</h3><p>A referral from a member is a promise: your client will be taken care of.</p></div>
      <div class="value reveal"><h3>Local</h3><p>Proudly invested in the people, culture, and economy of Greater New Orleans.</p></div>
    </div>
  </div>
</section>

<section class="section section-dark" id="visit">
  <div class="wrap split">
    <div class="reveal">
      <span class="eyebrow">Join Us</span>
      <h2>Inquire about visiting.</h2>
      <p>Membership is by invitation and is extended to established business owners in the Greater New Orleans area who share our commitment to professionalism and to one another's growth.</p>
      <p>Tell us a little about you and your business, and a member will be in touch.</p>
      ${meetingCard()}
    </div>
    <div class="reveal">
      ${sent ? '<div class="notice notice-ok">Thank you — your inquiry has been received. A member will reach out soon.</div>' : ''}
      <form method="post" action="/inquire" class="form form-dark">
        <div class="row2">
          <label>Your name<input name="name" required maxlength="120"></label>
          <label>Business<input name="business" required maxlength="160"></label>
        </div>
        <div class="row2">
          <label>Email<input type="email" name="email" required maxlength="160"></label>
          <label>Phone<input name="phone" maxlength="40"></label>
        </div>
        <label>Industry<input name="industry" maxlength="120"></label>
        <label>Tell us about your business<textarea name="message" rows="4" maxlength="2000"></textarea></label>
        <input name="website_confirm" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="btn btn-gold">Send Inquiry</button>
      </form>
    </div>
  </div>
</section>`;
  return layout({ title: 'About', active: '/about', body, authed });
}

function directory({ members, authed }) {
  const industries = [...new Set(members.map((m) => m.industry).filter(Boolean))].sort();
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
  const body = `
<section class="page-hero page-hero-sm" style="--bg:url('${cfg.media.handshake}')">
  <div class="wrap"><span class="eyebrow eyebrow-light">Member Directory</span><h1>Find a trusted <em>New Orleans</em> business.</h1>
  <p class="lead">Every member is an established owner committed to taking excellent care of their clients.</p></div>
</section>
<section class="section">
  <div class="wrap">
    <div class="toolbar">
      <input type="search" id="dirSearch" placeholder="Search by name, business, or service…" aria-label="Search members">
      ${industries.length ? `<select id="dirIndustry" aria-label="Filter by industry"><option value="">All industries</option>${industries.map((i) => `<option>${esc(i)}</option>`).join('')}</select>` : ''}
      <a href="/members/new" class="btn btn-gold">${authed ? '+ Add your profile' : 'Members: add your profile'}</a>
    </div>
    ${
      sorted.length
        ? `<div class="member-grid" id="memberGrid">${sorted.map((m) => `<div id="m-${esc(m.id)}">${memberCard(m)}</div>`).join('')}</div>
           <p class="empty hidden" id="dirEmpty">No members match your search.</p>`
        : `<div class="empty-state"><h3>Member profiles are on their way.</h3><p>Our members are adding their bios and contact information now. Check back soon.</p><a href="/members/new" class="btn btn-dark">Members: add your profile</a></div>`
    }
  </div>
</section>`;
  return layout({ title: 'Member Directory', active: '/members', body, authed });
}

function profileForm({ member = {}, authed, error }) {
  const editing = Boolean(member.id);
  const f = (name) => esc(member[name] || '');
  const body = `
<section class="page-hero page-hero-sm" style="--bg:url('${cfg.media.table}')">
  <div class="wrap"><span class="eyebrow eyebrow-light">Member Directory</span><h1>${editing ? 'Update your profile' : 'Add your profile'}</h1>
  <p class="lead">Public fields appear in the open directory. Members-only fields are visible only inside the Member Portal.</p></div>
</section>
<section class="section">
  <div class="wrap narrow">
    ${error ? `<div class="notice notice-err">${esc(error)}</div>` : ''}
    <form method="post" action="${editing ? `/members/${esc(member.id)}/edit` : '/members/new'}" enctype="multipart/form-data" class="form">
      <fieldset>
        <legend>About you</legend>
        <div class="row2">
          <label>Full name *<input name="name" required maxlength="120" value="${f('name')}"></label>
          <label>Title<input name="title" maxlength="120" placeholder="Owner, CEO, Founder…" value="${f('title')}"></label>
        </div>
        <div class="row2">
          <label>Business name *<input name="business" required maxlength="160" value="${f('business')}"></label>
          <label>Industry<input name="industry" maxlength="80" placeholder="e.g. Construction, Legal, Marketing" value="${f('industry')}"></label>
        </div>
        <label>Bio<textarea name="bio" rows="6" maxlength="3000" placeholder="Your story, your business, and what makes you great to work with.">${f('bio')}</textarea></label>
        <label>A great referral for me is…<input name="services" maxlength="300" placeholder="e.g. Commercial property owners planning renovations" value="${f('services')}"></label>
        <label>Headshot or logo <span class="muted small">(JPG, PNG or WebP, up to 4 MB)</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>
        ${member.photo ? `<div class="current-photo">${avatar(member)} <label class="check"><input type="checkbox" name="removePhoto" value="1"> Remove current photo</label></div>` : ''}
      </fieldset>
      <fieldset>
        <legend>Public contact <span class="muted small">— shown to everyone</span></legend>
        <div class="row2">
          <label>Email<input type="email" name="publicEmail" maxlength="160" value="${f('publicEmail')}"></label>
          <label>Phone<input name="publicPhone" maxlength="40" value="${f('publicPhone')}"></label>
        </div>
        <label>Website<input name="website" maxlength="200" placeholder="yourbusiness.com" value="${f('website')}"></label>
        <div class="row2">
          <label>LinkedIn URL<input name="linkedin" maxlength="200" value="${f('linkedin')}"></label>
          <label>Instagram URL<input name="instagram" maxlength="200" value="${f('instagram')}"></label>
        </div>
      </fieldset>
      <fieldset class="fs-private">
        <legend>Members-only contact <span class="muted small">— visible only in the Member Portal</span></legend>
        <div class="row2">
          <label>Direct cell<input name="privatePhone" maxlength="40" value="${f('privatePhone')}"></label>
          <label>Direct email<input type="email" name="privateEmail" maxlength="160" value="${f('privateEmail')}"></label>
        </div>
        <label>Note to members<input name="privateNotes" maxlength="300" placeholder="Best time to reach me, assistant's name, etc." value="${f('privateNotes')}"></label>
      </fieldset>
      <div class="form-actions">
        <button class="btn btn-gold">${editing ? 'Save changes' : 'Publish my profile'}</button>
        <a href="${editing ? '/portal' : '/members'}" class="btn btn-text">Cancel</a>
      </div>
    </form>
    ${
      editing
        ? `<form method="post" action="/members/${esc(member.id)}/delete" class="danger-zone" onsubmit="return confirm('Permanently remove this profile from the directory?')"><button class="btn-text danger">Remove this profile from the directory</button></form>`
        : ''
    }
  </div>
</section>`;
  return layout({ title: editing ? 'Edit Profile' : 'Add Profile', active: '/members', body, authed });
}

function shoutouts({ shoutouts, members, authed, posted }) {
  const sorted = [...shoutouts].reverse();
  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name));
  const body = `
<section class="page-hero page-hero-sm" style="--bg:url('${cfg.media.dining}')">
  <div class="wrap"><span class="eyebrow eyebrow-light">Shout-Outs</span><h1>Celebrate. Promote. <em>Give credit.</em></h1>
  <p class="lead">Upcoming events from our members, and kind words about the great work happening across our community.</p></div>
</section>
<section class="section">
  <div class="wrap">
    ${posted ? '<div class="notice notice-ok">Thank you — your post is live.</div>' : ''}
    <div class="toolbar">
      <div class="chips" role="tablist">
        <button class="chip active" data-filter="">All</button>
        <button class="chip" data-filter="event">Events</button>
        <button class="chip" data-filter="testimonial">Testimonials</button>
        <button class="chip" data-filter="shoutout">Shout-Outs</button>
      </div>
      <a href="#post" class="btn btn-gold">+ Post a shout-out</a>
    </div>
    ${
      sorted.length
        ? `<div class="shout-grid" id="shoutGrid">${sorted.map((s) => shoutCard(s, members, { canDelete: authed })).join('')}</div>`
        : `<div class="empty-state"><h3>Be the first to give a shout-out.</h3><p>Promote an upcoming event or recognize a member for outstanding work.</p></div>`
    }
  </div>
</section>
<section class="section section-tan" id="post">
  <div class="wrap narrow">
    <div class="section-head center"><span class="eyebrow">Share Something</span><h2>Post a shout-out</h2>
    <p class="muted">${authed ? 'Posting as a signed-in member.' : 'Posting is for members — you\'ll be asked for the member access code.'}</p></div>
    <form method="post" action="/shoutouts" class="form">
      <div class="row2">
        <label>Type
          <select name="type" id="shoutType">
            <option value="shoutout">Shout-Out</option>
            <option value="testimonial">Testimonial</option>
            <option value="event">Event</option>
          </select>
        </label>
        <label>Your name *<input name="author" required maxlength="120"></label>
      </div>
      <label>Headline *<input name="title" required maxlength="140" placeholder="e.g. Grand opening of our new Metairie location"></label>
      <label>Message *<textarea name="message" required rows="5" maxlength="3000"></textarea></label>
      <div class="row2">
        <label>About a member <span class="muted small">(optional)</span>
          <select name="memberId"><option value="">—</option>${sortedMembers.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}${m.business ? ` — ${esc(m.business)}` : ''}</option>`).join('')}</select>
        </label>
        <label>Link <span class="muted small">(optional)</span><input name="link" maxlength="300" placeholder="Tickets, website, etc."></label>
      </div>
      <div class="row2 event-fields">
        <label>Event date<input type="date" name="eventDate"></label>
        <label>Event location<input name="eventLocation" maxlength="160"></label>
      </div>
      ${authed ? '' : '<label>Member access code *<input name="code" type="password" inputmode="numeric" required autocomplete="off"></label>'}
      <button class="btn btn-dark">Publish</button>
    </form>
  </div>
</section>`;
  return layout({ title: 'Shout-Outs', active: '/shoutouts', body, authed });
}

function gate({ error, next }) {
  const body = `
<section class="gate" style="--bg:url('${cfg.media.restaurant}')">
  <div class="gate-card">
    <div class="brand-mark big">10k</div>
    <span class="eyebrow">Members Only</span>
    <h1>Member Portal</h1>
    <p class="muted">Enter the member access code to view the full member roster, direct contact information, and meeting details.</p>
    ${error ? `<div class="notice notice-err">${esc(error)}</div>` : ''}
    <form method="post" action="/portal/login" class="form">
      <input type="hidden" name="next" value="${esc(next || '/portal')}">
      <label class="sr-only" for="code">Access code</label>
      <input id="code" name="code" type="password" inputmode="numeric" autocomplete="off" placeholder="Access code" required autofocus class="code-input">
      <button class="btn btn-gold btn-block">Enter</button>
    </form>
  </div>
</section>`;
  return layout({ title: 'Member Portal', active: '/portal', body, authed: false });
}

function portal({ members, inquiries, shoutouts }) {
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
  const upcoming = shoutouts
    .filter((s) => s.type === 'event' && s.eventDate && s.eventDate >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const body = `
<section class="page-hero page-hero-sm" style="--bg:url('${cfg.media.restaurant}')">
  <div class="wrap"><span class="eyebrow eyebrow-light">Member Portal</span><h1>Welcome back to <em>the table.</em></h1></div>
</section>
<section class="section">
  <div class="wrap portal-grid">
    <aside>
      ${meetingCard(`<p><span class="label">Venue</span><br>${esc(cfg.meeting.venue)}</p>`)}
      <div class="side-card">
        <h4>Quick actions</h4>
        <a href="/members/new" class="btn btn-gold btn-block">Add a member profile</a>
        <a href="/shoutouts#post" class="btn btn-dark btn-block">Post a shout-out</a>
        <a href="/portal/roster.csv" class="btn btn-outline btn-block">Download roster (CSV)</a>
        <form method="post" action="/portal/logout"><button class="btn-text">Sign out</button></form>
      </div>
      ${
        upcoming.length
          ? `<div class="side-card"><h4>Upcoming member events</h4>${upcoming
              .slice(0, 5)
              .map((e) => `<div class="mini-event"><strong>${esc(fmtDate(e.eventDate))}</strong><span>${esc(e.title)}</span></div>`)
              .join('')}</div>`
          : ''
      }
      <div class="side-card">
        <h4>Meeting etiquette</h4>
        <ul class="ticks">
          <li>Arrive by 11:30 — we start on time.</li>
          <li>Bring one specific introduction you're looking for.</li>
          <li>Come ready to give a name to someone else.</li>
          <li>Follow up on every referral within 48 hours.</li>
        </ul>
      </div>
    </aside>
    <div>
      <div class="toolbar">
        <h2 class="no-margin">Member roster <span class="count">${sorted.length}</span></h2>
        <input type="search" id="dirSearch" placeholder="Search members…" aria-label="Search members">
      </div>
      ${
        sorted.length
          ? `<div class="member-grid member-grid-2" id="memberGrid">${sorted.map((m) => memberCard(m, { privateView: true })).join('')}</div><p class="empty hidden" id="dirEmpty">No members match your search.</p>`
          : `<div class="empty-state"><h3>No profiles yet.</h3><p>Be the first — add your profile so the group can find you.</p><a href="/members/new" class="btn btn-gold">Add your profile</a></div>`
      }
      <h2 class="mt-lg">Visitor inquiries <span class="count">${inquiries.length}</span></h2>
      ${
        inquiries.length
          ? `<div class="table-wrap"><table class="table"><thead><tr><th>Received</th><th>Name</th><th>Business</th><th>Contact</th><th>Message</th><th></th></tr></thead><tbody>
          ${[...inquiries]
            .reverse()
            .map(
              (q) => `<tr><td>${esc(fmtDate(q.createdAt))}</td><td>${esc(q.name)}</td><td>${esc(q.business)}${q.industry ? `<br><span class="muted small">${esc(q.industry)}</span>` : ''}</td>
              <td><a href="mailto:${esc(q.email)}">${esc(q.email)}</a>${q.phone ? `<br>${esc(q.phone)}` : ''}</td><td class="msg">${esc(q.message)}</td>
              <td><form method="post" action="/portal/inquiries/${esc(q.id)}/delete" onsubmit="return confirm('Remove this inquiry?')"><button class="btn-text">Remove</button></form></td></tr>`
            )
            .join('')}
          </tbody></table></div>`
          : '<p class="muted">No inquiries yet. Visitors can reach out from the About page.</p>'
      }
    </div>
  </div>
</section>`;
  return layout({ title: 'Member Portal', active: '/portal', body, authed: true });
}

function notFound({ authed }) {
  return layout({
    title: 'Not Found',
    authed,
    body: `<section class="section"><div class="wrap narrow center"><span class="eyebrow">404</span><h1>We couldn't find that page.</h1><a href="/" class="btn btn-gold">Back home</a></div></section>`,
  });
}

module.exports = { home, about, directory, profileForm, shoutouts, gate, portal, notFound };
