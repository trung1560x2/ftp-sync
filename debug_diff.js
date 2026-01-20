
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

async function check() {
    const db = await open({
        filename: path.resolve('ftp_manager.sqlite'),
        driver: sqlite3.Database
    });
    const config = await db.get("SELECT * FROM ftp_connections WHERE id = 2");
    const localRoot = config.local_path;

    // Check /app directory
    const requestPath = '/app';
    let relativePath = path.posix.relative(config.target_directory || '/', requestPath);
    if (relativePath.startsWith('..')) relativePath = '';
    const localDir = path.join(localRoot, relativePath.split('/').join(path.sep));

    console.log('--- Checking Directory: ' + localDir + ' ---');

    if (fs.existsSync(localDir)) {
        try {
            const files = fs.readdirSync(localDir);
            console.log(`Found ${files.length} items.`);

            for (const f of files) {
                const fullPath = path.join(localDir, f);
                try {
                    const s = fs.statSync(fullPath);
                    const type = s.isDirectory() ? 'DIR' : 'FILE';
                    console.log(`[OK] ${f} (${type})`);
                } catch (err) {
                    console.log(`[FAIL] ${f}: ${err.message}`);
                    console.log(`Error Code: ${err.code}`);
                }
            }
        } catch (e) {
            console.log(`Failed to readdir: ${e.message}`);
        }
    } else {
        console.log(`Directory does not exist.`);
    }
}
check();
