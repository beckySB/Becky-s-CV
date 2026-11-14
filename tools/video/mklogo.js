/* Writes the studio's horizontal logo files in the real lockup (as scripts/make-og.js in the
   womens-wealth- repo sets it): WOMEN in letterspaced gold, WORTH & WEALTH in bold uppercase
   Cormorant Garamond with a gold italic ampersand. Fonts are embedded so a canvas draws it. */
const fs = require('fs'); const { chromium } = require('playwright');
const root = '/home/user/Becky-s-CV/assets/';
const b64 = f => fs.readFileSync(root + 'fonts/' + f).toString('base64');
const fontCss = `@font-face{font-family:"WWW Cormorant";font-weight:500 700;src:url(data:font/woff2;base64,${b64('cormorant.woff2')}) format("woff2")}@font-face{font-family:"WWW Cormorant";font-style:italic;font-weight:500 700;src:url(data:font/woff2;base64,${b64('cormorant-italic.woff2')}) format("woff2")}@font-face{font-family:"WWW Sans";font-weight:400 600;src:url(data:font/woff2;base64,${b64('dm-sans.woff2')}) format("woff2")}`;
const leaves = (a, b, c) => `<path d="M62 8 C88 40 88 86 64 120 C42 88 40 44 62 8 Z" fill="${a}"/><path d="M8 60 C36 58 58 86 62 150 C30 138 8 104 8 60 Z" fill="${b}"/><path d="M112 76 C108 112 90 140 64 150 C70 112 86 86 112 76 Z" fill="${c}"/>`;
function svg(v, W) {
  const mark = v.disc
    ? `<circle cx="70" cy="70" r="66" fill="#fbf7f1"/><g transform="translate(38 20) scale(0.53)">${leaves('url(#wg)', '#123d32', 'url(#wo)')}</g>`
    : `<g transform="translate(14 7) scale(0.8)">${v.white ? leaves('#fff', '#fff', '#fff') : leaves('url(#wg)', '#123d32', 'url(#wo)')}</g>`;
  const x = v.disc ? 160 : 128;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 140" width="${W}" height="140" role="img" aria-label="Women Worth &amp; Wealth">
<title>Women Worth &amp; Wealth</title>
<defs><style>${fontCss}</style>
<linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9b46a"/><stop offset="1" stop-color="#a87c35"/></linearGradient>
<linearGradient id="wo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a08a4a"/><stop offset="1" stop-color="#5d5a2c"/></linearGradient></defs>
${mark}
<text x="${x + 3}" y="44" font-family="'WWW Sans', 'DM Sans', Arial, sans-serif" font-weight="500" font-size="20" letter-spacing="9" fill="${v.kicker}">WOMEN</text>
<text id="name" x="${x}" y="110" font-family="'WWW Cormorant', 'Cormorant Garamond', Georgia, serif" font-weight="700" font-size="66" fill="${v.word}">WORTH <tspan font-style="italic" font-weight="600" fill="${v.amp}">&amp;</tspan> WEALTH</text>
</svg>
`;
}
const V = {
  'www-logo-horizontal.svg': { word: '#123d32', amp: '#9a7330', kicker: '#7d5a1c' },
  'www-logo-horizontal-reverse.svg': { word: '#ffffff', amp: '#c9a86a', kicker: '#c9a86a', disc: true },
  'www-logo-horizontal-white.svg': { word: '#ffffff', amp: '#ffffff', kicker: '#ffffff', white: true }
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const widths = {};
  for (const [f, v] of Object.entries(V)) {
    await p.setContent(svg(v, 900)); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const bb = document.getElementById('name').getBBox(); return bb.x + bb.width; });
    widths[f] = Math.ceil(r + 12);
  }
  const W = Math.max(...Object.values(widths));   // one width, so one LOGO_RATIO serves all three
  for (const [f, v] of Object.entries(V)) fs.writeFileSync(root + 'brand/' + f, svg(v, W));
  console.log('width', W, widths);
  const u = f => 'data:image/svg+xml;base64,' + fs.readFileSync(root + 'brand/' + f).toString('base64');
  await p.setViewportSize({ width: W + 80, height: 560 });
  await p.setContent(`<body style="margin:0"><div style="padding:20px;background:#fbf7f1"><img src="${u('www-logo-horizontal.svg')}"></div><div style="padding:20px;background:#0c2e25"><img src="${u('www-logo-horizontal-reverse.svg')}"></div><div style="padding:20px;background:#123d32"><img src="${u('www-logo-horizontal-white.svg')}"></div></body>`);
  await p.waitForTimeout(800); await p.screenshot({ path: '/home/user/www-video/qa/logos.png' });
  await b.close();
})();
