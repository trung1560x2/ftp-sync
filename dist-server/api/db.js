import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
let db = null;
export const initDb = async () => {
    if (db)
        return db;
    const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'ftp_manager.sqlite');
    console.log('Initializing DB at:', dbPath); // Log explicitly for debugging
    // Explicitly check if directory exists and is writable?
    // fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
    }
    catch (err) {
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

    CREATE INDEX IF NOT EXISTS idx_sync_logs_conn ON sync_logs(connection_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_stats_conn ON transfer_stats(connection_id);
  `);
    // Migration for existing tables
    try {
        await db.exec("ALTER TABLE ftp_connections ADD COLUMN local_path TEXT");
    }
    catch (e) { /* ignore if exists */ }
    try {
        await db.exec("ALTER TABLE ftp_connections ADD COLUMN sync_mode TEXT DEFAULT 'bi_directional'");
    }
    catch (e) { /* ignore if exists */ }
    try {
        await db.exec("ALTER TABLE ftp_connections ADD COLUMN secure INTEGER DEFAULT 0");
    }
    catch (e) { /* ignore if exists */ }
    try {
        await db.exec("ALTER TABLE ftp_connections ADD COLUMN sync_deletions INTEGER DEFAULT 0");
    }
    catch (e) { /* ignore if exists */ }
    try {
        await db.exec("ALTER TABLE ftp_connections ADD COLUMN parallel_connections INTEGER DEFAULT 3");
    }
    catch (e) { /* ignore if exists */ }
    try {
        await db.exec("ALTER TABLE ftp_connections ADD COLUMN buffer_size INTEGER DEFAULT 16");
    }
    catch (e) { /* ignore if exists */ }
    console.log('Database initialized successfully');
    return db;
};
export const getDb = async () => {
    if (!db) {
        return await initDb();
    }
    return db;
};
