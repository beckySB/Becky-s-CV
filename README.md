# 10kB2B — Greater New Orleans Business Collective

Website for 10kB2B, a group of established Greater New Orleans business owners. The group was founded by alumni of the Goldman Sachs 10,000 Small Businesses program, and members meet the **second Tuesday of every month at 11:30 AM** for lunch.

## Pages
| Page | Who can see it | What it does |
|---|---|---|
| **Home** `/` | Everyone | Hero with video loop, our focus, values, next meeting date, recent shout-outs |
| **About** `/about` | Everyone | Story (10,000 Small Businesses roots), how meetings work, values, "Inquire about visiting" form |
| **Member Directory** `/members` | Everyone | Searchable public bios & contact info. Members add/edit their own profiles (headshot upload) |
| **Shout-Outs** `/shoutouts` | Everyone views; members post | Events, testimonials and shout-outs, with filters |
| **Member Portal** `/portal` | Access code | Full roster with private cell and email, venue details, visitor inquiries, CSV roster download |

The default access code is `1011222`. Set the `PORTAL_CODE` environment variable to change it.

## Run locally
```bash
npm install
npm start          # http://localhost:3000
```

## Deploy to Railway
1. In Railway, choose **New Project → Deploy from GitHub repo** and pick this repo/branch.
2. **Add a Volume** to the service and mount it at `/data`. Without one, uploaded profiles and photos are erased on every redeploy.
3. Under **Variables**, set:
   - `DATA_DIR=/data`
   - `PORTAL_CODE=1011222` (or a new code)
   - `SESSION_SECRET=` any long random string
   - `MEETING_VENUE=` the restaurant name and address. Only members see this, in the portal.
4. Under **Settings → Networking**, choose **Generate Domain**. You can also add a custom domain there.

Railway detects Node automatically. `railway.json` sets the start command and a `/healthz` health check.

## Photos & video
Put a looping lunch-table video at `public/media/hero-loop.mp4` and it plays behind the homepage hero. Without it, the hero shows a slow-zoom stock photo. Other photos are set in `lib/config.js`. Swapping in real photos of members is recommended. See `public/media/README.md`.
