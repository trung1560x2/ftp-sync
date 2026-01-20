
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function check() {
    const db = await open({
        filename: path.resolve('ftp_manager.sqlite'),
        driver: sqlite3.Database
    });
    const conn = await db.get("SELECT * FROM ftp_connections WHERE server LIKE '%ximage.online%'");
    console.log(JSON.stringify(conn, null, 2));
}
check();
