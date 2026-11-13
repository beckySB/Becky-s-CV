/* Turns event photos and a few facts into a ready-to-review post: a headline for the
   image, captions for each platform, a line per carousel slide, alt text for every photo,
   and a list of things a reviewer should check before it goes out.

   Claude sees the photos, so it can say what is actually in them. It is told to use only
   what the advisor typed and what is visible: no invented names, numbers, quotes or
   outcomes. The answer comes back as structured fields against a schema, so nothing has
   to be guessed out of prose. */

'use strict';

const MODEL = 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'subhead', 'leadPhoto', 'slideLines', 'captions', 'hashtags', 'firstComment', 'altText', 'flags', 'celebration'],
  properties: {
    headline: { type: 'string', description: 'For the image itself. Eight words at most.' },
    subhead: { type: 'string', description: 'One short line for under the headline, usually the date and place.' },
    leadPhoto: { type: 'integer', description: 'Zero-based index of the strongest photo to lead with.' },
    slideLines: { type: 'array', items: { type: 'string' }, description: 'One short factual line per photo, in the order given, for carousel slides.' },
    captions: {
      type: 'object',
      additionalProperties: false,
      required: ['linkedin', 'instagram', 'facebook'],
      properties: {
        linkedin: { type: 'string' },
        instagram: { type: 'string' },
        facebook: { type: 'string' }
      }
    },
    hashtags: { type: 'array', items: { type: 'string' }, description: 'Three to five, for Instagram only.' },
    firstComment: { type: 'string', description: 'The link and any credits, for the first comment. Empty if there is no link.' },
    altText: { type: 'array', items: { type: 'string' }, description: 'One per photo, in the order given.' },
    flags: { type: 'array', items: { type: 'string' }, description: 'Anything a reviewer must check before posting.' },
    celebration: {
      type: 'object',
      additionalProperties: false,
      required: ['kicker', 'script', 'name', 'body', 'closing'],
      description: 'Text for the firm\'s congratulations graphic.',
      properties: {
        kicker: { type: 'string', description: 'A short lead-in above the script, such as "Congratulations on your".' },
        script: { type: 'string', description: 'The occasion in two to four words, for large script type, such as "Grand Opening" or "25 Years in Business".' },
        name: { type: 'string', description: 'Who is being congratulated, exactly as written in the details or on signage in the photos. Empty if not known.' },
        body: { type: 'string', description: 'Two sentences, 40 words at most, speaking to them directly.' },
        closing: { type: 'string', description: 'One short closing line.' }
      }
    }
  }
};

let Anthropic = null;
let jsonSchemaOutputFormat = null;
function sdk() {
  if (!Anthropic) {
    const m = require('@anthropic-ai/sdk');
    Anthropic = m.default || m;
    jsonSchemaOutputFormat = require('@anthropic-ai/sdk/helpers/json-schema').jsonSchemaOutputFormat;
  }
  return Anthropic;
}

function systemPrompt(voiceBrief, guardrails) {
  return [
    'You write social media posts from event photos for Women Worth & Wealth, an educational money and worth program for women in New Orleans, co-hosted by Amy Landry and Becky Gustafson.',
    'The posts show the program and its hosts taking part in their community and in the lives of the women they serve. They are warm, specific and short.',
    '',
    'THE BRAND VOICE. Follow it exactly.',
    voiceBrief,
    '',
    'RULES. These are compliance rules, not style preferences.',
    '- Use only the facts in the event details and what is plainly visible in the photos. Never invent a name, a number, a quote, an outcome or an attendance figure.',
    '- Never identify anyone from their face. Use a person\'s name only if it is given in the details.',
    '- No testimonials, no endorsements, and nothing that implies a person, company or organization pictured endorses the firm.',
    '- No mention of investment performance, products, insurance or fees. No urgency. The program is educational and gives no advice.',
    '- Never name Eternal Wealth Partners, Northwestern Mutual or any broker-dealer. Never tie a woman\'s worth to her income.',
    '- Thank hosts and organizers by name only where the details name them.',
    (guardrails || []).map((g) => '- ' + g).join('\n'),
    '',
    'WHAT TO WRITE',
    '- headline: for the image, eight words at most, no full stop needed.',
    '- subhead: one short line, usually the date and place.',
    '- leadPhoto: the index of the strongest photo to lead with, counting from 0.',
    '- slideLines: one short factual line per photo, in order, for a carousel.',
    '- captions.linkedin: 600 to 1,300 characters, written by the advisor in the first person. The first two lines must work alone as the hook. No hashtags and no links in the body.',
    '- captions.instagram: shorter and warmer. At most one emoji, never in the first line. Hashtags go in the hashtags field, not here.',
    '- captions.facebook: warm and short, for the firm\'s page.',
    '- hashtags: three to five, specific to the event or place, for Instagram only.',
    '- firstComment: the link from the details plus any credits, or an empty string.',
    '- altText: one plain description per photo, in order, naming no one unless the details give the name.',
    '- celebration: the words for a congratulations graphic, for when the event is someone else\'s milestone (an opening, an anniversary, an award). kicker and script read together, as in "Congratulations on your" then "Grand Opening". name is who is being congratulated, taken from the details or from signage plainly readable in the photos, never guessed. body is two sentences, 40 words at most, said to them, about what the photos actually show. closing is one short line from the firm. If the event is the firm\'s own, fill these as best fits.',
    '- If the post or graphic names someone as a client of the firm, add a flag that their written consent to be named is needed.',
    '- flags: anything a reviewer must check. Always flag recognizable people (consent needed), children, readable documents, screens or whiteboards, another company\'s branding, and anything that could read as an endorsement. Say which photo.'
  ].join('\n');
}

function detailsText(d) {
  const lines = [
    'EVENT DETAILS, as typed by the advisor:',
    'What it was: ' + (d.what || ''),
    'When: ' + (d.when || ''),
    'Where: ' + (d.where || ''),
    'Who was there, and who to thank: ' + (d.who || ''),
    'What happened: ' + (d.happened || ''),
    'Why it matters: ' + (d.why || ''),
    'Link: ' + (d.link || 'none'),
    'Platforms: ' + ((d.platforms && d.platforms.length) ? d.platforms.join(', ') : 'LinkedIn, Instagram, Facebook')
  ];
  if (d.advisor) lines.push('The advisor writing in the first person is ' + d.advisor + '.');
  return lines.join('\n');
}

async function caption(input, opts) {
  opts = opts || {};
  if (!opts.client) sdk();
  const client = opts.client || new Anthropic();
  const format = opts.format || (jsonSchemaOutputFormat ? jsonSchemaOutputFormat(SCHEMA) : { type: 'json_schema', schema: SCHEMA });

  const content = [];
  input.images.forEach((img, i) => {
    content.push({ type: 'text', text: 'Photo ' + i + ':' });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  });
  content.push({ type: 'text', text: detailsText(input.details || {}) });

  const message = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format },
    system: [{ type: 'text', text: systemPrompt(input.voiceBrief || '', input.guardrails), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }]
  });

  if (message.stop_reason === 'refusal') {
    const d = message.stop_details || {};
    const err = new Error('The model declined this request' + (d.explanation ? ': ' + d.explanation : '.'));
    err.code = 'refusal';
    throw err;
  }
  let out = message.parsed_output;
  if (!out) {
    const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    try { out = JSON.parse(text); } catch (e) { out = null; }
  }
  if (!out) {
    const err = new Error(message.stop_reason === 'max_tokens' ? 'The answer was cut off before it finished. Try again with fewer photos.' : 'The answer did not come back in the expected shape. Try again.');
    err.code = 'shape';
    throw err;
  }

  /* Keep the per-photo lists aligned with the photos, whatever came back. */
  const n = input.images.length;
  const fit = (arr) => Array.from({ length: n }, (_, i) => (Array.isArray(arr) && typeof arr[i] === 'string') ? arr[i] : '');
  out.altText = fit(out.altText);
  out.slideLines = fit(out.slideLines);
  if (!(out.leadPhoto >= 0 && out.leadPhoto < n)) out.leadPhoto = 0;
  const u = message.usage || {};
  return { model: message.model || MODEL, result: out, usage: { input: u.input_tokens || 0, output: u.output_tokens || 0 } };
}

module.exports = { caption, SCHEMA, systemPrompt, detailsText, MODEL };
