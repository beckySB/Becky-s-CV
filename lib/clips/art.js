/* The branded overlays for a clip, drawn on the server.

   The look is the brand's own, read from the style guide the Studio sends with the job: the
   primary colour for the grounds, the gold accent for rules and labels, cream for type, the
   leaf mark on its cream disc, and the wordmark set the way the website sets it. Nothing
   here is decoration for its own sake. One band, one card, one caption at a time, with room
   around each, so the people in the frame stay the subject.

   Each overlay is a full-frame transparent PNG. The renderer lays them over the footage. */
'use strict';

const path = require('path');

const W = 1080, H = 1920;
let C = null;

function canvasLib() {
  if (C) return C;
  C = require('@napi-rs/canvas');
  const fonts = path.join(__dirname, '..', '..', 'assets', 'fonts');
  C.GlobalFonts.registerFromPath(path.join(fonts, 'cormorant.woff2'), 'Studio Serif');
  C.GlobalFonts.registerFromPath(path.join(fonts, 'cormorant-italic.woff2'), 'Studio Serif Italic');
  C.GlobalFonts.registerFromPath(path.join(fonts, 'dm-sans.woff2'), 'Studio Sans');
  return C;
}

const DEFAULT_LOOK = {
  ground: '#123d32', deep: '#0c2e25', accent: '#c9a86a', cream: '#f3ede2', card: '#fbf7f1',
  eyebrow: 'Women', wordmark: ['Worth', '&', 'Wealth'],
  tagline: 'Own your worth. Steward your wealth.'
};

function hexOk(h) { return typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h.trim()); }
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function mix(a, b, t) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((x >> s) & 255) + (((y >> s) & 255) - ((x >> s) & 255)) * t);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

/* The look for a job: the defaults, with whatever the style guide supplies laid over them. */
function lookFrom(input) {
  const L = Object.assign({}, DEFAULT_LOOK);
  const v = input || {};
  ['ground', 'deep', 'accent', 'cream', 'card'].forEach((k) => { if (hexOk(v[k])) L[k] = v[k].trim().toLowerCase(); });
  if (hexOk(v.ground) && !hexOk(v.deep)) L.deep = mix(L.ground, '#000000', 0.28);
  if (typeof v.tagline === 'string' && v.tagline.trim()) L.tagline = v.tagline.trim().slice(0, 80);
  if (typeof v.eyebrow === 'string') L.eyebrow = v.eyebrow.trim().slice(0, 24);
  if (Array.isArray(v.wordmark) && v.wordmark.length) L.wordmark = v.wordmark.map((s) => String(s).slice(0, 24)).slice(0, 5);
  return L;
}

function font(ctx, family, weight, size) {
  ctx.font = size + 'px "' + family + '"';
  /* The bundled faces are variable fonts: the weight is an axis, not a second file. */
  try { ctx.fontVariationSettings = '"wght" ' + weight; } catch (e) { /* older canvas builds draw the default weight */ }
}
const serif = (ctx, w, s) => font(ctx, 'Studio Serif', w, s);
const italic = (ctx, w, s) => font(ctx, 'Studio Serif Italic', w, s);
const sans = (ctx, w, s) => font(ctx, 'Studio Sans', w, s);

function tracked(ctx, text, x, y, spacing, align) {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : x;
  const prev = ctx.textAlign; ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
  ctx.textAlign = prev;
  return total;
}
function trackedWidth(ctx, text, spacing) {
  const chars = Array.from(text);
  return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
}

function wrap(ctx, text, max) {
  const words = String(text).split(/\s+/).filter(Boolean), out = [];
  let line = '';
  words.forEach((w) => {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  });
  if (line) out.push(line);
  return out;
}
/* Wrap, then even the lines out so a headline never leaves one word alone on the last line. */
function balanced(ctx, text, max) {
  const first = wrap(ctx, text, max);
  if (first.length < 2) return first;
  let best = first, lo = max * 0.5, hi = max;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2, t = wrap(ctx, text, mid);
    if (t.length <= first.length) { best = t; hi = mid; } else lo = mid;
  }
  return best;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

/* The three-leaf mark, from the site's logo.svg (viewBox 120 x 160), drawn at any size. */
function mark(ctx, x, y, width) {
  const { Path2D } = canvasLib();
  const k = width / 120;
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  let g = ctx.createLinearGradient(0, 8, 0, 120); g.addColorStop(0, '#d9b46a'); g.addColorStop(1, '#a87c35');
  ctx.fillStyle = g; ctx.fill(new Path2D('M62 8 C88 40 88 86 64 120 C42 88 40 44 62 8 Z'));
  ctx.fillStyle = '#123d32'; ctx.fill(new Path2D('M8 60 C36 58 58 86 62 150 C30 138 8 104 8 60 Z'));
  g = ctx.createLinearGradient(64, 76, 112, 150); g.addColorStop(0, '#a08a4a'); g.addColorStop(1, '#5d5a2c');
  ctx.fillStyle = g; ctx.fill(new Path2D('M112 76 C108 112 90 140 64 150 C70 112 86 86 112 76 Z'));
  ctx.restore();
}
function disc(ctx, L, cx, cy, r, shadow) {
  ctx.save();
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; }
  ctx.fillStyle = L.card; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const mw = r * 1.04;
  mark(ctx, cx - mw / 2, cy - (mw * 160 / 120) / 2, mw);
}

/* The wordmark on one line: WORTH & WEALTH, bold capitals, the ampersand in gold italic. */
function wordmarkLine(ctx, L, x, y, size, measureOnly) {
  let cx = x;
  L.wordmark.forEach((part, i) => {
    const amp = part === '&';
    if (amp) italic(ctx, 600, size); else serif(ctx, 700, size);
    const t = amp ? part : part.toUpperCase();
    const w = ctx.measureText(t).width;
    if (!measureOnly) { ctx.fillStyle = amp ? L.accent : '#ffffff'; ctx.fillText(t, cx, y); }
    cx += w + (i < L.wordmark.length - 1 ? size * 0.24 : 0);
  });
  return cx - x;
}

function fresh() {
  const { createCanvas } = canvasLib();
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  return [c, ctx];
}
const png = (c) => c.toBuffer('image/png');

/* The corner badge, on screen for the whole clip. */
function bug(look) {
  const L = lookFrom(look), [c, ctx] = fresh();
  const x = 54, y = 196, d = 92, pad = 12, gap = 18;
  serif(ctx, 700, 40);
  const nameW = wordmarkLine(ctx, L, 0, 0, 40, true);
  const w = pad + d + gap + nameW + 34, h = d + pad * 2;
  ctx.fillStyle = rgba(L.deep, 0.88); roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = rgba(L.accent, 0.85); ctx.lineWidth = 2; roundRect(ctx, x + 1, y + 1, w - 2, h - 2, h / 2 - 1); ctx.stroke();
  disc(ctx, L, x + pad + d / 2, y + h / 2, d / 2, false);
  const tx = x + pad + d + gap;
  if (L.eyebrow) { sans(ctx, 500, 17); ctx.fillStyle = L.accent; tracked(ctx, L.eyebrow.toUpperCase(), tx + 1, y + 44, 17 * 0.45); }
  wordmarkLine(ctx, L, tx, y + (L.eyebrow ? 88 : 72), 40);
  return png(c);
}

/* The hook, for the first three seconds: a quiet label, the line itself, one ornament. */
function title(look, eyebrow, hook) {
  const L = lookFrom(look), [c, ctx] = fresh();
  const top = 350, padTop = 44, padBottom = 50;
  serif(ctx, 700, 78);
  const lines = balanced(ctx, hook, W - 192).slice(0, 4);
  const lh = 78 * 1.08;
  const bandH = padTop + (eyebrow ? 25 + 20 : 0) + lines.length * lh + 26 + 12 + padBottom;
  const g = ctx.createLinearGradient(0, top, 0, top + bandH);
  g.addColorStop(0, rgba(L.ground, 0.95)); g.addColorStop(1, rgba(L.deep, 0.95));
  ctx.fillStyle = g; ctx.fillRect(0, top, W, bandH);
  ctx.fillStyle = L.accent; ctx.fillRect(0, top, W, 3); ctx.fillRect(0, top + bandH - 3, W, 3);
  let y = top + padTop;
  if (eyebrow) {
    sans(ctx, 600, 25); ctx.fillStyle = L.accent;
    tracked(ctx, String(eyebrow).toUpperCase(), W / 2, y + 22, 25 * 0.3, 'center');
    y += 25 + 20;
  }
  serif(ctx, 700, 78); ctx.fillStyle = L.cream; ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 62 + i * lh));
  y += lines.length * lh + 26;
  ctx.fillStyle = L.accent;
  ctx.fillRect(W / 2 - 134, y + 5, 120, 2); ctx.fillRect(W / 2 + 14, y + 5, 120, 2);
  ctx.save(); ctx.translate(W / 2, y + 6); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12); ctx.restore();
  return png(c);
}

/* Who is speaking: a name in the serif, a role in small gold capitals. */
function lower(look, who, role) {
  const L = lookFrom(look), [c, ctx] = fresh();
  const x = 60, y = 1196;
  let size = 50;
  serif(ctx, 700, size);
  while (ctx.measureText(who).width > W - 240 && size > 34) { size -= 2; serif(ctx, 700, size); }
  const whoW = ctx.measureText(who).width;
  sans(ctx, 600, 21);
  const roleText = String(role || '').toUpperCase();
  const roleW = roleText ? trackedWidth(ctx, roleText, 21 * 0.2) : 0;
  const w = 30 + Math.max(whoW, roleW) + 34 + 10, h = 22 + size * 1.05 + (roleText ? 10 + 26 : 0) + 24;
  ctx.fillStyle = rgba(L.ground, 0.95); roundRect(ctx, x, y, w, h, 14); ctx.fill();
  ctx.strokeStyle = L.accent; ctx.lineWidth = 2; roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 13); ctx.stroke();
  ctx.save(); roundRect(ctx, x, y, w, h, 14); ctx.clip(); ctx.fillStyle = L.accent; ctx.fillRect(x, y, 10, h); ctx.restore();
  serif(ctx, 700, size); ctx.fillStyle = L.cream; ctx.textAlign = 'left';
  ctx.fillText(who, x + 40, y + 22 + size * 0.82);
  if (roleText) { sans(ctx, 600, 21); ctx.fillStyle = L.accent; tracked(ctx, roleText, x + 40, y + 22 + size * 1.05 + 10 + 19, 21 * 0.2); }
  return png(c);
}

/* One caption: cream on the deep ground, two lines at most, clear of the platform's buttons. */
function caption(look, text) {
  const L = lookFrom(look), [c, ctx] = fresh();
  sans(ctx, 600, 56);
  const lines = balanced(ctx, text, 840).slice(0, 3);
  const lh = 56 * 1.2, padX = 30, padY = 17;
  const widest = Math.max.apply(null, lines.map((l) => ctx.measureText(l).width));
  const bh = lines.length * lh + padY * 2, bottom = H - 404;
  ctx.fillStyle = rgba(L.deep, 0.9); roundRect(ctx, W / 2 - widest / 2 - padX, bottom - bh, widest + padX * 2, bh, 14); ctx.fill();
  ctx.fillStyle = L.cream; ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, bottom - bh + padY + 50 + i * lh));
  return png(c);
}

/* The end card: the site's share image, stacked for a vertical frame. Opaque. */
function end(look, opts) {
  const L = lookFrom(look), [c, ctx] = fresh();
  opts = opts || {};
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, L.ground); g.addColorStop(1, L.deep);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.88, H * 0.08, 0, W * 0.88, H * 0.08, H * 0.5);
  g.addColorStop(0, rgba(L.accent, 0.3)); g.addColorStop(1, rgba(L.accent, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  let y = 330;
  disc(ctx, L, W / 2, y + 165, 165, true);
  y += 330 + 74;
  if (L.eyebrow) {
    sans(ctx, 500, 38); ctx.fillStyle = L.accent;
    tracked(ctx, L.eyebrow.toUpperCase(), W / 2, y + 30, 38 * 0.45, 'center');
    y += 38 + 14;
  }
  /* The wordmark over two lines: WORTH & on the first, WEALTH on the second. */
  const amp = L.wordmark.indexOf('&');
  const rows = amp >= 0 && amp < L.wordmark.length - 1 ? [L.wordmark.slice(0, amp + 1), L.wordmark.slice(amp + 1)] : [L.wordmark];
  let size = 150;
  const rowW = (r, s) => wordmarkLine(ctx, Object.assign({}, L, { wordmark: r }), 0, 0, s, true);
  while (Math.max.apply(null, rows.map((r) => rowW(r, size))) > W - 160 && size > 80) size -= 4;
  ctx.textAlign = 'left';
  rows.forEach((r, i) => {
    const w = rowW(r, size);
    wordmarkLine(ctx, Object.assign({}, L, { wordmark: r }), (W - w) / 2, y + size * 0.82 + i * size * 0.98, size);
  });
  y += rows.length * size * 0.98 + 44;
  ctx.textAlign = 'center';
  italic(ctx, 600, 62); ctx.fillStyle = L.cream;
  const tag = L.tagline.split(/(?<=\.)\s+/).filter(Boolean).slice(0, 3);
  tag.forEach((l, i) => ctx.fillText(l, W / 2, y + 50 + i * 62 * 1.15));
  y += tag.length * 62 * 1.15 + 26;
  if (opts.sub) { sans(ctx, 500, 28); ctx.fillStyle = L.accent; tracked(ctx, opts.sub, W / 2, y + 24, 28 * 0.08, 'center'); y += 28 + 10; }
  if (opts.line) {
    y += 60;
    sans(ctx, 600, 38);
    const bw = ctx.measureText(opts.line).width + 108, bh = 96;
    ctx.strokeStyle = L.accent; ctx.lineWidth = 3; roundRect(ctx, (W - bw) / 2, y, bw, bh, bh / 2); ctx.stroke();
    ctx.fillStyle = L.cream; ctx.fillText(opts.line, W / 2, y + 61);
  }
  if (opts.small) {
    sans(ctx, 400, 25); ctx.fillStyle = rgba(L.cream, 0.82);
    const sl = wrap(ctx, opts.small, W - 220);
    sl.forEach((l, i) => ctx.fillText(l, W / 2, H - 210 - (sl.length - 1 - i) * 35));
  }
  return png(c);
}

module.exports = { bug, title, lower, caption, end, lookFrom, W, H };
