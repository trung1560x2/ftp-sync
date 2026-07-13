CREATE TABLE IF NOT EXISTS ssh_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'rsa' | 'ed25519'
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL, -- Encrypted private key
  passphrase_protected INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE ftp_connections ADD COLUMN ssh_key_id INTEGER REFERENCES ssh_keys(id) ON DELETE SET NULL;
