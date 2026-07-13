-- Migration 009: Known Hosts Verification
CREATE TABLE IF NOT EXISTS known_hosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  host TEXT NOT NULL,
  key_type TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(host, key_type)
);
