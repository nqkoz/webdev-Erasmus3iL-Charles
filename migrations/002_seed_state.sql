CREATE TABLE seed_state (
  name TEXT PRIMARY KEY,
  seeded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
