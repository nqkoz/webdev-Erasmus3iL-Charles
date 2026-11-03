const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../src/data/database');
const userRepository = require('../src/data/userRepository');
const authService = require('../src/services/authService');
const { createApp } = require('../src/server');

async function createFixture(t, { googleClient, localUser = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-google-auth-'));
  const database = openDatabase({ filename: path.join(directory, 'test.db') });
  let localUserId = null;
  if (localUser) {
    localUserId = userRepository.createUser(database, {
      email: 'student@example.test',
      passwordHash: await authService.hashPassword('correct-horse-battery'),
      role: 'student',
    });
  }
  const server = createApp(database, { googleClient }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    database,
    localUserId,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

function fakeGoogleClient(profile, calls = {}) {
  return {
    isConfigured: () => true,
    getRedirectUri: () => 'http://localhost:3000/auth/google/callback',
    getAuthorizationUrl: ({ state, codeChallenge, redirectUri }) => {
      calls.authorization = { state, codeChallenge, redirectUri };
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
    },
    exchangeCode: async (input) => {
      calls.exchange = input;
      return { accessToken: 'fake-access-token' };
    },
    getProfile: async ({ accessToken }) => {
      calls.accessToken = accessToken;
      return profile;
    },
  };
}

async function beginGoogleSignIn(baseUrl) {
  const response = await fetch(`${baseUrl}/auth/google`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  const authorizationUrl = new URL(response.headers.get('location'));
  const cookieHeader = response.headers.get('set-cookie');
  const stateCookie = cookieHeader.match(/google_oauth_state=([a-f0-9]+)/);
  const verifierCookie = cookieHeader.match(/google_oauth_verifier=([A-Za-z0-9_-]+)/);
  assert.ok(stateCookie);
  assert.ok(verifierCookie);
  return {
    authorizationUrl,
    cookie: `google_oauth_state=${stateCookie[1]}; google_oauth_verifier=${verifierCookie[1]}`,
  };
}

test('AC-13 verified Google sign-in links to the local user and creates the same session identity', async (t) => {
  const calls = {};
  const googleClient = fakeGoogleClient({
    sub: 'google-subject-123',
    email: ' Student@Example.Test ',
    email_verified: true,
  }, calls);
  const { baseUrl, database, localUserId } = await createFixture(t, { googleClient });
  database.prepare(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(localUserId, 1, '2026-11-02T08:00:00.000Z', '2026-11-02T09:00:00.000Z');

  const { authorizationUrl, cookie } = await beginGoogleSignIn(baseUrl);
  assert.equal(authorizationUrl.searchParams.get('state'), calls.authorization.state);
  assert.equal(authorizationUrl.searchParams.get('code_challenge'), calls.authorization.codeChallenge);
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');

  const callback = await fetch(`${baseUrl}/auth/google/callback?code=one-time-code&state=${calls.authorization.state}`, {
    headers: { cookie },
    redirect: 'manual',
  });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/my-bookings');
  assert.equal(calls.exchange.code, 'one-time-code');
  assert.equal(calls.exchange.codeVerifier.length, 43);
  assert.equal(calls.accessToken, 'fake-access-token');

  const sessionCookie = callback.headers.get('set-cookie').match(/lab_session=([a-f0-9]{64})/)[1];
  const googleBookingsResponse = await fetch(`${baseUrl}/api/my-bookings`, {
    headers: { cookie: `lab_session=${sessionCookie}` },
  });
  assert.equal(googleBookingsResponse.status, 200);
  const googleBookings = await googleBookingsResponse.json();
  assert.equal(googleBookings.length, 1);
  assert.equal(googleBookings[0].workstationName, 'PC-01');
  assert.equal(authService.getUserForSession(database, sessionCookie).id, localUserId);
  assert.equal(database.prepare('SELECT user_id AS userId FROM oauth_accounts WHERE provider_subject = ?').get('google-subject-123').userId, localUserId);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);

  const localUser = await authService.authenticate(database, 'student@example.test', 'correct-horse-battery');
  assert.equal(localUser.id, localUserId);
  const localSession = authService.createSession(database, localUser.id);
  const localBookingsResponse = await fetch(`${baseUrl}/api/my-bookings`, {
    headers: { cookie: `lab_session=${localSession.token}` },
  });
  assert.deepEqual(await localBookingsResponse.json(), googleBookings);
});

test('AC-13 an unverified Google e-mail is not linked to an existing local account', async (t) => {
  const googleClient = fakeGoogleClient({
    sub: 'unverified-google-subject',
    email: 'student@example.test',
    email_verified: false,
  });
  const { baseUrl, database, localUserId } = await createFixture(t, { googleClient });
  const { authorizationUrl, cookie } = await beginGoogleSignIn(baseUrl);

  const callback = await fetch(`${baseUrl}/auth/google/callback?code=one-time-code&state=${authorizationUrl.searchParams.get('state')}`, {
    headers: { cookie },
    redirect: 'manual',
  });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/login?error=google');
  assert.equal(callback.headers.get('set-cookie').includes('lab_session='), false);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM oauth_accounts').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
  assert.equal(userRepository.findById(database, localUserId).email, 'student@example.test');
});

test('Google callback rejects mismatched state without exchanging the authorization code', async (t) => {
  const calls = {};
  const googleClient = fakeGoogleClient({
    sub: 'google-subject-123',
    email: 'student@example.test',
    email_verified: true,
  }, calls);
  const { baseUrl, database } = await createFixture(t, { googleClient });
  const { cookie } = await beginGoogleSignIn(baseUrl);

  const callback = await fetch(`${baseUrl}/auth/google/callback?code=one-time-code&state=wrong-state`, {
    headers: { cookie },
    redirect: 'manual',
  });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/login?error=google');
  assert.equal(calls.exchange, undefined);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
});

test('Google callback reports provider cancellation without creating a session', async (t) => {
  const calls = {};
  const googleClient = fakeGoogleClient({
    sub: 'google-subject-123',
    email: 'student@example.test',
    email_verified: true,
  }, calls);
  const { baseUrl, database } = await createFixture(t, { googleClient });
  const { authorizationUrl, cookie } = await beginGoogleSignIn(baseUrl);

  const callback = await fetch(`${baseUrl}/auth/google/callback?error=access_denied&state=${authorizationUrl.searchParams.get('state')}`, {
    headers: { cookie },
    redirect: 'manual',
  });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/login?error=google');
  assert.equal(calls.exchange, undefined);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
});

test('Google sign-in can create a passwordless student account and reuse its linked identity', async (t) => {
  const profile = {
    sub: 'new-google-subject',
    email: 'new.student@example.test',
    email_verified: true,
  };
  const { database } = await createFixture(t, { localUser: false });

  const firstUser = authService.authenticateGoogle(database, profile);
  const secondUser = authService.authenticateGoogle(database, profile);
  assert.equal(firstUser.id, secondUser.id);
  assert.equal(firstUser.email, 'new.student@example.test');
  assert.equal(firstUser.role, 'student');
  assert.equal(userRepository.findByEmail(database, firstUser.email).passwordHash, null);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
});

test('Google sign-in is unavailable without OAuth configuration', async (t) => {
  const googleClient = {
    isConfigured: () => false,
    getAuthorizationUrl: () => assert.fail('Authorization must not start when configuration is missing'),
  };
  const { baseUrl } = await createFixture(t, { googleClient });
  const response = await fetch(`${baseUrl}/auth/google`, { redirect: 'manual' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/login?error=google-unavailable');
  const loginPage = await fetch(`${baseUrl}/login?error=google-unavailable`);
  assert.match(await loginPage.text(), /Google sign-in is not configured/);
  const normalLoginPage = await fetch(`${baseUrl}/login`);
  assert.doesNotMatch(await normalLoginPage.text(), /Continue with Google/);
});
