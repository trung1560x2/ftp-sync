import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database | null = null;

export const initDb = async () => {
  if (db) return db;

  const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'ftp_manager.sqlite');
  console.log('Initializing DB at:', dbPath); // Log explicitly for debugging

  // Explicitly check if directory exists and is writable?
  // fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);

  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // Enable WAL mode and synchronous optimizations for high concurrency
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA synchronous = NORMAL;');
  } catch (err: any) {
    console.error('Failed to open database:', err);
    // Fallback to memory db if file access fails, just to keep app running (though data wont persist)
    // or re-throw to show error. Let's re-throw but with clearer message
    throw new Error(`Failed to open database at ${dbPath}: ${err.message}`);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ftp_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server TEXT NOT NULL,
      port INTEGER DEFAULT 21,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      target_directory TEXT,
      local_path TEXT,
      sync_mode TEXT DEFAULT 'bi_directional',
      secure INTEGER DEFAULT 0,
      sync_deletions INTEGER DEFAULT 0,
      ssh_port INTEGER,
      ssh_username TEXT,
      ssh_password_hash TEXT,
      ssh_private_key TEXT,
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

    CREATE TABLE IF NOT EXISTS transfer_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id INTEGER NOT NULL,
      bytes INTEGER DEFAULT 0,
      direction TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS local_file_cache (
      connection_id INTEGER NOT NULL,
      rel_path TEXT NOT NULL,
      name TEXT NOT NULL,
      is_directory INTEGER NOT NULL,
      size INTEGER DEFAULT 0,
      modified_at TEXT NOT NULL,
      PRIMARY KEY (connection_id, rel_path)
    );

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

    CREATE INDEX IF NOT EXISTS idx_sync_logs_conn ON sync_logs(connection_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_stats_conn ON transfer_stats(connection_id);
    CREATE INDEX IF NOT EXISTS idx_local_file_cache_conn ON local_file_cache(connection_id);
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

    CREATE INDEX IF NOT EXISTS idx_command_snippets_conn ON command_snippets(connection_id);
    CREATE INDEX IF NOT EXISTS idx_port_forwards_conn ON port_forwards(connection_id);
  `);

  // Recovery: Mark all 'syncing' or 'pending' files from previous crash as 'interrupted'
  try {
    await db.exec(`
      UPDATE sync_transfer_queue 
      SET status = 'interrupted' 
      WHERE status = 'syncing' OR status = 'pending'
    `);
    console.log('Startup crash check: Interrupted any pending/syncing transfers');
  } catch (err) {
    console.error('Failed to update crashed sync states:', err);
  }

  // Migration for existing tables
  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN local_path TEXT");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN sync_mode TEXT DEFAULT 'bi_directional'");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN secure INTEGER DEFAULT 0");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN sync_deletions INTEGER DEFAULT 0");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN parallel_connections INTEGER DEFAULT 3");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN buffer_size INTEGER DEFAULT 16");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN protocol TEXT DEFAULT 'ftp'");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN private_key TEXT");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN name TEXT");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN conflict_resolution TEXT DEFAULT 'overwrite'");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN exclude_paths TEXT");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN last_sync_time INTEGER");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN last_sync_duration INTEGER");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN last_sync_status TEXT");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN validation_status TEXT DEFAULT 'unverified'");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN validation_message TEXT");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN ssh_port INTEGER");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN ssh_username TEXT");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN ssh_password_hash TEXT");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN ssh_private_key TEXT");
  } catch (e) { /* ignore if exists */ }

  try {
    await db.exec("ALTER TABLE ftp_connections ADD COLUMN backup_path TEXT");
  } catch (e) { /* ignore if exists */ }

  // Migration: ensure command_snippets columns exist (for older DBs)
  try {
    await db.exec("ALTER TABLE command_snippets ADD COLUMN use_count INTEGER DEFAULT 0");
  } catch (e) { /* ignore if exists */ }

  // Migration: ensure port_forwards columns exist (for older DBs)
  try {
    await db.exec("ALTER TABLE port_forwards ADD COLUMN auto_start INTEGER DEFAULT 0");
  } catch (e) { /* ignore if exists */ }

  console.log('Database initialized successfully');
  return db;
};

export const getDb = async () => {
  if (!db) {
    return await initDb();
  }
  return db;
};
