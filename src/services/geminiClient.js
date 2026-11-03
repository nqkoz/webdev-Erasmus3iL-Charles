const requestTimeoutMs = 8000;

class GeminiClientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeminiClientError';
  }
}

function createGeminiClient({
  apiKey = process.env.GEMINI_API_KEY,
  modelName = process.env.MODEL_NAME || 'gemini-2.5-flash',
  fetchImpl = fetch,
} = {}) {
  const isConfigured = () => typeof apiKey === 'string' && apiKey.length > 0;

  async function suggestSlot({ activityType, date, slots }) {
    if (!isConfigured()) throw new GeminiClientError('Gemini is not configured.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
    const requestBody = {
      contents: [{
        role: 'user',
        parts: [{
          text: JSON.stringify({
            task: 'Choose the best available workstation slot for this activity and date.',
            activityType,
            date,
            availableSlots: slots,
            responseShape: { slotId: 'string identifier from availableSlots', reason: 'short explanation' },
          }),
        }],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            slotId: { type: 'STRING' },
            reason: { type: 'STRING' },
          },
          required: ['slotId', 'reason'],
        },
      },
    };

    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      throw new GeminiClientError('Gemini could not be reached.');
    }
    if (!response.ok) throw new GeminiClientError('Gemini could not provide a suggestion.');

    let result;
    try {
      result = await response.json();
    } catch {
      throw new GeminiClientError('Gemini returned an invalid response.');
    }
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new GeminiClientError('Gemini returned an invalid suggestion.');

    let suggestion;
    try {
      suggestion = JSON.parse(text);
    } catch {
      throw new GeminiClientError('Gemini returned an invalid suggestion.');
    }
    if (!suggestion || typeof suggestion !== 'object' || Array.isArray(suggestion)) {
      throw new GeminiClientError('Gemini returned an invalid suggestion.');
    }
    return suggestion;
  }

  return { isConfigured, suggestSlot };
}

module.exports = { createGeminiClient, GeminiClientError };
