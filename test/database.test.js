const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createTestDatabase, initializeDatabase, openDatabase } = require('../src/data/database');

const postgresMigrations = path.resolve(__dirname, '../migrations/postgres');

test('application refuses to open the database without DATABASE_URL', async () => {
  await assert.rejects(openDatabase({ connectionString: '' }), /missing DATABASE_URL: see \.env\.example/);
});

test('AC-23 PostgreSQL migration adds validated activity types and backfills workstations', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-upgrade-'));
  const migrationsDirectory = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  for (const migration of ['001_initial_schema.sql', '002_seed_state.sql']) {
    fs.copyFileSync(path.join(postgresMigrations, migration), path.join(migrationsDirectory, migration));
  }

  const database = await createTestDatabase({ migrationsDirectory, seedReference: false });
  t.after(async () => {
    await database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await database.query(
    'INSERT INTO labs (id, name, location) VALUES ($1, $2, $3), ($4, $5, $6)',
    [1, 'Lab 1250 - Web and Cloud', 'Building 1, floor 2', 2, 'Lab 2310 - Networks', 'Building 2, floor 3'],
  );
  await database.query(`
    INSERT INTO workstations (id, lab_id, name, description)
    VALUES
      (1, 1, 'PC-01', 'Standard workstation for web development'),
      (2, 1, 'PC-02', 'Standard workstation for web development'),
      (3, 2, 'PC-01', 'Workstation for networking exercises')
  `);

  fs.copyFileSync(
    path.join(postgresMigrations, '003_activity_type_and_google_accounts.sql'),
    path.join(migrationsDirectory, '003_activity_type_and_google_accounts.sql'),
  );
  await initializeDatabase(database, migrationsDirectory);

  const workstations = await database.query(
    'SELECT id, activity_type AS "activityType" FROM workstations ORDER BY id',
  );
  assert.deepEqual(workstations.rows, [
    { id: 1, activityType: 'web_cloud' },
    { id: 2, activityType: 'web_cloud' },
    { id: 3, activityType: 'networking' },
  ]);
  await assert.rejects(
    database.query("UPDATE workstations SET activity_type = 'unsupported' WHERE id = 1"),
    /check constraint/i,
  );
  const oauthAccounts = await database.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'oauth_accounts'",
  );
  assert.equal(oauthAccounts.rowCount, 1);
  assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM schema_migrations')).rows[0].count, 3);
  await initializeDatabase(database, migrationsDirectory);
  assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM schema_migrations')).rows[0].count, 3);
});

test('PostgreSQL migration chain creates and seeds the relational booking schema', async (t) => {
  const database = await createTestDatabase();
  t.after(() => database.close());

  const tables = await database.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  assert.deepEqual(tables.rows.map((row) => row.table_name), [
    'bookings',
    'labs',
    'oauth_accounts',
    'schema_migrations',
    'seed_state',
    'sessions',
    'users',
    'workstations',
  ]);
  assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM labs')).rows[0].count, 2);
  assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM workstations')).rows[0].count, 3);
  assert.deepEqual(
    (await database.query('SELECT activity_type AS "activityType" FROM workstations ORDER BY id')).rows,
    [
      { activityType: 'web_cloud' },
      { activityType: 'web_cloud' },
      { activityType: 'networking' },
    ],
  );
  assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM schema_migrations')).rows[0].count, 3);
});

test('AC-4 PostgreSQL rejects overlapping active bookings for a workstation', async (t) => {
  const database = await createTestDatabase();
  t.after(() => database.close());
  await database.query(
    "INSERT INTO users (id, email, role) VALUES (1, 'student@example.test', 'student')",
  );

  const insertBooking = `
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at)
    VALUES ($1, $2, $3, $4)
  `;
  await database.query(insertBooking, [1, 1, '2026-11-02T09:00:00+02:00', '2026-11-02T10:00:00+02:00']);
  await assert.rejects(
    database.query(insertBooking, [1, 1, '2026-11-02T09:30:00+02:00', '2026-11-02T10:30:00+02:00']),
    (error) => error.code === '23P01' && /overlaps an active booking/.test(error.message),
  );
  assert.equal((await database.query('SELECT COUNT(*)::integer AS count FROM bookings')).rows[0].count, 1);
});
