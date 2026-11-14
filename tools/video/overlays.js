/* Renders the branded overlay PNGs for one clip, in the real Women Worth & Wealth identity:
   the lockup from the site's share image (scripts/make-og.js in womens-wealth-): the leaf
   mark on a cream circle, WOMEN in letterspaced gold, WORTH & WEALTH in bold uppercase
   Cormorant with a gold italic ampersand, on the green ground with the gold glow.
   Usage: node overlays.js spec.json outdir */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STUDIO = '/home/user/Becky-s-CV/assets';
const SITE = '/home/user/womens-wealth-/assets';
const font = f => 'data:font/woff2;base64,' + fs.readFileSync(path.join(STUDIO, 'fonts', f)).toString('base64');
const mark = fs.readFileSync(path.join(SITE, 'logo.svg'), 'utf8').replace(/id="gold"/g, 'id="GOLDID"').replace(/id="olive"/g, 'id="OLIVEID"').replace(/url\(#gold\)/g, 'url(#GOLDID)').replace(/url\(#olive\)/g, 'url(#OLIVEID)');
const markN = n => mark.replace(/GOLDID/g, 'g' + n).replace(/OLIVEID/g, 'o' + n);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const css = `
@font-face{font-family:"DM Sans";font-weight:400 600;src:url(${font('dm-sans.woff2')}) format("woff2")}
@font-face{font-family:"Cormorant Garamond";font-weight:500 700;src:url(${font('cormorant.woff2')}) format("woff2")}
@font-face{font-family:"Cormorant Garamond";font-style:italic;font-weight:500 700;src:url(${font('cormorant-italic.woff2')}) format("woff2")}
:root{--green:#123d32;--deep:#0c2e25;--gold:#c9a86a;--cream:#f3ede2;--card:#fbf7f1}
*{box-sizing:border-box}
html,body{margin:0;width:1080px;height:1920px;background:transparent;overflow:hidden}
.layer{position:absolute;inset:0;display:none}
.on{display:block}
.sans{font-family:"DM Sans",sans-serif}
.serif{font-family:"Cormorant Garamond",serif}
.amp{color:var(--gold);font-style:italic;font-weight:600}

/* The corner bug: on screen for the whole clip. */
#bug .pill{position:absolute;left:54px;top:196px;display:flex;align-items:center;gap:18px;padding:12px 34px 12px 12px;
  background:rgba(12,46,37,.88);border:2px solid rgba(201,168,106,.85);border-radius:999px}
#bug .disc{width:92px;height:92px;border-radius:50%;background:var(--card);display:grid;place-items:center;flex:none}
#bug .disc svg{width:48px;height:auto}
#bug .eyebrow{font:500 17px "DM Sans";letter-spacing:.45em;text-transform:uppercase;color:var(--gold);line-height:1}
#bug .name{font:700 40px/1 "Cormorant Garamond";text-transform:uppercase;color:#fff;margin-top:6px;white-space:nowrap}

/* The hook, for the first three seconds. */
#title .band{position:absolute;left:0;right:0;top:350px;padding:44px 96px 50px;text-align:center;
  background:linear-gradient(180deg,rgba(18,61,50,.95),rgba(12,46,37,.95));border-top:3px solid var(--gold);border-bottom:3px solid var(--gold)}
#title .eyebrow{font:600 25px "DM Sans";letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}
#title .hook{font:700 78px/1.08 "Cormorant Garamond";color:var(--cream);margin-top:20px;text-wrap:balance}
.orn{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:26px}
.orn i{display:block;height:2px;width:120px;background:var(--gold)}
.orn b{display:block;width:12px;height:12px;background:var(--gold);transform:rotate(45deg)}

/* Who is speaking. */
#lower .card{position:absolute;left:60px;top:1196px;padding:22px 34px 24px 30px;background:rgba(18,61,50,.95);
  border:2px solid var(--gold);border-left:10px solid var(--gold);border-radius:14px}
#lower .who{font:700 50px/1.05 "Cormorant Garamond";color:var(--cream);white-space:nowrap}
#lower .role{font:600 21px "DM Sans";letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-top:10px;white-space:nowrap}

/* Captions. */
#cap .box{position:absolute;left:0;right:0;bottom:404px;display:flex;justify-content:center}
#cap .txt{max-width:900px;padding:16px 30px 18px;background:rgba(12,46,37,.9);border-radius:14px;
  font:600 56px/1.2 "DM Sans";color:var(--cream);text-align:center;text-wrap:balance}

/* The end card: the site's share image, stacked for vertical. */
#end{background:radial-gradient(ellipse at 88% 8%,rgba(201,168,106,.30),transparent 52%),linear-gradient(180deg,#123d32,#0c2e25)}
#end .col{position:absolute;left:0;right:0;top:330px;display:flex;flex-direction:column;align-items:center;text-align:center;color:var(--cream)}
#end .disc{width:330px;height:330px;border-radius:50%;background:var(--card);display:grid;place-items:center;box-shadow:0 14px 40px rgba(0,0,0,.28)}
#end .disc svg{width:172px;height:auto}
#end .eyebrow{font:500 38px "DM Sans";letter-spacing:.45em;text-transform:uppercase;color:var(--gold);margin-top:74px;padding-left:.45em}
#end .name{font:700 150px/.98 "Cormorant Garamond";text-transform:uppercase;color:#fff;margin-top:14px}
#end .headline{font:italic 600 62px/1.15 "Cormorant Garamond";margin-top:44px}
#end .sub{font:500 28px "DM Sans";letter-spacing:.08em;color:var(--gold);margin-top:26px}
#end .btn{margin-top:70px;padding:24px 54px;border:3px solid var(--gold);border-radius:999px;font:600 38px "DM Sans";color:var(--cream)}
#end .fine{position:absolute;left:110px;right:110px;bottom:210px;text-align:center;font:400 25px/1.4 "DM Sans";color:rgba(243,237,226,.82)}
`;

const page = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<div class="layer" id="bug"><div class="pill"><div class="disc">${markN(1)}</div><div><div class="eyebrow">Women</div><div class="name">Worth <span class="amp">&amp;</span> Wealth</div></div></div></div>
<div class="layer" id="title"><div class="band"><div class="eyebrow" id="t-eyebrow"></div><div class="hook" id="t-hook"></div><div class="orn"><i></i><b></b><i></i></div></div></div>
<div class="layer" id="lower"><div class="card"><div class="who" id="l-who"></div><div class="role" id="l-role"></div></div></div>
<div class="layer" id="cap"><div class="box"><div class="txt" id="c-txt"></div></div></div>
<div class="layer" id="end"><div class="col"><div class="disc">${markN(2)}</div><div class="eyebrow">Women</div>
  <div class="name">Worth <span class="amp">&amp;</span><br>Wealth</div><div class="headline">Own your worth.<br>Steward your wealth.</div>
  <div class="sub" id="e-sub"></div><div class="btn" id="e-btn"></div></div><div class="fine" id="e-fine"></div></div>`;

(async () => {
  const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const out = process.argv[3];
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await p.setContent(page);
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => Promise.all(['700 40px "Cormorant Garamond"', 'italic 600 40px "Cormorant Garamond"', '600 40px "DM Sans"', '500 40px "DM Sans"', '400 40px "DM Sans"'].map(f => document.fonts.load(f))));
  const shot = async (id, name, set) => {
    await p.evaluate(([id, set]) => {
      document.querySelectorAll('.layer').forEach(l => l.classList.toggle('on', l.id === id));
      for (const k in set) document.getElementById(k).textContent = set[k];
    }, [id, set || {}]);
    await p.screenshot({ path: path.join(out, name), omitBackground: true });
  };
  await shot('bug', 'bug.png');
  await shot('title', 'title.png', { 't-eyebrow': spec.theme || 'Women Worth & Wealth', 't-hook': spec.hook });
  await shot('lower', 'lower.png', { 'l-who': spec.lowerName, 'l-role': spec.lowerTitle });
  await shot('end', 'end.png', { 'e-sub': spec.endSub, 'e-btn': spec.endLine, 'e-fine': spec.endSmall });
  for (let i = 0; i < spec.cues.length; i++) await shot('cap', 'cap' + String(i).padStart(3, '0') + '.png', { 'c-txt': spec.cues[i].text });
  await b.close();
})();
