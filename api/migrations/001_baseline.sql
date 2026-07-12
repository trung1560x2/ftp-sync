-- Baseline Schema definition for OmniSync

CREATE TABLE IF NOT EXISTS ftp_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  server TEXT NOT NULL,
  port INTEGER DEFAULT 21,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  target_directory TEXT,
  local_path TEXT,
  sync_mode TEXT DEFAULT 'bi_directional',
  secure INTEGER DEFAULT 0,
  sync_deletions INTEGER DEFAULT 0,
  parallel_connections INTEGER DEFAULT 3,
  buffer_size INTEGER DEFAULT 16,
  protocol TEXT DEFAULT 'ftp',
  private_key TEXT,
  conflict_resolution TEXT DEFAULT 'overwrite',
  exclude_paths TEXT,
  last_sync_time INTEGER,
  last_sync_duration INTEGER,
  last_sync_status TEXT,
  validation_status TEXT DEFAULT 'unverified',
  validation_message TEXT,
  ssh_port INTEGER,
  ssh_username TEXT,
  ssh_password_hash TEXT,
  ssh_private_key TEXT,
  backup_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ftp_connections_server ON ftp_connections(server);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_conn ON sync_logs(connection_id);

CREATE TABLE IF NOT EXISTS transfer_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL,
  bytes INTEGER DEFAULT 0,
  direction TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transfer_stats_conn ON transfer_stats(connection_id);

CREATE TABLE IF NOT EXISTS local_file_cache (
  connection_id INTEGER NOT NULL,
  rel_path TEXT NOT NULL,
  name TEXT NOT NULL,
  is_directory INTEGER NOT NULL,
  size INTEGER DEFAULT 0,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, rel_path)
);

CREATE INDEX IF NOT EXISTS idx_local_file_cache_conn ON local_file_cache(connection_id);

CREATE TABLE IF NOT EXISTS sync_transfer_queue (
  connection_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  direction TEXT NOT NULL,
  total_size INTEGER DEFAULT 0,
  bytes_transferred INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (connection_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_sync_transfer_queue_conn ON sync_transfer_queue(connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_transfer_queue_status ON sync_transfer_queue(status);

CREATE TABLE IF NOT EXISTS command_snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  description TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  use_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_command_snippets_conn ON command_snippets(connection_id);

CREATE TABLE IF NOT EXISTS port_forwards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'local',
  local_host TEXT DEFAULT '127.0.0.1',
  local_port INTEGER NOT NULL,
  remote_host TEXT DEFAULT '127.0.0.1',
  remote_port INTEGER NOT NULL,
  description TEXT DEFAULT '',
  auto_start INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_port_forwards_conn ON port_forwards(connection_id);
