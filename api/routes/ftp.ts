import { Router, Request, Response } from 'express';
import { Client } from 'basic-ftp';
import { getDb } from '../db.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import path from 'path';
import fs from 'fs-extra';

const router = Router();

// Get all connections
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const connections = await db.all('SELECT id, server, port, username, target_directory, local_path, sync_mode, secure, sync_deletions, parallel_connections, created_at FROM ftp_connections ORDER BY created_at DESC');
    res.json(connections);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Check if local path exists
router.post('/check-path', async (req: Request, res: Response) => {
  const { path: checkPath } = req.body;
  if (!checkPath) return res.status(400).json({ error: 'Path is required' });

  try {
    const exists = await fs.pathExists(checkPath);
    if (!exists) return res.json({ valid: false, message: 'Directory does not exist' });

    const stats = await fs.stat(checkPath);
    if (!stats.isDirectory()) return res.json({ valid: false, message: 'Path is not a directory' });

    res.json({ valid: true });
  } catch (err: any) {
    res.json({ valid: false, message: err.message });
  }
});

// Create new connection
router.post('/', async (req: Request, res: Response) => {
  const { server, port, username, password, targetDirectory, localPath, syncMode, secure, syncDeletions, parallelConnections } = req.body;

  if (!server || !username || !password) {
    return res.status(400).json({ error: 'Server, username and password are required' });
  }

  try {
    const db = await getDb();
    const passwordEncrypted = encrypt(password);

    const result = await db.run(
      `INSERT INTO ftp_connections (server, port, username, password_hash, target_directory, local_path, sync_mode, secure, sync_deletions, parallel_connections) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        server,
        port || 21,
        username,
        passwordEncrypted,
        targetDirectory || '/',
        localPath || '',
        syncMode || 'bi_directional',
        secure ? 1 : 0,
        syncDeletions ? 1 : 0,
        Math.max(1, Math.min(10, parallelConnections || 3))
      ]
    );

    res.status(201).json({
      id: result.lastID,
      server,
      port: port || 21,
      username,
      targetDirectory: targetDirectory || '/',
      localPath,
      syncMode,
      secure: !!secure,
      syncDeletions: !!syncDeletions,
      parallelConnections: Math.max(1, Math.min(10, parallelConnections || 3))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update connection
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  console.log('PUT /ftp-connections/:id body:', req.body);
  const { server, port, username, password, targetDirectory, localPath, syncMode, secure, syncDeletions, parallelConnections } = req.body;

  try {
    const db = await getDb();
    const existing = await db.get('SELECT * FROM ftp_connections WHERE id = ?', id);

    if (!existing) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    let passwordEncrypted = existing.password_hash;
    if (password) {
      passwordEncrypted = encrypt(password);
    }

    await db.run(
      `UPDATE ftp_connections 
       SET server = ?, port = ?, username = ?, password_hash = ?, target_directory = ?, local_path = ?, sync_mode = ?, secure = ?, sync_deletions = ?, parallel_connections = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
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
        id
      ]
    );

    res.json({ message: 'Updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete connection
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('DELETE FROM ftp_connections WHERE id = ?', id);
    res.json({ message: 'Deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test connection
router.post('/test', async (req: Request, res: Response) => {
  let { server, port, username, password, id, secure } = req.body;
  let finalPassword = password;

  if (id && !password) {
    try {
      const db = await getDb();
      const conn = await db.get('SELECT server, port, username, password_hash, secure FROM ftp_connections WHERE id = ?', id);
      if (!conn) return res.status(404).json({ error: 'Connection not found' });

      finalPassword = decrypt(conn.password_hash);

      if (!finalPassword) {
        return res.status(400).json({
          success: false,
          message: 'Cannot decrypt password. Please edit connection and re-enter password.'
        });
      }

      if (!server) server = conn.server;
      if (!port) port = conn.port;
      if (!username) username = conn.username;
      if (secure === undefined) secure = !!conn.secure;

    } catch (err: any) {
      return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
    }
  }

  if (!finalPassword) {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }

  const client = new Client();
  try {
    await client.access({
      host: server,
      user: username,
      password: finalPassword,
      port: port || 21,
      secure: secure ? true : false,
      secureOptions: secure ? { rejectUnauthorized: false } : undefined // Allow self-signed certs for testing
    });
    res.json({ success: true, message: 'Connection successful' });
  } catch (error: any) {
    res.status(200).json({ success: false, message: `Error: ${error.message}` });
  } finally {
    client.close();
  }
});

export default router;
