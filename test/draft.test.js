'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { draft, splitSections, shape } = require('../lib/draft');

const OUT = [
  '=== ARTICLE ===', 'TITLE: The credit line got cheaper', 'Body paragraph.', '',
  '=== LINKEDIN ===', 'Hook line.', '',
  '=== CAROUSEL ===', 'Slide 1: First', 'Slide 2: Second', '',
  '=== VIDEO ===', 'HOOK: Your line of credit', 'SECONDS: 55', 'SCRIPT: Line one.', 'Line two.', '',
  '=== EMAIL ===', 'SUBJECT: Rates', 'Hi {{first}},', 'Note.', '',
  '=== FACTS ===', '- The Fed held rates | Federal Reserve | https://www.federalreserve.gov/a.htm | Nov 5, 2026',
  '- Made up | Nowhere | https://example.com/x | 2026', '',
  '=== UNKNOWNS ===', 'The next meeting.', '',
  '=== REVIEW NOTES ===', 'Check the date.'
].join('\n');

test('sections parse into a content pack', () => {
  const p = shape(splitSections(OUT));
  assert.strictEqual(p.article.title, 'The credit line got cheaper');
  assert.strictEqual(p.article.body, 'Body paragraph.');
  assert.deepStrictEqual(p.carousel, ['First', 'Second']);
  assert.strictEqual(p.video.seconds, 55);
  assert.strictEqual(p.video.script, 'Line one.\nLine two.');
  assert.strictEqual(p.email.subject, 'Rates');
  assert.strictEqual(p.facts.length, 2);
});

function client(responses, seen) {
  return { beta: { messages: { stream(params) {
    seen.push(JSON.parse(JSON.stringify(params)));
    const r = responses.shift();
    return { finalMessage: async () => r };
  } } } };
}

const searchBlock = { type: 'web_search_tool_result', tool_use_id: 't1', content: [
  { type: 'web_search_result', url: 'https://www.federalreserve.gov/a.htm', title: 'FOMC statement', page_age: null, encrypted_content: 'x' }
] };
const citedText = { type: 'text', text: OUT, citations: [
  { type: 'web_search_result_location', url: 'https://www.federalreserve.gov/a.htm', title: 'FOMC statement', cited_text: 'decided to maintain', encrypted_index: 'e' }
] };

test('pause_turn is resumed, sources come from what was actually read', async () => {
  const seen = [];
  const c = client([
    { stop_reason: 'pause_turn', model: 'claude-opus-5-5', content: [{ type: 'server_tool_use', id: 't1', name: 'web_search', input: {} }, searchBlock], usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 1 } } },
    { stop_reason: 'end_turn', model: 'claude-opus-5-5', content: [citedText], usage: { input_tokens: 20, output_tokens: 50 } }
  ], seen);
  const r = await draft({ item: { title: 'Fed holds' }, today: '2026-11-12', region: 'Louisiana', voiceBrief: 'VOICE' },
    { draftDomains: ['federalreserve.gov'], guardrails: ['No forecasts.'] }, { client: c });

  assert.strictEqual(seen.length, 2, 'resumed once after pause_turn');
  assert.strictEqual(seen[1].messages[1].role, 'assistant', 'the paused turn is handed back unchanged');
  assert.strictEqual(seen[0].model, 'claude-opus-5-5');
  assert.strictEqual(seen[0].fallbacks, 'default');
  assert.deepStrictEqual(seen[0].tools[0].allowed_domains, ['federalreserve.gov']);
  assert.strictEqual(seen[0].tools[0].user_location.region, 'Louisiana');
  assert.match(seen[0].system[0].text, /VOICE/);
  assert.match(seen[0].system[0].text, /No forecasts\./);
  assert.match(seen[0].messages[0].content, /outside material/);

  assert.strictEqual(r.sources.cited.length, 1);
  assert.strictEqual(r.pack.facts[0].verifiedInSearch, true);
  assert.strictEqual(r.pack.facts[1].verifiedInSearch, false, 'a URL the model typed but never read is flagged');
  assert.ok(r.problems.some((p) => /never appeared in a search result/.test(p)));
  assert.strictEqual(r.usage.searches, 1);
  assert.strictEqual(r.complete, true);
});

test('a draft with no sources says not to publish it', async () => {
  const c = client([{ stop_reason: 'end_turn', content: [{ type: 'text', text: OUT }], usage: {} }], []);
  const r = await draft({ item: { title: 'x' }, today: '2026-11-12' }, { draftDomains: ['irs.gov'] }, { client: c });
  assert.ok(r.problems[0].includes('Do not publish'));
});

test('a refusal is an error, not an empty draft', async () => {
  const c = client([{ stop_reason: 'refusal', stop_details: { explanation: 'no' }, content: [], usage: {} }], []);
  await assert.rejects(draft({ item: { title: 'x' }, today: 'd' }, { draftDomains: ['irs.gov'] }, { client: c }), (e) => e.code === 'refusal');
});
