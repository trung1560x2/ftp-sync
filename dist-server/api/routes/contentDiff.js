import { Router } from 'express';
import { Client } from 'basic-ftp';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { getDb } from '../db.js';
import { decrypt } from '../utils/encryption.js';
const router = Router();
// Temp directory for downloaded files
const TEMP_DIR = path.join(os.tmpdir(), 'ftp_sync_diff');
// Helper to get FTP client
async function getFtpClient(connectionId) {
    const db = await getDb();
    const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
    if (!config)
        throw new Error('Connection not found');
    const password = decrypt(config.password_hash);
    if (!password)
        throw new Error('Cannot decrypt password');
    const client = new Client();
    await client.access({
        host: config.server,
        user: config.username,
        password: password,
        port: config.port || 21,
        secure: config.secure ? true : false,
        secureOptions: config.secure ? {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2'
        } : undefined
    });
    return { client, config };
}
// Helper to get local root
async function getLocalRoot(connectionId, config) {
    if (!config || !config.local_path) {
        const db = await getDb();
        config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
    }
    if (!config)
        throw new Error('Connection not found');
    if (config.local_path && config.local_path.trim() !== '') {
        return config.local_path;
    }
    return path.resolve(process.cwd(), 'sync_data', connectionId);
}
// Normalize line endings for comparison
function normalizeContent(content, options = {}) {
    let normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (options.ignoreWhitespace) {
        // Normalize multiple spaces/tabs to single space, trim lines
        normalized = normalized.split('\n').map(line => line.trim().replace(/\s+/g, ' ')).join('\n');
    }
    if (options.ignoreCase) {
        normalized = normalized.toLowerCase();
    }
    return normalized;
}
// Detect file encoding (basic detection)
function detectEncoding(buffer) {
    // Check for BOM
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return 'utf-8';
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return 'utf-16le';
    }
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        return 'utf-16be';
    }
    // Default to utf-8
    return 'utf-8';
}
// GET /api/content-diff/:id - Compare file content
router.post('/:id', async (req, res) => {
    const { id } = req.params;
    const { remotePath, options } = req.body;
    if (!remotePath) {
        return res.status(400).json({ error: 'remotePath is required' });
    }
    let retryCount = 0;
    while (retryCount < 3) {
        let client;
        try {
            const { client: ftpClient, config } = await getFtpClient(id);
            client = ftpClient;
            const localRoot = await getLocalRoot(id, config);
            const remoteRoot = config.target_directory || '/';
            // Calculate local path from remote path manually to avoid path.relative issues on Windows
            // Normalize slashes to forward slashes for reliable consistent processing
            const normalizePath = (p) => p.replace(/\\/g, '/');
            const normRemotePath = normalizePath(remotePath);
            const normRemoteRoot = normalizePath(remoteRoot);
            let relPath = '';
            if (normRemoteRoot === '/' || normRemoteRoot === '') {
                // If root is '/', just strip leading slash if present
                relPath = normRemotePath.startsWith('/') ? normRemotePath.substring(1) : normRemotePath;
            }
            else {
                // If root is not '/', verify remotePath starts with it
                if (normRemotePath.startsWith(normRemoteRoot)) {
                    relPath = normRemotePath.substring(normRemoteRoot.length);
                    if (relPath.startsWith('/'))
                        relPath = relPath.substring(1);
                }
                else {
                    // Fallback: mostly shouldn't happen if path came from list, but maybe manual request
                    relPath = path.basename(remotePath);
                }
            }
            // Final safety check
            if (relPath.startsWith('/'))
                relPath = relPath.substring(1);
            const localPath = path.join(localRoot, relPath.split('/').join(path.sep));
            // Ensure temp directory exists
            await fs.ensureDir(TEMP_DIR);
            // Download remote file to temp
            const tempFilePath = path.join(TEMP_DIR, `${id}_${Date.now()}_${path.basename(remotePath)}`);
            await client.downloadTo(tempFilePath, remotePath);
            // Read both files
            const remoteBuffer = await fs.readFile(tempFilePath);
            const remoteEncoding = detectEncoding(remoteBuffer);
            let remoteContent = remoteBuffer.toString(remoteEncoding);
            let localContent = '';
            let localExists = false;
            if (await fs.pathExists(localPath)) {
                localExists = true;
                const localBuffer = await fs.readFile(localPath);
                const localEncoding = detectEncoding(localBuffer);
                localContent = localBuffer.toString(localEncoding);
            }
            // Clean up temp file
            await fs.remove(tempFilePath);
            // Normalize for comparison (but return original for display)
            const normalizedRemote = normalizeContent(remoteContent, options);
            const normalizedLocal = normalizeContent(localContent, options);
            const isIdentical = normalizedRemote === normalizedLocal;
            res.json({
                success: true,
                localPath,
                remotePath,
                localExists,
                localContent: localContent.replace(/\r\n/g, '\n'),
                remoteContent: remoteContent.replace(/\r\n/g, '\n'),
                isIdentical,
                fileName: path.basename(remotePath)
            });
            return; // Success, exit loop
        }
        catch (error) {
            console.error(`[ContentDiff] Error (Attempt ${retryCount + 1}/3):`, error.message);
            if (retryCount >= 2) {
                return res.status(500).json({ error: error.message });
            }
            retryCount++;
            await new Promise(r => setTimeout(r, 1000));
        }
        finally {
            if (client) {
                try {
                    client.close();
                }
                catch { }
            }
        }
    }
});
// POST /api/content-diff/:id/merge - Merge content
router.post('/:id/merge', async (req, res) => {
    const { id } = req.params;
    const { remotePath, direction, content } = req.body;
    if (!remotePath || !direction || content === undefined) {
        return res.status(400).json({ error: 'remotePath, direction, and content are required' });
    }
    let retryCount = 0;
    while (retryCount < 3) {
        let client;
        try {
            const { client: ftpClient, config } = await getFtpClient(id);
            client = ftpClient;
            const localRoot = await getLocalRoot(id, config);
            const remoteRoot = config.target_directory || '/';
            // Calculate local path from remote path manually
            const normalizePath = (p) => p.replace(/\\/g, '/');
            const normRemotePath = normalizePath(remotePath);
            const normRemoteRoot = normalizePath(remoteRoot);
            let relPath = '';
            if (normRemoteRoot === '/' || normRemoteRoot === '') {
                relPath = normRemotePath.startsWith('/') ? normRemotePath.substring(1) : normRemotePath;
            }
            else if (normRemotePath.startsWith(normRemoteRoot)) {
                relPath = normRemotePath.substring(normRemoteRoot.length);
                if (relPath.startsWith('/'))
                    relPath = relPath.substring(1);
            }
            else {
                relPath = path.basename(remotePath);
            }
            if (relPath.startsWith('/'))
                relPath = relPath.substring(1);
            const localPath = path.join(localRoot, relPath.split('/').join(path.sep));
            if (direction === 'toLocal') {
                // Save content to local file
                await fs.ensureDir(path.dirname(localPath));
                await fs.writeFile(localPath, content, 'utf-8');
                res.json({ success: true, message: 'Content saved to local file' });
                return;
            }
            else if (direction === 'toRemote') {
                // Upload content to remote
                await fs.ensureDir(TEMP_DIR);
                const tempFilePath = path.join(TEMP_DIR, `merge_${Date.now()}_${path.basename(remotePath)}`);
                await fs.writeFile(tempFilePath, content, 'utf-8');
                const remoteDir = path.posix.dirname(remotePath);
                await client.ensureDir(remoteDir);
                await client.uploadFrom(tempFilePath, remotePath);
                await fs.remove(tempFilePath);
                res.json({ success: true, message: 'Content uploaded to remote' });
                return;
            }
            else {
                res.status(400).json({ error: 'Invalid direction. Use "toLocal" or "toRemote"' });
                return;
            }
        }
        catch (error) {
            console.error(`[ContentDiff Merge] Error (Attempt ${retryCount + 1}/3):`, error.message);
            if (retryCount >= 2) {
                return res.status(500).json({ error: error.message });
            }
            retryCount++;
            await new Promise(r => setTimeout(r, 1000));
        }
        finally {
            if (client) {
                try {
                    client.close();
                }
                catch { }
            }
        }
    }
});
export default router;
