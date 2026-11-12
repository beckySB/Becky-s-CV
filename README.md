# William Martinez | CV

Static CV site for willmartnez.win, deployed with Cloudflare Workers (static assets).

- Site files live in `public/` (edit `public/index.html` for content, `public/styles.css` for design).
- `wrangler.jsonc` tells Cloudflare to serve `public/` and attach the custom domain.
- Every push to the connected branch triggers a Cloudflare build (`npx wrangler deploy`).
- "Download CV" uses the browser print dialog with a dedicated print layout (Save as PDF).
