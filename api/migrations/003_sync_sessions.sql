-- Phase 3: Create sync_sessions table for unified database logs
CREATE TABLE IF NOT EXISTS sync_sessions (
  id TEXT PRIMARY KEY,
  connection_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL,
  duration INTEGER NOT NULL,
  files TEXT NOT NULL,
  FOREIGN KEY (connection_id) REFERENCES ftp_connections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_sessions_conn ON sync_sessions(connection_id);
