const assert = require('node:assert/strict');
const test = require('node:test');
const { createTestDatabase } = require('../src/data/database');
const bookingRepository = require('../src/data/bookingRepository');
const userRepository = require('../src/data/userRepository');
const authService = require('../src/services/authService');
const bookingService = require('../src/services/bookingService');

const fixedNow = new Date('2026-10-30T12:00:00.000Z');

test('service validation rejects invalid authentication and booking inputs', async (t) => {
  const database = await createTestDatabase();
  t.after(() => database.close());
  const passwordHash = await authService.hashPassword('correct-horse-battery');
  const studentId = await userRepository.createUser(database, {
    email: 'validation-student@example.test',
    passwordHash,
    role: 'student',
  });
  const staffId = await userRepository.createUser(database, {
    email: 'validation-staff@example.test',
    passwordHash,
    role: 'staff',
  });

  await assert.rejects(authService.hashPassword('short'), /at least 8 characters/);
  assert.equal(await authService.verifyPassword(null, passwordHash), false);
  assert.equal(await authService.verifyPassword('password', 'not-a-hash'), false);
  assert.equal(await authService.ensureSeedStudent(database, {}), false);
  await assert.rejects(
    authService.ensureSeedStudent(database, { email: 'student@example.test' }),
    /required together/,
  );
  await assert.rejects(
    authService.ensureSeedStudent(database, { email: ' ', password: 'long-enough-password' }),
    /required together/,
  );
  assert.equal(await authService.authenticate(database, null, 'password'), null);
  assert.equal(await authService.authenticate(database, ' ', 'password'), null);
  assert.equal(await authService.authenticate(database, 'missing@example.test', 'password'), null);
  assert.equal(await authService.authenticate(database, 'validation-student@example.test', 'wrong-password'), null);
  assert.equal((await authService.authenticate(database, 'validation-student@example.test', 'correct-horse-battery')).id, studentId);

  for (const profile of [
    null,
    { sub: '', email: 'student@example.test', email_verified: true },
    { sub: 'valid-subject', email: 'student@example.test', email_verified: false },
    { sub: 'valid-subject', email: 'not-an-email', email_verified: true },
    { sub: 'valid-subject', email: `${'a'.repeat(250)}@example.test`, email_verified: true },
  ]) {
    await assert.rejects(authService.authenticateGoogle(database, profile), authService.GoogleAccountError);
  }
  const googleProfile = {
    sub: 'validation-google-subject',
    email: 'google.student@example.test',
    email_verified: true,
  };
  const googleUser = await authService.authenticateGoogle(database, googleProfile);
  assert.equal((await authService.authenticateGoogle(database, googleProfile)).id, googleUser.id);
  assert.equal(await authService.authenticate(database, googleUser.email, 'password'), null);
  const duplicateLinkDatabase = {
    transaction: async () => {
      throw Object.assign(new Error('unique violation'), { code: '23505' });
    },
  };
  await assert.rejects(
    authService.authenticateGoogle(duplicateLinkDatabase, {
      ...googleProfile,
      sub: 'another-subject',
    }),
    authService.GoogleAccountError,
  );
  await assert.rejects(
    authService.authenticateGoogle({ transaction: async () => { throw new Error('database unavailable'); } }, {
      ...googleProfile,
      sub: 'error-subject',
    }),
    /database unavailable/,
  );

  assert.equal(await authService.getUserForSession(database, 'invalid-token'), null);
  assert.equal(await authService.revokeSession(database, 'invalid-token'), false);
  const session = await authService.createSession(database, studentId);
  assert.equal((await authService.getUserForSession(database, session.token)).id, studentId);
  assert.equal(await authService.revokeSession(database, session.token), true);
  assert.equal(await authService.revokeSession(database, session.token), false);

  await assert.rejects(bookingService.ensureStudent(database, 0), (error) => error.status === 401);
  await assert.rejects(bookingService.ensureStudent(database, 1.5), (error) => error.status === 401);
  await assert.rejects(bookingService.ensureStudent(database, 999), (error) => error.status === 401);
  await assert.rejects(bookingService.ensureStudent(database, staffId), (error) => error.status === 403);
  await assert.rejects(bookingService.ensureStaff(database, 0), (error) => error.status === 401);
  await assert.rejects(bookingService.ensureStaff(database, 1.5), (error) => error.status === 401);
  await assert.rejects(bookingService.ensureStaff(database, 999), (error) => error.status === 401);
  await assert.rejects(bookingService.ensureStaff(database, studentId), (error) => error.status === 403);
  await assert.rejects(bookingService.ensureAvailabilityAccess(database, 0), (error) => error.status === 401);
  await assert.rejects(bookingService.ensureAvailabilityAccess(database, 1.5), (error) => error.status === 401);
  await assert.rejects(bookingService.ensureAvailabilityAccess(database, 999), (error) => error.status === 401);

  const originalFindById = userRepository.findById;
  userRepository.findById = async () => ({ id: 1000, role: 'visitor' });
  try {
    await assert.rejects(bookingService.ensureAvailabilityAccess(database, 1000), (error) => error.status === 403);
  } finally {
    userRepository.findById = originalFindById;
  }

  await assert.rejects(bookingService.createLabAndWorkstation(database, studentId, {}), (error) => error.status === 403);
  await assert.rejects(bookingService.createLabAndWorkstation(database, staffId, null), (error) => error.status === 400);
  await assert.rejects(bookingService.createLabAndWorkstation(database, staffId, []), (error) => error.status === 400);
  const validLabInput = {
    labName: 'Validation Lab',
    labLocation: 'Building 4',
    workstationName: 'PC-01',
    workstationDescription: 'Student workstation',
    activityType: 'web_cloud',
  };
  for (const invalidLabInput of [
    { ...validLabInput, labName: ' ' },
    { ...validLabInput, labName: 'L'.repeat(101) },
    { ...validLabInput, labLocation: '' },
    { ...validLabInput, labLocation: 'L'.repeat(201) },
    { ...validLabInput, workstationName: null },
    { ...validLabInput, workstationName: 'W'.repeat(101) },
    { ...validLabInput, workstationDescription: '' },
    { ...validLabInput, workstationDescription: 'D'.repeat(501) },
  ]) {
    await assert.rejects(
      bookingService.createLabAndWorkstation(database, staffId, invalidLabInput),
      (error) => error.status === 400,
    );
  }
  await assert.rejects(bookingService.createLabAndWorkstation(database, staffId, {
    ...validLabInput,
    activityType: 'unsupported',
  }), (error) => error.status === 400);
  await bookingService.createLabAndWorkstation(database, staffId, validLabInput);
  await assert.rejects(
    bookingService.createLabAndWorkstation(database, staffId, validLabInput),
    (error) => error.status === 409,
  );

  await assert.rejects(bookingService.ensureDemoBookings(database, 0), /seeded student/);
  for (const date of [
    undefined,
    'invalid-date',
    '2026-02-30',
    '2026-10-29',
    '2026-12-01',
    '2026-10-31',
    '2026-11-01',
  ]) {
    await assert.rejects(
      bookingService.listAvailableSlots(database, studentId, date, fixedNow),
      bookingService.BookingError,
    );
  }
  await assert.rejects(bookingService.listAvailableSlots(database, 0, '2026-11-02', fixedNow), (error) => error.status === 401);
  const slotsForToday = await bookingService.listAvailableSlots(database, studentId, '2026-10-30', fixedNow);
  assert.ok(slotsForToday.length > 0);
  assert.ok(slotsForToday.every((slot) => Date.parse(slot.startsAt) > fixedNow.getTime()));

  for (const bookingInput of [
    null,
    'not-an-object',
    [],
    { workstationId: 0, startsAt: '2026-11-02T07:00:00.000Z' },
    { workstationId: 1.5, startsAt: '2026-11-02T07:00:00.000Z' },
    { workstationId: 1, startsAt: 'not-an-instant' },
    { workstationId: 1, startsAt: 123 },
    { workstationId: 1, startsAt: '2026-11-02T09:00:00+02:00' },
    { workstationId: 1, startsAt: '2026-11-02T05:30:00.000Z' },
    { workstationId: 1, startsAt: '2026-11-02T17:00:00.000Z' },
    { workstationId: 1, startsAt: '2026-11-02T06:30:00.000Z' },
    { workstationId: 1, startsAt: '2026-11-02T06:00:30.000Z' },
    { workstationId: 1, startsAt: '2026-10-29T07:00:00.000Z' },
    { workstationId: 1, startsAt: '2026-10-31T07:00:00.000Z' },
    { workstationId: 1, startsAt: '2026-12-01T07:00:00.000Z' },
    { workstationId: 999, startsAt: '2026-11-02T07:00:00.000Z' },
  ]) {
    await assert.rejects(
      bookingService.createBooking(database, studentId, bookingInput, fixedNow),
      bookingService.BookingError,
    );
  }
  await assert.rejects(bookingService.createBooking(database, staffId, {}, fixedNow), (error) => error.status === 403);

  const originalCreateForUser = bookingRepository.createForUser;
  try {
    bookingRepository.createForUser = async () => {
      throw new Error('workstation booking overlaps an active booking');
    };
    await assert.rejects(
      bookingService.createBooking(database, studentId, {
        workstationId: 1,
        startsAt: '2026-11-02T07:00:00.000Z',
      }, fixedNow),
      (error) => error.status === 409,
    );

    bookingRepository.createForUser = async () => {
      throw new Error('storage failure');
    };
    await assert.rejects(
      bookingService.createBooking(database, studentId, {
        workstationId: 1,
        startsAt: '2026-11-02T07:00:00.000Z',
      }, fixedNow),
      /storage failure/,
    );
  } finally {
    bookingRepository.createForUser = originalCreateForUser;
  }

  await assert.rejects(bookingService.cancelBooking(database, studentId, 0, fixedNow), (error) => error.status === 400);
  await assert.rejects(bookingService.cancelBooking(database, studentId, 999, fixedNow), (error) => error.status === 404);
  await database.query(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES ($1, 1, '2026-11-02T07:00:00Z', '2026-11-02T08:00:00Z', 'cancelled')
  `, [studentId]);
  await assert.rejects(bookingService.cancelBooking(database, studentId, 1, fixedNow), (error) => error.status === 409);
  await database.query(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES ($1, 1, '2026-10-29T07:00:00Z', '2026-10-29T08:00:00Z', 'active')
  `, [studentId]);
  await assert.rejects(bookingService.cancelBooking(database, studentId, 2, fixedNow), (error) => error.status === 409);
});
