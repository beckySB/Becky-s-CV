(() => {
  // Mobile nav
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // Hero video: fall back to the animated photo if no video file loads
  const video = document.querySelector('.hero-video');
  if (video) {
    const sources = video.querySelectorAll('source');
    const last = sources[sources.length - 1];
    const fail = () => video.classList.add('failed');
    if (!sources.length) fail();
    else last.addEventListener('error', fail);
    video.addEventListener('error', fail);
  }

  // Scroll reveal
  const els = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
  } else els.forEach((el) => el.classList.add('in'));

  // Expand long bios
  document.querySelectorAll('.clamp').forEach((el) => el.addEventListener('click', () => el.classList.toggle('open')));

  // Directory search + industry filter
  const search = document.getElementById('dirSearch');
  const industry = document.getElementById('dirIndustry');
  const grid = document.getElementById('memberGrid');
  const empty = document.getElementById('dirEmpty');
  const filterMembers = () => {
    if (!grid) return;
    const q = (search?.value || '').toLowerCase().trim();
    const ind = industry?.value || '';
    let shown = 0;
    grid.querySelectorAll('.member-card').forEach((card) => {
      const ok = (!q || card.dataset.search.includes(q)) && (!ind || card.dataset.industry === ind);
      (card.parentElement.id ? card.parentElement : card).classList.toggle('hidden', !ok);
      if (ok) shown++;
    });
    empty?.classList.toggle('hidden', shown > 0);
  };
  search?.addEventListener('input', filterMembers);
  industry?.addEventListener('change', filterMembers);

  // Shout-out filter chips
  const chips = document.querySelectorAll('.chip');
  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const f = chip.dataset.filter;
      document.querySelectorAll('#shoutGrid .shout-card').forEach((card) =>
        card.classList.toggle('hidden', !!f && card.dataset.type !== f)
      );
    })
  );

  // Show event fields only for events
  const type = document.getElementById('shoutType');
  const eventFields = document.querySelector('.event-fields');
  if (type && eventFields) {
    const sync = () => eventFields.classList.toggle('hidden', type.value !== 'event');
    type.addEventListener('change', sync);
    sync();
  }
})();
