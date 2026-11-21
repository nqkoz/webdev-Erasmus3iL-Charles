const assert = require('node:assert/strict');
const test = require('node:test');
const { createTestDatabase } = require('../src/data/database');
const { createApp } = require('../src/server');

async function startServer(t, database, appOptions = {}) {
  const server = createApp(database, appOptions).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('health endpoint reports whether the database responds', async (t) => {
  const database = await createTestDatabase();
  const baseUrl = await startServer(t, database);

  const healthyResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthyResponse.status, 200);
  assert.deepEqual(await healthyResponse.json(), { status: 'ok', db: 'ok' });

  database.ping = async () => {
    throw new Error('test database unavailable');
  };
  const unavailableResponse = await fetch(`${baseUrl}/health`);
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(await unavailableResponse.json(), { status: 'error', db: 'down' });
});

test('health stays unavailable until database initialization is complete', async (t) => {
  const database = await createTestDatabase();
  const baseUrl = await startServer(t, database, { isDatabaseReady: () => false });

  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'error', db: 'down' });
});

test('unknown paths return a short 404 and malformed JSON returns 400 without internals', async (t) => {
  const database = await createTestDatabase();
  const baseUrl = await startServer(t, database);

  const missingResponse = await fetch(`${baseUrl}/no-such-page`);
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), { error: 'Not found' });

  const malformedResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"workstationId":',
  });
  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(await malformedResponse.json(), { error: 'Request body must be valid JSON.' });
});

test('unexpected errors return one generic sentence without a stack trace', async (t) => {
  const database = await createTestDatabase();
  const baseUrl = await startServer(t, database);
  database.query = async () => {
    throw new Error('internal database details');
  };

  const response = await fetch(`${baseUrl}/api/my-bookings`, {
    headers: { cookie: `lab_session=${'a'.repeat(64)}` },
  });
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.equal(body, '{"error":"The request could not be completed. Please try again."}');
  assert.doesNotMatch(body, /stack|internal database details/i);
});
