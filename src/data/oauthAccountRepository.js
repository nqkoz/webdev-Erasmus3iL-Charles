function findUserByGoogleSubject(database, subject) {
  return database.prepare(`
    SELECT users.id, users.email, users.role
    FROM oauth_accounts
    JOIN users ON users.id = oauth_accounts.user_id
    WHERE oauth_accounts.provider = 'google' AND oauth_accounts.provider_subject = ?
  `).get(subject);
}

function linkGoogleAccount(database, subject, userId) {
  database.prepare(`
    INSERT INTO oauth_accounts (provider, provider_subject, user_id)
    VALUES ('google', ?, ?)
  `).run(subject, userId);
}

module.exports = { findUserByGoogleSubject, linkGoogleAccount };
