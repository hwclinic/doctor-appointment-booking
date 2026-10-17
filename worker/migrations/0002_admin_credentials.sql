CREATE TABLE IF NOT EXISTS admin_credentials (
  id TEXT PRIMARY KEY CHECK (id = 'admin'),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
