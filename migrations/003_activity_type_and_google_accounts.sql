ALTER TABLE workstations
ADD COLUMN activity_type TEXT NOT NULL DEFAULT 'web_cloud'
CHECK (activity_type IN ('web_cloud', 'networking'));

UPDATE workstations
SET activity_type = 'networking'
WHERE lower(description) LIKE '%network%';

CREATE TABLE oauth_accounts (
  provider TEXT NOT NULL CHECK (provider = 'google'),
  provider_subject TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (provider, provider_subject),
  UNIQUE (provider, user_id)
);
