CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('student', 'staff')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE labs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL
);

CREATE TABLE workstations (
  id INTEGER PRIMARY KEY,
  lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE (lab_id, name)
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  workstation_id INTEGER NOT NULL REFERENCES workstations(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (starts_at < ends_at)
);

CREATE INDEX bookings_user_starts_at ON bookings (user_id, starts_at);
CREATE INDEX bookings_workstation_time ON bookings (workstation_id, starts_at, ends_at);
CREATE INDEX sessions_expires_at ON sessions (expires_at);

CREATE TRIGGER bookings_no_active_overlap_insert
BEFORE INSERT ON bookings
WHEN NEW.status = 'active'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM bookings
    WHERE workstation_id = NEW.workstation_id
      AND status = 'active'
      AND starts_at < NEW.ends_at
      AND ends_at > NEW.starts_at
  )
  THEN RAISE(ABORT, 'workstation booking overlaps an active booking')
  END;
END;

CREATE TRIGGER bookings_no_active_overlap_update
BEFORE UPDATE OF workstation_id, starts_at, ends_at, status ON bookings
WHEN NEW.status = 'active'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM bookings
    WHERE workstation_id = NEW.workstation_id
      AND id != NEW.id
      AND status = 'active'
      AND starts_at < NEW.ends_at
      AND ends_at > NEW.starts_at
  )
  THEN RAISE(ABORT, 'workstation booking overlaps an active booking')
  END;
END;
