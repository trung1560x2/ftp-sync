
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function inspect() {
    const dbPath = path.resolve('ftp_manager.sqlite');
    try {
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        const row = await db.get('SELECT * FROM ftp_connections WHERE id = 4');
        console.log('Connection 4:', JSON.stringify(row, null, 2));

    } catch (err) {
        console.error('Error:', err);
    }
}

inspect();
