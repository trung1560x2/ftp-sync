import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs-extra';

let db: Database | null = null;

export const runMigrations = async (database: Database) => {
  // 1. Ensure schema_version table exists
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Get current version
  const row = await database.get<{ version: number }>('SELECT MAX(version) as version FROM schema_version');
  let currentVersion = row?.version || 0;

  // 3. Check if this is an existing database (contains ftp_connections table) but has no migrations applied
  if (currentVersion === 0) {
    const existingTable = await database.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ftp_connections'"
    );
    if (existingTable) {
      console.log('Existing database detected. Seeding baseline migration (v1) without executing SQL.');
      await database.run('INSERT INTO schema_version (version) VALUES (1)');
      currentVersion = 1;
    }
  }

  // 4. Read all migration files
  const migrationsDir = path.resolve(process.cwd(), 'api/migrations');
  if (!await fs.pathExists(migrationsDir)) {
    throw new Error(`Migrations directory not found at: ${migrationsDir}`);
  }

  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      const match = f.match(/^(\d+)_/);
      if (!match) throw new Error(`Invalid migration filename format: ${f}`);
      return {
        version: parseInt(match[1]),
        filename: f,
        filepath: path.join(migrationsDir, f)
      };
    })
    .sort((a, b) => a.version - b.version);

  // 5. Apply migrations sequentially
  for (const migration of sqlFiles) {
    if (migration.version > currentVersion) {
      console.log(`Applying migration v${migration.version} (${migration.filename})...`);
      const sql = await fs.readFile(migration.filepath, 'utf8');
      
      // Execute within transaction
      await database.exec('BEGIN TRANSACTION;');
      try {
        await database.exec(sql);
        await database.run('INSERT INTO schema_version (version) VALUES (?)', migration.version);
        await database.exec('COMMIT;');
        console.log(`Successfully applied migration v${migration.version}`);
      } catch (err) {
        await database.exec('ROLLBACK;');
        console.error(`Failed to apply migration v${migration.version}:`, err);
        throw err;
      }
    }
  }
};

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

  // Run migrations
  await runMigrations(db);

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

  console.log('Database initialized successfully');
  return db;
};

export const getDb = async () => {
  if (!db) {
    return await initDb();
  }
  return db;
};

