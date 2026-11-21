const assert = require('node:assert/strict');
const test = require('node:test');
const { createTestDatabase } = require('../src/data/database');
const userRepository = require('../src/data/userRepository');
const authService = require('../src/services/authService');
const { createApp } = require('../src/server');
const bookingService = require('../src/services/bookingService');
const slotSuggestionService = require('../src/services/slotSuggestionService');

const fixedNow = new Date('2026-10-30T12:00:00.000Z');
const testDate = '2026-11-02';

async function createFixture(t, { slotSuggestionClient } = {}) {
  const database = await createTestDatabase();
  const passwordHash = await authService.hashPassword('correct-horse-battery');
  const studentId = await userRepository.createUser(database, {
    email: 'student@example.test',
    passwordHash,
    role: 'student',
  });
  const otherStudentId = await userRepository.createUser(database, {
    email: 'other@example.test',
    passwordHash: await authService.hashPassword('another-correct-password'),
    role: 'student',
  });
  const server = createApp(database, {
    nowProvider: () => new Date(fixedNow),
    slotSuggestionClient,
  }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.close();
  });
  return {
    database,
    studentId,
    otherStudentId,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function signIn(baseUrl) {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'student@example.test', password: 'correct-horse-battery' }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303);
  return response.headers.get('set-cookie').match(/lab_session=([a-f0-9]{64})/)[1];
}

function headers(token) {
  return { cookie: `lab_session=${token}`, accept: 'application/json', 'content-type': 'application/json' };
}

async function suggest(baseUrl, token, body) {
  return fetch(`${baseUrl}/api/slot-suggestions`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  });
}

function slotClient(suggestion, onCall = () => {}) {
  return {
    isConfigured: () => true,
    suggestSlot: async (input) => {
      onCall(input);
      return suggestion;
    },
  };
}
test('AC-20 the suggestion service replaces a nonexistent model slot with a real available slot', async (t) => {
  const { database, studentId } = await createFixture(t);

  const availableSlots = (await bookingService
    .listAvailableSlots(database, studentId, testDate, fixedNow))
    .filter((slot) => slot.activityType === 'networking');

  assert.ok(availableSlots.length > 0, 'the fixture must contain an available networking slot');

  const result = await slotSuggestionService.suggestSlot(
    database,
    studentId,
    { activityType: 'networking', date: testDate },
    fixedNow,
    slotClient({
      slotId: '999:2026-11-02T06:00:00.000Z',
      reason: 'This slot does not exist.',
    }),
  );

  assert.deepEqual(result.suggestion.slot, availableSlots[0]);
  assert.equal(result.suggestion.reason, 'First available slot matching your selected activity.');
  assert.match(result.fallbackMessage, /Gemini/);
});

test('AC-10 and AC-18 a student receives one available model suggestion without creating a booking', async (t) => {
  let modelInput;
  const { baseUrl, database, studentId } = await createFixture(t, {
    slotSuggestionClient: slotClient({ slotId: '3:2026-11-02T06:00:00.000Z', reason: 'A quiet networking workstation is available.' }, (input) => {
      modelInput = input;
    }),
  });
  const token = await signIn(baseUrl);
  const pageResponse = await fetch(`${baseUrl}/availability`, {
    headers: { cookie: `lab_session=${token}` },
  });
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /id="suggestion-form"/);
  assert.match(page, /never books a slot automatically/);
  const before = (await database.query('SELECT COUNT(*)::integer AS count FROM bookings')).rows[0].count;

  const response = await suggest(baseUrl, token, { activityType: 'networking', date: testDate });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.suggestion.slot.workstationId, 3);
  assert.equal(result.suggestion.slot.activityType, 'networking');
  assert.equal(result.suggestion.slot.labName, 'Lab 2310 - Networks');
  assert.equal(result.suggestion.reason, 'A quiet networking workstation is available.');
  assert.equal(result.fallbackMessage, null);
  assert.equal(modelInput.date, testDate);
  assert.equal(modelInput.activityType, 'networking');
  assert.ok(modelInput.slots.every((slot) => !('userId' in slot) && !('studentEmail' in slot)));
  assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM bookings')).rows[0].count, before);
  assert.equal((await database.query('SELECT id FROM users WHERE id = $1', [studentId])).rows[0].id, studentId);
});

test('AC-19 no matching free workstation returns a clear result and creates no booking', async (t) => {
  const { baseUrl, database, otherStudentId } = await createFixture(t, {
    slotSuggestionClient: slotClient({ slotId: 3, reason: 'Should not be called.' }, () => {
      assert.fail('The model must not be called when there are no matching slots.');
    }),
  });
  const token = await signIn(baseUrl);
  const startsAt = [
    '2026-11-02T06:00:00.000Z', '2026-11-02T07:00:00.000Z',
    '2026-11-02T08:00:00.000Z', '2026-11-02T09:00:00.000Z',
    '2026-11-02T10:00:00.000Z', '2026-11-02T11:00:00.000Z',
    '2026-11-02T12:00:00.000Z', '2026-11-02T13:00:00.000Z',
    '2026-11-02T14:00:00.000Z', '2026-11-02T15:00:00.000Z',
  ];
  const insert = `
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES ($1, 3, $2, $3, 'active')
  `;
  for (const start of startsAt) {
    await database.query(insert, [otherStudentId, start, new Date(Date.parse(start) + 60 * 60 * 1000).toISOString()]);
  }
  const before = (await database.query('SELECT COUNT(*)::integer AS count FROM bookings')).rows[0].count;

  const response = await suggest(baseUrl, token, { activityType: 'networking', date: testDate });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.suggestion, null);
  assert.match(result.message, /No matching workstation is available/);
  assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM bookings')).rows[0].count, before);
});

test('AC-11 and AC-20 model failure and invalid output fall back to the first matching available slot', async (t) => {
  for (const [label, client] of [
    ['provider error', { isConfigured: () => true, suggestSlot: async () => { throw new Error('provider detail'); } }],
    ['invalid slot', slotClient({ slotId: 999, reason: 'Unavailable.' })],
    ['invalid reason', slotClient({ slotId: 3, reason: '' })],
    ['missing key', { isConfigured: () => false, suggestSlot: async () => assert.fail('Unconfigured model must not be called.') }],
  ]) {
    await t.test(label, async (subtest) => {
      const { baseUrl, database } = await createFixture(subtest, { slotSuggestionClient: client });
      const token = await signIn(baseUrl);
      const before = (await database.query('SELECT COUNT(*)::integer AS count FROM bookings')).rows[0].count;
      const response = await suggest(baseUrl, token, { activityType: 'networking', date: testDate });
      const result = await response.json();

      assert.equal(response.status, 200);
      assert.equal(result.suggestion.slot.workstationId, 3);
      assert.equal(result.suggestion.slot.startsAt, '2026-11-02T06:00:00.000Z');
      assert.match(result.fallbackMessage, /Gemini/);
      assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM bookings')).rows[0].count, before);
    });
  }
});

test('AC-21 an unauthenticated visitor receives no suggestion data', async (t) => {
  const { baseUrl } = await createFixture(t, { slotSuggestionClient: slotClient({}) });
  const response = await fetch(`${baseUrl}/api/slot-suggestions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ activityType: 'networking', date: testDate }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Sign in first.' });
});

test('AC-22 an unsupported activity returns HTTP 422 without a model call or booking', async (t) => {
  const { baseUrl, database } = await createFixture(t, {
    slotSuggestionClient: slotClient({}, () => assert.fail('The model must not be called for invalid preferences.')),
  });
  const token = await signIn(baseUrl);
  const before = (await database.query('SELECT COUNT(*)::integer AS count FROM bookings')).rows[0].count;
  const response = await suggest(baseUrl, token, { activityType: 'robotics', date: testDate });
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /supported activity/);
  assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM bookings')).rows[0].count, before);
});
