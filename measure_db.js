import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function test() {
  const dbPath = path.resolve('ftp_manager.sqlite');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const connectionId = 7;
  const count = 39880;
  const files = [];
  for (let i = 0; i < count; i++) {
    files.push({
      relPath: `folder/subfolder/file_${i}.txt`,
      name: `file_${i}.txt`,
      isDirectory: false,
      size: 1024,
      modifiedAt: new Date().toISOString()
    });
  }

  console.log('Testing sequential prepared statement inserts inside transaction...');
  let tStart = Date.now();
  await db.run('BEGIN TRANSACTION');
  const stmt = await db.prepare(`
    INSERT OR REPLACE INTO local_file_cache (connection_id, rel_path, name, is_directory, size, modified_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const f of files) {
    await stmt.run(connectionId, f.relPath, f.name, f.isDirectory ? 1 : 0, f.size, f.modifiedAt);
  }
  await stmt.finalize();
  await db.run('COMMIT');
  console.log(`Sequential inserts took: ${Date.now() - tStart}ms`);

  // Clear cache
  await db.run('DELETE FROM local_file_cache WHERE connection_id = ?', connectionId);

  console.log('Testing batch SQL statement inserts (1000 at a time)...');
  tStart = Date.now();
  await db.run('BEGIN TRANSACTION');
  const batchSize = 1000;
  for (let i = 0; i < files.length; i += batchSize) {
    const chunk = files.slice(i, i + batchSize);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const sql = `INSERT OR REPLACE INTO local_file_cache (connection_id, rel_path, name, is_directory, size, modified_at) VALUES ${placeholders}`;
    const params = [];
    for (const f of chunk) {
      params.push(connectionId, f.relPath, f.name, f.isDirectory ? 1 : 0, f.size, f.modifiedAt);
    }
    await db.run(sql, params);
  }
  await db.run('COMMIT');
  console.log(`Batch inserts took: ${Date.now() - tStart}ms`);

  await db.close();
}

test().catch(console.error);
