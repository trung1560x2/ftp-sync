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
        const conns = await db.all("SELECT id, name, protocol, server, port, username, ssh_port, ssh_username, has_password, has_ssh_password FROM ftp_connections");
        console.log('--- Production Configs ---');
        console.log(JSON.stringify(conns, null, 2));
    } catch (e) {
        console.log('Could not open Production DB:', e.message);
    }

    try {
        const dbLocal = await open({
            filename: 'ftp_manager.sqlite',
            driver: sqlite3.Database
        });
        const connsLocal = await dbLocal.all("SELECT id, name, protocol, server, port, username, ssh_port, ssh_username FROM ftp_connections");
        console.log('--- Local Configs ---');
        console.log(JSON.stringify(connsLocal, null, 2));
    } catch (el) {
        console.log('Could not open Local DB:', el.message);
    }
}
check();
