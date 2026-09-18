# Curriculum Vitae — Rebecca M. Gustafson

A single-page CV for **Rebecca M. Gustafson, CFP®**, Wealth Management Advisor
and principal of **Eternal Wealth Partners**.

It sits behind a shared access code, and it is built on the same design system
and the same narrative — the story, the
methodology and the five-year vision — as the advisor profile, with one
deliberate difference: **every practice financial has been removed.** No
revenue, no assets under management, no production or premium credit, no book
values, no client counts, no growth multiples. Those figures belong on
firm-specific paperwork that goes to one named recipient. This page is a
document meant to be handed to people and forwarded by them, so it carries none
of them.

That is the rule the file enforces, and it is worth keeping: if a figure of that
kind ever reappears in `assets/js/cv-data.js`, it is a mistake, not an update.

## What is on the page

| Section | What it holds |
| --- | --- |
| Profile | The story: who the clients are, how the work is framed, why a move |
| Credentials & licensing | Eleven designations, MSFP, FINRA licences, the thirteen-state footprint |
| Practice & experience | Career history, the practice, areas of specialisation, team |
| The Seven Pillars | The methodology, as a continuum rather than seven engagements |
| Recognition | Rankings, speaking and media, leadership and community |
| The next five years | The vision, stated as depth rather than as a growth target |
| Contact | Email, phone, city, CRD |

## Running it

No build step, no dependencies.

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

Data is loaded through `<script>` tags rather than `fetch`, so opening
`index.html` directly from the filesystem works too.

To produce a PDF, print the page. The print stylesheet drops the navigation and
the theme control, keeps everything else, and avoids breaking cards across
pages.

## Where the content lives

```
index.html                 page structure only — no content
assets/css/site.css        the visual system, on EWP brand tokens
assets/js/cv-data.js       the record: bio, credentials, practice, recognition, vision
assets/js/render.js        renders it
```

Nothing is hard-coded into the HTML. To update the CV, edit `cv-data.js`.

## Deploying to Railway

`server.js` is a dependency-free static server, `package.json` starts it, and
`railway.json` tells Railway how to build it and where to health check.

1. In Railway, choose **New Project → Deploy from GitHub repo**, and pick
   `beckySB/Becky-s-CV`.
2. Railway detects Node, runs `npm start`, and health checks `/healthz`.
3. Under **Settings → Networking**, click **Generate Domain**.

### The gate code

Visitors land on a branded gate page and type an access code. Everything is
behind it: the page, the stylesheet and both scripts. Only `/healthz` is open,
so the platform can still see the service is up.

The code is **built into `server.js`**. That is a deliberate trade — this
repository is private, so the code is readable only by someone who can already
see the source, and in exchange the gate works the moment the site deploys with
nothing to configure. Set `SITE_GATE_CODE` in the host environment to override
it without a commit.

**If this repository is ever made public, move the code to the environment the
same day.**

Rotating the code invalidates every existing session automatically: the cookie
carries an HMAC keyed by the code itself, so changing the code changes the
token and everyone is asked again.

What the gate is and is not: it is one shared code, which is the right weight
for handing a link to a few people. It is not per-person access control —
everyone uses the same code, and it cannot be revoked for one person without
changing it for all of them.

The server also sends `X-Robots-Tag: noindex` and a disallow-all `robots.txt`,
which keeps the page out of search results. That is separate from the gate and
does not substitute for it. Set `SITE_INDEXABLE=1` to allow indexing.
