-- Migration 008: Terminal Tabs Persistence
CREATE TABLE IF NOT EXISTS terminal_tabs (
  id TEXT PRIMARY KEY,
  connection_id INTEGER,
  title TEXT,
  cwd TEXT,
  color TEXT,
  split_mode TEXT,
  split_parent_id TEXT,
  position INTEGER DEFAULT 0,
  FOREIGN KEY(connection_id) REFERENCES ftp_connections(id) ON DELETE SET NULL
);
