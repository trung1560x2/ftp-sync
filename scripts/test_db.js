
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
    // The DB is in the root, so go up one level from scripts/
    const dbPath = path.resolve(__dirname, '../ftp_manager.sqlite');
    console.log('Testing DB at:', dbPath);

    try {
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        console.log('Connected to DB');

        // Check tables
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        console.log('Tables:', tables.map(t => t.name));

        // Insert test log
        const result = await db.run(
            'INSERT INTO sync_logs (connection_id, type, message) VALUES (?, ?, ?)',
            999, 'info', 'Test log entry from script'
        );
        console.log('Insert result:', result);

        // Read back
        const logs = await db.all('SELECT * FROM sync_logs WHERE connection_id = 999 ORDER BY id DESC LIMIT 1');
        console.log('Read back:', logs);

        if (logs.length > 0 && logs[0].message === 'Test log entry from script') {
            console.log('SUCCESS: Read/Write verified');
            // Cleanup
            await db.run('DELETE FROM sync_logs WHERE connection_id = 999');
        } else {
            console.error('FAILURE: Could not verify write');
        }

    } catch (e) {
        console.error('DB Error:', e);
    }
})();
