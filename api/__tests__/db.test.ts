import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { runMigrations } from '../db.js';

describe('Database Migrations Engine', () => {
  const testBaseDir = path.resolve(process.cwd(), 'scratch/test_db');
  const originalCwd = process.cwd();

  beforeAll(async () => {
    await fs.ensureDir(testBaseDir);
  });

  afterAll(async () => {
    // Restore original cwd first
    process.chdir(originalCwd);
    await fs.remove(testBaseDir);
  });

  beforeEach(async () => {
    await fs.emptyDir(testBaseDir);
    // Change cwd to temp directory so relative path 'api/migrations' resolves there
    process.chdir(testBaseDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('should run migrations sequentially on a new database', async () => {
    // 1. Create a mock migrations folder structure
    const migrationsDir = path.join(testBaseDir, 'api', 'migrations');
    await fs.ensureDir(migrationsDir);

    // Create 001_baseline.sql
    await fs.writeFile(
      path.join(migrationsDir, '001_baseline.sql'),
      `CREATE TABLE test_table (id INTEGER PRIMARY KEY, val TEXT);`,
      'utf8'
    );

    // Create 002_migration.sql
    await fs.writeFile(
      path.join(migrationsDir, '002_migration.sql'),
      `ALTER TABLE test_table ADD COLUMN extra TEXT;`,
      'utf8'
    );

    // 2. Open an in-memory SQLite database
    const db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    // 3. Run migrations
    await runMigrations(db);

    // 4. Verify tables and schema version
    const versionRow = await db.get<{ version: number }>('SELECT MAX(version) as version FROM schema_version');
    expect(versionRow?.version).toBe(2);

    // Check if test_table exists and has the extra column
    const schema = await db.all("PRAGMA table_info(test_table)");
    expect(schema).toHaveLength(3); // id, val, extra
    expect(schema[0].name).toBe('id');
    expect(schema[1].name).toBe('val');
    expect(schema[2].name).toBe('extra');

    await db.close();
  });

  it('should seed version 1 and skip baseline sql for existing databases', async () => {
    const migrationsDir = path.join(testBaseDir, 'api', 'migrations');
    await fs.ensureDir(migrationsDir);

    // Create mock migrations
    await fs.writeFile(
      path.join(migrationsDir, '001_baseline.sql'),
      `CREATE TABLE ftp_connections (id INTEGER PRIMARY KEY);`, // If it runs, it would recreate or fail
      'utf8'
    );

    await fs.writeFile(
      path.join(migrationsDir, '002_migration.sql'),
      `CREATE TABLE test_two (id INTEGER PRIMARY KEY);`,
      'utf8'
    );

    const db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    // Manually create ftp_connections table to simulate pre-existing database
    await db.exec('CREATE TABLE ftp_connections (id INTEGER PRIMARY KEY);');

    // Run migrations
    await runMigrations(db);

    // Schema version should be 2 (baseline 1 seeded without run, 2 run successfully)
    const versionRow = await db.get<{ version: number }>('SELECT MAX(version) as version FROM schema_version');
    expect(versionRow?.version).toBe(2);

    // Verify test_two exists
    const testTwoExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='test_two'");
    expect(testTwoExists).toBeDefined();

    await db.close();
  });

  it('should rollback and throw error if a migration fails', async () => {
    const migrationsDir = path.join(testBaseDir, 'api', 'migrations');
    await fs.ensureDir(migrationsDir);

    await fs.writeFile(
      path.join(migrationsDir, '001_baseline.sql'),
      `CREATE TABLE first_table (id INTEGER PRIMARY KEY);`,
      'utf8'
    );

    // 002 has invalid SQL syntax
    await fs.writeFile(
      path.join(migrationsDir, '002_failed.sql'),
      `CREATE TABLE INVALID_SQL SYNTAX ERR;`,
      'utf8'
    );

    const db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    await expect(runMigrations(db)).rejects.toThrow();

    // Verify version rollback: version should be 1
    const versionRow = await db.get<{ version: number }>('SELECT MAX(version) as version FROM schema_version');
    expect(versionRow?.version).toBe(1);

    // Verify first_table exists, but failed table does not
    const firstExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='first_table'");
    expect(firstExists).toBeDefined();

    await db.close();
  });
});
