/* The video editor: take a recording, make it ready to post.

   Trim it, frame it for the platform, put the captions on, add the brand's title card,
   lower third and end card, and export a finished file. Everything happens in this
   browser. The video is never uploaded anywhere, which matters for a recording that may
   have a client's office or a whiteboard in the background.

   How it works: the recording plays into a canvas, the canvas draws the brand on top, and
   the browser records the canvas and the audio together. That is why an export takes as
   long as the video runs, and why the tab has to stay in front while it does.

   Captions come from the script the Studio already wrote, timed across the clip by word
   count, or from a transcript file (.srt or .vtt) for exact timing. Most of these videos
   are recorded from a Studio script, so most of the time the captions already exist. */
(function (global) {
  'use strict';

  var FORMATS = {
    '9:16': { w: 1080, h: 1920, label: 'Vertical 9:16', use: 'Reels, TikTok, Shorts, LinkedIn mobile' },
    '4:5':  { w: 1080, h: 1350, label: 'Portrait 4:5', use: 'LinkedIn and Instagram feed' },
    '1:1':  { w: 1080, h: 1080, label: 'Square 1:1', use: 'Any feed' },
    '16:9': { w: 1920, h: 1080, label: 'Wide 16:9', use: 'YouTube, website, presentations' }
  };

  var VE = {
    url: '', name: '', size: 0, duration: 0, vw: 0, vh: 0,
    start: 0, end: 0,
    format: '9:16', quality: 1080, focusX: 0.5, focusY: 0.5,
    captionsOn: true, captionMode: 'auto', captionText: '', timedCues: [], captionSize: 1,
    titleOn: true, hook: '', titleDur: 3,
    lowerOn: true, lowerName: '', lowerTitle: '', lowerAt: 1, lowerDur: 5,
    endOn: true, endLine: '', endSmall: '', endDur: 3,
    guides: true, scriptTitle: '',
    playing: false, previewT: 0,
    exporting: false, progress: 0, outUrl: '', outName: '', outType: '', error: '',
    mountedIn: null, audio: null, brandSeeded: false
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(id) { return document.getElementById(id); }
  function brand() { return global.Store && global.Store.activeBrand ? global.Store.activeBrand() : null; }
  function toast(m) { if (global.App && global.App.toast) global.App.toast(m); }
  function fmt(t) {
    t = Math.max(0, t || 0);
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function clipLen() { return Math.max(0, VE.end - VE.start); }
  function totalLen() { return clipLen() + (VE.endOn ? VE.endDur : 0); }

  /* ---------------- brand ---------------- */

  function hexRgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgba(hex, a) { var c = hexRgb(hex) || [0, 0, 0]; return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function palette() {
    var b = brand();
    var vis = (b && b.visual) || {};
    var t = global.Brand && global.Brand.themeFor && b ? global.Brand.themeFor(b) : null;
    var ground = t ? t.light.brand : '#1d4d43';
    var cols = (vis.colors || []).filter(function (c) { return hexRgb(c.hex); });
    var accent = cols.find(function (c) { return /gold/i.test(c.name || ''); });
    if (!accent) {
      accent = cols.slice().sort(function (a, b2) {
        var x = hexRgb(a.hex), y = hexRgb(b2.hex);
        return (y[0] + y[1] + y[2]) - (x[0] + x[1] + x[2]);
      }).find(function (c) { var x = hexRgb(c.hex); return Math.max.apply(null, x) - Math.min.apply(null, x) > 18; });
    }
    return {
      ground: ground,
      accent: accent ? accent.hex : '#DBCE99',
      gradFrom: vis.gradient && hexRgb(vis.gradient.from) ? vis.gradient.from : ground,
      gradTo: vis.gradient && hexRgb(vis.gradient.to) ? vis.gradient.to : ground,
      name: (b && b.name) || ''
    };
  }

  function seedFromBrand() {
    if (VE.brandSeeded) return;
    var b = brand();
    if (!b) return;
    var id = b.identity || {};
    var news = global.DATA && global.DATA.news;
    VE.lowerName = VE.lowerName || id.attributionShort || id.advisor || '';
    VE.lowerTitle = VE.lowerTitle || id.title || '';
    VE.endLine = VE.endLine || id.website || '';
    VE.endSmall = VE.endSmall || (news && news.disclosure ? news.disclosure.split('. ')[0] + '.' : '');
    VE.brandSeeded = true;
  }

  /* ---------------- captions ---------------- */

  function cleanScript(s) {
    return String(s || '').replace(/\[[^\]]*\]/g, ' ').replace(/\{\{[^}]*\}\}/g, '').replace(/[ \t]+/g, ' ')
      .split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join('\n');
  }

  /* Short lines read on a phone. Break at sentence ends first, then every seven words or so. */
  function chunk(text) {
    var out = [];
    String(text || '').split('\n').forEach(function (line) {
      line.split(/(?<=[.?!:;])\s+/).forEach(function (sentence) {
        var words = sentence.split(/\s+/).filter(Boolean);
        if (!words.length) return;
        var size = words.length <= 9 ? words.length : Math.ceil(words.length / Math.ceil(words.length / 7));
        for (var i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(' '));
      });
    });
    return out;
  }

  function autoCues() {
    var lines = VE.captionText.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var span = clipLen();
    if (!lines.length || span <= 0) return [];
    var weights = lines.map(function (l) { return Math.max(2, l.split(/\s+/).length); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var lead = Math.min(0.3, span * 0.02), usable = Math.max(0.5, span - lead - 0.2);
    var t = lead;
    return lines.map(function (l, i) {
      var d = usable * weights[i] / total;
      var cue = { start: t, end: t + d, text: l };
      t += d;
      return cue;
    });
  }

  /* Imported cues are timed against the original recording. Shift them onto the trimmed
     clip and drop anything that falls outside it. */
  function cues() {
    if (VE.captionMode === 'timed') {
      return VE.timedCues.map(function (c) { return { start: c.start - VE.start, end: c.end - VE.start, text: c.text }; })
        .filter(function (c) { return c.end > 0 && c.start < clipLen(); });
    }
    return autoCues();
  }

  function parseTime(s) {
    var m = String(s).trim().match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/);
    if (!m) return NaN;
    return (parseInt(m[1] || '0', 10) * 3600) + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + parseInt((m[4] + '00').slice(0, 3), 10) / 1000;
  }
  function parseSubs(text) {
    var out = [];
    String(text || '').replace(/\r/g, '').split(/\n\s*\n/).forEach(function (block) {
      var lines = block.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var ti = lines.findIndex(function (l) { return l.indexOf('-->') >= 0; });
      if (ti < 0) return;
      var parts = lines[ti].split('-->');
      var a = parseTime(parts[0]), b = parseTime(parts[1]);
      var txt = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim();
      if (!isNaN(a) && !isNaN(b) && b > a && txt) out.push({ start: a, end: b, text: txt });
    });
    return out;
  }

  /* ---------------- drawing ---------------- */

  function size() {
    var f = FORMATS[VE.format];
    var k = VE.quality === 720 ? (720 / Math.min(f.w, f.h)) : 1;
    return { w: Math.round(f.w * k / 2) * 2, h: Math.round(f.h * k / 2) * 2 };
  }

  function wrap(ctx, text, maxW) {
    var words = String(text || '').split(/\s+/).filter(Boolean), lines = [], line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function drawFrame(ctx, W, H, video) {
    var P = palette();
    ctx.fillStyle = P.ground;
    ctx.fillRect(0, 0, W, H);
    if (!video || !VE.vw) return;
    var target = W / H, src = VE.vw / VE.vh, sw, sh;
    if (src > target) { sh = VE.vh; sw = sh * target; } else { sw = VE.vw; sh = sw / target; }
    var sx = (VE.vw - sw) * VE.focusX, sy = (VE.vh - sh) * VE.focusY;
    try { ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H); } catch (e) { /* frame not ready */ }
  }

  function drawTitle(ctx, W, H, t) {
    if (!VE.titleOn || !VE.hook || t > VE.titleDur) return;
    var P = palette();
    var alpha = Math.min(1, Math.max(0, (VE.titleDur - t) / 0.4), t / 0.25 + 0.4);
    var fs = Math.round(Math.min(W, H) * (W < H ? 0.066 : 0.058));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '500 ' + fs + 'px "Cormorant Garamond", Georgia, serif';
    var lines = wrap(ctx, VE.hook, W * 0.8);
    var lh = fs * 1.18, pad = fs * 0.8;
    var boxH = lines.length * lh + pad * 2;
    var y = W < H ? H * 0.14 : H * 0.12;
    ctx.fillStyle = rgba(P.ground, 0.9);
    ctx.fillRect(0, y, W, boxH);
    ctx.fillStyle = P.accent;
    ctx.fillRect(W * 0.1, y + boxH - Math.max(3, H * 0.003), W * 0.8, Math.max(3, H * 0.003));
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach(function (l, i) { ctx.fillText(l, W / 2, y + pad + i * lh); });
    ctx.restore();
  }

  function drawLower(ctx, W, H, t) {
    if (!VE.lowerOn || !VE.lowerName) return;
    var rel = t - VE.lowerAt;
    if (rel < 0 || rel > VE.lowerDur) return;
    var P = palette();
    var inT = Math.min(1, rel / 0.35), outT = Math.min(1, (VE.lowerDur - rel) / 0.35);
    var k = Math.min(inT, outT);
    var base = Math.min(W, H);
    var nameFs = Math.round(base * 0.042), titleFs = Math.round(base * 0.028);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.font = '600 ' + nameFs + 'px "DM Sans", Arial, sans-serif';
    var nw = ctx.measureText(VE.lowerName).width;
    ctx.font = '400 ' + titleFs + 'px "DM Sans", Arial, sans-serif';
    var tw = VE.lowerTitle ? ctx.measureText(VE.lowerTitle).width : 0;
    var padX = base * 0.03, padY = base * 0.022, bar = Math.max(6, base * 0.008);
    var boxW = Math.max(nw, tw) + padX * 2 + bar;
    var boxH = nameFs * 1.2 + (VE.lowerTitle ? titleFs * 1.4 : 0) + padY * 2;
    var x = W * 0.06 - (1 - inT) * W * 0.04;
    var y = (W < H ? H * 0.6 : H * 0.66);
    ctx.fillStyle = rgba(P.ground, 0.94);
    ctx.fillRect(x, y, boxW, boxH);
    ctx.fillStyle = P.accent;
    ctx.fillRect(x, y, bar, boxH);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '600 ' + nameFs + 'px "DM Sans", Arial, sans-serif';
    ctx.fillText(VE.lowerName, x + bar + padX, y + padY);
    if (VE.lowerTitle) {
      ctx.font = '400 ' + titleFs + 'px "DM Sans", Arial, sans-serif';
      ctx.fillStyle = rgba('#ffffff', 0.86);
      ctx.fillText(VE.lowerTitle, x + bar + padX, y + padY + nameFs * 1.25);
    }
    ctx.restore();
  }

  function drawCaption(ctx, W, H, t, list) {
    if (!VE.captionsOn) return;
    var c = list.find(function (q) { return t >= q.start && t < q.end; });
    if (!c) return;
    var P = palette();
    var base = Math.min(W, H);
    var fs = Math.round(base * (W < H ? 0.052 : 0.042) * VE.captionSize);
    ctx.save();
    ctx.font = '600 ' + fs + 'px "DM Sans", Arial, sans-serif';
    var lines = wrap(ctx, c.text, W * 0.82);
    var lh = fs * 1.22, padX = fs * 0.5, padY = fs * 0.28;
    /* On vertical video the bottom fifth is under the platform's buttons and caption. */
    var bottom = W < H ? H * 0.79 : H * 0.9;
    var top = bottom - lines.length * lh - padY * 2;
    var widest = Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l).width; }));
    ctx.fillStyle = rgba(P.ground, 0.86);
    roundRect(ctx, W / 2 - widest / 2 - padX, top, widest + padX * 2, lines.length * lh + padY * 2, fs * 0.25);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach(function (l, i) { ctx.fillText(l, W / 2, top + padY + i * lh + fs * 0.06); });
    ctx.restore();
  }

  function drawEnd(ctx, W, H, t) {
    var P = palette();
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.gradFrom); g.addColorStop(1, P.gradTo);
    ctx.save();
    ctx.globalAlpha = Math.min(1, t / 0.3);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    var base = Math.min(W, H);
    var fs = Math.round(base * 0.07);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 ' + fs + 'px "Cormorant Garamond", Georgia, serif';
    var name = (P.name || '').toUpperCase();
    var lines = wrap(ctx, name, W * 0.84);
    var cy = H * 0.42 - (lines.length - 1) * fs * 0.6;
    lines.forEach(function (l, i) { ctx.fillText(l, W / 2, cy + i * fs * 1.2); });
    var ruleY = cy + lines.length * fs * 1.2 - fs * 0.2;
    ctx.fillStyle = P.accent;
    ctx.fillRect(W / 2 - base * 0.09, ruleY, base * 0.18, Math.max(3, base * 0.005));
    if (VE.endLine) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '500 ' + Math.round(base * 0.036) + 'px "DM Sans", Arial, sans-serif';
      ctx.fillText(VE.endLine, W / 2, ruleY + base * 0.07);
    }
    if (VE.endSmall) {
      var sf = Math.round(base * 0.022);
      ctx.font = '400 ' + sf + 'px "DM Sans", Arial, sans-serif';
      ctx.fillStyle = rgba('#ffffff', 0.82);
      var sl = wrap(ctx, VE.endSmall, W * 0.8);
      sl.forEach(function (l, i) { ctx.fillText(l, W / 2, H * 0.88 - (sl.length - 1 - i) * sf * 1.35); });
    }
    ctx.restore();
  }

  function drawGuides(ctx, W, H) {
    if (W >= H) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.setLineDash([12, 10]);
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.05, H * 0.1, W * 0.9, H * 0.7);
    ctx.restore();
  }

  /* One function draws both the preview and the export, so what you see is what you get. */
  function render(ctx, W, H, t, video, forExport, list) {
    if (VE.endOn && t >= clipLen()) {
      drawEnd(ctx, W, H, t - clipLen());
      return;
    }
    drawFrame(ctx, W, H, video);
    drawTitle(ctx, W, H, t);
    drawLower(ctx, W, H, t);
    drawCaption(ctx, W, H, t, list || cues());
    if (!forExport && VE.guides) drawGuides(ctx, W, H);
  }

  /* ---------------- preview ---------------- */

  var raf = 0;
  function canvas() { return $('ve-canvas'); }
  function video() { return $('ve-video'); }

  function sizeCanvas() {
    var c = canvas(); if (!c) return;
    var s = size();
    if (c.width !== s.w || c.height !== s.h) { c.width = s.w; c.height = s.h; }
    c.style.aspectRatio = s.w + ' / ' + s.h;
  }

  function paint() {
    var c = canvas(), v = video();
    if (!c) return;
    sizeCanvas();
    var t = VE.playing && v && !v.paused ? v.currentTime - VE.start : VE.previewT;
    render(c.getContext('2d'), c.width, c.height, t, v, false);
    var lab = $('ve-time');
    if (lab) lab.textContent = fmt(t) + ' / ' + fmt(totalLen());
    var sc = $('ve-scrub');
    if (sc && VE.playing) sc.value = String(t);
  }

  function loop() {
    var v = video();
    if (VE.playing && v) {
      if (v.currentTime >= VE.end || v.ended) {
        v.pause();
        VE.playing = false;
        VE.previewT = clipLen();
        setPlayLabel();
      }
    }
    paint();
    raf = VE.playing ? requestAnimationFrame(loop) : 0;
  }

  function setPlayLabel() { var b = $('ve-play'); if (b) b.textContent = VE.playing ? 'Pause' : 'Play'; }

  function ensureAudio() {
    var v = video();
    if (!v) return null;
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    if (!VE.audio) VE.audio = { ctx: new Ctx(), el: null };
    var A = VE.audio;
    if (A.el !== v) {
      A.src = A.ctx.createMediaElementSource(v);
      A.speakers = A.ctx.createGain();
      A.rec = A.ctx.createMediaStreamDestination();
      A.src.connect(A.speakers); A.speakers.connect(A.ctx.destination);
      A.src.connect(A.rec);
      A.el = v;
    }
    return A;
  }

  function play() {
    var v = video(); if (!v || !VE.url) return;
    var A = ensureAudio();
    if (A && A.ctx.state === 'suspended') A.ctx.resume();
    if (A) A.speakers.gain.value = 1;
    var t = VE.previewT;
    if (t >= clipLen() - 0.05) t = 0;
    v.currentTime = VE.start + t;
    VE.playing = true;
    setPlayLabel();
    v.play().then(function () { if (!raf) raf = requestAnimationFrame(loop); }).catch(function () { VE.playing = false; setPlayLabel(); });
  }
  function pause() {
    var v = video(); if (v) v.pause();
    if (v) VE.previewT = Math.max(0, v.currentTime - VE.start);
    VE.playing = false;
    setPlayLabel();
    paint();
  }

  function seekPreview(t) {
    VE.previewT = Math.max(0, Math.min(totalLen(), t));
    var v = video();
    if (v && VE.url && VE.previewT < clipLen()) {
      v.currentTime = VE.start + VE.previewT;
      v.addEventListener('seeked', paint, { once: true });
    }
    paint();
  }

  /* ---------------- loading a file ---------------- */

  function load(file) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) { toast('That is not a video file.'); return; }
    if (VE.url) URL.revokeObjectURL(VE.url);
    if (VE.outUrl) { URL.revokeObjectURL(VE.outUrl); VE.outUrl = ''; }
    VE.url = URL.createObjectURL(file);
    VE.name = file.name.replace(/\.[^.]+$/, '');
    VE.size = file.size;
    VE.error = '';
    VE.playing = false;
    var v = video();
    v.src = VE.url;
    v.addEventListener('loadedmetadata', function () {
      VE.duration = v.duration || 0;
      VE.vw = v.videoWidth; VE.vh = v.videoHeight;
      VE.start = 0; VE.end = VE.duration; VE.previewT = 0;
      if (VE.vw > VE.vh && VE.format === '9:16') { /* keep the choice, but say so */ }
      panel();
      v.currentTime = 0.05;
    }, { once: true });
    v.addEventListener('seeked', paint);
    v.addEventListener('error', function () {
      VE.error = 'This browser cannot play that file. Phones often record HEVC (H.265), which most desktop browsers outside Safari cannot decode. Export it as H.264 MP4 from the phone or try Safari.';
      panel();
    }, { once: true });
  }

  /* ---------------- export ---------------- */

  /* H.264 in MP4 is what LinkedIn and Instagram accept. Ask for it by codec, because a
     browser can say yes to plain "video/mp4" and then put VP9 inside it, which looks like
     an MP4 and gets rejected on upload. Plain MP4 is the last resort, and the result is
     labelled by what was actually recorded, not by what was asked for. */
  function pickType() {
    var types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1.4D401F,mp4a.40.2',
                 'video/mp4;codecs=avc1,mp4a', 'video/mp4;codecs=avc1',
                 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    if (!global.MediaRecorder) return '';
    for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    return '';
  }
  function describe(actual) {
    var a = String(actual || '').toLowerCase();
    var container = a.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
    var h264 = /avc1|h264/.test(a);
    var codec = h264 ? 'H.264' : /vp9|vp09/.test(a) ? 'VP9' : /vp8/.test(a) ? 'VP8' : /av01|av1/.test(a) ? 'AV1' : '';
    var aac = /mp4a|aac/.test(a);
    var audio = aac ? 'AAC' : /opus/.test(a) ? 'Opus' : '';
    return { container: container, h264: h264, codec: codec, aac: aac, audio: audio };
  }

  function slug(s) { return String(s || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'video'; }

  function exportVideo() {
    var v = video(), c = canvas();
    if (!v || !VE.url || VE.exporting) return;
    if (!c.captureStream) { VE.error = 'This browser cannot record a canvas. Use a current Chrome, Edge or Safari.'; panel(); return; }
    var type = pickType();
    if (!type) { VE.error = 'This browser has no video recorder. Use a current Chrome, Edge or Safari.'; panel(); return; }

    pause();
    VE.exporting = true; VE.progress = 0; VE.error = '';
    if (VE.outUrl) { URL.revokeObjectURL(VE.outUrl); VE.outUrl = ''; }
    panel();
    sizeCanvas();
    var W = c.width, H = c.height, ctx = c.getContext('2d');
    var list = cues();
    var stream = c.captureStream(30);
    var A = ensureAudio();
    if (A) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      A.speakers.gain.value = 0;
      A.rec.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
    }
    var chunks = [];
    var rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: VE.quality === 720 ? 5000000 : 9000000, audioBitsPerSecond: 160000 });
    } catch (e) {
      VE.exporting = false; VE.error = 'The recorder would not start: ' + e.message; panel(); return;
    }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      var info = describe(rec.mimeType || type);
      var blobType = info.container === 'mp4' ? 'video/mp4' : 'video/webm';
      var blob = new Blob(chunks, { type: blobType });
      VE.outUrl = URL.createObjectURL(blob);
      VE.outType = blobType;
      VE.outCodec = [info.codec, info.audio].filter(Boolean).join(' with ') || '';
      VE.outRecorded = rec.mimeType || type;
      /* Ready means what the platforms actually take: H.264 video and AAC audio in MP4. */
      VE.outReady = info.container === 'mp4' && info.h264 && info.aac;
      VE.outName = slug(VE.scriptTitle || VE.name) + '-' + VE.format.replace(':', 'x') + (info.container === 'mp4' ? '.mp4' : '.webm');
      VE.outSize = blob.size;
      VE.exporting = false;
      VE.progress = 1;
      if (A) A.speakers.gain.value = 1;
      panel();
      toast('Export ready');
    };

    var endStarted = 0;
    function frame() {
      if (!VE.exporting) return;
      var t;
      if (!endStarted) {
        t = v.currentTime - VE.start;
        if (v.currentTime >= VE.end - 0.02 || v.ended) {
          v.pause();
          if (VE.endOn) { endStarted = performance.now(); t = clipLen(); }
          else { rec.stop(); return; }
        }
      }
      if (endStarted) {
        var e = (performance.now() - endStarted) / 1000;
        t = clipLen() + e;
        if (e >= VE.endDur) { render(ctx, W, H, t, v, true, list); rec.stop(); return; }
      }
      render(ctx, W, H, t, v, true, list);
      VE.progress = Math.min(0.999, t / totalLen());
      var bar = $('ve-progress'); if (bar) bar.style.width = (VE.progress * 100).toFixed(1) + '%';
      requestAnimationFrame(frame);
    }

    v.currentTime = VE.start;
    v.addEventListener('seeked', function go() {
      rec.start(500);
      v.play().then(function () { requestAnimationFrame(frame); }).catch(function (e) {
        VE.exporting = false; VE.error = 'Playback would not start: ' + e.message; try { rec.stop(); } catch (x) {} panel();
      });
    }, { once: true });
  }

  function saveCover() {
    var c = canvas(); if (!c) return;
    var off = document.createElement('canvas');
    off.width = c.width; off.height = c.height;
    var t = VE.playing ? video().currentTime - VE.start : VE.previewT;
    render(off.getContext('2d'), off.width, off.height, t, video(), true);
    off.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = slug(VE.scriptTitle || VE.name || 'cover') + '-cover-' + VE.format.replace(':', 'x') + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  }

  /* ---------------- scripts to caption from ---------------- */

  function scripts() {
    var out = [];
    var b = brand();
    ((b && b.videos) || []).forEach(function (v) { if (v.script) out.push({ id: 'b:' + v.id, title: v.name, hook: v.hook, script: v.script }); });
    var n = global.DATA && global.DATA.news;
    ((n && n.briefings) || []).forEach(function (x) { out.push({ id: 'n:' + x.id, title: 'Newsroom: ' + x.title, hook: x.video.hook, script: x.video.script }); });
    if (VE.presetScript) out.unshift(VE.presetScript);
    return out;
  }

  function useScript(s) {
    if (!s) return;
    VE.captionText = chunk(cleanScript(s.script)).join('\n');
    VE.captionMode = 'auto';
    VE.hook = s.hook || VE.hook;
    VE.scriptTitle = s.title || '';
  }

  /* ---------------- the panel ---------------- */

  function num(name, val, step, min, max) {
    return '<input type="number" data-ve="' + name + '" value="' + (Math.round(val * 10) / 10) + '" step="' + (step || 0.1) + '"' +
      (min != null ? ' min="' + min + '"' : '') + (max != null ? ' max="' + max + '"' : '') + ' style="width:90px">';
  }
  function check(name, on, label) {
    return '<label class="check-row" style="margin:0"><input type="checkbox" data-ve="' + name + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }

  function panel() {
    var host = $('ve-panel'); if (!host) return;
    seedFromBrand();
    var has = !!VE.url;
    var list = has ? cues() : [];
    var sc = scripts();
    var mb = VE.size ? (VE.size / 1048576).toFixed(1) + ' MB' : '';
    var outMb = VE.outSize ? (VE.outSize / 1048576).toFixed(1) + ' MB' : '';
    host.innerHTML =
      (VE.error ? '<div class="callout alert" style="margin-bottom:12px">' + esc(VE.error) + '</div>' : '') +

      '<div class="card"><h3 style="margin-top:0">1. The clip</h3>' +
      (has ? '<p class="small" style="margin-top:0"><strong>' + esc(VE.name) + '</strong> <span class="muted">' + fmt(VE.duration) + ', ' + VE.vw + '×' + VE.vh + ', ' + mb + '</span></p>' +
        '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' +
        '<label class="field" style="margin:0"><span class="field-l">Start (s)</span>' + num('start', VE.start, 0.1, 0, VE.duration) + '</label>' +
        '<label class="field" style="margin:0"><span class="field-l">End (s)</span>' + num('end', VE.end, 0.1, 0, VE.duration) + '</label>' +
        '<button class="btn btn-sm" data-ve="mark-start">Start at playhead</button><button class="btn btn-sm" data-ve="mark-end">End at playhead</button></div>' +
        '<p class="tiny muted" style="margin:8px 0 0">Trimmed length ' + fmt(clipLen()) + '. Cut the first breath and the last "so, yeah". The first three seconds decide whether anyone watches.</p>'
        : '<p class="small muted" style="margin:0">Choose a recording on the left. MP4 or MOV from a phone works, as long as it is H.264.</p>') +
      '</div>' +

      '<div class="card"><h3 style="margin-top:0">2. Where it is going</h3><div class="row" style="gap:6px;flex-wrap:wrap">' +
      Object.keys(FORMATS).map(function (k) {
        return '<button class="btn btn-sm' + (VE.format === k ? ' btn-primary' : '') + '" data-ve="format" data-v="' + k + '" title="' + esc(FORMATS[k].use) + '">' + esc(FORMATS[k].label) + '</button>';
      }).join('') + '</div><p class="tiny muted" style="margin:6px 0 10px">' + esc(FORMATS[VE.format].use) + '.</p>' +
      '<div class="row" style="gap:14px;flex-wrap:wrap">' +
      '<label class="field" style="margin:0;flex:1;min-width:150px"><span class="field-l">Frame left to right</span><input type="range" min="0" max="1" step="0.01" data-ve="focusX" value="' + VE.focusX + '"></label>' +
      '<label class="field" style="margin:0;flex:1;min-width:150px"><span class="field-l">Frame top to bottom</span><input type="range" min="0" max="1" step="0.01" data-ve="focusY" value="' + VE.focusY + '"></label></div>' +
      '<div class="row" style="gap:14px;margin-top:8px;flex-wrap:wrap">' + check('guides', VE.guides, 'Show the safe area in the preview') +
      '<label class="field" style="margin:0"><span class="field-l">Export size</span><select data-ve="quality"><option value="1080"' + (VE.quality === 1080 ? ' selected' : '') + '>Full HD</option><option value="720"' + (VE.quality === 720 ? ' selected' : '') + '>720p, faster upload</option></select></label></div></div>' +

      '<div class="card"><h3 style="margin-top:0">3. Captions</h3>' + check('captionsOn', VE.captionsOn, 'Burn captions into the video') +
      '<p class="tiny muted" style="margin:6px 0 10px">Most social video is watched with the sound off. Captions are not optional.</p>' +
      '<label class="field"><span class="field-l">Start from a script</span><select data-ve="script"><option value="">Choose a script the Studio wrote…</option>' +
      sc.map(function (s) { return '<option value="' + esc(s.id) + '"' + (VE.scriptTitle === s.title ? ' selected' : '') + '>' + esc(s.title) + '</option>'; }).join('') + '</select></label>' +
      (VE.captionMode === 'timed'
        ? '<p class="small">Using ' + VE.timedCues.length + ' timed captions from your transcript file' +
          (has && list.length !== VE.timedCues.length ? ', ' + list.length + ' of them inside the trimmed clip' : '') + '. <button class="btn btn-ghost btn-sm" data-ve="untimed">Switch back to the script</button></p>'
        : '<label class="field"><span class="field-l">One caption per line, timed across the clip by length</span><textarea data-ve="captionText" rows="7">' + esc(VE.captionText) + '</textarea></label>') +
      '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><label class="btn btn-sm" style="cursor:pointer">Import a transcript (.srt or .vtt)<input type="file" accept=".srt,.vtt,text/vtt" data-ve="subs" hidden></label>' +
      '<label class="field" style="margin:0"><span class="field-l">Caption size</span><select data-ve="captionSize">' +
      [[0.85, 'Smaller'], [1, 'Standard'], [1.15, 'Larger']].map(function (o) { return '<option value="' + o[0] + '"' + (VE.captionSize === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label></div>' +
      (list.length ? '<p class="tiny muted" style="margin:10px 0 4px">' + list.length + ' captions. The first few:</p><table class="table"><tbody>' +
        list.slice(0, 4).map(function (q) { return '<tr><td class="tiny" style="white-space:nowrap">' + fmt(q.start) + ' to ' + fmt(q.end) + '</td><td class="small">' + esc(q.text) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      '<p class="tiny muted" style="margin:8px 0 0">Script timing is an estimate. If you went off script, record captions on your phone or with any transcription tool and import the .srt for exact timing.</p></div>' +

      '<div class="card"><h3 style="margin-top:0">4. The brand on it</h3>' +
      check('titleOn', VE.titleOn, 'Hook on screen at the start') +
      '<div class="row" style="gap:8px;margin:6px 0 12px;align-items:flex-end;flex-wrap:wrap"><label class="field" style="margin:0;flex:1;min-width:220px"><span class="field-l">Hook</span><input type="text" data-ve="hook" value="' + esc(VE.hook) + '"></label>' +
      '<label class="field" style="margin:0"><span class="field-l">Seconds</span>' + num('titleDur', VE.titleDur, 0.5, 1, 8) + '</label></div>' +
      check('lowerOn', VE.lowerOn, 'Name and title, lower third') +
      '<div class="row" style="gap:8px;margin:6px 0 12px;align-items:flex-end;flex-wrap:wrap"><label class="field" style="margin:0;flex:1;min-width:180px"><span class="field-l">Name</span><input type="text" data-ve="lowerName" value="' + esc(VE.lowerName) + '"></label>' +
      '<label class="field" style="margin:0;flex:1;min-width:180px"><span class="field-l">Title</span><input type="text" data-ve="lowerTitle" value="' + esc(VE.lowerTitle) + '"></label>' +
      '<label class="field" style="margin:0"><span class="field-l">From (s)</span>' + num('lowerAt', VE.lowerAt, 0.5, 0) + '</label>' +
      '<label class="field" style="margin:0"><span class="field-l">For (s)</span>' + num('lowerDur', VE.lowerDur, 0.5, 1, 15) + '</label></div>' +
      check('endOn', VE.endOn, 'End card') +
      '<div class="row" style="gap:8px;margin-top:6px;align-items:flex-end;flex-wrap:wrap"><label class="field" style="margin:0;flex:1;min-width:180px"><span class="field-l">Line</span><input type="text" data-ve="endLine" value="' + esc(VE.endLine) + '"></label>' +
      '<label class="field" style="margin:0"><span class="field-l">Seconds</span>' + num('endDur', VE.endDur, 0.5, 1, 8) + '</label></div>' +
      '<label class="field" style="margin-top:8px"><span class="field-l">Small print on the end card</span><input type="text" data-ve="endSmall" value="' + esc(VE.endSmall) + '"></label>' +
      '<p class="tiny muted" style="margin:6px 0 0">Colours come from the active brand: the ground, the accent rule and the end card gradient. Type is the Studio\'s web fonts, the nearest available to the brand faces.</p></div>' +

      '<div class="card"><h3 style="margin-top:0">5. Export</h3>' +
      (VE.exporting
        ? '<p class="small">Recording. This runs in real time, so a 60 second video takes about 60 seconds. Keep this tab in front until it finishes.</p><div class="ve-bar"><i id="ve-progress" style="width:' + (VE.progress * 100).toFixed(1) + '%"></i></div>'
        : '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-ve="export"' + (has ? '' : ' disabled') + '>Export the video</button>' +
          '<button class="btn" data-ve="cover"' + (has ? '' : ' disabled') + '>Save this frame as a cover image</button></div>') +
      (VE.outUrl ? '<div class="callout ' + (VE.outReady ? 'brand' : 'warn') + '" style="margin-top:12px">' +
        '<a class="btn btn-primary btn-sm" href="' + esc(VE.outUrl) + '" download="' + esc(VE.outName) + '">Download ' + esc(VE.outName) + '</a> <span class="tiny muted">' + outMb +
        (VE.outCodec ? ', ' + esc(VE.outCodec) : '') + '</span>' +
        (VE.outReady ? '<p class="tiny" style="margin:8px 0 0">H.264 video and AAC audio in MP4, ready for LinkedIn, Instagram and YouTube.</p>'
          : '<p class="tiny" style="margin:8px 0 0">This browser recorded ' + esc(VE.outCodec || 'an unconfirmed format') + '. YouTube accepts it. LinkedIn and Instagram expect H.264 video with AAC audio and may reject this on upload. ' +
            'Export from current Google Chrome, Edge or Safari on a Mac or PC, which record that combination.</p>') + '</div>' : '') +
      '<p class="tiny muted" style="margin:10px 0 0">Nothing leaves this computer. The video is read, edited and written in this browser.</p></div>';
  }

  function setNum(key, v) {
    v = parseFloat(v);
    if (isNaN(v)) return;
    if (key === 'start') { VE.start = Math.max(0, Math.min(v, VE.end - 0.5)); seekPreview(0); }
    else if (key === 'end') { VE.end = Math.min(VE.duration, Math.max(v, VE.start + 0.5)); seekPreview(Math.min(VE.previewT, clipLen())); }
    else VE[key] = Math.max(0, v);
  }

  /* ---------------- mounting ---------------- */

  function view() {
    return '<div class="page-head"><div><div class="page-eyebrow">Content Studio</div><h1>Edit a video for posting</h1>' +
      '<p class="lede">Trim it, frame it for the platform, caption it from the script you recorded, put the brand on it, and export. All in this browser.</p></div></div>' +
      '<div id="ve-root" class="ve-grid">' +
      '<div class="ve-stage card">' +
      '<div class="ve-canvas-wrap" id="ve-drop"><canvas id="ve-canvas" width="1080" height="1920"></canvas>' +
      '<label class="ve-pick" id="ve-pick"><span>Drop a recording here, or <u>choose a file</u></span><input type="file" accept="video/*,.mov,.mp4,.m4v,.webm" data-ve="file" hidden></label></div>' +
      '<video id="ve-video" playsinline preload="auto" crossorigin="anonymous" style="display:none"></video>' +
      '<div class="row" style="gap:8px;align-items:center;margin-top:10px">' +
      '<button class="btn btn-sm" id="ve-play" data-ve="play">Play</button>' +
      '<input type="range" id="ve-scrub" data-ve="scrub" min="0" step="0.01" value="0" style="flex:1">' +
      '<span class="tiny muted" id="ve-time" style="min-width:92px;text-align:right">0:00.0 / 0:00.0</span></div>' +
      '<div class="row" style="gap:8px;margin-top:8px"><label class="btn btn-ghost btn-sm" style="cursor:pointer">Choose a different recording<input type="file" accept="video/*,.mov,.mp4,.m4v,.webm" data-ve="file" hidden></label></div>' +
      '</div><div id="ve-panel"></div></div>';
  }

  function mount() {
    var root = $('ve-root');
    if (!root || VE.mountedIn === root) return;
    VE.mountedIn = root;
    VE.playing = false;
    var v = video();
    if (VE.url) {
      v.src = VE.url;
      v.addEventListener('loadedmetadata', function () { v.currentTime = VE.start + VE.previewT; }, { once: true });
      v.addEventListener('seeked', paint);
    }
    $('ve-pick').style.display = VE.url ? 'none' : '';
    var drop = $('ve-drop');
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('is-over');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) { load(f); $('ve-pick').style.display = 'none'; }
    });
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    if (global.document.fonts && global.document.fonts.load) {
      Promise.all([document.fonts.load('600 40px "DM Sans"'), document.fonts.load('600 40px "Cormorant Garamond"')]).then(paint, paint);
    }
    panel();
    scrubRange();
    paint();
  }

  function scrubRange() { var s = $('ve-scrub'); if (s) { s.max = String(totalLen() || 0); s.value = String(VE.previewT); } }

  function onClick(e) {
    var el = e.target.closest('[data-ve]');
    if (!el) return;
    var k = el.dataset.ve;
    if (k === 'play') { if (VE.playing) pause(); else play(); }
    else if (k === 'format') { VE.format = el.dataset.v; panel(); paint(); }
    else if (k === 'mark-start') { var v = video(); setNum('start', VE.playing ? v.currentTime : VE.start + VE.previewT); panel(); scrubRange(); }
    else if (k === 'mark-end') { var v2 = video(); setNum('end', VE.playing ? v2.currentTime : VE.start + VE.previewT); panel(); scrubRange(); }
    else if (k === 'export') exportVideo();
    else if (k === 'cover') saveCover();
    else if (k === 'untimed') { VE.captionMode = 'auto'; panel(); paint(); }
  }

  function onInput(e) {
    var el = e.target.closest('[data-ve]');
    if (!el) return;
    var k = el.dataset.ve;
    if (k === 'scrub') { if (VE.playing) pause(); seekPreview(parseFloat(el.value)); }
    else if (k === 'focusX' || k === 'focusY') { VE[k] = parseFloat(el.value); paint(); }
    else if (k === 'captionText' || k === 'hook' || k === 'lowerName' || k === 'lowerTitle' || k === 'endLine' || k === 'endSmall') { VE[k] = el.value; paint(); }
  }

  function onChange(e) {
    var el = e.target.closest('[data-ve]');
    if (!el) return;
    var k = el.dataset.ve;
    if (k === 'file') { var f = el.files && el.files[0]; if (f) { load(f); $('ve-pick').style.display = 'none'; } el.value = ''; return; }
    if (k === 'subs') {
      var sf = el.files && el.files[0];
      if (!sf) return;
      sf.text().then(function (txt) {
        var list = parseSubs(txt);
        if (!list.length) { toast('No captions found in that file.'); return; }
        VE.timedCues = list; VE.captionMode = 'timed'; panel(); paint();
        toast(list.length + ' captions imported');
      });
      el.value = '';
      return;
    }
    if (k === 'script') {
      var s = scripts().find(function (x) { return x.id === el.value; });
      useScript(s); panel(); paint(); return;
    }
    if (el.type === 'checkbox') { VE[k] = el.checked; panel(); scrubRange(); paint(); return; }
    if (k === 'quality') { VE.quality = parseInt(el.value, 10); panel(); paint(); return; }
    if (k === 'captionSize') { VE.captionSize = parseFloat(el.value); paint(); return; }
    if (el.type === 'number') { setNum(k, el.value); panel(); scrubRange(); paint(); return; }
    if (k === 'captionText') { panel(); }
  }

  /* The newsroom hands over a script, so the editor opens ready to caption it. */
  function preset(s) {
    if (!s) return;
    VE.presetScript = { id: 'preset', title: s.title || 'From the newsroom', hook: s.hook, script: s.script };
    useScript(VE.presetScript);
  }

  global.VideoEdit = {
    view: view, mount: mount, preset: preset,
    busy: function () { return VE.exporting; },
    _state: VE, _parseSubs: parseSubs, _chunk: chunk, _cleanScript: cleanScript, _autoCues: autoCues
  };
})(window);
