const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../src/data/database');
const userRepository = require('../src/data/userRepository');
const bookingRepository = require('../src/data/bookingRepository');
const bookingService = require('../src/services/bookingService');
const authService = require('../src/services/authService');
const { createApp } = require('../src/server');

async function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-list-'));
  const database = openDatabase({ filename: path.join(directory, 'test.db') });
  const studentHash = await authService.hashPassword('student-password-123');
  const otherHash = await authService.hashPassword('other-student-password');
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

  assert.equal(bookingService.ensureDemoBookings(database, studentId, new Date('2026-10-30T12:00:00.000Z')), true);
  database.prepare(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES (?, 3, '2026-11-03T08:00:00.000Z', '2026-11-03T09:00:00.000Z', 'active')
  `).run(otherStudentId);

  const server = createApp(database).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { database, studentId, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function signIn(baseUrl) {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'student@example.test', password: 'student-password-123' }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303);
  return response.headers.get('set-cookie').match(/lab_session=([a-f0-9]{64})/)[1];
}

test('AC-15 the seeded student sees their booking details and no other student rows', async (t) => {
  const { baseUrl, database, studentId } = await createFixture(t);
  const token = await signIn(baseUrl);
  const pageResponse = await fetch(`${baseUrl}/my-bookings`, {
    headers: { cookie: `lab_session=${token}` },
  });
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /My bookings/);
  assert.match(page, /\/my-bookings\.js/);

  const apiResponse = await fetch(`${baseUrl}/api/my-bookings`, {
    headers: { cookie: `lab_session=${token}` },
  });
  const bookings = await apiResponse.json();
  assert.equal(apiResponse.status, 200);
  assert.equal(bookings.length, 2);
  assert.ok(bookings.every((booking) => booking.labName === 'Lab 1250 - Web and Cloud'));
  assert.ok(bookings.every((booking) => booking.workstationName && booking.startsAt && booking.endsAt && booking.status === 'active'));
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 3);
  assert.equal(bookingRepository.countForUser(database, studentId), 2);
});

test('AC-16 deleting a booking row removes it from the refreshed booking list and does not reseed it', async (t) => {
  const { baseUrl, database, studentId } = await createFixture(t);
  const token = await signIn(baseUrl);
  const headers = { cookie: `lab_session=${token}` };
  const firstResponse = await fetch(`${baseUrl}/api/my-bookings`, { headers });
  const beforeDeletion = await firstResponse.json();
  assert.equal(beforeDeletion.length, 2);

  database.prepare('DELETE FROM bookings WHERE id = ? AND user_id = ?').run(beforeDeletion[0].id, studentId);
  assert.equal(bookingService.ensureDemoBookings(database, studentId, new Date('2026-10-30T12:00:00.000Z')), false);

  const reloadResponse = await fetch(`${baseUrl}/api/my-bookings`, { headers });
  const afterDeletion = await reloadResponse.json();
  assert.equal(afterDeletion.length, 1);
  assert.ok(afterDeletion.every((booking) => booking.id !== beforeDeletion[0].id));
});
