function findByEmail(database, email) {
  return database.prepare(`
    SELECT id, email, password_hash AS passwordHash, role
    FROM users
    WHERE email = ? COLLATE NOCASE
  `).get(email);
}

function findById(database, userId) {
  return database.prepare(`
    SELECT id, email, role
    FROM users
    WHERE id = ?
  `).get(userId);
}

function createUser(database, { email, passwordHash, role = 'student' }) {
  const result = database.prepare(`
    INSERT INTO users (email, password_hash, role)
    VALUES (?, ?, ?)
  `).run(email, passwordHash, role);
  return Number(result.lastInsertRowid);
}

module.exports = { createUser, findByEmail, findById };
