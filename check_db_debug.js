
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import os from 'os';

async function check() {
    const appData = path.join(process.env.APPDATA || os.homedir(), 'FTP Sync Manager');
    const dbPath = path.join(appData, 'ftp_manager.sqlite');

    console.log('Checking Production DB at:', dbPath);

    try {
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        const conns = await db.all("SELECT id, server, local_path, target_directory FROM ftp_connections");
        console.log('--- Production Configs ---');
        conns.forEach(c => console.log(JSON.stringify(c)));
    } catch (e) {
        console.log('Could not open Production DB:', e.message);

        console.log('Check Local Project DB as fallback...');
        try {
            const dbLocal = await open({
                filename: 'ftp_manager.sqlite',
                driver: sqlite3.Database
            });
            const connsLocal = await dbLocal.all("SELECT id, server, local_path, target_directory FROM ftp_connections");
            console.log('--- Local Configs ---');
            connsLocal.forEach(c => console.log(JSON.stringify(c)));
        } catch (el) {
            console.log('Could not open Local DB:', el.message);
        }
    }
}
check();
