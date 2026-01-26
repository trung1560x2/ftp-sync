import { Router } from 'express';
import { getDb } from '../db.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import path from 'path';
import fs from 'fs-extra';
import { readFtpIgnore, writeFtpIgnore } from '../services/IgnoreService.js';
const router = Router();
// Get all connections
router.get('/', async (req, res) => {
    try {
        const db = await getDb();
        const connections = await db.all('SELECT id, name, server, port, username, target_directory, local_path, sync_mode, secure, sync_deletions, parallel_connections, buffer_size, exclude_paths, created_at FROM ftp_connections ORDER BY created_at DESC');
        res.json(connections);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Check if local path exists
router.post('/check-path', async (req, res) => {
    const { path: checkPath } = req.body;
    if (!checkPath)
        return res.status(400).json({ error: 'Path is required' });
    try {
        const exists = await fs.pathExists(checkPath);
        if (!exists)
            return res.json({ valid: false, message: 'Directory does not exist' });
        const stats = await fs.stat(checkPath);
        if (!stats.isDirectory())
            return res.json({ valid: false, message: 'Path is not a directory' });
        res.json({ valid: true });
    }
    catch (err) {
        res.json({ valid: false, message: err.message });
    }
});
// Create new connection
router.post('/', async (req, res) => {
    const { name, server, port, username, password, targetDirectory, localPath, syncMode, secure, syncDeletions, parallelConnections, bufferSize, protocol, privateKey, excludePaths } = req.body;
    if (!server || !username || (!password && !privateKey)) {
        return res.status(400).json({ error: 'Server, username and password/key are required' });
    }
    try {
        const db = await getDb();
        const passwordEncrypted = password ? encrypt(password) : '';
        const result = await db.run(`INSERT INTO ftp_connections (name, server, port, username, password_hash, target_directory, local_path, sync_mode, secure, sync_deletions, parallel_connections, buffer_size, protocol, private_key, exclude_paths) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            name || null,
            server,
            port || (protocol === 'sftp' ? 22 : 21),
            username,
            passwordEncrypted,
            targetDirectory || '/',
            localPath || '',
            syncMode || 'bi_directional',
            secure ? 1 : 0,
            syncDeletions ? 1 : 0,
            Math.max(1, Math.min(10, parallelConnections || 3)),
            bufferSize || 16,
            protocol || 'ftp',
            privateKey || null,
            excludePaths || ''
        ]);
        res.status(201).json({
            id: result.lastID,
            name,
            server,
            port: port || (protocol === 'sftp' ? 22 : 21),
            username,
            targetDirectory: targetDirectory || '/',
            localPath,
            syncMode,
            secure: !!secure,
            syncDeletions: !!syncDeletions,
            parallelConnections: Math.max(1, Math.min(10, parallelConnections || 3)),
            bufferSize: bufferSize || 16,
            protocol: protocol || 'ftp',
            privateKey
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Update connection
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    // Create a copy of the body for logging to mask sensitive data
    const { password: _, ...logBody } = req.body;
    console.log('PUT /ftp-connections/:id body:', { ...logBody, password: req.body.password ? '******' : undefined });
    const { name, server, port, username, password, targetDirectory, localPath, syncMode, secure, syncDeletions, parallelConnections, bufferSize, protocol, privateKey, excludePaths } = req.body;
    try {
        const db = await getDb();
        const existing = await db.get('SELECT * FROM ftp_connections WHERE id = ?', id);
        if (!existing) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        let passwordEncrypted = existing.password_hash;
        // Only update password if a NEW non-empty password is provided
        // Empty string or undefined = keep existing password (security: password is not resent)
        if (password && password.trim() !== '') {
            passwordEncrypted = encrypt(password);
        }
        await db.run(`UPDATE ftp_connections 
       SET name = ?, server = ?, port = ?, username = ?, password_hash = ?, target_directory = ?, local_path = ?, sync_mode = ?, secure = ?, sync_deletions = ?, parallel_connections = ?, buffer_size = ?, protocol = ?, private_key = ?, exclude_paths = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`, [
            name !== undefined ? name : existing.name,
            server || existing.server,
            port || existing.port,
            username || existing.username,
            passwordEncrypted,
            targetDirectory || existing.target_directory,
            localPath !== undefined ? localPath : existing.local_path,
            syncMode || existing.sync_mode,
            secure !== undefined ? (secure ? 1 : 0) : existing.secure,
            syncDeletions !== undefined ? (syncDeletions ? 1 : 0) : existing.sync_deletions,
            parallelConnections !== undefined ? Math.max(1, Math.min(10, parallelConnections)) : (existing.parallel_connections || 3),
            bufferSize !== undefined ? bufferSize : (existing.buffer_size || 16),
            protocol || existing.protocol || 'ftp',
            privateKey !== undefined ? privateKey : (existing.private_key || null),
            excludePaths !== undefined ? excludePaths : (existing.exclude_paths || ''),
            id
        ]);
        res.json({ message: 'Updated successfully' });
        // Clear active session so next usage picks up new config
        // @ts-ignore
        SyncManager.clearSession(id);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
import SyncManager from '../services/SyncService.js';
// Delete connection
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const db = await getDb();
        await db.run('DELETE FROM ftp_connections WHERE id = ?', id);
        // Clear active session
        // @ts-ignore
        SyncManager.clearSession(id);
        res.json({ message: 'Deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
import { TransferClientFactory } from '../services/transfer/TransferClientFactory.js';
// Test connection
router.post('/test', async (req, res) => {
    let { server, port, username, password, id, secure, protocol, privateKey } = req.body;
    let finalPassword = password;
    if (id && !password && !privateKey) {
        try {
            const db = await getDb();
            const conn = await db.get('SELECT server, port, username, password_hash, secure, protocol, private_key FROM ftp_connections WHERE id = ?', id);
            if (!conn)
                return res.status(404).json({ error: 'Connection not found' });
            if (conn.password_hash) {
                finalPassword = decrypt(conn.password_hash);
            }
            if (!server)
                server = conn.server;
            if (!port)
                port = conn.port;
            if (!username)
                username = conn.username;
            if (secure === undefined)
                secure = !!conn.secure;
            if (!protocol)
                protocol = conn.protocol || 'ftp';
            if (!privateKey)
                privateKey = conn.private_key;
        }
        catch (err) {
            return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
        }
    }
    if (!finalPassword && !privateKey) {
        return res.status(400).json({ success: false, message: 'Password or Private Key is required' });
    }
    const client = TransferClientFactory.createClient(protocol || 'ftp');
    try {
        await client.connect({
            host: server,
            username: username,
            password: finalPassword,
            port: port || (protocol === 'sftp' ? 22 : 21),
            secure: secure ? true : false,
            secureOptions: secure ? { rejectUnauthorized: false } : undefined,
            privateKey: privateKey
        });
        res.json({ success: true, message: 'Connection successful' });
    }
    catch (error) {
        res.status(200).json({ success: false, message: `Error: ${error.message}` });
    }
    finally {
        client.close();
    }
});
// Get .ftpignore content for a connection
router.get('/:id/ignore', async (req, res) => {
    const { id } = req.params;
    try {
        const db = await getDb();
        const connection = await db.get('SELECT local_path FROM ftp_connections WHERE id = ?', id);
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        // Determine local root path
        const localRoot = connection.local_path && connection.local_path.trim() !== ''
            ? connection.local_path
            : path.resolve(process.cwd(), 'sync_data', id);
        const content = await readFtpIgnore(localRoot);
        res.json({ content, localRoot });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Update .ftpignore content for a connection
router.put('/:id/ignore', async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    if (content === undefined) {
        return res.status(400).json({ error: 'Content is required' });
    }
    try {
        const db = await getDb();
        const connection = await db.get('SELECT local_path FROM ftp_connections WHERE id = ?', id);
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        // Determine local root path
        const localRoot = connection.local_path && connection.local_path.trim() !== ''
            ? connection.local_path
            : path.resolve(process.cwd(), 'sync_data', id);
        // Ensure directory exists
        await fs.ensureDir(localRoot);
        await writeFtpIgnore(localRoot, content);
        res.json({ message: 'Ignore patterns updated successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
