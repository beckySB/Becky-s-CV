'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { caption, SCHEMA } = require('../lib/caption');

const IMG = { media_type: 'image/jpeg', data: 'AAAA' };
function client(msg, seen) {
  return { beta: { messages: { parse: async (p) => { seen.push(p); return msg; } } } };
}
const GOOD = {
  headline: 'Owners at the Metairie Business Expo', subhead: 'November 7, 2026, Pontchartrain Center', leadPhoto: 2,
  slideLines: ['a', 'b'], captions: { linkedin: 'L', instagram: 'I', facebook: 'F' }, hashtags: ['#Metairie'],
  firstComment: '', altText: ['x'], flags: ['Photo 2: a name badge is readable.']
};

test('photos go in order, labelled, with the details last; schema enforced', async () => {
  const seen = [];
  const r = await caption({ images: [IMG, IMG, IMG], details: { what: 'Expo', who: 'Jane Smith' }, voiceBrief: 'VOICE', guardrails: ['No forecasts.'] },
    { client: client({ stop_reason: 'end_turn', parsed_output: JSON.parse(JSON.stringify(GOOD)), usage: { input_tokens: 9, output_tokens: 3 } }, seen), format: { type: 'json_schema', schema: SCHEMA } });
  const p = seen[0];
  assert.strictEqual(p.model, 'claude-opus-5-5');
  assert.strictEqual(p.fallbacks, 'default');
  assert.strictEqual(p.output_config.format.type, 'json_schema');
  const c = p.messages[0].content;
  assert.deepStrictEqual(c.map((b) => b.type), ['text', 'image', 'text', 'image', 'text', 'image', 'text']);
  assert.strictEqual(c[0].text, 'Photo 0:');
  assert.match(c[6].text, /Jane Smith/);
  assert.match(p.system[0].text, /VOICE/);
  assert.match(p.system[0].text, /Never identify anyone from their face/);
  assert.match(p.system[0].text, /No forecasts\./);
  assert.strictEqual(r.result.leadPhoto, 2);
  assert.strictEqual(r.result.altText.length, 3, 'per-photo lists padded to the number of photos');
  assert.deepStrictEqual(r.result.slideLines, ['a', 'b', '']);
});

test('an out-of-range lead photo falls back to the first', async () => {
  const bad = Object.assign({}, GOOD, { leadPhoto: 9 });
  const r = await caption({ images: [IMG] }, { client: client({ stop_reason: 'end_turn', parsed_output: bad, usage: {} }, []), format: {} });
  assert.strictEqual(r.result.leadPhoto, 0);
});

test('refusal and a malformed answer are errors, not empty posts', async () => {
  await assert.rejects(caption({ images: [IMG] }, { client: client({ stop_reason: 'refusal', content: [], usage: {} }, []), format: {} }), (e) => e.code === 'refusal');
  await assert.rejects(caption({ images: [IMG] }, { client: client({ stop_reason: 'max_tokens', parsed_output: null, content: [{ type: 'text', text: '{"head' }], usage: {} }, []), format: {} }), (e) => e.code === 'shape' && /cut off/.test(e.message));
});
