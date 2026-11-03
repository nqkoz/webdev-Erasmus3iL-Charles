function countForUser(database, userId) {
  return database.prepare('SELECT COUNT(*) AS count FROM bookings WHERE user_id = ?').get(userId).count;
}

function listForUser(database, userId) {
  return database.prepare(`
    SELECT
      bookings.id,
      bookings.starts_at AS startsAt,
      bookings.ends_at AS endsAt,
      bookings.status,
      labs.name AS labName,
      labs.location AS labLocation,
      workstations.name AS workstationName
    FROM bookings
    JOIN workstations ON workstations.id = bookings.workstation_id
    JOIN labs ON labs.id = workstations.lab_id
    WHERE bookings.user_id = ?
    ORDER BY bookings.starts_at, bookings.id
  `).all(userId);
}

function listAllBookings(database) {
  return database.prepare(`
    SELECT
      bookings.id,
      bookings.user_id AS userId,
      users.email AS studentEmail,
      bookings.starts_at AS startsAt,
      bookings.ends_at AS endsAt,
      bookings.status,
      labs.name AS labName,
      labs.location AS labLocation,
      workstations.name AS workstationName
    FROM bookings
    JOIN users ON users.id = bookings.user_id
    JOIN workstations ON workstations.id = bookings.workstation_id
    JOIN labs ON labs.id = workstations.lab_id
    ORDER BY bookings.starts_at, bookings.id
  `).all();
}

function listWorkstations(database) {
  return database.prepare(`
    SELECT
      workstations.id AS workstationId,
      workstations.name AS workstationName,
      workstations.description AS workstationDescription,
      workstations.activity_type AS activityType,
      labs.id AS labId,
      labs.name AS labName,
      labs.location AS labLocation
    FROM workstations
    JOIN labs ON labs.id = workstations.lab_id
    ORDER BY labs.name, workstations.name
  `).all();
}

function createLabAndWorkstation(database, {
  labName,
  labLocation,
  workstationName,
  workstationDescription,
  activityType,
}) {
  return database.transaction(() => {
    const labResult = database.prepare(`
      INSERT INTO labs (name, location) VALUES (?, ?)
    `).run(labName, labLocation);
    const workstationResult = database.prepare(`
      INSERT INTO workstations (lab_id, name, description, activity_type)
      VALUES (?, ?, ?, ?)
    `).run(Number(labResult.lastInsertRowid), workstationName, workstationDescription, activityType);
    return {
      labId: Number(labResult.lastInsertRowid),
      workstationId: Number(workstationResult.lastInsertRowid),
    };
  })();
}

function listConflictingForRange(database, startsAt, endsAt) {
  return database.prepare(`
    SELECT workstation_id AS workstationId, starts_at AS startsAt, ends_at AS endsAt
    FROM bookings
    WHERE status = 'active' AND starts_at < ? AND ends_at > ?
  `).all(endsAt, startsAt);
}

function findWorkstation(database, workstationId) {
  return database.prepare(`
    SELECT id, name FROM workstations WHERE id = ?
  `).get(workstationId);
}

function countFutureActiveForUser(database, userId, now) {
  return database.prepare(`
    SELECT COUNT(*) AS count
    FROM bookings
    WHERE user_id = ? AND status = 'active' AND starts_at > ?
  `).get(userId, now).count;
}

function createForUser(database, { userId, workstationId, startsAt, endsAt }) {
  const result = database.prepare(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(userId, workstationId, startsAt, endsAt);
  return Number(result.lastInsertRowid);
}

function findBooking(database, bookingId) {
  return database.prepare(`
    SELECT id, user_id AS userId, starts_at AS startsAt, status
    FROM bookings
    WHERE id = ?
  `).get(bookingId);
}

function cancel(database, bookingId) {
  return database.prepare(`
    UPDATE bookings SET status = 'cancelled'
    WHERE id = ? AND status = 'active'
  `).run(bookingId).changes;
}

function seedDemoBookings(database, { userId, bookings }) {
  return database.transaction(() => {
    const marker = database.prepare('SELECT 1 FROM seed_state WHERE name = ?').get('demo-student-bookings-v1');
    if (marker) return false;
    const existing = countForUser(database, userId);
    if (existing > 0) {
      database.prepare('INSERT INTO seed_state (name) VALUES (?)').run('demo-student-bookings-v1');
      return false;
    }

    const insert = database.prepare(`
      INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
      VALUES (?, ?, ?, ?, 'active')
    `);
    for (const booking of bookings) {
      insert.run(userId, booking.workstationId, booking.startsAt, booking.endsAt);
    }

    database.prepare('INSERT INTO seed_state (name) VALUES (?)').run('demo-student-bookings-v1');
    return true;
  })();
}

module.exports = {
  cancel,
  countForUser,
  countFutureActiveForUser,
  createForUser,
  createLabAndWorkstation,
  findBooking,
  findWorkstation,
  listConflictingForRange,
  listForUser,
  listAllBookings,
  listWorkstations,
  seedDemoBookings,
};
