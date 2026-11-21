async function findUserByGoogleSubject(database, subject) {
  const result = await database.query(`
    SELECT users.id, users.email, users.role
    FROM oauth_accounts
    JOIN users ON users.id = oauth_accounts.user_id
    WHERE oauth_accounts.provider = 'google' AND oauth_accounts.provider_subject = $1
  `, [subject]);
  return result.rows[0];
}

async function linkGoogleAccount(database, subject, userId) {
  await database.query(`
    INSERT INTO oauth_accounts (provider, provider_subject, user_id)
    VALUES ('google', $1, $2)
  `, [subject, userId]);
}

module.exports = { findUserByGoogleSubject, linkGoogleAccount };
