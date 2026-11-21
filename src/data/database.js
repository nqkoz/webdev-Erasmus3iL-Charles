const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const defaultMigrationsDirectory = path.resolve(__dirname, '../../migrations/postgres');

function normalizeResult(result) {
  return {
    rows: result.rows || [],
    rowCount: result.rowCount ?? result.affectedRows ?? result.rows?.length ?? 0,
  };
}

function createPostgresDatabase(pool) {
  return {
    query: async (sql, values = []) => normalizeResult(await pool.query(sql, values)),
    ping: async () => pool.query('SELECT 1'),
    execute: async (sql) => pool.query(sql),
    transaction: async (callback) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback({
          query: async (sql, values = []) => normalizeResult(await client.query(sql, values)),
          execute: async (sql) => client.query(sql),
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createTestDatabase({
  migrationsDirectory = defaultMigrationsDirectory,
  seedReference = true,
} = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const engine = await PGlite.create();
  const database = {
    query: async (sql, values = []) => normalizeResult(await engine.query(sql, values)),
    ping: async () => engine.query('SELECT 1'),
    execute: async (sql) => engine.exec(sql),
    transaction: (callback) => engine.transaction((transaction) => callback({
      query: async (sql, values = []) => normalizeResult(await transaction.query(sql, values)),
      execute: async (sql) => transaction.exec(sql),
    })),
    close: () => engine.close(),
  };

  await initializeDatabase(database, migrationsDirectory);
  if (seedReference) await seedReferenceData(database);
  return database;
}

async function openDatabase({
  connectionString = process.env.DATABASE_URL,
  migrationsDirectory = defaultMigrationsDirectory,
  initialize = true,
} = {}) {
  if (typeof connectionString !== 'string' || !connectionString.trim()) {
    throw new Error('missing DATABASE_URL: see .env.example');
  }
  const pool = new Pool({ connectionString, max: 5 });
  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error.message);
  });
  const database = createPostgresDatabase(pool);
  if (!initialize) return database;

  try {
    await initializeDatabase(database, migrationsDirectory);
    await seedReferenceData(database);
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}

async function initializeDatabase(database, migrationsDirectory = defaultMigrationsDirectory) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationNames = fs.readdirSync(migrationsDirectory)
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort();
  for (const name of migrationNames) {
    const alreadyApplied = await database.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name],
    );
    if (alreadyApplied.rowCount > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDirectory, name), 'utf8');
    await database.transaction(async (transaction) => {
      await transaction.execute(sql);
      await transaction.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
  }
}

async function seedReferenceData(database) {
  await database.transaction(async (transaction) => {
    await transaction.query(`
      INSERT INTO labs (id, name, location)
      VALUES ($1, $2, $3)
      ON CONFLICT(id) DO NOTHING
    `, [1, 'Lab 1250 - Web and Cloud', 'Building 1, floor 2']);
    await transaction.query(`
      INSERT INTO labs (id, name, location)
      VALUES ($1, $2, $3)
      ON CONFLICT(id) DO NOTHING
    `, [2, 'Lab 2310 - Networks', 'Building 2, floor 3']);

    const workstations = [
      [1, 1, 'PC-01', 'Standard workstation for web development', 'web_cloud'],
      [2, 1, 'PC-02', 'Standard workstation for web development', 'web_cloud'],
      [3, 2, 'PC-01', 'Workstation for networking exercises', 'networking'],
    ];
    for (const workstation of workstations) {
      await transaction.query(`
        INSERT INTO workstations (id, lab_id, name, description, activity_type)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(id) DO NOTHING
      `, workstation);
    }

    await transaction.query(`
      SELECT setval(
        pg_get_serial_sequence('labs', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 1) FROM labs), 1),
        true
      )
    `);
    await transaction.query(`
      SELECT setval(
        pg_get_serial_sequence('workstations', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 1) FROM workstations), 1),
        true
      )
    `);
  });
}

module.exports = {
  createTestDatabase,
  initializeDatabase,
  openDatabase,
  seedReferenceData,
};
