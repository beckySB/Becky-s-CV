/* Builds the single-file Content Studio from the same sources as the site.
   Usage: node build-artifact.js [outfile]  */
const fs = require('fs');
const path = require('path');

const out = process.argv[2] || 'dist/www-content-studio.html';
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');

const files = ['craft', 'brands', 'practice', 'coi', 'growth', 'news', 'experience', 'publishing', 'moments'];
const DATA = {};
files.forEach(f => { DATA[f] = JSON.parse(read(`data/${f}.json`)); });

const shell = read('index.html')
  .replace(/[\s\S]*<body>/, '')
  .replace(/<script[\s\S]*/, '')
  .replace(/<\/body>[\s\S]*/, '')
  .trim();

const html = `<title>Worth & Wealth Studio</title>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<style>
${read('assets/css/app.css').replace(/url\("\.\.\/fonts\/([^"]+)"\)/g, (m, f) => 'url("data:font/woff2;base64,' + fs.readFileSync(path.join(__dirname, 'assets/fonts', f)).toString('base64') + '")')}
</style>

${shell}

<script>window.STUDIO_DATA = ${JSON.stringify(DATA)};
window.STUDIO_ASSETS = ${JSON.stringify({
  logoColor: 'data:image/svg+xml;base64,' + Buffer.from(read('assets/brand/www-logo-horizontal.svg')).toString('base64'),
  logoWhite: 'data:image/svg+xml;base64,' + Buffer.from(read('assets/brand/www-logo-horizontal-white.svg')).toString('base64'),
  logoReverse: 'data:image/svg+xml;base64,' + Buffer.from(read('assets/brand/www-logo-horizontal-reverse.svg')).toString('base64')
})};</script>
<script>${read('assets/js/store.js')}</script>
<script>${read('assets/js/brand.js')}</script>
<script>${read('assets/js/shims.js')}</script>
<script>${read('assets/js/views.js')}</script>
<script>${read('assets/js/social.js')}</script>
<script>${read('assets/js/outreach.js')}</script>
<script>${read('assets/js/mail.js')}</script>
<script>${read('assets/js/newsroom.js')}</script>
<script>${read('assets/js/videoedit.js')}</script>
<script>${read('assets/js/experience.js')}</script>
<script>${read('assets/js/postmaker.js')}</script>
<script>${read('assets/js/publish.js')}</script>
<script>${read('assets/js/moments.js')}</script>
<script>${read('assets/js/app.js')}</script>
`;

fs.mkdirSync(path.dirname(path.join(__dirname, out)), { recursive: true });
fs.writeFileSync(path.join(__dirname, out), html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB');
