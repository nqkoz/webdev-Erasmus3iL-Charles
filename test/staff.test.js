const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../src/data/database');
const userRepository = require('../src/data/userRepository');
const authService = require('../src/services/authService');
const bookingService = require('../src/services/bookingService');
const { createApp } = require('../src/server');

async function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-staff-'));
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
  const staffId = userRepository.createUser(database, {
    email: 'staff@example.test',
    passwordHash: staffHash,
    role: 'staff',
  });
  database.prepare(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(studentId, 1, '2026-11-02T08:00:00.000Z', '2026-11-02T09:00:00.000Z');
  database.prepare(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(otherStudentId, 2, '2026-11-02T08:00:00.000Z', '2026-11-02T09:00:00.000Z');

  const server = createApp(database).listen(0);
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
    staffId,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function signIn(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), email === 'staff@example.test' ? '/staff' : '/my-bookings');
  return response.headers.get('set-cookie').match(/lab_session=([a-f0-9]{64})/)[1];
}

function headers(token) {
  return { cookie: `lab_session=${token}`, accept: 'application/json', 'content-type': 'application/json' };
}

test('AC-8 only staff can create a lab and workstation and see the new rows', async (t) => {
  const { baseUrl, database, studentId, staffId } = await createFixture(t);
  const input = {
    labName: 'Lab 3000 - Robotics',
    labLocation: 'Building 3, floor 1',
    workstationName: 'Robot-01',
    workstationDescription: 'Robotics development workstation',
    activityType: 'web_cloud',
  };

  assert.throws(
    () => bookingService.createLabAndWorkstation(database, studentId, input),
    (error) => error.status === 403,
  );
  assert.deepEqual(bookingService.createLabAndWorkstation(database, staffId, input), {
    labId: 3,
    workstationId: 4,
  });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM labs WHERE name = 'Lab 3000 - Robotics'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workstations WHERE name = 'Robot-01'").get().count, 1);

  const studentToken = await signIn(baseUrl, 'student@example.test', 'student-password-123');
  const forbiddenPage = await fetch(`${baseUrl}/staff`, {
    headers: { cookie: `lab_session=${studentToken}` },
  });
  assert.equal(forbiddenPage.status, 403);
  const forbidden = await fetch(`${baseUrl}/api/staff/workstations`, {
    method: 'POST',
    headers: headers(studentToken),
    body: JSON.stringify({ ...input, labName: 'Forbidden Lab', workstationName: 'No-01' }),
  });
  assert.equal(forbidden.status, 403);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM labs WHERE name = 'Forbidden Lab'").get().count, 0);

  const staffToken = await signIn(baseUrl, 'staff@example.test', 'staff-password-123');
  const page = await fetch(`${baseUrl}/staff`, { headers: { cookie: `lab_session=${staffToken}` } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /staff\.js/);
  const staffCreation = await fetch(`${baseUrl}/api/staff/workstations`, {
    method: 'POST',
    headers: headers(staffToken),
    body: JSON.stringify({
      ...input,
      labName: 'Lab 3001 - Robotics',
      workstationName: 'Robot-02',
    }),
  });
  assert.equal(staffCreation.status, 201);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM labs WHERE name = 'Lab 3001 - Robotics'").get().count, 1);
  const workstationList = await fetch(`${baseUrl}/api/staff/workstations`, {
    headers: headers(staffToken),
  });
  const workstations = await workstationList.json();
  assert.equal(workstationList.status, 200);
  assert.ok(workstations.some((workstation) => workstation.workstationName === 'Robot-01'));
  assert.ok(workstations.some((workstation) => workstation.workstationName === 'Robot-02'));
});

test('AC-9 staff see all student bookings while students see only their own', async (t) => {
  const { baseUrl, database, studentId, otherStudentId, staffId } = await createFixture(t);
  database.prepare(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(studentId, 3, '2026-11-03T08:00:00.000Z', '2026-11-03T09:00:00.000Z');

  const staffBookings = bookingService.listAllBookingsForStaff(database, staffId);
  assert.equal(staffBookings.length, 3);
  assert.deepEqual(new Set(staffBookings.map((booking) => booking.userId)), new Set([studentId, otherStudentId]));
  assert.throws(
    () => bookingService.listAllBookingsForStaff(database, studentId),
    (error) => error.status === 403,
  );

  const studentToken = await signIn(baseUrl, 'student@example.test', 'student-password-123');
  const ownBookingsResponse = await fetch(`${baseUrl}/api/my-bookings`, {
    headers: headers(studentToken),
  });
  const ownBookings = await ownBookingsResponse.json();
  assert.equal(ownBookingsResponse.status, 200);
  assert.equal(ownBookings.length, 2);
  assert.deepEqual(
    ownBookings.map((booking) => booking.labName).sort(),
    ['Lab 1250 - Web and Cloud', 'Lab 2310 - Networks'],
  );

  const forbidden = await fetch(`${baseUrl}/api/staff/bookings`, {
    headers: headers(studentToken),
  });
  assert.equal(forbidden.status, 403);

  const staffToken = await signIn(baseUrl, 'staff@example.test', 'staff-password-123');
  const allBookingsResponse = await fetch(`${baseUrl}/api/staff/bookings`, {
    headers: headers(staffToken),
  });
  const allBookings = await allBookingsResponse.json();
  assert.equal(allBookingsResponse.status, 200);
  assert.equal(allBookings.length, 3);
  assert.deepEqual(new Set(allBookings.map((booking) => booking.userId)), new Set([studentId, otherStudentId]));
});
