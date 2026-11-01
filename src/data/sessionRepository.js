function createSession(database, { tokenHash, userId, expiresAt }) {
  database.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(tokenHash, userId, expiresAt);
}

function findActiveSession(database, tokenHash, now) {
  return database.prepare(`
    SELECT users.id, users.email, users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, now);
}

function deleteSession(database, tokenHash) {
  return database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash).changes;
}

module.exports = { createSession, deleteSession, findActiveSession };
