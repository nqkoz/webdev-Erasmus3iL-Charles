const assert = require('node:assert/strict');
const test = require('node:test');
const { createGeminiClient, GeminiClientError } = require('../src/services/geminiClient');

function providerResponse(ok, value) {
  return {
    ok,
    json: async () => {
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

function configuredClient(fetchImpl, overrides = {}) {
  return createGeminiClient({
    apiKey: 'test-gemini-key',
    modelName: 'gemini-test-model',
    fetchImpl,
    ...overrides,
  });
}

test('Gemini client sends only structured availability data and parses a suggestion', async () => {
  let captured;
  const client = configuredClient(async (url, options) => {
    captured = { url, options };
    return providerResponse(true, {
      candidates: [{
        content: { parts: [{ text: JSON.stringify({ slotId: '3:2026-11-02T06:00:00.000Z', reason: 'Matches the requested activity.' }) }] },
      }],
    });
  });
  const slots = [{
    slotId: '3:2026-11-02T06:00:00.000Z',
    workstationName: 'PC-01',
    workstationDescription: 'Networking workstation',
    labName: 'Lab 2310 - Networks',
    labLocation: 'Building 2',
    startsAt: '2026-11-02T06:00:00.000Z',
    endsAt: '2026-11-02T07:00:00.000Z',
  }];
  const suggestion = await client.suggestSlot({ activityType: 'networking', date: '2026-11-02', slots });

  assert.deepEqual(suggestion, { slotId: slots[0].slotId, reason: 'Matches the requested activity.' });
  assert.equal(captured.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent');
  assert.equal(captured.options.headers['x-goog-api-key'], 'test-gemini-key');
  assert.equal(captured.url.includes('test-gemini-key'), false);
  assert.equal(captured.options.signal.aborted, false);
  const request = JSON.parse(captured.options.body);
  const prompt = JSON.parse(request.contents[0].parts[0].text);
  assert.equal(prompt.activityType, 'networking');
  assert.equal(prompt.date, '2026-11-02');
  assert.deepEqual(prompt.availableSlots, slots);
  assert.equal(JSON.stringify(prompt).includes('email'), false);
  assert.equal(JSON.stringify(prompt).includes('userId'), false);
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
});

test('Gemini client reports missing key without making a provider request', async () => {
  const client = createGeminiClient({
    apiKey: '',
    fetchImpl: async () => assert.fail('Unconfigured Gemini must not make a request.'),
  });
  assert.equal(client.isConfigured(), false);
  await assert.rejects(
    client.suggestSlot({ activityType: 'web_cloud', date: '2026-11-02', slots: [] }),
    GeminiClientError,
  );
});

test('Gemini client reports provider errors, invalid JSON and missing suggestion fields', async () => {
  const input = { activityType: 'web_cloud', date: '2026-11-02', slots: [] };
  const providerError = configuredClient(async () => { throw new Error('network detail'); });
  const httpError = configuredClient(async () => providerResponse(false, {}));
  const jsonError = configuredClient(async () => providerResponse(true, new Error('invalid JSON')));
  const missingCandidate = configuredClient(async () => providerResponse(true, { candidates: [] }));
  const invalidSuggestion = configuredClient(async () => providerResponse(true, {
    candidates: [{ content: { parts: [{ text: '{' }] } }],
  }));
  const nonObjectSuggestion = configuredClient(async () => providerResponse(true, {
    candidates: [{ content: { parts: [{ text: '[]' }] } }],
  }));

  for (const client of [providerError, httpError, jsonError, missingCandidate, invalidSuggestion, nonObjectSuggestion]) {
    await assert.rejects(client.suggestSlot(input), GeminiClientError);
  }
});
