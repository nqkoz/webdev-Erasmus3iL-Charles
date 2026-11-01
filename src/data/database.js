const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const defaultMigrationsDirectory = path.resolve(__dirname, '../../migrations');

function openDatabase({ filename, migrationsDirectory = defaultMigrationsDirectory } = {}) {
  const databasePath = filename || process.env.DATABASE_PATH || path.resolve(__dirname, '../../data/lab-booking.db');
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  applyMigrations(database, migrationsDirectory);
  seedReferenceData(database);

  return database;
}

function applyMigrations(database, migrationsDirectory) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const migrationNames = fs.readdirSync(migrationsDirectory)
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort();
  const hasMigration = database.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
  const recordMigration = database.prepare('INSERT INTO schema_migrations (name) VALUES (?)');

  for (const name of migrationNames) {
    if (hasMigration.get(name)) continue;
    const sql = fs.readFileSync(path.join(migrationsDirectory, name), 'utf8');
    database.transaction(() => {
      database.exec(sql);
      recordMigration.run(name);
    })();
  }
}

function seedReferenceData(database) {
  database.transaction(() => {
    database.prepare(`
      INSERT INTO labs (id, name, location)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(1, 'Lab 1250 - Web and Cloud', 'Building 1, floor 2');

    database.prepare(`
      INSERT INTO labs (id, name, location)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(2, 'Lab 2310 - Networks', 'Building 2, floor 3');

    const insertWorkstation = database.prepare(`
      INSERT INTO workstations (id, lab_id, name, description)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);
    insertWorkstation.run(1, 1, 'PC-01', 'Standard workstation for web development');
    insertWorkstation.run(2, 1, 'PC-02', 'Standard workstation for web development');
    insertWorkstation.run(3, 2, 'PC-01', 'Workstation for networking exercises');
  })();
}

module.exports = { applyMigrations, openDatabase, seedReferenceData };
