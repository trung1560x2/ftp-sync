import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function main() {
  const db = await open({
    filename: 'ftp_manager.sqlite',
    driver: sqlite3.Database
  });
  const conns = await db.all('SELECT id, server, username, local_path, sync_mode FROM ftp_connections');
  console.log('Connections in local DB:', conns);
}

main().catch(console.error);
