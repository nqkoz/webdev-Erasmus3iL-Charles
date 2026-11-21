function normalizeTimes(row) {
  for (const field of ['startsAt', 'endsAt']) {
    if (row[field] instanceof Date) row[field] = row[field].toISOString();
  }
  return row;
}

function normalizeRows(rows) {
  return rows.map(normalizeTimes);
}

async function countForUser(database, userId) {
  const result = await database.query(
    'SELECT COUNT(*)::integer AS count FROM bookings WHERE user_id = $1',
    [userId],
  );
  return result.rows[0].count;
}

async function listForUser(database, userId) {
  const result = await database.query(`
    SELECT
      bookings.id,
      bookings.starts_at AS "startsAt",
      bookings.ends_at AS "endsAt",
      bookings.status,
      labs.name AS "labName",
      labs.location AS "labLocation",
      workstations.name AS "workstationName"
    FROM bookings
    JOIN workstations ON workstations.id = bookings.workstation_id
    JOIN labs ON labs.id = workstations.lab_id
    WHERE bookings.user_id = $1
    ORDER BY bookings.starts_at, bookings.id
  `, [userId]);
  return normalizeRows(result.rows);
}

async function listAllBookings(database) {
  const result = await database.query(`
    SELECT
      bookings.id,
      bookings.user_id AS "userId",
      users.email AS "studentEmail",
      bookings.starts_at AS "startsAt",
      bookings.ends_at AS "endsAt",
      bookings.status,
      labs.name AS "labName",
      labs.location AS "labLocation",
      workstations.name AS "workstationName"
    FROM bookings
    JOIN users ON users.id = bookings.user_id
    JOIN workstations ON workstations.id = bookings.workstation_id
    JOIN labs ON labs.id = workstations.lab_id
    ORDER BY bookings.starts_at, bookings.id
  `);
  return normalizeRows(result.rows);
}

async function listWorkstations(database) {
  const result = await database.query(`
    SELECT
      workstations.id AS "workstationId",
      workstations.name AS "workstationName",
      workstations.description AS "workstationDescription",
      workstations.activity_type AS "activityType",
      labs.id AS "labId",
      labs.name AS "labName",
      labs.location AS "labLocation"
    FROM workstations
    JOIN labs ON labs.id = workstations.lab_id
    ORDER BY labs.name, workstations.name
  `);
  return result.rows;
}

async function createLabAndWorkstation(database, {
  labName,
  labLocation,
  workstationName,
  workstationDescription,
  activityType,
}) {
  return database.transaction(async (transaction) => {
    const labResult = await transaction.query(`
      INSERT INTO labs (name, location) VALUES ($1, $2) RETURNING id
    `, [labName, labLocation]);
    const workstationResult = await transaction.query(`
      INSERT INTO workstations (lab_id, name, description, activity_type)
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [labResult.rows[0].id, workstationName, workstationDescription, activityType]);
    return {
      labId: labResult.rows[0].id,
      workstationId: workstationResult.rows[0].id,
    };
  });
}

async function listConflictingForRange(database, startsAt, endsAt) {
  const result = await database.query(`
    SELECT workstation_id AS "workstationId",
      starts_at AS "startsAt", ends_at AS "endsAt"
    FROM bookings
    WHERE status = 'active' AND starts_at < $1 AND ends_at > $2
  `, [endsAt, startsAt]);
  return normalizeRows(result.rows);
}

async function findWorkstation(database, workstationId) {
  const result = await database.query(
    'SELECT id, name FROM workstations WHERE id = $1',
    [workstationId],
  );
  return result.rows[0];
}

async function countFutureActiveForUser(database, userId, now) {
  const result = await database.query(`
    SELECT COUNT(*)::integer AS count
    FROM bookings
    WHERE user_id = $1 AND status = 'active' AND starts_at > $2
  `, [userId, now]);
  return result.rows[0].count;
}

async function createForUser(database, { userId, workstationId, startsAt, endsAt }) {
  const result = await database.query(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
    VALUES ($1, $2, $3, $4, 'active')
    RETURNING id
  `, [userId, workstationId, startsAt, endsAt]);
  return result.rows[0].id;
}

async function findBooking(database, bookingId) {
  const result = await database.query(`
    SELECT id, user_id AS "userId", starts_at AS "startsAt", status
    FROM bookings
    WHERE id = $1
  `, [bookingId]);
  return result.rows[0] ? normalizeTimes(result.rows[0]) : undefined;
}

async function cancel(database, bookingId) {
  const result = await database.query(`
    UPDATE bookings SET status = 'cancelled'
    WHERE id = $1 AND status = 'active'
  `, [bookingId]);
  return result.rowCount;
}

async function seedDemoBookings(database, { userId, bookings }) {
  return database.transaction(async (transaction) => {
    const marker = await transaction.query(
      'SELECT 1 FROM seed_state WHERE name = $1',
      ['demo-student-bookings-v1'],
    );
    if (marker.rowCount > 0) return false;

    const existing = await countForUser(transaction, userId);
    if (existing > 0) {
      await transaction.query('INSERT INTO seed_state (name) VALUES ($1)', ['demo-student-bookings-v1']);
      return false;
    }

    for (const booking of bookings) {
      await transaction.query(`
        INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at, status)
        VALUES ($1, $2, $3, $4, 'active')
      `, [userId, booking.workstationId, booking.startsAt, booking.endsAt]);
    }

    await transaction.query('INSERT INTO seed_state (name) VALUES ($1)', ['demo-student-bookings-v1']);
    return true;
  });
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
