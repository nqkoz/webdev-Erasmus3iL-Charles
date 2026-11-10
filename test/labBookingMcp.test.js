const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../src/data/database');
const sessionRepository = require('../src/data/sessionRepository');
const userRepository = require('../src/data/userRepository');
const authService = require('../src/services/authService');
const { createApp } = require('../src/server');

const fixedNow = new Date();
const nextWeekday = new Date(Date.UTC(fixedNow.getUTCFullYear(), fixedNow.getUTCMonth(), fixedNow.getUTCDate() + 1));
while (nextWeekday.getUTCDay() === 0 || nextWeekday.getUTCDay() === 6) {
  nextWeekday.setUTCDate(nextWeekday.getUTCDate() + 1);
}
const testDate = nextWeekday.toISOString().slice(0, 10);
const mcpScript = path.resolve(__dirname, '../mcp-server/labBookingServer.js');

function slotAtUtc(hour) {
  return `${testDate}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

async function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-mcp-'));
  const databasePath = path.join(directory, 'test.db');
  const database = openDatabase({ filename: databasePath });
  const passwordHash = await authService.hashPassword('correct-horse-battery');
  const studentId = userRepository.createUser(database, {
    email: 'student@example.test',
    passwordHash,
    role: 'student',
  });
  const otherStudentId = userRepository.createUser(database, {
    email: 'other@example.test',
    passwordHash: await authService.hashPassword('another-correct-password'),
    role: 'student',
  });
  const staffId = userRepository.createUser(database, {
    email: 'staff@example.test',
    passwordHash: await authService.hashPassword('staff-correct-password'),
    role: 'staff',
  });
  database.prepare(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(studentId, 1, slotAtUtc(7), slotAtUtc(8));
  database.prepare(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(otherStudentId, 2, slotAtUtc(8), slotAtUtc(9));
  const studentSession = authService.createSession(database, studentId);
  const staffSession = authService.createSession(database, staffId);
  const app = createApp(database, {
    nowProvider: () => new Date(fixedNow),
    slotSuggestionClient: { isConfigured: () => false },
  });
  const httpServer = app.listen(0);
  await new Promise((resolve) => httpServer.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    database,
    databasePath,
    directory,
    studentId,
    staffId,
    studentToken: studentSession.token,
    staffToken: staffSession.token,
    baseUrl: `http://127.0.0.1:${httpServer.address().port}`,
  };
}

function invokeMcpServer(databasePath, token, messages) {
  const environment = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    DATABASE_PATH: databasePath,
  };
  if (token !== undefined) environment.MCP_TOKEN = token;
  const result = spawnSync(process.execPath, [mcpScript], {
    env: environment,
    input: messages.map((message) => JSON.stringify(message)).join('\n') + '\n',
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  return {
    exitCode: result.status,
    stderr: result.stderr,
    replies: result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
  };
}

function parseToolResult(response) {
  assert.equal(response.jsonrpc, '2.0');
  assert.ok(response.result);
  assert.equal(response.result.content[0].type, 'text');
  const text = response.result.content[0].text;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return {
    value,
    isError: response.result.isError,
  };
}

function callMcpTool(databasePath, token, name, args) {
  const result = invokeMcpServer(databasePath, token, [{
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  }]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.replies.length, 1);
  return parseToolResult(result.replies[0]);
}

test('AC-12 Lab Booking MCP exposes all five project tools through the JSON-RPC protocol', async (t) => {
  const { databasePath, studentToken } = await createFixture(t);
  const result = invokeMcpServer(databasePath, studentToken, [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.replies.length, 2);
  const [initialized, listed] = result.replies;
  assert.equal(initialized.result.serverInfo.name, 'lab-booking');
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    'list_free_slots',
    'my_bookings',
    'book_slot',
    'cancel_booking',
    'suggest_slot',
  ]);
  assert.ok(listed.result.tools.every((tool) => tool.description.length > 20));
});

test('AC-12 a student MCP session receives the same results as the matching HTTP services', async (t) => {
  const { database, databasePath, studentId, studentToken } = await createFixture(t);
  const httpFixture = await createFixture(t);
  const { baseUrl, studentToken: httpToken } = httpFixture;

  const available = callMcpTool(databasePath, studentToken, 'list_free_slots', { date: testDate });
  const httpAvailabilityResponse = await fetch(`${baseUrl}/api/availability?date=${testDate}`, {
    headers: { cookie: `lab_session=${httpToken}`, accept: 'application/json' },
  });
  assert.equal(httpAvailabilityResponse.status, 200);
  assert.equal(available.isError, false);
  assert.deepEqual(available.value, await httpAvailabilityResponse.json());

  const bookings = callMcpTool(databasePath, studentToken, 'my_bookings', {});
  const httpBookingsResponse = await fetch(`${baseUrl}/api/my-bookings`, {
    headers: { cookie: `lab_session=${httpToken}`, accept: 'application/json' },
  });
  assert.equal(httpBookingsResponse.status, 200);
  assert.deepEqual(bookings.value, await httpBookingsResponse.json());

  const suggestion = callMcpTool(databasePath, studentToken, 'suggest_slot', {
    activityType: 'networking',
    date: testDate,
  });
  const httpSuggestionResponse = await fetch(`${baseUrl}/api/slot-suggestions`, {
    method: 'POST',
    headers: { cookie: `lab_session=${httpToken}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ activityType: 'networking', date: testDate }),
  });
  assert.equal(httpSuggestionResponse.status, 200);
  assert.deepEqual(suggestion.value, await httpSuggestionResponse.json());
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 2);
  assert.equal(httpFixture.database.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 2);

  const mcpBooking = callMcpTool(databasePath, studentToken, 'book_slot', {
    workstationId: 3,
    startsAt: slotAtUtc(10),
  });
  assert.equal(mcpBooking.isError, false);
  assert.equal(mcpBooking.value.status, 'active');
  assert.equal(mcpBooking.value.workstationId, 3);

  const httpBookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { cookie: `lab_session=${httpToken}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ workstationId: 3, startsAt: slotAtUtc(10) }),
  });
  assert.equal(httpBookingResponse.status, 201);
  const httpBooking = await httpBookingResponse.json();
  assert.deepEqual(
    mcpBooking.value,
    httpBooking,
  );

  const mcpCancellation = callMcpTool(databasePath, studentToken, 'cancel_booking', {
    bookingId: mcpBooking.value.id,
  });
  const httpCancellationResponse = await fetch(`${baseUrl}/api/bookings/${httpBooking.id}/cancel`, {
    method: 'POST',
    headers: { cookie: `lab_session=${httpToken}`, accept: 'application/json' },
  });
  assert.equal(httpCancellationResponse.status, 200);
  assert.deepEqual(mcpCancellation.value, await httpCancellationResponse.json());
  assert.equal(mcpCancellation.isError, false);

  const mcpConflict = callMcpTool(databasePath, studentToken, 'book_slot', {
    workstationId: 1,
    startsAt: slotAtUtc(7),
  });
  const httpConflictResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { cookie: `lab_session=${httpToken}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ workstationId: 1, startsAt: slotAtUtc(7) }),
  });
  assert.equal(httpConflictResponse.status, 409);
  assert.equal(mcpConflict.isError, true);
  assert.equal(mcpConflict.value, (await httpConflictResponse.json()).error);
  assert.ok(database.prepare('SELECT id FROM users WHERE id = ?').get(studentId));
});

test('AC-12 staff MCP sessions can view slots but cannot use student-only operations', async (t) => {
  const { databasePath, staffToken } = await createFixture(t);
  const slots = callMcpTool(databasePath, staffToken, 'list_free_slots', { date: testDate });
  assert.equal(slots.isError, false);
  assert.ok(slots.value.length > 0);

  for (const [name, args] of [
    ['my_bookings', {}],
    ['book_slot', { workstationId: 3, startsAt: slotAtUtc(10) }],
    ['cancel_booking', { bookingId: 1 }],
    ['suggest_slot', { activityType: 'networking', date: testDate }],
  ]) {
    const result = callMcpTool(databasePath, staffToken, name, args);
    assert.equal(result.isError, true);
    assert.match(result.value, /Student access is required/);
  }
});

test('AC-12 an MCP tool call rejects missing or expired user sessions', async (t) => {
  const { database, databasePath, studentId } = await createFixture(t);
  const expiredToken = 'a'.repeat(64);
  sessionRepository.createSession(database, {
    tokenHash: createHash('sha256').update(expiredToken).digest('hex'),
    userId: studentId,
    expiresAt: '2020-01-01T00:00:00.000Z',
  });
  const result = callMcpTool(databasePath, expiredToken, 'my_bookings', {});
  assert.equal(result.isError, true);
  assert.match(result.value, /Sign in again/);
});

test('Lab Booking MCP server refuses to start without a session token', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-mcp-no-token-'));
  const databasePath = path.join(directory, 'must-not-be-created.db');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const child = spawnSync(process.execPath, [mcpScript], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      DATABASE_PATH: databasePath,
    },
    input: '',
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 1);
  assert.match(child.stderr, /MCP_TOKEN must be the current 64-character lab_session token/);
  assert.equal(fs.existsSync(databasePath), false);
});
