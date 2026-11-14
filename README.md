# Women Worth & Wealth Content Studio

Outreach, content and community engagement for **Women Worth & Wealth**, the small group money and
worth program for women in New Orleans created and co-hosted by Amy Landry and Becky Gustafson.
Who to reach this week and what to say to them, everything the program publishes, and the notes
that carry a relationship between Wealth Wednesdays.

It is a copy of the EWP Content Studio with the same functionality, rebranded: the Women Worth &
Wealth logo, palette and type (taken from wealthandwisdom.biz), and a Women Worth & Wealth brand
record in `data/brands.json` written from the site's own copy, curriculum and build spec.

It is deliberately separate from the EWP studio. The program's rules say it stays apart from
Becky's advisory practice, so nothing it drafts names Eternal Wealth Partners, Northwestern Mutual
or a broker-dealer, and nothing is shared between the two except the code they started from.

## The brand

| What | Where it came from |
| --- | --- |
| Logo | `assets/brand/`: the three-leaf mark from the site, with the wordmark set in Cormorant Garamond (fonts embedded in each SVG, so it draws the same on a canvas). Colour, reverse and white versions. |
| Palette | Worth Green `#123d32` (primary), Deep Green `#0c2e25`, Wealth Gold `#c9a86a`, Gold Ink `#7d5a1c`, Cream `#fbf7f1`, Blush `#f5ebe4`, Ink `#1f2a26`. |
| Type | Cormorant Garamond, DM Sans and Allura, bundled in `assets/fonts` (all SIL Open Font License). |
| Voice | Warm, analytical, visionary. No em dashes. Educational only. Never "earn your worth". See the Style guide screen. |
| Content | 16 posts, 5 Reel scripts, 7 outreach sequences (sponsors, partner organisations, applicants, the launch party), 10 participant and social pieces, profile copy, and a 12 week calendar building to the Vision Board party and Session 1. |

The theme follows the brand: a colour marked `"primary": true` in the style guide drives the
buttons and accents, so the saturated Gold Ink cannot take over from Worth Green.

## Still carrying the EWP practice playbooks

These data files drive real screens and were kept so every feature works, but their content was
written for an advisory practice and should be rewritten for the program before anyone relies
on them:

- `data/experience.json` (Client experience: service tiers, the client year, scorecard)
- `data/coi.json` (the centre of influence lanes the board ranks: CPAs, attorneys)
- `data/growth.json` (people roles, life events; the segments are already rewritten for the program)
- `data/moments.json` (the moments playbook and gift guidance)
- `data/craft.json` (brand-neutral craft, though many examples speak to business owners)

## Running it

```bash
npm start                      # then visit http://localhost:3000
# or
python3 -m http.server 8000    # then visit http://localhost:8000
```

The content files load with `fetch`, so open it through a server rather than `file://`.
`node build-artifact.js` compiles the whole thing into one self contained HTML file.

## The week (the craft, shared with the EWP studio)

Three posting days, inside the window the research actually supports.

| Day | Role | Format |
| --- | --- | --- |
| Monday | Prepare. Write the week, submit it to review as one batch. | No post |
| Tuesday | The document | Native PDF carousel |
| Wednesday | The video | Under 90 seconds, vertical, captioned |
| Thursday | The live post | Text, written that week from something that happened |
| Friday | Engage and read the numbers | No post |

What that rests on, with sources shown in the app: Tuesday to Thursday is the peak window across
every large dataset, and weekend engagement falls 50 to 70 percent. Comments carry roughly 15
times the weight of a like and push a post into second and third degree feeds. Dwell time past
about 30 seconds widens distribution. The first 30 to 60 minutes sets the ceiling. Documents run
about 6.6 percent engagement against video's 5.6 to 5.9 and text's 2. Past five posts a week,
engagement per post falls 18 to 32 percent. And the largest single effect in the whole body of
research: accounts posting three times a week that replied in the first 90 minutes beat accounts
posting daily without it by 4.2 times on lead generation.

The app is equally clear about what does **not** hold up, because most posting advice is vendor
blogspam: the exact best hour is unreliable and varies with whose accounts were sampled, text's
low engagement rate understates its value per hour of effort, and engagement rate is not the goal
for this practice anyway.

Which format lands on which of the three days is production convenience, not evidence, and the
app says so.

## Video

Ten scripts, 25 to 90 seconds, each with its hook, shot notes and caption. Formats run from face
to camera through walk and talk to the two hander with a CPA or attorney, which is the strongest
collaboration play available: it puts you in front of their network with their endorsement
attached, and comments from their audience are what carries a post beyond your own connections.

One rule separates video from everything else here: **the script goes to review before the
shoot.** A written post that comes back marked up costs a rewrite. A recorded video that comes
back marked up costs a reshoot.

## Making it ahead of time

An eight stage pipeline with lead times, a monthly batch recording session that produces a
quarter of Wednesdays, and an honest read on scheduling: LinkedIn's own scheduler is free, breaks
no terms and hands credentials to nobody, which for a three post week is genuinely all you need.
Nothing schedules a comment, and nothing should.

## Brands, and the craft

The split that makes a second brand cheap:

**A brand owns** its identity, its voice principles, its banned words, its palette and fonts, its
content themes, its posts, its videos, its profile copy, its calendar, and its own board, queue
and imported reference. Switch brands and all of it swaps.

**The craft belongs to nobody** and lives in `data/craft.json`: what the platforms actually
reward, the shape of a working week, how video gets made, the comment archetypes, what can
honestly be automated, the production pipeline, and the compliance framework. None of it is about
who you are, so none of it is duplicated per brand.

A new brand starts with the craft's defaults for the things that are templates rather than copy:
the outreach sequences, the between-meetings pieces, the channel definitions and a six-theme
pillar scaffold to rename. Posts, videos and profile copy start empty, because those are the
brand's own words and nobody else's will do.

`assets/js/brand.js` resolves the active brand plus the craft into exactly the shape
`social.js` and `outreach.js` already expected, so neither of those modules knows a brand exists.
That is what kept the refactor small.

## The style guide

Build one on the Style guide screen, or paste one you already have. It tracks how much is filled
in, out of ten parts, because a half-built guide produces vaguer content rather than an error, and
that gap is otherwise invisible.

Upload a logo and the palette is read straight off the image in your own browser, on a canvas,
with no library and nothing uploaded anywhere. It quantises, drops the near-white and near-black
every logo is mostly made of, and keeps what is left by frequency. It is a shortcut past typing six
hex codes, not a design tool.

It deliberately does **not** try to parse a design-heavy PDF into fields. That fails quietly and
you would not know which fields were wrong. Paste the words instead.

Two documents come out of it, and they are the point of the screen:

- **The voice brief.** One page you hand a writer, an agency or an assistant so they can work in
  this voice without asking a question.
- **The Canva template spec.** Four templates with the exact data-field names, for whoever builds
  them.

## On Canva, video and scheduling

Deliberate positions rather than missing features.

**Canva.** Its API does not design a post from a brief. The real pattern is templates plus
autofill: the templates get built once, properly, with named data fields, and the API fills them.

The four Women Worth & Wealth templates are **not built yet**. The Style guide screen lists the
exact data-field names to build them with: carousel slide (`slide_text`), quote card (`quote`,
`attribution`), Reel cover (`hook_line`), image post (`image`, `headline`, `body`).

Wiring the studio itself to call Canva still waits for a backend to hold the OAuth secret. Until
then the autofill runs from an assistant session with the Canva connector attached.

**Video.** The studio holds the script, the shot list, the caption and the state. It does not edit
video, and it should not: CapCut and Descript already do trim, vertical crop and auto-captions
better than anything shipped here would, and Descript's captions beat gluing Whisper to ffmpeg.

**Scheduling.** Now built: see Publishing below. Nothing schedules a comment, and nothing should.

## Post from photos: the Celebration layout

For someone else's big day (a grand opening, an anniversary, an award), after you have been there.
The layout follows a congratulations graphic: the white logo, a small-caps lead ("Congratulations on your"), the occasion in gold script, a collage of
up to four photos with gold edges, who is being congratulated, two warm sentences, and a closing
line, on a deep version of the brand green. Every block of text shrinks together to fit, at 4:5,
square, story and wide. Write the post with Claude fills the words from the photos and the event
details; every field stays editable. Choosing "A client" shows a reminder that naming a client in
public needs their written consent on file.

The script is Allura (SIL Open Font License), the website's own, bundled in `assets/fonts` so it is always there
when the image is drawn.

## Publishing

Posts go to LinkedIn (your personal profile), the Women Worth & Wealth Facebook Page and its Instagram
professional account from the Publishing screen, on the weekly slots in `data/publishing.json`.

- Post from photos, Send to Publishing: the finished images (JPEG) and captions arrive as a draft.
- In Publishing, edit the text, pick a time or Next open slot, and approve. Approval is the
  sign-off: nothing posts without it, and Back to draft stops it.
- The server posts at that time, with the laptop closed. A failure on one platform does not stop
  the others; Post what is missing retries only those that failed. If the server restarts mid-post
  the post is held for a person to check, so nothing posts twice.
- Every attempt is in the publish log (Posted, Download the publish log): time, platform, link or
  error, who approved it, the exact text, and a SHA-256 of each image.

Railway variables (secrets go here, never in chat):

| Variable | What it is |
| --- | --- |
| `SITE_PASSWORD` | Required. Publishing never runs on an open site. |
| `SOCIAL_TOKEN_KEY` | Optional once a volume is attached: a key is made once and kept on the volume. Set it to use your own (40+ random characters); it seals the stored tokens with AES-256-GCM. Changing it means reconnecting. |
| `PUBLIC_URL` | The site's https address. Railway's `RAILWAY_PUBLIC_DOMAIN` is used if this is unset. |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | From a LinkedIn developer app with Sign In with LinkedIn using OpenID Connect and Share on LinkedIn. |
| `META_APP_ID`, `META_APP_SECRET` | From a Meta Business app with Facebook Login for Business and the Instagram API. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. From a Google Cloud OAuth client (Web application), for saving videos to Google Drive. |
| `LINKEDIN_VERSION` | Optional. The `LinkedIn-Version` header, default `202609`. LinkedIn retires versions after about a year; raise it if posts fail with a version error. |
| `META_GRAPH_VERSION` | Optional. Default `v25.0`. |

### Google Drive

Finished videos can be saved straight to Google Drive: Publishing, Connections, Connect Google
Drive, then Save to Google Drive on the Video editor after an export. The Studio asks for one
Drive permission (`drive.file`): it can see and change only the files it puts there itself, in a
folder it makes called Women Worth & Wealth Studio (`DRIVE_FOLDER_NAME` renames it). Saving is not
publishing; nothing is posted by it.

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Railway, from a Google Cloud OAuth client of
type Web application whose redirect URI is the site's address plus `/auth/google/callback`. The
Connections tab shows the exact address and walks through the consent screen. The sign-in is kept
sealed like the other connections and renews itself, so there is no expiry to watch.

Attach a Railway volume (mount path `/data`) so the queue and the log survive deploys; Railway
passes its path in `RAILWAY_VOLUME_MOUNT_PATH`. The Connections tab walks through all of it and
shows the exact redirect URLs to register with each platform.

Meta fetches images from a URL, so a post's JPEGs are served at an unguessable `/media/` link,
and only while that post is being published. Everything else sits behind the site password.
LinkedIn tokens last about 60 days and cannot be renewed automatically; the Studio warns ten days
ahead. The first comment is not posted automatically; it is shown on the post to add by hand.

## The board

It ranks the people standing next to the households the practice serves rather than a list
somebody rented, which means every suggestion arrives with a route in attached:

- Professionals on a client's team who are not in the network yet
- People around a household flagged as a likely household of their own
- Centre of influence lanes with nobody warm in them
- Warm COIs who have not been given a specific ask in months
- Recorded signals, which are a client touch first and the best moment in the year to ask for an introduction second

Accept one and it starts a sequence. The queue then says which step is due, merges what it knows,
and marks in red anything a person still has to fill in.

## Where its knowledge of the network comes from

The Operating System exports a contact and relationship extract, and this reads it. That extract
carries household and company names, the professional team, the people around each household,
centres of influence, recent signals, and the quarter's three priorities.

**It carries no financials.** Not revenue, margins, cash, debt, net worth, valuations, fees,
pillar notes or questionnaire answers. That is enforced on the exporting side by an allow list of
fields rather than by deleting things, so nothing new can leak in by accident.

In the Operating System: **Settings → Export for the Content Studio**. Here:
**Settings → Import an extract**. The flow is one way; nothing here writes back, and the Operating
System stays the source of truth. Re-import whenever it has moved on, which replaces rather than
merges.

Without an extract the site still publishes, and the board still works on anybody added by hand.
It just cannot see the network.

## Two rules it is built around

**It drafts, you send.** There is no bulk send button. LinkedIn has no API for direct messages,
connection requests, likes or comments, and the tools that do those things drive a browser against
the platform's terms, putting at risk the one account the whole referral network lives in. An
unreviewed message from a licensed advisor to a prospect is also precisely the communication that
draws regulatory attention. So the studio automates the decision and the draft, and a person
performs the send. The channel by channel position is on the Rules and training tab.

**Nothing here is approved.** Every public piece is advertising the moment a prospect can see it.
The studio drafts, the firm's review process decides, and posting happens after. Every client
facing piece carries that gate. The content names no broker-dealer, carrier or affiliate, so the
review process supplies them.

## Sending through Gmail

The email steps in a sequence can go out for real. The queue puts the drafted message into your
own Gmail drafts, addressed and subject lined, where you read it and press send yourself. There is
a Send it now, and an Open in my mail app fallback that needs no setup.

The site has no backend, so the browser talks to Gmail directly. The access token lives in memory
for the session and is never written to storage, and the only permission asked for is
`gmail.compose`, which drafts and sends. It cannot read a mailbox because it never asks to. Each
person connects their own mailbox: there is no shared sending account, because a message that says
it came from an advisor should have left that advisor's mailbox.

Settings carries the one time Google Cloud setup and shows the exact origin to authorise.

The server's content security policy names the three Google origins this needs and nothing else:
`accounts.google.com` for the sign-in script and the consent window, `oauth2.googleapis.com` for
the token, `gmail.googleapis.com` to write the draft. Remove any of them and Connect Gmail fails
silently, which is the worst way for it to fail.

## Moments

Client experience, Moments: when something big happens to a client, a center of influence or a
prospect, it shows up the same morning with how to respond.

- **The watch list** holds a name, a company, a city, the relationship (Tier 1, 2 or 3, COI or
  prospect) and whether to watch the company too. Nothing about anyone's money. Paste a Redtail
  export to add many at once.
- **Every morning after 6 AM Central** the server reads Google News for each name (with its
  company or city, last 14 days) and the local business press (Biz New Orleans, CityBusiness,
  Louisiana Illuminator). Anything already seen is not shown again. If nothing can be read, it
  retries in an hour. Read the news now runs it on demand.
- **Sorting.** With `ANTHROPIC_API_KEY` set, Claude reads each find to drop people who only share
  the name, pick the moment, and name the one specific detail a note should mention. Without it,
  keywords sort them, and sad or risky news always wins a tie, so a loss is never filed as a
  celebration.
- **Instagram.** With Instagram connected in Publishing, it also reads the recent posts of each
  contact's business or creator Instagram (the watch list's Instagram column), through the firm's
  own account, and every post that tags the firm. Everyday posts are ignored; only news makes an
  alert. Personal and private accounts cannot be read.
- **Gift limit.** Moments, Playbook: one firm-wide dollar limit per gift (or `GIFT_LIMIT` in
  Railway), engraving, framing and shipping included. It overrides the playbook ceilings, and drafts
  scale the gesture down to fit or recommend the note alone.
- **LinkedIn and personal Facebook** let no app read other people's posts. Add a screenshot of the
  post (or paste one, or its text) in Log one, Saw it on social media: it is read the same way (who, which moment, the detail to name),
  matched to the watch list, and nothing is stored.
- **The playbook** (`data/moments.json`): 19 moments (award, press, new role, contract or expansion,
  sale, business anniversary, retirement, philanthropy; a new baby or grandbaby, college
  acceptance or signing day, graduation, a child's achievement, a grown child's first job or home,
  a wedding or anniversary; loss, hardship, trouble; tagged the firm, mention). Kids and grandkids:
  the engraved rattle for a newborn, a hat or sweatshirt from the college, a note addressed to the
  young person passed on by the parent; never anything sent directly to a minor, and children's
  names are never searched. Each says what to do per tier and relationship, when, the gift (tied to the milestone
  occasions and their ceilings), lines to use and never use, the planning question for the next
  meeting, and what to log in Redtail. Sensitive moments never get a public comment.
- **Draft the note** writes the card, a call opener and (only where appropriate) a public comment
  in the house voice, with no contractions. Log one does the same for news heard in person and
  stores nothing.

Optional variables: `MOMENTS_SEARCH=off` reads only the local feeds and sends no names to Google;
`MOMENTS_SCAN_HOUR` changes the morning hour (Central). The watch list needs `SITE_PASSWORD`, and a
Railway volume to survive deploys. LinkedIn cannot be read; turn on LinkedIn's own notifications
for the same people. Dated occasions (birthdays, anniversaries) stay in Redtail's key date workflow.

## Where the data lives

The publishing queue, its images, the connections and the publish log, and the Moments watch list
and what it found, live on the server, under the Railway volume. Everything else lives in your own browser, under `www.studio.v1`. That is the people you are working, their sequence
state, what you have turned down, your settings, and the imported reference. Export on Settings
moves it to another machine.

## Repository layout

```
index.html            single page shell and hash router
assets/css/app.css    the visual system, in the Women Worth & Wealth palette and type
assets/js/store.js    this site's own storage, per brand, and the extract reader
assets/js/brand.js    the brand model, the style guide outputs, and the resolution layer
assets/js/shims.js    the few lookups the shared modules need
assets/js/social.js   filtering, merging and the calendar maths
assets/js/outreach.js the board, sequence state and the outreach merge
assets/js/mail.js     Gmail drafting and sending, straight from the browser
assets/js/views.js    every screen
assets/js/app.js      router, events and boot
assets/js/publish.js  the Publishing screen: queue, schedule, connections
lib/social/           the queue, scheduler, token sealing, and the LinkedIn, Meta and Google Drive clients
data/publishing.json  the weekly posting slots
assets/js/moments.js  the Moments screen: alerts, watch list, playbook, log one
lib/moments.js        the watch list, the morning news read, sorting and note drafting
data/moments.json     the moments playbook
data/brands.json      the shipped brand: Women Worth & Wealth
data/craft.json       what is true for any brand: the evidence, the week, video, production
data/practice.json    the audience classes every piece is routed through
data/coi.json         the centre of influence lanes
data/growth.json      segments and life event types
```

`social.js`, `outreach.js` and `mail.js` are shared with the Operating System's history and kept
identical in behaviour. `shims.js` supplies the handful of lookups they expect so neither has to
fork.
