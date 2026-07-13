CREATE TABLE IF NOT EXISTS remote_file_cache (
  connection_id INTEGER NOT NULL,
  rel_path TEXT NOT NULL,
  name TEXT NOT NULL,
  is_directory INTEGER NOT NULL,
  size INTEGER DEFAULT 0,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, rel_path)
);

CREATE INDEX IF NOT EXISTS idx_remote_file_cache_conn ON remote_file_cache(connection_id);
