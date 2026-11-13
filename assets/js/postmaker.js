/* Post from photos: drop in pictures from an event, say what it was, and get back a
   finished, on-brand image post and the captions to go with it.

   The image is built here, in the browser, from your own photos and the official logo:
   nothing is generated, so nothing in the picture is invented. Claude looks at the photos
   and writes the headline, a caption for each platform, alt text and a list of things to
   check. The photos leave this browser only for that, only once consent is confirmed, and
   the server keeps none of them. */
(function (global) {
  'use strict';

  var SIZES = {
    '4:5': { w: 1080, h: 1350, label: 'Portrait 4:5', use: 'LinkedIn and Instagram feed. The default.' },
    '1:1': { w: 1080, h: 1080, label: 'Square 1:1', use: 'Any feed, and Facebook.' },
    '1.91:1': { w: 1200, h: 628, label: 'Landscape 1.91:1', use: 'LinkedIn and Facebook link-style images.' },
    '9:16': { w: 1080, h: 1920, label: 'Story 9:16', use: 'Instagram and Facebook stories.' }
  };
  var LAYOUTS = {
    band: { label: 'Photo and caption band', use: 'One photo over the deep green band, gold seam, logo in white. Matches the Canva image post.' },
    box: { label: 'Photo and logo box', use: 'Full-bleed photo with a white box holding the logo and headline, as in the brand guide\'s social examples.' },
    collage: { label: 'Collage', use: 'Two to four photos over the caption band.' },
    carousel: { label: 'Carousel', use: 'One slide per photo, then a closing slide with the logo.' },
    celebrate: { label: 'Celebration', use: 'For someone else\'s big day: the logo, a gold script headline, a collage of up to four photos, their name, and a few warm lines. Best at 4:5 or square.' }
  };
  var RELS = {
    client: { label: 'A client, named with their written consent', lead: 'A huge congratulations to our clients at' },
    friend: { label: 'A friend of the program', lead: 'A huge congratulations to our friends at' },
    person: { label: 'A person, not a company', lead: 'A huge congratulations to' }
  };

  var PM = {
    photos: [], slide: 0, layout: 'band', size: '4:5',
    details: { what: '', when: '', where: '', who: '', happened: '', why: '', link: '' },
    platforms: { LinkedIn: true, Instagram: true, Facebook: false },
    consent: false, headline: '', subhead: '', slideLines: [],
    cel: { kicker: 'Congratulations on your', script: 'Grand Opening', rel: 'client', leadIn: RELS.client.lead, name: '', body: '',
           closing: 'We\'re honored to be part of your journey, and even more excited for what\'s next.' },
    result: null, running: false, error: '', caps: null, logos: null, mounted: null
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(id) { return document.getElementById(id); }
  function brand() { return global.Store && global.Store.activeBrand ? global.Store.activeBrand() : null; }
  function toast(m) { if (global.App && global.App.toast) global.App.toast(m); }
  function chip(label, tone) { return '<span class="chip ' + (tone || '') + '"><i class="dot"></i>' + esc(label) + '</span>'; }
  function checks(text) {
    return global.Newsroom && global.Newsroom.checkChips ? '<div class="nr-checks">' + global.Newsroom.checkChips(text, false) + '</div>' : '';
  }

  /* ---------------- brand ---------------- */

  function palette() {
    var b = brand(), vis = (b && b.visual) || {};
    var t = global.Brand && global.Brand.themeFor && b ? global.Brand.themeFor(b) : null;
    var gold = (vis.colors || []).find(function (c) { return /gold/i.test(c.name || ''); });
    var charcoal = (vis.colors || []).find(function (c) { return /charcoal|ink/i.test(c.name || ''); });
    return {
      ground: t ? t.light.brand : '#123d32',
      accent: gold ? gold.hex : '#c9a86a',
      ink: charcoal ? charcoal.hex : '#1f2a26',
      from: (vis.gradient && vis.gradient.from) || '#1d5a4a',
      to: (vis.gradient && vis.gradient.to) || '#0c2e25',
      name: (b && b.name) || '',
      site: (b && b.identity && b.identity.website) || ''
    };
  }

  /* The official artwork. In the single-file copy it arrives inlined as data. */
  function loadLogos() {
    if (PM.logos) return;
    PM.logos = { color: new Image(), white: new Image(), reverse: new Image() };
    var A = global.STUDIO_ASSETS || {};
    PM.logos.color.src = A.logoColor || 'assets/brand/www-logo-horizontal.svg';
    PM.logos.white.src = A.logoWhite || 'assets/brand/www-logo-horizontal-white.svg';
    /* On a dark ground the mark keeps its colours and only the wordmark turns cream. */
    PM.logos.reverse.src = A.logoReverse || 'assets/brand/www-logo-horizontal-reverse.svg';
    [PM.logos.color, PM.logos.white, PM.logos.reverse].forEach(function (im) { im.onload = paint; });
  }
  var LOGO_RATIO = 556 / 140;
  function drawLogo(ctx, which, x, y, h, align) {
    var im = PM.logos && PM.logos[which];
    var w = h * LOGO_RATIO;
    var lx = align === 'center' ? x - w / 2 : x;
    if (im && im.complete && im.naturalWidth) { ctx.drawImage(im, lx, y, w, h); return w; }
    /* Fallback only if the file failed to load: the firm's name in plain type, never an
       imitation of the mark. */
    ctx.save();
    ctx.fillStyle = which === 'color' ? palette().ink : '#ffffff';
    ctx.font = '500 ' + Math.round(h * 0.42) + 'px "Cormorant Garamond", Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = align === 'center' ? 'center' : 'left';
    ctx.fillText(palette().name.toUpperCase(), x, y + h / 2);
    ctx.restore();
    return w;
  }

  /* ---------------- drawing ---------------- */

  function cover(ctx, p, x, y, w, h) {
    if (!p || !p.img || !p.img.naturalWidth) { ctx.fillStyle = '#ece6da'; ctx.fillRect(x, y, w, h); return; }
    var iw = p.img.naturalWidth, ih = p.img.naturalHeight, tr = w / h, sr = iw / ih, sw, sh;
    if (sr > tr) { sh = ih; sw = sh * tr; } else { sw = iw; sh = sw / tr; }
    ctx.drawImage(p.img, (iw - sw) * p.fx, (ih - sh) * p.fy, sw, sh, x, y, w, h);
  }

  function wrap(ctx, text, maxW) {
    var words = String(text || '').split(/\s+/).filter(Boolean), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  /* Largest size at which the text fits the box in at most maxLines lines. */
  function fit(ctx, text, font, maxW, maxH, maxLines, start, min, lh) {
    for (var s = start; s >= min; s -= 2) {
      ctx.font = font(s);
      var lines = wrap(ctx, text, maxW);
      if (lines.length <= maxLines && lines.length * s * lh <= maxH) return { size: s, lines: lines };
    }
    ctx.font = font(min);
    return { size: min, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
  }
  var SERIF = function (s) { return '600 ' + s + 'px "Cormorant Garamond", Georgia, serif'; };
  var SANS = function (s) { return '500 ' + s + 'px "DM Sans", Arial, sans-serif'; };

  /* The text block for the green band: headline, subhead, centred or left-aligned in a box. */
  function bandText(ctx, x, y, w, h, headline, subhead, align, scale) {
    var P = palette(), base = Math.min(ctx.canvas.width, ctx.canvas.height) * (scale || 1);
    var hl = headline ? fit(ctx, headline, SERIF, w, h * 0.72, 3, Math.round(base * 0.075), Math.round(base * 0.04), 1.12) : { size: 0, lines: [] };
    var shSize = Math.round(base * 0.03);
    var total = hl.lines.length * hl.size * 1.12 + (subhead ? shSize * 1.9 : 0);
    var ty = y + (h - total) / 2;
    var tx = align === 'center' ? x + w / 2 : x;
    ctx.save();
    ctx.textAlign = align === 'center' ? 'center' : 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = SERIF(hl.size);
    hl.lines.forEach(function (l, i) { ctx.fillText(l, tx, ty + i * hl.size * 1.12); });
    if (subhead) {
      ctx.font = SANS(shSize);
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      ctx.fillText(subhead, tx, ty + hl.lines.length * hl.size * 1.12 + shSize * 0.75);
    }
    ctx.restore();
  }

  function band(ctx, W, H, photoArea, headline, subhead, extra) {
    var P = palette();
    var land = W / H > 1.4;
    var seam = Math.max(4, Math.round(Math.min(W, H) * 0.005));
    if (land) {
      var pw = Math.round(W * 0.58);
      photoArea(0, 0, pw, H);
      ctx.fillStyle = P.accent; ctx.fillRect(pw, 0, seam, H);
      ctx.fillStyle = P.ground; ctx.fillRect(pw + seam, 0, W - pw - seam, H);
      var pad = W * 0.035, lh = H * 0.075;
      bandText(ctx, pw + seam + pad, pad, W - pw - seam - pad * 2, H - pad * 2 - lh * 2, headline, subhead, 'left', 1.05);
      drawLogo(ctx, 'white', pw + seam + pad, H - pad - lh, lh, 'left');
    } else {
      var ph = Math.round(H * (extra && extra.photoShare || (W === H ? 0.62 : 0.66)));
      photoArea(0, 0, W, ph);
      ctx.fillStyle = P.accent; ctx.fillRect(0, ph, W, seam);
      ctx.fillStyle = P.ground; ctx.fillRect(0, ph + seam, W, H - ph - seam);
      var lh2 = Math.round(W * 0.058), pad2 = W * 0.08;
      var bottomSafe = H > W * 1.5 ? H * 0.12 : 0;            /* stories: clear the reply bar */
      var ly = H - bottomSafe - pad2 * 0.7 - lh2;
      drawLogo(ctx, 'white', W / 2, ly, lh2, 'center');
      var top = ph + seam + pad2 * 0.55, bottom = ly - lh2 * 0.6;  /* half the logo height clear above it */
      bandText(ctx, pad2, top, W - pad2 * 2, bottom - top, headline, subhead, 'center');
      if (extra && extra.page) {
        /* On the logo's line, at the far edge, well clear of the logo's own space. */
        ctx.save(); ctx.font = SANS(Math.round(W * 0.022)); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(extra.page, W - pad2 * 0.6, ly + lh2 / 2); ctx.restore();
      }
    }
  }

  function box(ctx, W, H, p, headline, subhead) {
    var P = palette(), land = W / H > 1.4;
    cover(ctx, p, 0, 0, W, H);
    var g = ctx.createLinearGradient(0, H * 0.4, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var base = Math.min(W, H);
    var bw = land ? W * 0.5 : W * 0.86, bx = land ? W * 0.05 : W * 0.07, pad = base * 0.05;
    var lh = base * 0.06;
    var hl = headline ? fit(ctx, headline, SERIF, bw - pad * 2, base * 0.3, 3, Math.round(base * 0.064), Math.round(base * 0.036), 1.12) : { size: 0, lines: [] };
    var shSize = Math.round(base * 0.028);
    var bh = pad + lh + lh * 0.55 + hl.lines.length * hl.size * 1.12 + (subhead ? shSize * 1.8 : 0) + pad * 0.9;
    var margin = H > W * 1.5 ? H * 0.16 : base * 0.07;
    var by = H - margin - bh;
    ctx.fillStyle = P.ground; ctx.fillRect(0, by + bh * 0.38, bx + base * 0.03, bh * 0.24);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = P.accent; ctx.fillRect(bx, by + bh - Math.max(4, base * 0.005), bw, Math.max(4, base * 0.005));
    drawLogo(ctx, 'color', bx + pad, by + pad, lh, 'left');
    ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    var ty = by + pad + lh + lh * 0.55;
    ctx.fillStyle = P.ink; ctx.font = SERIF(hl.size);
    hl.lines.forEach(function (l, i) { ctx.fillText(l, bx + pad, ty + i * hl.size * 1.12); });
    if (subhead) { ctx.font = SANS(shSize); ctx.fillStyle = P.ink; ctx.fillText(subhead, bx + pad, ty + hl.lines.length * hl.size * 1.12 + shSize * 0.6); }
    ctx.restore();
  }

  function collageArea(ctx, photos) {
    return function (x, y, w, h) {
      var P = palette(), g = Math.max(6, Math.round(Math.min(w, h) * 0.008)), n = Math.min(4, photos.length);
      ctx.fillStyle = P.ground; ctx.fillRect(x, y, w, h);
      if (n <= 1) return cover(ctx, photos[0], x, y, w, h);
      if (n === 2) { var hw = (w - g) / 2; cover(ctx, photos[0], x, y, hw, h); cover(ctx, photos[1], x + hw + g, y, hw, h); return; }
      if (n === 3) {
        var bw = Math.round(w * 0.6), rh = (h - g) / 2;
        cover(ctx, photos[0], x, y, bw, h); cover(ctx, photos[1], x + bw + g, y, w - bw - g, rh); cover(ctx, photos[2], x + bw + g, y + rh + g, w - bw - g, rh); return;
      }
      var cw = (w - g) / 2, ch = (h - g) / 2;
      cover(ctx, photos[0], x, y, cw, ch); cover(ctx, photos[1], x + cw + g, y, cw, ch);
      cover(ctx, photos[2], x, y + ch + g, cw, ch); cover(ctx, photos[3], x + cw + g, y + ch + g, cw, ch);
    };
  }

  function closing(ctx, W, H) {
    var P = palette(), base = Math.min(W, H);
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, P.from); g.addColorStop(1, P.to);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var lh = base * 0.11;
    drawLogo(ctx, 'white', W / 2, H * 0.42 - lh / 2, lh, 'center');
    ctx.fillStyle = P.accent; ctx.fillRect(W / 2 - base * 0.09, H * 0.42 + lh * 1.0, base * 0.18, Math.max(4, base * 0.005));
    if (P.site) {
      ctx.save(); ctx.fillStyle = '#ffffff'; ctx.font = SANS(Math.round(base * 0.034)); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(P.site, W / 2, H * 0.42 + lh * 1.35); ctx.restore();
    }
  }

  /* ---------------- the celebration layout ----------------
     The firm's congratulations graphic: logo, a small-caps lead, the occasion in gold script,
     a collage with gold edges, who is being congratulated, two warm sentences and a closing
     line, on a deep version of the brand green. Every text block shrinks together until it
     fits, so a long company name or a square canvas never runs off the edge. */

  var SCRIPT = function (s) { return '400 ' + s + 'px Allura, "Snell Roundhand", "Brush Script MT", cursive'; };
  var BOLD = function (s) { return '600 ' + s + 'px "DM Sans", Arial, sans-serif'; };

  function mixHex(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), out = 0;
    [16, 8, 0].forEach(function (sh) { out |= Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t) << sh; });
    return '#' + ('000000' + out.toString(16)).slice(-6);
  }
  function goldFill(ctx, y0, y1) {
    var a = palette().accent, g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, mixHex(a, '#ffffff', 0.5)); g.addColorStop(0.5, a); g.addColorStop(1, mixHex(a, '#7a5a12', 0.45));
    return g;
  }
  function trackedWidth(ctx, text, tr) { return ctx.measureText(text).width + tr * Math.max(0, text.length - 1); }
  function wrapTracked(ctx, text, maxW, tr) {
    var words = String(text || '').split(/\s+/).filter(Boolean), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (trackedWidth(ctx, t, tr) > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  function drawTracked(ctx, text, cx, y, tr) {
    var x = cx - trackedWidth(ctx, text, tr) / 2;
    ctx.textAlign = 'left';
    for (var i = 0; i < text.length; i++) { ctx.fillText(text[i], x, y); x += ctx.measureText(text[i]).width + tr; }
  }

  /* Each block knows how tall it is at a scale, and how to draw itself there. */
  function celBlocks(ctx, w, base, part) {
    var C = PM.cel, P = palette(), demo = !PM.photos.length;
    var teal = mixHex(P.from, '#ffffff', 0.3);
    var blocks = [];
    function tracked(text, font, size, k, color, maxLines, after) {
      if (!text) return;
      var lay = function (s) {
        var up = text.toUpperCase(), fs = Math.round(size * s), min = Math.round(size * s * 0.8), lines;
        /* Prefer one line, a little smaller, over a second line. */
        for (; fs >= min; fs--) { ctx.font = font(fs); if (trackedWidth(ctx, up, fs * k) <= w) return { fs: fs, lines: [up] }; }
        fs = Math.round(size * s); ctx.font = font(fs);
        lines = wrapTracked(ctx, up, w, fs * k).slice(0, maxLines);
        /* Never leave one short word alone on the last line. */
        var n = lines.length;
        if (n > 1 && lines[n - 1].split(' ').length === 1 && lines[n - 2].split(' ').length > 2) {
          var prev = lines[n - 2].split(' '); lines[n - 1] = prev.pop() + ' ' + lines[n - 1]; lines[n - 2] = prev.join(' ');
        }
        return { fs: fs, lines: lines };
      };
      blocks.push({
        h: function (s) { var L = lay(s); return L.lines.length * L.fs * 1.5 + after * s; },
        draw: function (s, cx, y) { var L = lay(s); ctx.fillStyle = color; ctx.textBaseline = 'top'; L.lines.forEach(function (l, i) { drawTracked(ctx, l, cx, y + i * L.fs * 1.5 + L.fs * 0.25, L.fs * k); }); }
      });
    }
    if (part !== 'bottom') {
      var lh = base * 0.088;
      blocks.push({ h: function (s) { return lh * s + base * 0.022 * s; }, draw: function (s, cx, y) { drawLogo(ctx, 'reverse', cx, y, lh * s, 'center'); } });
      tracked(C.kicker, SERIF, base * 0.027, 0.34, '#ffffff', 2, base * 0.004);
      if (C.script) {
        var layS = function (s) {
          for (var fs = Math.round(base * 0.158 * s); fs > base * 0.06; fs -= 2) {
            ctx.font = SCRIPT(fs);
            var lines = wrap(ctx, C.script, w * 0.94);
            if (lines.length <= (C.script.length > 22 ? 2 : 1)) return { fs: fs, lines: lines };
          }
          return { fs: Math.round(base * 0.06), lines: wrap(ctx, C.script, w * 0.94).slice(0, 2) };
        };
        blocks.push({
          h: function (s) { var L = layS(s); return L.lines.length * L.fs * 0.98 + L.fs * 0.22; },
          draw: function (s, cx, y) {
            var L = layS(s), hh = L.lines.length * L.fs * 0.98;
            ctx.save();
            ctx.translate(cx, y + hh / 2); ctx.rotate(-0.045); ctx.translate(-cx, -(y + hh / 2));
            ctx.font = SCRIPT(L.fs); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = L.fs * 0.08; ctx.shadowOffsetY = L.fs * 0.02;
            L.lines.forEach(function (l, i) {
              var ly = y + L.fs * 0.55 + i * L.fs * 0.98;
              ctx.fillStyle = goldFill(ctx, ly - L.fs * 0.5, ly + L.fs * 0.5);
              ctx.fillText(l, cx, ly);
            });
            ctx.restore();
          }
        });
      }
    }
    if (part !== 'top') {
      if (part === 'all') blocks.push({ h: function (s) { return base * 0.03 * s; }, draw: function () {} });
      tracked(C.leadIn, SERIF, base * 0.0255, 0.3, '#ffffff', 2, base * 0.006);
      var name = C.name || (demo ? 'Their name here' : '');
      if (name) {
        var layN = function (s) {
          var text = name.toUpperCase();
          for (var fs = Math.round(base * 0.062 * s); fs > base * 0.026; fs -= 2) { ctx.font = BOLD(fs); if (trackedWidth(ctx, text, fs * 0.04) <= w * 0.86) break; }
          return { fs: fs, text: text, tw: trackedWidth(ctx, text, fs * 0.04) };
        };
        blocks.push({
          h: function (s) { return layN(s).fs * 1.28 + base * 0.012 * s; },
          draw: function (s, cx, y) {
            var L = layN(s); ctx.font = BOLD(L.fs); ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'top';
            drawTracked(ctx, L.text, cx, y + L.fs * 0.1, L.fs * 0.04);
            var gap = L.fs * 0.5, len = Math.min(base * 0.1, (w - L.tw) / 2 - gap), my = y + L.fs * 0.58;
            if (len > base * 0.02) {
              ctx.fillStyle = teal; var t = Math.max(2, base * 0.003);
              ctx.fillRect(cx - L.tw / 2 - gap - len, my, len, t); ctx.fillRect(cx + L.tw / 2 + gap, my, len, t);
            }
          }
        });
      }
      var body = C.body || (demo ? 'Two warm, specific sentences about what you saw there and what it took to get here.' : '');
      if (body) {
        var layB = function (s) { var fs = Math.round(base * 0.0265 * s); ctx.font = SERIF(fs); return { fs: fs, lines: wrap(ctx, body, w * 0.96).slice(0, 6) }; };
        blocks.push({
          h: function (s) { var L = layB(s); return L.lines.length * L.fs * 1.42 + base * 0.02 * s; },
          draw: function (s, cx, y) { var L = layB(s); ctx.font = SERIF(L.fs); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; L.lines.forEach(function (l, i) { ctx.fillText(l, cx, y + i * L.fs * 1.42); }); }
        });
      }
      tracked(C.closing, BOLD, base * 0.0205, 0.2, teal, 2, base * 0.012);
      if (part === 'bottom') blocks.push({
        h: function (s) { return base * 0.022 * s; },
        draw: function (s, cx, y) {
          /* The swoosh: a thin arc that fades at both ends. */
          var half = Math.min(w * 0.36, base * 0.3), g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, teal); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = Math.max(2, base * 0.0035); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx - half, y + base * 0.02 * s); ctx.quadraticCurveTo(cx, y - base * 0.004, cx + half, y + base * 0.012 * s); ctx.stroke(); ctx.restore();
        }
      });
    }
    return blocks;
  }
  function celStack(ctx, blocks, cx, top, bottom, from) {
    var avail = bottom - top, s = from || 1, total = 0;
    var sum = function (k) { return blocks.reduce(function (a, b) { return a + b.h(k); }, 0); };
    for (; s >= 0.5; s -= 0.04) { total = sum(s); if (total <= avail) break; }
    var y = top + Math.max(0, (avail - total) / 2);
    blocks.forEach(function (b) { b.draw(s, cx, y); y += b.h(s); });
  }

  function celGround(ctx, W, H) {
    var P = palette(), base = Math.min(W, H);
    var deep = mixHex(P.to, '#000000', 0.66), mid = mixHex(P.to, '#000000', 0.4);
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, deep); g.addColorStop(0.45, mid); g.addColorStop(1, deep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    /* A soft sky: the same clouds every time, so a re-export matches the first. */
    var seed = 7; var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    [[0.1, 0.2], [0.86, 0.09], [0.93, 0.24], [0.04, 0.04], [0.5, 0.97], [0.12, 0.93]].forEach(function (c) {
      for (var i = 0; i < 9; i++) {
        var x = (c[0] + (rnd() - 0.5) * 0.3) * W, y = (c[1] + (rnd() - 0.5) * 0.06) * H, r = base * (0.09 + rnd() * 0.12);
        var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, 'rgba(255,255,255,' + (0.018 + rnd() * 0.022).toFixed(3) + ')'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
    var glow = ctx.createRadialGradient(W / 2, H * 0.12, 0, W / 2, H * 0.12, base * 0.7);
    glow.addColorStop(0, 'rgba(255,255,255,.07)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  }
  function celCorners(ctx, W, H, which) {
    var base = Math.min(W, H), a = base * 0.085, b = base * 0.19;
    ctx.save();
    var gold = ctx.createLinearGradient(0, 0, W, H);
    var acc = palette().accent;
    gold.addColorStop(0, mixHex(acc, '#ffffff', 0.35)); gold.addColorStop(0.5, acc); gold.addColorStop(1, mixHex(acc, '#7a5a12', 0.4));
    ctx.fillStyle = gold; ctx.strokeStyle = gold; ctx.lineWidth = Math.max(2, base * 0.003);
    if (which.indexOf('tl') >= 0) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(a, 0); ctx.lineTo(0, b); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(a * 1.22, 0); ctx.lineTo(0, b * 1.22); ctx.stroke();
    }
    if (which.indexOf('br') >= 0) {
      ctx.beginPath(); ctx.moveTo(W, H); ctx.lineTo(W - a, H); ctx.lineTo(W, H - b); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(W - a * 1.22, H); ctx.lineTo(W, H - b * 1.22); ctx.stroke();
    }
    ctx.restore();
  }
  /* One large photo and the rest stacked beside it, divided by gold lines. */
  function celCollage(ctx, x, y, w, h) {
    var photos = PM.photos.length ? PM.photos.slice(0, 4) : [null, null, null];
    var n = photos.length, g = Math.max(4, Math.round(Math.min(ctx.canvas.width, ctx.canvas.height) * 0.0045));
    ctx.fillStyle = palette().accent; ctx.fillRect(x, y, w, h);
    var ph = function (p, px, py, pw, phh) { if (p) cover(ctx, p, px, py, pw, phh); else { ctx.fillStyle = '#2a5446'; ctx.fillRect(px, py, pw, phh); } };
    if (n === 1) return ph(photos[0], x, y, w, h);
    if (w / h >= 1.6) {
      /* A wide band: the lead on the left, the rest stacked beside it. */
      var bw = Math.round(w * (n === 2 ? 0.56 : 0.59)), rw = w - bw - g, rh = (h - g * (n - 2)) / (n - 1);
      ph(photos[0], x, y, bw, h);
      for (var i = 1; i < n; i++) ph(photos[i], x + bw + g, y + (i - 1) * (rh + g), rw, rh);
      return;
    }
    /* A squarer space: the lead across the top, the rest in a row under it. */
    var th = Math.round(h * (n === 2 ? 0.5 : 0.6)), cw = (w - g * (n - 2)) / (n - 1);
    ph(photos[0], x, y, w, th);
    for (var k = 1; k < n; k++) ph(photos[k], x + (k - 1) * (cw + g), y + th + g, cw, h - th - g);
  }

  function celebrate(ctx, W, H) {
    var P = palette(), base = Math.min(W, H), teal = mixHex(P.from, '#ffffff', 0.3);
    celGround(ctx, W, H);
    var line = Math.max(3, base * 0.004);
    if (W / H > 1.4) {
      /* Wide: photos on the left, everything else stacked on the right. */
      var cw = Math.round(W * 0.47);
      celCollage(ctx, 0, 0, cw, H);
      ctx.fillStyle = goldFill(ctx, 0, H); ctx.fillRect(cw, 0, line, H);
      celCorners(ctx, W, H, 'br');
      celStack(ctx, celBlocks(ctx, (W - cw) * 0.84, base * 0.92, 'all'), cw + (W - cw) / 2, H * 0.04, H * 0.96);
      return;
    }
    /* A story is tall, and the app covers its top and bottom: keep clear of both and use
       the extra height for larger type. */
    var story = H / W > 1.5;
    var y0 = Math.round(H * (story ? 0.325 : 0.292)), y1 = Math.round(H * (story ? 0.64 : 0.668)), slant = base * 0.034;
    celCorners(ctx, W, H, 'tl br');
    celStack(ctx, celBlocks(ctx, W * 0.8, base, 'top'), W / 2, H * (story ? 0.085 : 0.022), y0 - slant * 0.2, story ? 1.15 : 1);
    /* The collage sits in a band whose top edge rises to the right. */
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, y0 + slant); ctx.lineTo(W, y0 - slant * 0.4); ctx.lineTo(W, y1); ctx.lineTo(0, y1); ctx.closePath(); ctx.clip();
    celCollage(ctx, 0, y0 - slant * 0.4, W, y1 - y0 + slant * 0.4);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = goldFill(ctx, y0 - slant, y0 + slant * 2); ctx.lineWidth = line * 1.4;
    ctx.beginPath(); ctx.moveTo(0, y0 + slant); ctx.lineTo(W, y0 - slant * 0.4); ctx.stroke();
    ctx.fillStyle = palette().accent; ctx.fillRect(0, y1, W, line);
    ctx.fillStyle = teal; ctx.fillRect(0, y1 + line, W, line * 0.8);
    ctx.restore();
    celStack(ctx, celBlocks(ctx, W * 0.84, base, 'bottom'), W / 2, y1 + base * 0.03, H - (story ? H * 0.1 : base * 0.028), story ? 1.3 : 1);
  }

  function slides() {
    var n = PM.photos.length;
    if (!n) return [{ kind: PM.layout === 'celebrate' ? 'celebrate' : 'empty' }];
    if (PM.layout === 'carousel') {
      var out = PM.photos.map(function (p, i) { return { kind: 'photo', i: i }; });
      out.push({ kind: 'closing' });
      return out;
    }
    return [{ kind: PM.layout }];
  }

  function drawSlide(ctx, W, H, s) {
    ctx.clearRect(0, 0, W, H);
    var P = palette();
    if (s.kind === 'celebrate') return celebrate(ctx, W, H);
    if (s.kind === 'empty') { ctx.fillStyle = P.ground; ctx.fillRect(0, 0, W, H); band(ctx, W, H, function (x, y, w, h) { ctx.fillStyle = '#e7e0d2'; ctx.fillRect(x, y, w, h); }, PM.headline || 'Your headline here', PM.subhead || 'Date and place'); return; }
    if (s.kind === 'closing') return closing(ctx, W, H);
    if (s.kind === 'box') return box(ctx, W, H, PM.photos[0], PM.headline, PM.subhead);
    if (s.kind === 'collage') return band(ctx, W, H, collageArea(ctx, PM.photos), PM.headline, PM.subhead);
    if (s.kind === 'photo') {
      var p = PM.photos[s.i], first = s.i === 0, total = PM.photos.length + 1;
      return band(ctx, W, H, function (x, y, w, h) { cover(ctx, p, x, y, w, h); },
        first ? PM.headline : (PM.slideLines[s.i] || ''), first ? PM.subhead : '',
        { photoShare: first ? undefined : 0.76, page: (s.i + 1) + ' / ' + total });
    }
    return band(ctx, W, H, function (x, y, w, h) { cover(ctx, PM.photos[0], x, y, w, h); }, PM.headline, PM.subhead);
  }

  function paint() {
    var c = $('pm-canvas'); if (!c) return;
    var S = SIZES[PM.size], list = slides();
    if (PM.slide >= list.length) PM.slide = 0;
    if (c.width !== S.w || c.height !== S.h) { c.width = S.w; c.height = S.h; }
    drawSlide(c.getContext('2d'), S.w, S.h, list[PM.slide]);
    var strip = $('pm-strip');
    if (strip) {
      if (list.length < 2) { strip.innerHTML = ''; return; }
      if (strip.children.length !== list.length) {
        strip.innerHTML = list.map(function (s, i) { return '<canvas class="pm-thumb" data-pm="slide" data-i="' + i + '"></canvas>'; }).join('');
      }
      Array.prototype.forEach.call(strip.children, function (t, i) {
        var k = 120 / S.w; t.width = 120; t.height = Math.round(S.h * k);
        var tc = t.getContext('2d'); tc.save(); tc.scale(k, k); drawSlide(tc, S.w, S.h, list[i]); tc.restore();
        t.classList.toggle('is-on', i === PM.slide);
      });
    }
  }

  /* ---------------- photos ---------------- */

  var nextId = 1;
  function addFiles(files) {
    Array.prototype.forEach.call(files || [], function (f) {
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)) return;
      if (PM.photos.length >= 10) { toast('Ten photos at most.'); return; }
      var p = { id: nextId++, name: f.name, url: URL.createObjectURL(f), fx: 0.5, fy: 0.5, img: new Image() };
      p.img.onload = function () { panel(); paint(); };
      p.img.onerror = function () {
        PM.photos = PM.photos.filter(function (x) { return x !== p; });
        PM.error = f.name + ' could not be opened. iPhone photos in HEIC need to be saved as JPEG first (in Photos: Share, Options, Most Compatible, or AirDrop to a Mac and export).';
        panel(); paint();
      };
      p.img.src = p.url;
      PM.photos.push(p);
    });
    PM.result = PM.result && PM.photos.length ? PM.result : null;
    panel(); paint();
  }

  function downscale(p) {
    var max = 1280, iw = p.img.naturalWidth, ih = p.img.naturalHeight, k = Math.min(1, max / Math.max(iw, ih));
    var c = document.createElement('canvas'); c.width = Math.round(iw * k); c.height = Math.round(ih * k);
    c.getContext('2d').drawImage(p.img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82).split(',')[1];
  }

  /* ---------------- Claude ---------------- */

  function loadCaps() {
    if (PM.caps || PM.capsLoading) return;
    PM.capsLoading = true;
    fetch('api/capabilities', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) { PM.caps = c || { draft: false, draftReason: 'The writing service is not available here.' }; })
      .catch(function () { PM.caps = { draft: false, draftReason: 'Writing with Claude needs the hosted Studio. This copy has no server behind it.' }; })
      .then(function () { PM.capsLoading = false; panel(); });
  }

  function platformsOn() { return Object.keys(PM.platforms).filter(function (k) { return PM.platforms[k]; }); }

  function write() {
    if (!PM.photos.length) { PM.error = 'Add at least one photo first.'; return panel(); }
    if (!PM.consent) { PM.error = 'Confirm consent first. The photos are sent to Claude to be described.'; return panel(); }
    var b = brand();
    PM.running = true; PM.error = ''; panel();
    var send = PM.photos.slice(0, 6);
    var body = {
      consent: true,
      images: send.map(function (p) { return { media_type: 'image/jpeg', data: downscale(p) }; }),
      details: Object.assign({}, PM.details, { platforms: platformsOn(), advisor: (b && b.identity && b.identity.advisor) || '' }),
      voiceBrief: (global.Brand && global.Brand.voiceBrief && b) ? global.Brand.voiceBrief(b) : ''
    };
    fetch('api/caption', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) {
        var res = j.result;
        PM.result = j;
        PM.headline = res.headline || PM.headline;
        PM.subhead = res.subhead || PM.subhead;
        if (res.leadPhoto > 0 && res.leadPhoto < send.length) {
          var lead = PM.photos.splice(res.leadPhoto, 1)[0]; PM.photos.unshift(lead);
          var sl = res.slideLines.splice(res.leadPhoto, 1)[0]; res.slideLines.unshift(sl);
          var at = res.altText.splice(res.leadPhoto, 1)[0]; res.altText.unshift(at);
          j.movedLead = true;
        }
        PM.slideLines = res.slideLines.slice();
        var cel = res.celebration;
        if (cel) ['kicker', 'script', 'name', 'body', 'closing'].forEach(function (k) { if (cel[k]) PM.cel[k] = cel[k]; });
        PM.slide = 0;
        toast('Post ready for review');
      })
      .catch(function (e) { PM.error = /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? 'Writing with Claude needs the hosted Studio.' : e.message; })
      .then(function () { PM.running = false; panel(); paint(); });
  }

  function brief() {
    var b = brand(), d = PM.details;
    var vb = (global.Brand && global.Brand.voiceBrief && b) ? global.Brand.voiceBrief(b) : '';
    return [
      'I am attaching ' + (PM.photos.length || 'my') + ' photos from an event. Write a social post for Women Worth & Wealth, an educational money and worth program for women in New Orleans.',
      '', 'BRAND VOICE', vb, '',
      'RULES: use only the facts below and what is visible in the photos. Never invent names, numbers, quotes or outcomes. Never identify anyone from their face; use names only as I give them. No testimonials, endorsements, performance, products or urgency.',
      '', 'THE EVENT', 'What it was: ' + d.what, 'When: ' + d.when, 'Where: ' + d.where, 'Who was there, and who to thank: ' + d.who,
      'What happened: ' + d.happened, 'Why it matters: ' + d.why, 'Link: ' + (d.link || 'none'), '',
      'GIVE ME: a headline for the image (eight words at most), a one-line subhead, which photo to lead with, ' +
      platformsOn().join(', ') + ' captions (LinkedIn 600 to 1,300 characters in my first person, no hashtags or links in the body), three to five Instagram hashtags, a first comment with the link, alt text for each photo, and anything a reviewer should check before posting.'
    ].join('\n');
  }

  /* ---------------- export ---------------- */

  function slug(s) { return String(s || 'post').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'post'; }
  function exportSlide(i) {
    var S = SIZES[PM.size], c = document.createElement('canvas');
    c.width = S.w; c.height = S.h;
    drawSlide(c.getContext('2d'), S.w, S.h, slides()[i]);
    return new Promise(function (resolve) {
      c.toBlob(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        var n = slides().length;
        a.download = 'www-' + slug(PM.details.what || PM.headline) + '-' + PM.size.replace(':', 'x') + (n > 1 ? '-' + (i + 1) + 'of' + n : '') + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        resolve();
      }, 'image/png');
    });
  }
  /* Every slide as a JPEG, which is what Instagram takes, straight into the Publishing queue
     as a draft. Nothing posts from here: approval happens in Publishing. */
  function slideJpeg(i) {
    var S = SIZES[PM.size], c = document.createElement('canvas');
    c.width = S.w; c.height = S.h;
    drawSlide(c.getContext('2d'), S.w, S.h, slides()[i]);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }
  function altFor(s, alts) {
    if (s.kind === 'photo') return alts[s.i] || '';
    if (s.kind === 'closing') return 'The Women Worth & Wealth logo.';
    return alts.filter(Boolean).join(' ');
  }
  var KEYS = { LinkedIn: 'linkedin', Facebook: 'facebook', Instagram: 'instagram' };
  function sendToPublishing() {
    if (!PM.consent) { PM.error = 'Confirm consent before sending.'; return panel(); }
    if (!global.Publish) return;
    var r = PM.result && PM.result.result;
    var tags = r && r.hashtags && r.hashtags.length ? '\n\n' + r.hashtags.map(function (h) { return h.charAt(0) === '#' ? h : '#' + h; }).join(' ') : '';
    var alts = (r && r.altText) || [];
    var list = slides();
    PM.sending = true; PM.error = ''; panel();
    var post = {
      title: PM.details.what || PM.headline || 'Post from photos',
      source: 'post-maker',
      platforms: platformsOn().map(function (k) { return KEYS[k]; }),
      captions: r ? { linkedin: r.captions.linkedin || '', facebook: r.captions.facebook || '', instagram: (r.captions.instagram || '') + tags } : {},
      altText: list.map(function (s) { return altFor(s, alts); }),
      firstComment: (r && r.firstComment) || '',
      images: list.map(function (s, i) { return slideJpeg(i); })
    };
    global.Publish.queue(post).then(function () {
      PM.sending = false; toast('Sent to Publishing as a draft.'); location.hash = '#/publish';
    }).catch(function (e) {
      PM.sending = false;
      PM.error = /Failed to fetch|NetworkError|Load failed|HTTP 404/i.test(e.message) ? 'Publishing needs the hosted Studio. Download the images instead.' : e.message;
      panel();
    });
  }

  function exportAll() {
    if (!PM.consent) { PM.error = 'Confirm consent before exporting.'; return panel(); }
    var n = slides().length, i = 0;
    (function next() { if (i >= n) return; exportSlide(i++).then(function () { setTimeout(next, 450); }); })();
  }

  /* ---------------- the panel ---------------- */

  function field(k, label, ph, area) {
    return '<label class="field" style="margin:0"><span class="field-l">' + esc(label) + '</span>' +
      (area ? '<textarea rows="3" data-pm="detail" data-k="' + k + '" placeholder="' + esc(ph) + '">' + esc(PM.details[k]) + '</textarea>'
            : '<input type="text" data-pm="detail" data-k="' + k + '" placeholder="' + esc(ph) + '" value="' + esc(PM.details[k]) + '">') + '</label>';
  }

  function resultHtml() {
    var j = PM.result; if (!j) return '';
    var r = j.result, out = '';
    if (j.movedLead) out += '<p class="tiny muted">Claude picked a different lead photo, so it moved to the front.</p>';
    if (r.flags && r.flags.length) out += '<div class="callout warn" style="margin:10px 0"><strong>Check before posting.</strong><ul class="bullets" style="margin-top:6px">' + r.flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>';
    var cap = function (id, label, text, note) {
      return '<div class="cx-outbox"><div class="row-between"><strong class="small">' + esc(label) + '</strong><button class="btn btn-sm" data-act="copy" data-target="' + id + '">Copy</button></div>' +
        checks(text) + '<div class="nr-pre" id="' + id + '">' + esc(text) + '</div>' + (note ? '<p class="tiny muted" style="margin:6px 0 0">' + esc(note) + '</p>' : '') + '</div>';
    };
    var on = platformsOn();
    out += '<div class="cx-out" style="margin-top:10px">';
    if (on.indexOf('LinkedIn') >= 0) out += cap('pm-li', 'LinkedIn', r.captions.linkedin, 'Post the image with this text. Put the link in the first comment.');
    if (on.indexOf('Instagram') >= 0) out += cap('pm-ig', 'Instagram', r.captions.instagram + (r.hashtags.length ? '\n\n' + r.hashtags.map(function (h) { return h.charAt(0) === '#' ? h : '#' + h; }).join(' ') : ''), '');
    if (on.indexOf('Facebook') >= 0) out += cap('pm-fb', 'Facebook', r.captions.facebook, '');
    if (r.firstComment) out += cap('pm-fc', 'First comment', r.firstComment, '');
    out += cap('pm-alt', 'Alt text, one per photo', r.altText.map(function (a, i) { return 'Photo ' + (i + 1) + ': ' + a; }).join('\n'), 'Paste into the platform\'s alt text field for each image.');
    out += '</div><p class="tiny muted" style="margin:8px 0 0">' + esc(j.model) + ' &middot; ' + j.usage.input + ' input and ' + j.usage.output + ' output tokens.</p>';
    return out;
  }

  function celFields() {
    var C = PM.cel;
    var f = function (k, label, ph, area) {
      return '<label class="field"><span class="field-l">' + esc(label) + '</span>' + (area
        ? '<textarea rows="3" data-pm="cel" data-k="' + k + '" placeholder="' + esc(ph) + '">' + esc(C[k]) + '</textarea>'
        : '<input type="text" data-pm="cel" data-k="' + k + '" value="' + esc(C[k]) + '" placeholder="' + esc(ph) + '">') + '</label>';
    };
    return '<div class="cx-fields">' + f('kicker', 'Small line at the top', 'Congratulations on your') + f('script', 'The occasion, in gold script', 'Grand Opening') + '</div>' +
      '<label class="field"><span class="field-l">Who it is for</span><select data-pm="celrel">' + Object.keys(RELS).map(function (k) {
        return '<option value="' + k + '"' + (C.rel === k ? ' selected' : '') + '>' + esc(RELS[k].label) + '</option>'; }).join('') + '</select></label>' +
      (C.rel === 'client' ? '<p class="tiny" style="margin:-6px 0 10px;color:var(--warn)">This names them as a client in public. Keep their written consent on file first.</p>' : '') +
      f('leadIn', 'Line above their name', RELS[C.rel].lead) + f('name', 'Their name, as it should appear', 'Delta Consolidated, LLC') +
      f('body', 'Two warm sentences', 'What you saw there, and what it took to get here. About 40 words.', true) +
      f('closing', 'Closing line', 'We\'re honored to be part of your journey.') +
      '<div data-pm-celcheck>' + checks([C.script, C.body, C.closing].filter(Boolean).join('. ')) + '</div>';
  }

  function panel() {
    var host = $('pm-panel'); if (!host) return;
    loadCaps();
    var caps = PM.caps || {};
    var n = PM.photos.length;
    host.innerHTML =
      (PM.error ? '<div class="callout alert" style="margin-bottom:12px">' + esc(PM.error) + '</div>' : '') +

      '<div class="card"><h3 style="margin-top:0">1. The photos</h3>' +
      '<label class="pm-drop" id="pm-drop"><input type="file" accept="image/*" multiple data-pm="files" hidden>' +
      '<span>Drop photos here, or <u>choose them</u>. Up to ten. The first one leads.</span></label>' +
      (n ? '<div class="pm-photos">' + PM.photos.map(function (p, i) {
        return '<div class="pm-ph' + (i === PM.slide && PM.layout === 'carousel' ? ' is-on' : '') + '"><img src="' + esc(p.url) + '" alt="">' +
          '<div class="pm-ph-bar">' + (i === 0 ? chip('Lead', 'good') : '<button class="btn btn-ghost btn-sm" data-pm="lead" data-i="' + i + '" title="Make this the lead">Lead</button>') +
          '<button class="btn btn-ghost btn-sm" data-pm="remove" data-i="' + i + '" title="Remove">Remove</button></div></div>';
      }).join('') + '</div>' +
        '<div class="row" style="gap:14px;flex-wrap:wrap;margin-top:10px">' +
        '<label class="field" style="margin:0;flex:1;min-width:150px"><span class="field-l">Frame the lead photo, left to right</span><input type="range" min="0" max="1" step="0.01" data-pm="fx" value="' + PM.photos[0].fx + '"></label>' +
        '<label class="field" style="margin:0;flex:1;min-width:150px"><span class="field-l">Top to bottom</span><input type="range" min="0" max="1" step="0.01" data-pm="fy" value="' + PM.photos[0].fy + '"></label></div>' : '') +
      '</div>' +

      '<div class="card"><h3 style="margin-top:0">2. The event</h3><div class="cx-fields">' +
      field('what', 'What it was', 'Vision Board launch party') + field('when', 'When', 'January 7, 2027') + field('where', 'Where', 'New Orleans') +
      field('who', 'Who was there, and who to thank', 'Names only of people who agreed to be named') + '</div>' +
      '<div style="display:grid;gap:10px;margin-top:10px">' + field('happened', 'What happened', 'Two or three plain sentences', true) +
      field('why', 'Why it matters, or what you took away', 'The one thing you want her to remember', true) +
      field('link', 'Link, optional', 'Goes in the first comment, not the post') + '</div>' +
      '<div class="row" style="gap:14px;margin-top:10px;flex-wrap:wrap">' + ['LinkedIn', 'Instagram', 'Facebook'].map(function (k) {
        return '<label class="check-row" style="margin:0"><input type="checkbox" data-pm="platform" data-k="' + k + '"' + (PM.platforms[k] ? ' checked' : '') + '><span class="small">' + k + '</span></label>';
      }).join('') + '</div></div>' +

      '<div class="card"><h3 style="margin-top:0">3. Consent</h3>' +
      '<label class="check-row"><input type="checkbox" data-pm="consent"' + (PM.consent ? ' checked' : '') + '><span class="small">Everyone recognizable in these photos agreed in writing to appear in the firm\'s marketing, and no client is named or shown without written consent.</span></label>' +
      '<p class="tiny muted" style="margin:4px 0 0">Required to write the caption and to export. The firm\'s plan: client names, quotes and photographs appear in nothing external without written consent and compliance clearance. Writing the caption sends the photos, downscaled, to Claude through the Anthropic API, which keeps none of them. Send to Publishing stores the finished images on the Studio\'s server, as part of the post\'s record.</p></div>' +

      '<div class="card"><h3 style="margin-top:0">4. Write it</h3>' +
      (caps.draft
        ? '<button class="btn btn-primary" data-pm="write"' + (PM.running || !n ? ' disabled' : '') + '>' + (PM.running ? 'Looking at the photos and writing…' : 'Write the post with Claude') + '</button>'
        : '<p class="small muted" style="margin:0 0 8px">' + esc(caps.draftReason || 'Checking whether writing with Claude is available…') + '</p>') +
      ' <button class="btn" data-act="copy" data-target="pm-brief">Copy a brief for Claude</button>' +
      '<pre id="pm-brief" hidden>' + esc(brief()) + '</pre>' +
      (PM.running ? '<p class="tiny muted" style="margin:8px 0 0">Usually 20 to 60 seconds.</p>' : '') +
      resultHtml() + '</div>' +

      '<div class="card"><h3 style="margin-top:0">5. The image</h3>' +
      (PM.layout === 'celebrate' ? celFields() :
      '<label class="field"><span class="field-l">Headline on the image</span><input type="text" data-pm="headline" value="' + esc(PM.headline) + '" placeholder="Eight words at most"></label>' +
      '<label class="field"><span class="field-l">Line under it</span><input type="text" data-pm="subhead" value="' + esc(PM.subhead) + '" placeholder="Date and place"></label>') +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">' + Object.keys(LAYOUTS).map(function (k) {
        return '<button class="btn btn-sm' + (PM.layout === k ? ' btn-primary' : '') + '" data-pm="layout" data-v="' + k + '">' + esc(LAYOUTS[k].label) + '</button>';
      }).join('') + '</div><p class="tiny muted" style="margin:0 0 10px">' + esc(LAYOUTS[PM.layout].use) + '</p>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">' + Object.keys(SIZES).map(function (k) {
        return '<button class="btn btn-sm' + (PM.size === k ? ' btn-primary' : '') + '" data-pm="size" data-v="' + k + '">' + esc(SIZES[k].label) + '</button>';
      }).join('') + '</div><p class="tiny muted" style="margin:0 0 12px">' + esc(SIZES[PM.size].use) + '</p>' +
      (PM.layout === 'carousel' && n ? '<div style="display:grid;gap:8px;margin-bottom:12px">' + PM.photos.slice(1).map(function (p, k) {
        var i = k + 1;
        return '<label class="field" style="margin:0"><span class="field-l">Slide ' + (i + 1) + ' line</span><input type="text" data-pm="slideline" data-i="' + i + '" value="' + esc(PM.slideLines[i] || '') + '"></label>';
      }).join('') + '</div>' : '') +
      '<div class="row" style="gap:8px">' +
      '<button class="btn btn-primary" data-pm="send"' + (n && PM.consent && !PM.sending ? '' : ' disabled') + '>' + (PM.sending ? 'Sending…' : 'Send to Publishing') + '</button>' +
      '<button class="btn" data-pm="export"' + (n && PM.consent ? '' : ' disabled') + '>' + (slides().length > 1 ? 'Download all ' + slides().length + ' slides' : 'Download the image') + '</button></div>' +
      (n && PM.consent && PM.size === '9:16' && PM.platforms.Instagram ? '<p class="tiny" style="margin:6px 0 0;color:var(--warn)">The Instagram feed does not take 9:16. Use 4:5 for the feed, or untick Instagram.</p>' : '') +
      (n && !PM.consent ? '<p class="tiny muted" style="margin:6px 0 0">Confirm consent to export.</p>' : '') +
      '<p class="tiny muted" style="margin:10px 0 0">Built from your photos and the Women Worth & Wealth logo, in the brand palette. Type is the Studio\'s web fonts, Cormorant Garamond and DM Sans, the same as the website. Send to Publishing puts it in the queue as a draft; it posts only once you approve it there.</p></div>';
    var drop = $('pm-drop');
    if (drop) {
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
      drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); PM.error = ''; addFiles(e.dataTransfer.files); });
    }
  }

  /* ---------------- mounting and events ---------------- */

  function view() {
    return '<div class="page-head"><div class="page-eyebrow">Content Studio</div><h1>Post from photos</h1>' +
      '<p class="lede">Drop in the pictures, say what the event was, and get an on-brand image post and the captions for it. Your photos, the real logo, and words written from what is actually in the pictures.</p></div>' +
      '<div id="pm-root" class="ve-grid pm-grid"><div class="ve-stage card"><div class="pm-canvas-wrap"><canvas id="pm-canvas" width="1080" height="1350"></canvas></div>' +
      '<div id="pm-strip" class="pm-strip"></div></div><div id="pm-panel"></div></div>';
  }

  function mount() {
    var root = $('pm-root');
    if (!root || PM.mounted === root) return;
    PM.mounted = root;
    loadLogos();
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('600 40px "Cormorant Garamond"'), document.fonts.load('500 40px "DM Sans"'), document.fonts.load('600 40px "DM Sans"'), document.fonts.load('400 40px Allura')]).then(paint, paint);
    }
    panel(); paint();
  }

  function onClick(e) {
    var el = e.target.closest('[data-pm]'); if (!el) return;
    var k = el.dataset.pm;
    if (k === 'slide') { PM.slide = +el.dataset.i; paint(); }
    else if (k === 'layout') { PM.layout = el.dataset.v; PM.slide = 0; panel(); paint(); }
    else if (k === 'size') { PM.size = el.dataset.v; panel(); paint(); }
    else if (k === 'lead') { var i = +el.dataset.i, p = PM.photos.splice(i, 1)[0]; PM.photos.unshift(p); var l = PM.slideLines.splice(i, 1)[0]; PM.slideLines.unshift(l || ''); panel(); paint(); }
    else if (k === 'remove') { var j = +el.dataset.i; URL.revokeObjectURL(PM.photos[j].url); PM.photos.splice(j, 1); PM.slideLines.splice(j, 1); PM.slide = 0; panel(); paint(); }
    else if (k === 'write') write();
    else if (k === 'export') exportAll();
    else if (k === 'send') sendToPublishing();
  }
  function onInput(e) {
    var el = e.target.closest('[data-pm]'); if (!el) return;
    var k = el.dataset.pm;
    if (k === 'detail') { PM.details[el.dataset.k] = el.value; var pre = $('pm-brief'); if (pre) pre.textContent = brief(); }
    else if (k === 'headline' || k === 'subhead') { PM[k] = el.value; paint(); }
    else if (k === 'slideline') { PM.slideLines[+el.dataset.i] = el.value; paint(); }
    else if (k === 'cel') {
      PM.cel[el.dataset.k] = el.value; paint();
      var cc = document.querySelector('[data-pm-celcheck]');
      if (cc) cc.innerHTML = checks([PM.cel.script, PM.cel.body, PM.cel.closing].filter(Boolean).join('. '));
    }
    else if ((k === 'fx' || k === 'fy') && PM.photos[0]) { PM.photos[0][k] = parseFloat(el.value); paint(); }
  }
  function onChange(e) {
    var el = e.target.closest('[data-pm]'); if (!el) return;
    var k = el.dataset.pm;
    if (k === 'files') { PM.error = ''; addFiles(el.files); el.value = ''; }
    else if (k === 'consent') { PM.consent = el.checked; PM.error = ''; panel(); }
    else if (k === 'platform') { PM.platforms[el.dataset.k] = el.checked; panel(); }
    else if (k === 'celrel') {
      /* Keep a lead-in the person typed themselves; replace only a stock one. */
      var stock = Object.keys(RELS).some(function (r) { return RELS[r].lead === PM.cel.leadIn; }) || !PM.cel.leadIn;
      PM.cel.rel = el.value; if (stock) PM.cel.leadIn = RELS[el.value].lead;
      panel(); paint();
    }
  }

  global.PostMaker = { view: view, mount: mount, busy: function () { return false; }, _state: PM, _slides: slides, _drawSlide: drawSlide, _sizes: SIZES };
})(window);
