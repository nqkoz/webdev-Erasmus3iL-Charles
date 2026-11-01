const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../src/data/database');
const userRepository = require('../src/data/userRepository');
const authService = require('../src/services/authService');
const { createApp } = require('../src/server');

async function startTestServer(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-auth-'));
  const database = openDatabase({ filename: path.join(directory, 'test.db') });
  const passwordHash = await authService.hashPassword('correct-horse-battery');
  userRepository.createUser(database, {
    email: 'student@example.test',
    passwordHash,
    role: 'student',
  });
  const server = createApp(database).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('password hashes are salted and verify without storing the password', async () => {
  const firstHash = await authService.hashPassword('correct-horse-battery');
  const secondHash = await authService.hashPassword('correct-horse-battery');
  assert.notEqual(firstHash, secondHash);
  assert.equal(await authService.verifyPassword('correct-horse-battery', firstHash), true);
  assert.equal(await authService.verifyPassword('wrong-password', firstHash), false);
  assert.equal(firstHash.includes('correct-horse-battery'), false);
});

test('AC-14 an unauthenticated visitor is redirected from the page and receives no API data', async (t) => {
  const baseUrl = await startTestServer(t);
  const pageResponse = await fetch(`${baseUrl}/my-bookings`, { redirect: 'manual' });
  assert.equal(pageResponse.status, 302);
  assert.equal(pageResponse.headers.get('location'), '/login');

  const apiResponse = await fetch(`${baseUrl}/api/my-bookings`);
  assert.equal(apiResponse.status, 401);
  assert.deepEqual(await apiResponse.json(), { error: 'Sign in first.' });
});

test('AC-17 an incorrect password gives a readable error and no authenticated session', async (t) => {
  const baseUrl = await startTestServer(t);
  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'student@example.test', password: 'wrong-password' }),
    redirect: 'manual',
  });
  assert.equal(loginResponse.status, 303);
  assert.equal(loginResponse.headers.get('location'), '/login?error=credentials');
  assert.equal(loginResponse.headers.get('set-cookie'), null);

  const loginPageResponse = await fetch(`${baseUrl}/login?error=credentials`);
  const loginPage = await loginPageResponse.text();
  assert.match(loginPage, /E-mail or password is incorrect/);
});

test('AC-1 a valid local sign-in creates an opaque HttpOnly session cookie', async (t) => {
  const baseUrl = await startTestServer(t);
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'student@example.test', password: 'correct-horse-battery' }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/my-bookings');
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /lab_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Lax/);
  const sessionToken = setCookie.match(/lab_session=([a-f0-9]{64})/)[1];
  const bookingsResponse = await fetch(`${baseUrl}/my-bookings`, {
    headers: { cookie: `lab_session=${sessionToken}` },
  });
  assert.equal(bookingsResponse.status, 200);
  assert.match(await bookingsResponse.text(), /My bookings/);
});

test('a seeded student is inserted once and its password is hashed', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-seed-'));
  const database = openDatabase({ filename: path.join(directory, 'test.db') });
  t.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  assert.equal(await authService.ensureSeedStudent(database, {
    email: ' Student@Lab-Booking.Local ',
    password: 'private-test-password',
  }), true);
  assert.equal(await authService.ensureSeedStudent(database, {
    email: 'student@lab-booking.local',
    password: 'another-private-password',
  }), false);

  const user = userRepository.findByEmail(database, 'student@lab-booking.local');
  assert.equal(user.role, 'student');
  assert.notEqual(user.passwordHash, 'private-test-password');
  assert.equal(await authService.verifyPassword('private-test-password', user.passwordHash), true);
});
