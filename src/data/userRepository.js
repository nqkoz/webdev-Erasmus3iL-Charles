async function findByEmail(database, email) {
  const result = await database.query(`
    SELECT id, email, password_hash AS "passwordHash", role
    FROM users
    WHERE lower(email) = lower($1)
  `, [email]);
  return result.rows[0];
}

async function findById(database, userId) {
  const result = await database.query(`
    SELECT id, email, role
    FROM users
    WHERE id = $1
  `, [userId]);
  return result.rows[0];
}

async function createUser(database, { email, passwordHash, role = 'student' }) {
  const result = await database.query(`
    INSERT INTO users (email, password_hash, role)
    VALUES ($1, $2, $3)
    RETURNING id
  `, [email, passwordHash, role]);
  return result.rows[0].id;
}

module.exports = { createUser, findByEmail, findById };
