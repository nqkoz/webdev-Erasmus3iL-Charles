const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../src/data/database');
const userRepository = require('../src/data/userRepository');
const bookingService = require('../src/services/bookingService');
const authService = require('../src/services/authService');
const { createApp } = require('../src/server');

const fixedNow = new Date('2026-10-30T12:00:00.000Z');

async function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-actions-'));
  const database = openDatabase({ filename: path.join(directory, 'test.db') });
  const studentHash = await authService.hashPassword('student-password-123');
  const otherHash = await authService.hashPassword('other-student-password');
  const staffHash = await authService.hashPassword('staff-password-123');
  const studentId = userRepository.createUser(database, {
    email: 'student@example.test',
    passwordHash: studentHash,
    role: 'student',
  });
  const otherStudentId = userRepository.createUser(database, {
    email: 'other@example.test',
    passwordHash: otherHash,
    role: 'student',
  });
  userRepository.createUser(database, {
    email: 'staff@example.test',
    passwordHash: staffHash,
    role: 'staff',
  });
  bookingService.ensureDemoBookings(database, studentId, fixedNow);

  const server = createApp(database, { nowProvider: () => new Date(fixedNow) }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    database,
    studentId,
    otherStudentId,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function signIn(baseUrl, email = 'student@example.test', password = 'student-password-123') {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303);
  return response.headers.get('set-cookie').match(/lab_session=([a-f0-9]{64})/)[1];
}

function jsonHeaders(token) {
  return { cookie: `lab_session=${token}`, 'content-type': 'application/json', accept: 'application/json' };
}

test('AC-2 availability lists future workstation slots and excludes active overlaps', async (t) => {
  const { baseUrl } = await createFixture(t);
  const token = await signIn(baseUrl);
  const pageResponse = await fetch(`${baseUrl}/availability`, {
    headers: { cookie: `lab_session=${token}` },
  });
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /id="availability-form"/);
  assert.match(page, /\/availability\.js/);

  const response = await fetch(`${baseUrl}/api/availability?date=2026-11-02`, {
    headers: jsonHeaders(token),
  });
  const slots = await response.json();

  assert.equal(response.status, 200);
  assert.ok(slots.length > 0);
  assert.ok(slots.every((slot) => slot.labName && slot.workstationName && slot.labLocation));
  assert.ok(slots.every((slot) => Date.parse(slot.endsAt) - Date.parse(slot.startsAt) === 60 * 60 * 1000));
  assert.equal(slots.some((slot) => slot.workstationId === 1 && slot.startsAt === '2026-11-02T07:00:00.000Z'), false);
  assert.equal(slots.some((slot) => slot.workstationId === 1 && slot.startsAt === '2026-11-02T08:00:00.000Z'), true);

  const invalidDateResponse = await fetch(`${baseUrl}/api/availability?date=2026-11-01`, {
    headers: jsonHeaders(token),
  });
  assert.equal(invalidDateResponse.status, 400);
});

test('AC-3 booking a free slot returns confirmation and stores an active row', async (t) => {
  const { baseUrl, database, studentId } = await createFixture(t);
  const token = await signIn(baseUrl);
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ workstationId: 1, startsAt: '2026-11-02T08:00:00.000Z' }),
  });
  const confirmation = await response.json();

  assert.equal(response.status, 201);
  assert.equal(confirmation.status, 'active');
  assert.equal(confirmation.workstationId, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM bookings WHERE user_id = ? AND status = ?').get(studentId, 'active').count, 3);
});

test('AC-4 a booking conflict returns HTTP 409 and stores no overlapping row', async (t) => {
  const { baseUrl, database } = await createFixture(t);
  const otherToken = await signIn(baseUrl, 'other@example.test', 'other-student-password');
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: jsonHeaders(otherToken),
    body: JSON.stringify({ workstationId: 1, startsAt: '2026-11-02T07:00:00.000Z' }),
  });
  const result = await response.json();

  assert.equal(response.status, 409);
  assert.equal(result.error, 'This slot is no longer available');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 2);
});

test('AC-5 a fourth future active booking is refused without inserting a row', async (t) => {
  const { baseUrl, database, studentId } = await createFixture(t);
  const token = await signIn(baseUrl);
  const thirdResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ workstationId: 1, startsAt: '2026-11-04T07:00:00.000Z' }),
  });
  assert.equal(thirdResponse.status, 201);

  const fourthResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ workstationId: 3, startsAt: '2026-11-04T07:00:00.000Z' }),
  });
  assert.equal(fourthResponse.status, 409);
  assert.equal((await fourthResponse.json()).error, 'You have reached the booking limit');
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bookings WHERE user_id = ? AND status = 'active'").get(studentId).count, 3);
});

test('AC-6 cancelling an owned future booking marks it cancelled and frees its slot', async (t) => {
  const { baseUrl, database } = await createFixture(t);
  const token = await signIn(baseUrl);
  const cancellation = await fetch(`${baseUrl}/api/bookings/1/cancel`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  assert.equal(cancellation.status, 200);
  assert.deepEqual(await cancellation.json(), { id: 1, status: 'cancelled' });
  assert.equal(database.prepare('SELECT status FROM bookings WHERE id = 1').get().status, 'cancelled');

  const availability = await fetch(`${baseUrl}/api/availability?date=2026-11-02`, {
    headers: jsonHeaders(token),
  });
  const slots = await availability.json();
  assert.equal(slots.some((slot) => slot.workstationId === 1 && slot.startsAt === '2026-11-02T07:00:00.000Z'), true);
});

test('AC-7 cancelling another student’s booking returns HTTP 403 and leaves it active', async (t) => {
  const { baseUrl, database } = await createFixture(t);
  const otherToken = await signIn(baseUrl, 'other@example.test', 'other-student-password');
  const response = await fetch(`${baseUrl}/api/bookings/1/cancel`, {
    method: 'POST',
    headers: jsonHeaders(otherToken),
  });

  assert.equal(response.status, 403);
  assert.equal(database.prepare('SELECT status FROM bookings WHERE id = 1').get().status, 'active');
});

test('staff can view availability but cannot use student booking operations', async (t) => {
  const { baseUrl, database } = await createFixture(t);
  const staffToken = await signIn(baseUrl, 'staff@example.test', 'staff-password-123');
  const availability = await fetch(`${baseUrl}/api/availability?date=2026-11-02`, {
    headers: jsonHeaders(staffToken),
  });
  assert.equal(availability.status, 200);
  assert.ok((await availability.json()).length > 0);

  const booking = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: jsonHeaders(staffToken),
    body: JSON.stringify({ workstationId: 1, startsAt: '2026-11-02T08:00:00.000Z' }),
  });
  assert.equal(booking.status, 403);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 2);
});
