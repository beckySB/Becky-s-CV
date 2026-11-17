/* Choosing the clips.

   Claude reads the transcript of one long recording, as numbered sentences with their times,
   and picks the moments that stand on their own. It works under the brand's style guide (the
   voice brief the Studio sends) and the compliance rules, and it is held to an editorial
   standard: high end, warm and polished. It does not rewrite what was said. It chooses where
   each clip starts and stops, writes the hook, the caption and the review notes, and lists
   the words the transcription misheard so the captions read correctly.

   The answer comes back against a schema, and everything in it is checked before a frame is
   rendered: sentence numbers must exist, clips must be a sensible length, and nothing is
   trusted for timing except the transcript's own word times. */
'use strict';

const MODEL = 'claude-opus-5-5';
const MIN_SECONDS = 12, MAX_SECONDS = 95;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['clips', 'corrections', 'speakers'],
  properties: {
    clips: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'theme', 'hook', 'ranges', 'caption', 'flags', 'speaking'],
        properties: {
          title: { type: 'string', description: 'A short working title for the clip, six words at most.' },
          theme: { type: 'string', description: 'The content theme this clip belongs to, exactly as named in the list of themes. Two to four words.' },
          hook: { type: 'string', description: 'The line shown on screen for the first three seconds. Twelve words at most. Usually the strongest phrase actually said in the clip, lightly tidied.' },
          ranges: {
            type: 'array',
            description: 'One range of sentences, or two when a passage in the middle must be left out. In the order they were spoken.',
            items: {
              type: 'object', additionalProperties: false, required: ['from', 'to'],
              properties: { from: { type: 'integer', description: 'Number of the first sentence.' }, to: { type: 'integer', description: 'Number of the last sentence, inclusive.' } }
            }
          },
          caption: { type: 'string', description: 'The social caption to post with the clip, in the brand voice. Two to four short paragraphs.' },
          flags: { type: 'array', items: { type: 'string' }, description: 'What a person must check or approve before this clip is posted. Empty if nothing.' },
          speaking: { type: 'string', description: 'Who is speaking, if the transcript makes it clear. Otherwise an empty string.' }
        }
      }
    },
    corrections: {
      type: 'array',
      description: 'Words the transcription plainly misheard, for the burned-in captions.',
      items: {
        type: 'object', additionalProperties: false, required: ['heard', 'meant'],
        properties: { heard: { type: 'string', description: 'The words exactly as they appear in the transcript.' }, meant: { type: 'string', description: 'What was actually said.' } }
      }
    },
    speakers: { type: 'string', description: 'One line on who is in the recording and how sure you are, from the transcript alone.' }
  }
};

function systemPrompt(input) {
  const rules = (input.guardrails || []).map((g) => '- ' + g).join('\n');
  const themes = (input.themes || []).map((t) => '- ' + t.name + (t.job ? ': ' + t.job : '')).join('\n');
  return [
    'You are the video editor for ' + (input.brandName || 'this brand') + '. You are given the transcript of one long recording, as numbered sentences with times, and you choose the short vertical clips to cut from it for social media.',
    '',
    'THE STANDARD. High end, warm and polished. Every clip should feel like it came from a considered brand, never from a clip farm.',
    '- Choose moments with a complete thought: a clean opening line, one idea, and an ending that lands. Never start mid-sentence or on a filler word, and never end on a sentence that trails off.',
    '- Prefer warmth, a specific story, or one clear idea over volume. A clip that would make the right person feel seen is better than one that is merely energetic.',
    '- Leave out cross-talk, false starts, housekeeping and anything that only makes sense with what came before.',
    '- The hook is quiet confidence, not clickbait. No questions designed to bait, no "you won\'t believe", no capitals for emphasis, no exclamation marks. Use the strongest words actually spoken wherever you can.',
    '- Captions are short, generous and human. They open on the idea, not on the brand, and close on a small next step or the brand line. No hashtags unless the style guide asks for them.',
    '- Fewer, better clips beat more, weaker ones. If the recording does not hold the number asked for, return fewer.',
    '',
    'THE BRAND STYLE GUIDE. Follow it exactly, in the hook and the caption. It overrides your own habits.',
    input.voiceBrief || '(No style guide was supplied. Write plainly and warmly.)',
    '',
    themes ? 'THE CONTENT THEMES. Give each clip the one it serves best, by its exact name.\n' + themes + '\n' : '',
    'RULES. These are compliance rules, not style preferences.',
    rules || '- No financial, tax or legal advice. No product recommendations, performance claims or outcome guarantees.',
    '- Do not include a passage that recommends a specific product, promises an outcome, or gives advice about one person\'s situation. Cut around it with two ranges, or leave the moment out, and say so in flags.',
    '- Never invent anything. The hook and the caption may only say what the clip itself supports.',
    '- No em dashes or en dashes anywhere.',
    '',
    'WHAT TO FLAG. A person approves every clip before it is posted. Tell them what to look at:',
    '- A personal or family story, a health matter, or anyone named who is not a host: the person whose story it is must approve it.',
    '- Any mention of a product, an index, a market, a number or a result, even in passing.',
    '- Anything a regulator or the person speaking might read differently out of context.',
    '- Where you joined two ranges, say what was left out and why.',
    '',
    'HOW TO CUT',
    '- Each clip runs ' + MIN_SECONDS + ' to ' + MAX_SECONDS + ' seconds, and most should sit between 25 and 60. Use the sentence times to check.',
    '- Give ranges as sentence numbers, inclusive. One range per clip is normal. Use two only to leave a passage out.',
    '- Clips may not overlap each other by more than a sentence.',
    '- corrections: list words the transcription plainly misheard, such as a brand name, a person\'s name or a term of art, exactly as heard and as meant. Only where you are sure. These fix the on-screen captions; they never change the audio.',
    '- speaking: name a speaker only when the transcript makes it plain, for instance because they introduce themselves or are addressed by name. You cannot see the video, so never guess from style.'
  ].filter((l) => l !== '').join('\n');
}

function userPrompt(input) {
  const mmss = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  const lines = input.sentences.map((s) => '[' + s.id + '] ' + mmss(s.start) + ' to ' + mmss(s.end) + '  ' + s.text);
  return [
    'Recording: ' + (input.name || 'untitled') + ', ' + mmss(input.duration || 0) + ' long.',
    input.who ? 'On screen, left to right: ' + input.who + '.' : '',
    'Choose up to ' + input.count + ' clips.',
    input.direction ? 'Direction from the person who uploaded it: ' + input.direction : '',
    '',
    'TRANSCRIPT',
    lines.join('\n')
  ].filter((l, i) => l !== '' || i > 3).join('\n');
}

let Anthropic = null, jsonSchemaOutputFormat = null;
function sdk() {
  if (!Anthropic) {
    const m = require('@anthropic-ai/sdk');
    Anthropic = m.default || m;
    try { jsonSchemaOutputFormat = require('@anthropic-ai/sdk/helpers/json-schema').jsonSchemaOutputFormat || null; } catch (e) { jsonSchemaOutputFormat = null; }
  }
  return Anthropic;
}

const clean = (s, max) => String(s == null ? '' : s).replace(/[–—]/g, ', ').replace(/[ \t]+/g, ' ').trim().slice(0, max);

/* Hold the answer to the transcript: real sentence numbers, sensible lengths, in order. */
function validate(out, sentences, count) {
  const last = sentences.length - 1;
  const clips = [];
  (Array.isArray(out.clips) ? out.clips : []).forEach((c) => {
    const ranges = (Array.isArray(c.ranges) ? c.ranges : []).map((r) => ({ from: Math.round(Number(r.from)), to: Math.round(Number(r.to)) }))
      .filter((r) => r.from >= 0 && r.to <= last && r.to >= r.from)
      .sort((a, b) => a.from - b.from).slice(0, 3);
    /* Ranges that touch or overlap are one range. */
    const merged = [];
    ranges.forEach((r) => { const p = merged[merged.length - 1]; if (p && r.from <= p.to + 1) p.to = Math.max(p.to, r.to); else merged.push(r); });
    if (!merged.length) return;
    const seconds = merged.reduce((a, r) => a + (sentences[r.to].end - sentences[r.from].start), 0);
    if (seconds < MIN_SECONDS || seconds > MAX_SECONDS + 10) return;
    const hook = clean(c.hook, 110);
    if (!hook) return;
    clips.push({
      title: clean(c.title, 80) || hook, theme: clean(c.theme, 40), hook,
      ranges: merged, seconds,
      caption: String(c.caption || '').replace(/[–—]/g, ', ').trim().slice(0, 2200),
      flags: (Array.isArray(c.flags) ? c.flags : []).map((f) => clean(f, 400)).filter(Boolean).slice(0, 8),
      speaking: clean(c.speaking, 80)
    });
  });
  clips.sort((a, b) => a.ranges[0].from - b.ranges[0].from);
  const corrections = (Array.isArray(out.corrections) ? out.corrections : [])
    .map((x) => ({ heard: clean(x.heard, 80), meant: clean(x.meant, 80) }))
    .filter((x) => x.heard && x.meant && x.heard.toLowerCase() !== x.meant.toLowerCase()).slice(0, 60);
  return { clips: clips.slice(0, count), corrections, speakers: clean(out.speakers, 300) };
}

async function plan(input, opts) {
  opts = opts || {};
  if (!opts.client) sdk();
  const client = opts.client || new Anthropic();
  const format = opts.format || (jsonSchemaOutputFormat ? jsonSchemaOutputFormat(SCHEMA) : { type: 'json_schema', schema: SCHEMA });
  /* A plan for a long recording is a long answer, and the SDK insists a request that may run
     past ten minutes is streamed. The stream is gathered back into one message here. */
  const send = (params) => client.beta.messages.stream ? client.beta.messages.stream(params).finalMessage() : client.beta.messages.parse(params);
  const message = await send({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format },
    system: [{ type: 'text', text: systemPrompt(input), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt(input) }]
  });
  if (message.stop_reason === 'refusal') {
    const d = message.stop_details || {};
    throw Object.assign(new Error('The model declined this recording' + (d.explanation ? ': ' + d.explanation : '.')), { code: 'refusal' });
  }
  let out = message.parsed_output;
  if (!out) {
    const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    try { out = JSON.parse(text); } catch (e) { out = null; }
  }
  if (!out) throw Object.assign(new Error(message.stop_reason === 'max_tokens' ? 'The clip plan was cut off before it finished. Ask for fewer clips and try again.' : 'The clip plan did not come back in the expected shape. Try again.'), { code: 'shape' });
  const result = validate(out, input.sentences, input.count);
  if (!result.clips.length) throw Object.assign(new Error('No usable clips came back for this recording. It may be too short, or the transcript too thin.'), { code: 'empty' });
  const u = message.usage || {};
  return Object.assign(result, { model: message.model || MODEL, usage: { input: u.input_tokens || 0, output: u.output_tokens || 0 } });
}

module.exports = { plan, validate, systemPrompt, userPrompt, SCHEMA, MODEL, MIN_SECONDS, MAX_SECONDS };
