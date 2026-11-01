const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../src/data/database');

test('initial migration creates the relational booking schema and seeds labs', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-booking-'));

  const database = openDatabase({ filename: path.join(directory, 'test.db') });
  t.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const tables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
  `).all().map((row) => row.name);
  assert.deepEqual(tables, ['bookings', 'labs', 'schema_migrations', 'seed_state', 'sessions', 'users', 'workstations']);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM labs').get().count, 2);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM workstations').get().count, 3);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 2);
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
