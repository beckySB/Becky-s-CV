# Video clip pipeline

Cuts a long recording into branded vertical clips, the way the first test (the 11.13.26 launch
conversation) was done. Needs ffmpeg, Python 3, Node with Playwright, and Whisper for the transcript.

- `overlays.js` draws the overlays for one clip in the real Women Worth & Wealth identity: the logo
  badge that stays on screen, the hook band, the co-host card, the captions and the end card.
- `render.py` cuts the clip from the source, converts iPhone HDR to standard colour, and puts the
  overlays on top. Input is a clip file: source time ranges, the hook, and the timed captions.
- `mklogo.js` regenerates the logo files in `assets/brand`.

The paths at the top of each script point at the machine they were first run on. Change them
before running anywhere else. Transcripts and clip plans are not kept here, because they hold
what was said in the recordings.
