
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import os from 'os';
import fs from 'fs';

async function check() {
    const appDataBase = process.env.APPDATA || os.homedir();

    // Try both possible folder names
    const possiblePaths = [
        path.join(appDataBase, 'FTP Sync Manager', 'ftp_manager.sqlite'),
        path.join(appDataBase, 'ftp_sync', 'ftp_manager.sqlite'),
        'E:\\xampp\\htdocs\\ftp_sync\\ftp_manager.sqlite'
    ];

    const outputPath = 'E:\\xampp\\htdocs\\ftp_sync\\config_debug.txt';

    let output = `=== Database Check ===\n`;

    let foundDb = null;
    for (const dbPath of possiblePaths) {
        output += `Checking: ${dbPath} - Exists: ${fs.existsSync(dbPath)}\n`;
        if (fs.existsSync(dbPath)) {
            foundDb = dbPath;
            break;
        }
    }

    output += `\n`;

    if (!foundDb) {
        output += `ERROR: No database file found!\n`;
        fs.writeFileSync(outputPath, output);
        console.log(output);
        return;
    }

    output += `Using DB: ${foundDb}\n\n`;

    try {
        const db = await open({
            filename: foundDb,
            driver: sqlite3.Database
        });

        const conns = await db.all("SELECT id, name, server, local_path, target_directory FROM ftp_connections");

        output += `Found ${conns.length} connection(s):\n\n`;

        for (const c of conns) {
            output += `--- Connection ID: ${c.id} ---\n`;
            output += `Name: ${c.name || 'N/A'}\n`;
            output += `Server: ${c.server}\n`;
            output += `Local Path: "${c.local_path || '(empty)'}"\n`;
            output += `Local Path Exists: ${c.local_path ? fs.existsSync(c.local_path) : 'N/A'}\n`;
            output += `Target Directory: "${c.target_directory || '(empty)'}"\n`;
            output += `\n`;
        }

        await db.close();
    } catch (e) {
        output += `ERROR: ${e.message}\n`;
    }

    fs.writeFileSync(outputPath, output);
    console.log('Output written to:', outputPath);
    console.log(output);
}

check();
