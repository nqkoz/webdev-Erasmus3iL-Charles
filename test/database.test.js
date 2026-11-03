const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { applyMigrations, openDatabase } = require('../src/data/database');

test('AC-23 migration adds validated activity types and backfills existing workstations', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-upgrade-'));
  const migrationsDirectory = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  for (const migration of ['001_initial_schema.sql', '002_seed_state.sql']) {
    fs.copyFileSync(path.resolve(__dirname, `../migrations/${migration}`), path.join(migrationsDirectory, migration));
  }

  const database = new Database(path.join(directory, 'test.db'));
  database.pragma('foreign_keys = ON');
  applyMigrations(database, migrationsDirectory);
  database.prepare('INSERT INTO labs (id, name, location) VALUES (?, ?, ?)').run(1, 'Lab 1250 - Web and Cloud', 'Building 1, floor 2');
  database.prepare('INSERT INTO labs (id, name, location) VALUES (?, ?, ?)').run(2, 'Lab 2310 - Networks', 'Building 2, floor 3');
  const insertLegacyWorkstation = database.prepare(`
    INSERT INTO workstations (id, lab_id, name, description) VALUES (?, ?, ?, ?)
  `);
  insertLegacyWorkstation.run(1, 1, 'PC-01', 'Standard workstation for web development');
  insertLegacyWorkstation.run(2, 1, 'PC-02', 'Standard workstation for web development');
  insertLegacyWorkstation.run(3, 2, 'PC-01', 'Workstation for networking exercises');
  t.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  assert.deepEqual(
    database.prepare('SELECT id, name, description FROM workstations ORDER BY id').all(),
    [
      { id: 1, name: 'PC-01', description: 'Standard workstation for web development' },
      { id: 2, name: 'PC-02', description: 'Standard workstation for web development' },
      { id: 3, name: 'PC-01', description: 'Workstation for networking exercises' },
    ],
  );

  const migration = '003_activity_type_and_google_accounts.sql';
  fs.copyFileSync(path.resolve(__dirname, `../migrations/${migration}`), path.join(migrationsDirectory, migration));
  applyMigrations(database, migrationsDirectory);

  assert.deepEqual(
    database.prepare('SELECT id, activity_type AS activityType FROM workstations ORDER BY id').all(),
    [
      { id: 1, activityType: 'web_cloud' },
      { id: 2, activityType: 'web_cloud' },
      { id: 3, activityType: 'networking' },
    ],
  );
  assert.throws(
    () => database.prepare("UPDATE workstations SET activity_type = 'unsupported' WHERE id = 1").run(),
    /CHECK constraint failed/,
  );
  assert.ok(database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'oauth_accounts'
  `).get());
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 3);
  applyMigrations(database, migrationsDirectory);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 3);
});

test('migration chain creates the relational booking schema and seeds activity types', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-'));

  const database = openDatabase({ filename: path.join(directory, 'test.db') });
  t.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const tables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
  `).all().map((row) => row.name);
  assert.deepEqual(tables, ['bookings', 'labs', 'oauth_accounts', 'schema_migrations', 'seed_state', 'sessions', 'users', 'workstations']);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM labs').get().count, 2);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM workstations').get().count, 3);
  assert.deepEqual(
    database.prepare('SELECT activity_type AS activityType FROM workstations ORDER BY id').all(),
    [
      { activityType: 'web_cloud' },
      { activityType: 'web_cloud' },
      { activityType: 'networking' },
    ],
  );
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 3);
});

test('AC-4 SQLite rejects overlapping active bookings for a workstation', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-'));

  const database = openDatabase({ filename: path.join(directory, 'test.db') });
  t.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  database.prepare("INSERT INTO users (id, email, role) VALUES (1, 'student@example.test', 'student')").run();

  const insertBooking = database.prepare(`
    INSERT INTO bookings (user_id, workstation_id, starts_at, ends_at)
    VALUES (?, ?, ?, ?)
  `);
  insertBooking.run(1, 1, '2026-11-02T09:00:00+02:00', '2026-11-02T10:00:00+02:00');
  assert.throws(
    () => insertBooking.run(1, 1, '2026-11-02T09:30:00+02:00', '2026-11-02T10:30:00+02:00'),
    /overlaps an active booking/,
  );
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 1);
});
