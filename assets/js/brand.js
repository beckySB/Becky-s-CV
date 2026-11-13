/* Brands.

   A brand is who you are posting as: the identity, the voice, the palette, and everything that
   brand has written. The craft, which is what the platforms reward and how a week is shaped and
   how video gets made, belongs to nobody and lives in data/craft.json.

   The point of the split is that adding a second brand costs a style guide and a library, not a
   fork of the application.

   resolve() is the load bearing piece. social.js and outreach.js were written against one brand
   and are shared with the Operating System's history, so rather than teach them about brands,
   this hands them an object shaped exactly as they already expect, built from the active brand
   plus the craft. They never learn a brand exists. */
(function (global) {
  'use strict';

  var S = global.Store;
  var D;

  function useData(d) { D = d; }

  /* ---------------- the record ----------------
     A new brand starts with the craft's defaults for the things that are templates rather than
     copy: the sequences, the between-meetings pieces, the channel definitions and a pillar
     scaffold. Posts, videos and profiles start empty, because those are the brand's own words
     and nobody else's will do. */
    function blank(name) {
    return {
      id: S.uid('br'),
      name: name || 'New brand',
      shortName: '',
      identity: { positioning: '', offer: '', market: '', audience: '', wedge: '', reviewedBy: '', tagline: '' },
      visual: { colors: [], fonts: [], logoNote: '', imageDirection: '', logoData: '' },
      voice: { heading: 'How the brand sounds', source: '', principles: [], mechanics: [], banned: [],
               openings: { note: '', patterns: [] }, closings: [] },
      pillars: JSON.parse(JSON.stringify(D.craft.pillarScaffold)),
      channels: JSON.parse(JSON.stringify(D.craft.defaultChannels)),
      posts: [],
      videos: [],
      engagement: JSON.parse(JSON.stringify(D.craft.defaultEngagement)),
      sequences: JSON.parse(JSON.stringify(D.craft.defaultSequences)),
      profiles: [],
      calendar: { heading: 'The quarter, week by week', note: '', rhythm: [], liveSlotSources: [], weeks: [] },
      premise: '', blurb: '',
      createdAt: S.iso(S.today())
    };
  }

  /* ---------------- resolution ----------------
     Build the shape social.js and outreach.js already read. */
  function resolveSocial(b) {
    var c = D.craft;
    return {
      title: 'The Content Studio',
      subtitle: 'What ' + (b.name || 'this brand') + ' says in public',
      blurb: b.blurb || ('Everything ' + (b.name || 'this brand') + ' publishes, in one place, written once.'),
      premise: b.premise || c.note,
      voice: b.voice,
      compliance: c.compliance,
      pillars: b.pillars,
      channels: b.channels,
      posts: b.posts,
      engagementGroups: c.engagementGroups,
      engagement: b.engagement,
      profiles: b.profiles,
      calendar: b.calendar,
      repurpose: c.repurpose,
      metrics: c.metrics,
      tokens: c.tokens,
      cadence: c.cadence,
      week: c.week,
      production: c.production,
      /* The craft owns how video is made; the brand owns which videos exist. */
      video: Object.assign({}, c.video, { library: b.videos || [] })
    };
  }

  function resolveOutreach(b) {
    var c = D.craft;
    return {
      title: 'Outreach and engagement',
      subtitle: 'Who to touch today, what to say, and what to do with the reply',
      blurb: c.discovery.note,
      reality: c.reality,
      casualVoice: c.casualVoice,
      sequences: b.sequences,
      discovery: c.discovery,
      engagementPlay: c.engagementPlay,
      scheduling: c.scheduling,
      guardrails: c.guardrails,
      training: c.training,
      tokens: c.tokens,
      gmail: c.gmail
    };
  }


  /* ---------------- the chrome follows the brand ----------------
     This is a multi-brand studio, so the app should not wear one firm's colours while
     you are working on another. Everything visual in the CSS hangs off three variables,
     so theming is a matter of deriving three good values from the brand's own palette.

     Derived rather than picked, because a palette names colours for print, not for an
     interface: a brand's gold is a correct brand colour and an unreadable button. The rule
     is contrast first, hue second. We take the brand colour that is still legible as
     white-on-colour, then build the hover and the tint from it, so the hue is the
     brand's and the contrast is ours.

     Written into a stylesheet rather than onto the root element's style attribute, so the
     dark-scheme media query still decides which set applies. An inline style would beat
     both and strand dark mode on the light values. */

  function hex2rgb(h) {
    if (typeof h !== 'string') return null;
    h = h.trim().replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2hex(c) {
    return '#' + c.map(function (v) {
      var n = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return n.length === 1 ? '0' + n : n;
    }).join('');
  }
  function lum(c) {
    var a = c.map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function chroma(c) { return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]); }

  var WHITE = [255, 255, 255];
  var DARK_SURFACE = [24, 32, 31];

  /* Step toward a target until the colour clears a contrast floor against ground. */
  function until(c, toward, ground, floor) {
    var out = c;
    for (var t = 0; t <= 1.001; t += 0.04) {
      out = mix(c, toward, t);
      if (contrast(out, ground) >= floor) return out;
    }
    return out;
  }

  function themeFor(b) {
    var cols = ((b.visual && b.visual.colors) || [])
      .map(function (c) { return hex2rgb(c.hex); })
      .filter(Boolean)
      .filter(function (c) { return chroma(c) >= 18; });   /* greys carry no hue to theme with */
    if (!cols.length) return null;

    /* The most colourful one that is still readable as white-on-colour. If none of them
       is, take the most colourful and darken it until it is. */
    var legible = cols.filter(function (c) { return contrast(c, WHITE) >= 4.5; });
    var pool = legible.length ? legible : cols;
    pool = pool.slice().sort(function (x, y) { return chroma(y) - chroma(x); });
    var base = pool[0];
    if (!legible.length) base = until(base, [0, 0, 0], WHITE, 4.5);
    /* A colour the style guide marks as primary wins outright, so a saturated accent
       (a gold ink, say) cannot take over the chrome from the brand's real colour. */
    var named = ((b.visual && b.visual.colors) || []).filter(function (c) { return c.primary && hex2rgb(c.hex); })[0];
    if (named) base = until(hex2rgb(named.hex), [0, 0, 0], WHITE, 4.5);

    return {
      light: {
        brand: rgb2hex(base),
        brand2: rgb2hex(until(mix(base, WHITE, 0.18), [0, 0, 0], WHITE, 4.5)),
        soft: rgb2hex(mix(base, WHITE, 0.9))
      },
      dark: {
        brand: rgb2hex(until(base, WHITE, DARK_SURFACE, 4.5)),
        brand2: rgb2hex(until(base, WHITE, DARK_SURFACE, 6.5)),
        soft: rgb2hex(mix(base, DARK_SURFACE, 0.82))
      }
    };
  }

  function theme(b) {
    var doc = global.document;
    if (!doc) return;
    var el = doc.getElementById('brand-theme');
    if (!el) {
      el = doc.createElement('style');
      el.id = 'brand-theme';
      doc.head.appendChild(el);
    }
    var t = b ? themeFor(b) : null;
    if (!t) { el.textContent = ''; return; }
    var vars = function (v) {
      return '--brand:' + v.brand + ';--brand-2:' + v.brand2 + ';--brand-soft:' + v.soft + ';';
    };
    el.textContent =
      ':root{' + vars(t.light) + '}' +
      '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){' + vars(t.dark) + '}}' +
      ':root[data-theme="dark"]{' + vars(t.dark) + '}';
  }

  /* Hand every module the active brand's view. Called at boot and on every brand switch. */
  function apply() {
    var b = S.activeBrand();
    if (!b) return null;
    var merged = {
      social: resolveSocial(b),
      outreach: resolveOutreach(b),
      craft: D.craft,
      practice: D.practice,
      coi: D.coi,
      growth: D.growth
    };
    global.Social.useData(merged);
    global.Outreach.useData(merged);
    global.Views.useData(merged);
    global.COI.useData(merged);
    global.Growth.useData(merged);
    global.Sprint.useData(merged);
    theme(b);
    return merged;
  }

  /* ---------------- the style guide, as something you can hand over ----------------
     The output that matters is not the form, it is this: one brief a writer, a designer or
     another assistant can work from without asking a single question. */
  function voiceBrief(b) {
    var L = [];
    L.push('VOICE AND STYLE: ' + (b.name || 'Unnamed brand'));
    if (b.identity.positioning) L.push(b.identity.positioning + '.');
    if (b.identity.market) L.push(b.identity.market + '.');
    L.push('');
    if (b.identity.audience) { L.push('WHO WE ARE WRITING TO'); L.push(b.identity.audience); L.push(''); }
    if (b.identity.wedge) { L.push('THE ONE THING WE SAY THAT NOBODY ELSE DOES'); L.push(b.identity.wedge); L.push(''); }

    if ((b.voice.principles || []).length) {
      L.push('HOW IT SOUNDS');
      b.voice.principles.forEach(function (p) {
        L.push('- ' + p.name + '. ' + (p.detail || ''));
      });
      L.push('');
    }
    if ((b.voice.mechanics || []).length) {
      L.push('MECHANICS, APPLIED EVERY TIME');
      b.voice.mechanics.forEach(function (m) { L.push('- ' + m); });
      L.push('');
    }
    if ((b.voice.banned || []).length) {
      L.push('WORDS THAT NEVER APPEAR, AND WHAT TO WRITE INSTEAD');
      b.voice.banned.forEach(function (x) { L.push('- Never: ' + x.word + '  ->  ' + (x.instead || '')); });
      L.push('');
    }
    if ((b.voice.openings && b.voice.openings.patterns || []).length) {
      L.push('HOW A PIECE OPENS');
      b.voice.openings.patterns.forEach(function (p) { L.push('- ' + p); });
      L.push('');
    }
    if ((b.voice.closings || []).length) {
      L.push('HOW A PIECE CLOSES');
      b.voice.closings.forEach(function (p) { L.push('- ' + p); });
      L.push('');
    }
    if ((b.pillars || []).length) {
      L.push('WHAT WE WRITE ABOUT');
      b.pillars.forEach(function (p) { L.push('- ' + p.name + '. ' + (p.job || '')); });
      L.push('');
    }
    if (b.identity.reviewedBy) {
      L.push('BEFORE ANYTHING IS PUBLISHED');
      L.push('Everything public goes through ' + b.identity.reviewedBy + ' first. Nothing drafted is approved by being drafted.');
    }
    return L.join('\n').trim();
  }

  /* The sheet somebody builds the Canva templates from. Deliberately a spec rather than a
     design: the templates get made by hand, once, and then autofilled. */
  function canvaSpec(b) {
    var L = [];
    L.push('CANVA TEMPLATE SPEC: ' + (b.name || 'Unnamed brand'));
    L.push('');
    L.push('COLORS');
    (b.visual.colors || []).forEach(function (c) {
      L.push('- ' + c.hex + '  ' + c.name + (c.pms ? '  PMS ' + c.pms : '') + (c.use ? '  (' + c.use + ')' : ''));
      if (c.cmyk) L.push('     CMYK ' + c.cmyk + '   RGB ' + c.rgb);
    });
    if (b.visual.gradient) {
      L.push('- ' + b.visual.gradient.from + ' to ' + b.visual.gradient.to + '  ' + b.visual.gradient.name +
             '  (' + b.visual.gradient.use + ')');
    }
    if (!(b.visual.colors || []).length) L.push('- none set yet');
    if (b.visual.colorNote) { L.push(''); L.push('NOTE: ' + b.visual.colorNote); }
    L.push('');
    L.push('FONTS');
    (b.visual.fonts || []).forEach(function (f) { L.push('- ' + f.name + (f.use ? '  (' + f.use + ')' : '')); });
    if (!(b.visual.fonts || []).length) L.push('- none set yet');
    if (b.visual.fontNote) { L.push(''); L.push('NOTE: ' + b.visual.fontNote); }
    if ((b.visual.fontSubstitutes || []).length) {
      L.push('');
      L.push('IN CANVA, USE INSTEAD:');
      b.visual.fontSubstitutes.forEach(function (x) {
        L.push('- ' + x.instead_of + '  ->  ' + x.use + '. ' + x.why);
      });
    }
    L.push('');
    if (b.visual.logoNote) { L.push('LOGO'); L.push(b.visual.logoNote); L.push(''); }
    if (b.visual.imageDirection) { L.push('IMAGERY'); L.push(b.visual.imageDirection); L.push(''); }
    if (b.visual.exclusionZone) { L.push('EXCLUSION ZONE'); L.push(b.visual.exclusionZone); L.push(''); }
    if ((b.visual.prohibited || []).length) {
      L.push('NEVER DO THIS TO THE LOGO');
      b.visual.prohibited.forEach(function (x) { L.push('- ' + x); });
      L.push('');
    }
    if (b.canva && (b.canva.templates || []).length) {
      L.push('TEMPLATES, ALREADY BUILT');
      L.push(b.canva.note || '');
      L.push('');
      b.canva.templates.forEach(function (t, i) {
        L.push((i + 1) + '. ' + t.name + '   ' + t.size + '   ' + t.id);
        L.push('   ' + t.use);
        L.push('   Fields: ' + t.fields.map(function (f) { return f.name + ' (' + f.type + ')'; }).join(', '));
        if (t.editUrl) L.push('   ' + t.editUrl);
        L.push('');
      });
      var ks = b.canva.brandKitSetup;
      if (ks) {
        L.push(ks.heading.toUpperCase());
        L.push(ks.why);
        L.push('');
        L.push('Where: ' + ks.where);
        ks.steps.forEach(function (x, i) { L.push((i + 1) + '. ' + x); });
        L.push('');
        L.push('The colours to enter:');
        ks.colors.forEach(function (c) { L.push('   ' + c.hex + '  ' + c.name + '  ' + c.role); });
        L.push('');
        L.push(ks.afterwards);
        L.push('');
      }
      if ((b.canva.fontFix || []).length) {
        L.push('STILL TO DO BY HAND, ONCE');
        b.canva.fontFix.forEach(function (x) { L.push('- ' + x); });
        L.push('');
      }
      if (b.canva.folderUrl) L.push('All four live in ' + b.canva.folderUrl);
    } else {
      L.push('TEMPLATES TO BUILD, AND THE FIELDS EACH NEEDS');
      L.push('');
      L.push('1. Carousel slide, 1080x1350, one per idea');
      L.push('   Fields: slide_text. One text frame, centred, large, generous margins.');
      L.push('');
      L.push('2. Quote card, 1080x1350');
      L.push('   Fields: quote, attribution. Type on the brand ground.');
      L.push('');
      L.push('3. Video cover, 1080x1920');
      L.push('   Fields: hook_line. The first three seconds as a still, for the thumbnail.');
      L.push('');
      L.push('4. Single image post, 1080x1350');
      L.push('   Fields: image, headline, body. The one with a photograph in it.');
      L.push('');
      L.push('Every field above is a Canva data field, so the studio can autofill it later.');
      L.push('Name the fields exactly as written here or the autofill will not find them.');
    }
    return L.join('\n');
  }

  global.Brand = {
    useData: useData, blank: blank, apply: apply,
    resolveSocial: resolveSocial, resolveOutreach: resolveOutreach,
    voiceBrief: voiceBrief, canvaSpec: canvaSpec, theme: theme, themeFor: themeFor
  };
})(window);
