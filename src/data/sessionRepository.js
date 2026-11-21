async function createSession(database, { tokenHash, userId, expiresAt }) {
  await database.query(`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES ($1, $2, $3)
  `, [tokenHash, userId, expiresAt]);
}

async function findActiveSession(database, tokenHash, now) {
  const result = await database.query(`
    SELECT users.id, users.email, users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = $1 AND sessions.expires_at > $2
  `, [tokenHash, now]);
  return result.rows[0];
}

async function deleteSession(database, tokenHash) {
  const result = await database.query(
    'DELETE FROM sessions WHERE token_hash = $1',
    [tokenHash],
  );
  return result.rowCount;
}

module.exports = { createSession, deleteSession, findActiveSession };
