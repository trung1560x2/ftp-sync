import { getDb, initDb } from './dist-server/api/db.js';
import SyncManager from './dist-server/api/services/SyncService.js';
import path from 'path';
import fs from 'fs-extra';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verify() {
  console.log('Initializing DB...');
  await initDb();

  const connId = 7;
  const db = await getDb();
  const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connId);
  if (!config) {
    console.error('Connection 7 not found in DB!');
    return;
  }

  console.log('Config local path:', config.local_path);
  const localRoot = config.local_path;

  console.log('Starting Sync Session for Connection 7...');
  const tStart = Date.now();
  await SyncManager.startSync(connId);

  console.log('Waiting for cache warming to complete...');
  let attempts = 0;
  let success = false;
  while (attempts < 360) {
    if (SyncManager.isCacheWarmed(connId)) {
      const elapsed = (Date.now() - tStart) / 1000;
      console.log(`SUCCESS: Cache warmed in ${elapsed.toFixed(2)} seconds!`);
      success = true;
      break;
    }
    await wait(500);
    attempts++;
  }

  if (!success) {
    console.error('Cache failed to warm within 30 seconds.');
  } else {
    const cachedFiles = await db.all('SELECT count(*) as count FROM local_file_cache WHERE connection_id = ?', connId);
    console.log(`Total files indexed in database: ${cachedFiles[0].count}`);
  }

  console.log('Stopping Sync Session...');
  await SyncManager.stopSync(connId);
  console.log('Verification finished.');
}

verify().catch(console.error);
