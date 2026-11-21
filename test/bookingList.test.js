const assert = require('node:assert/strict');
const test = require('node:test');
const { createTestDatabase } = require('../src/data/database');
const userRepository = require('../src/data/userRepository');
const bookingRepository = require('../src/data/bookingRepository');
const bookingService = require('../src/services/bookingService');
const authService = require('../src/services/authService');
const { createApp } = require('../src/server');

async function createFixture(t) {
  const database = await createTestDatabase();
  const studentHash = await authService.hashPassword('student-password-123');
  const otherHash = await authService.hashPassword('other-student-password');
  const studentId = await userRepository.createUser(database, {
    email: 'student@example.test',
    passwordHash: studentHash,
    role: 'student',
  });
  const otherStudentId = await userRepository.createUser(database, {
    email: 'other@example.test',
    passwordHash: otherHash,
    role: 'student',
  });

  assert.equal(await bookingService.ensureDemoBookings(database, studentId, new Date('2026-10-30T12:00:00.000Z')), true);
  await database.query(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES ($1, 3, '2026-11-03T08:00:00.000Z', '2026-11-03T09:00:00.000Z', 'active')
  `, [otherStudentId]);

  const server = createApp(database).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.close();
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
  assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM bookings')).rows[0].count, 3);
  assert.equal(await bookingRepository.countForUser(database, studentId), 2);
});

test('AC-16 deleting a booking row removes it from the refreshed booking list and does not reseed it', async (t) => {
  const { baseUrl, database, studentId } = await createFixture(t);
  const token = await signIn(baseUrl);
  const headers = { cookie: `lab_session=${token}` };
  const firstResponse = await fetch(`${baseUrl}/api/my-bookings`, { headers });
  const beforeDeletion = await firstResponse.json();
  assert.equal(beforeDeletion.length, 2);

  await database.query('DELETE FROM bookings WHERE id = $1 AND user_id = $2', [beforeDeletion[0].id, studentId]);
  assert.equal(await bookingService.ensureDemoBookings(database, studentId, new Date('2026-10-30T12:00:00.000Z')), false);

  const reloadResponse = await fetch(`${baseUrl}/api/my-bookings`, { headers });
  const afterDeletion = await reloadResponse.json();
  assert.equal(afterDeletion.length, 1);
  assert.ok(afterDeletion.every((booking) => booking.id !== beforeDeletion[0].id));
});
