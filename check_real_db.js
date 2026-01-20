
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
// import { app } from 'electron'; 
const appName = "FTP Sync Manager";


// Problem: accessing userData in this script is hard because it's distinct from the Electron app's userData.
// But earlier the user said "sai đường dẫn" based on the debug info which pointed to "release_v3" (the unpacked app dir), 
// effectively confirming the app IS looking at the built-in logic.
// However, I need to check the DB file that the APP is using.
// If the user is running the "release_v3" version (Production), the DB is in %APPDATA%\ftp_sync (or similar).
// If I run this script here in dev mode, I might be reading the WRONG database (the one in the project root).
// 
// Valid point. The user changed the setting IN THE APP. 
// If the app is using %APPDATA%/ftp_sync/ftp_manager.sqlite, I should try to read THAT file.

import os from 'os';

async function check() {
    // Guessing the App Name for userData path. 
    // package.json says "productName": "FTP Sync Manager"
    // Usually it's AppData/Roaming/<productName>
    const appData = path.join(process.env.APPDATA || os.homedir(), 'FTP Sync Manager');
    const dbPath = path.join(appData, 'ftp_manager.sqlite');

    console.log('Checking Production DB at:', dbPath);

    try {
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        const conn = await db.get("SELECT * FROM ftp_connections WHERE id = 2");
        console.log('--- Production Config ---');
        console.log(JSON.stringify(conn, null, 2));
    } catch (e) {
        console.log('Could not open Production DB:', e.message);

        // Fallback to local project DB just in case
        console.log('Check Local Project DB as fallback...');
        try {
            const dbLocal = await open({
                filename: 'ftp_manager.sqlite',
                driver: sqlite3.Database
            });
            const connLocal = await dbLocal.get("SELECT * FROM ftp_connections WHERE id = 2");
            console.log('--- Local Config ---');
            console.log(JSON.stringify(connLocal, null, 2));
        } catch (el) {
            console.log('Could not open Local DB:', el.message);
        }
    }
}
check();
