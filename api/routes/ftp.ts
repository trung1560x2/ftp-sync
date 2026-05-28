import { Router, Request, Response } from 'express';
import { Client } from 'basic-ftp';
import { getDb } from '../db.js';
import { encrypt, decrypt, encryptWithPassword, decryptWithPassword } from '../utils/encryption.js';
import path from 'path';
import fs from 'fs-extra';
import { readFtpIgnore, writeFtpIgnore } from '../services/IgnoreService.js';
import syncManager from '../services/SyncService.js';

const router = Router();

// Get all connections
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const connections = await db.all(`
      SELECT id, name, server, port, username, target_directory, local_path, backup_path, sync_mode, secure, sync_deletions, parallel_connections, buffer_size, exclude_paths, protocol, conflict_resolution,
      (CASE WHEN private_key IS NOT NULL AND private_key != '' THEN '********' ELSE '' END) AS private_key,
      last_sync_time, last_sync_duration, last_sync_status, validation_status, validation_message,
      created_at 
      FROM ftp_connections 
      ORDER BY created_at DESC
    `);
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
  const { name, server, port, username, password, targetDirectory, localPath, backupPath, syncMode, secure, syncDeletions, parallelConnections, bufferSize, protocol, privateKey, excludePaths, conflictResolution, validationStatus, validationMessage } = req.body;

  if (!server || !username || (!password && !privateKey)) {
    return res.status(400).json({ error: 'Server, username and password/key are required' });
  }

  try {
    const db = await getDb();
    const passwordEncrypted = password ? encrypt(password) : '';

    const result = await db.run(
      `INSERT INTO ftp_connections (name, server, port, username, password_hash, target_directory, local_path, backup_path, sync_mode, secure, sync_deletions, parallel_connections, buffer_size, protocol, private_key, exclude_paths, conflict_resolution, validation_status, validation_message) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name || null,
        server,
        port || (protocol === 'sftp' ? 22 : 21),
        username,
        passwordEncrypted,
        targetDirectory || '/',
        localPath || '',
        backupPath || '',
        syncMode || 'bi_directional',
        secure ? 1 : 0,
        syncDeletions ? 1 : 0,
        Math.max(1, Math.min(10, parallelConnections || 3)),
        bufferSize || 16,
        protocol || 'ftp',
        privateKey || null,
        excludePaths || '',
        conflictResolution || 'overwrite',
        validationStatus || 'unverified',
        validationMessage || null
      ]
    );

    res.status(201).json({
      id: result.lastID,
      name,
      server,
      port: port || (protocol === 'sftp' ? 22 : 21),
      username,
      targetDirectory: targetDirectory || '/',
      localPath,
      backupPath,
      syncMode,
      secure: !!secure,
      syncDeletions: !!syncDeletions,
      parallelConnections: Math.max(1, Math.min(10, parallelConnections || 3)),
      bufferSize: bufferSize || 16,
      protocol: protocol || 'ftp',
      privateKey,
      conflictResolution: conflictResolution || 'overwrite',
      validationStatus: validationStatus || 'unverified',
      validationMessage: validationMessage || null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update connection
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  // Create a copy of the body for logging to mask sensitive data
  const { password: _, ...logBody } = req.body;
  console.log('PUT /ftp-connections/:id body:', { ...logBody, password: req.body.password ? '******' : undefined });

  const { name, server, port, username, password, targetDirectory, localPath, backupPath, syncMode, secure, syncDeletions, parallelConnections, bufferSize, protocol, privateKey, excludePaths, conflictResolution, validationStatus, validationMessage } = req.body;

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

    let privateKeyVal = existing.private_key;
    if (privateKey !== undefined) {
      if (privateKey === '********') {
        privateKeyVal = existing.private_key;
      } else if (privateKey.trim() === '') {
        privateKeyVal = null;
      } else {
        privateKeyVal = privateKey;
      }
    }

    await db.run(
      `UPDATE ftp_connections 
       SET name = ?, server = ?, port = ?, username = ?, password_hash = ?, target_directory = ?, local_path = ?, backup_path = ?, sync_mode = ?, secure = ?, sync_deletions = ?, parallel_connections = ?, buffer_size = ?, protocol = ?, private_key = ?, exclude_paths = ?, conflict_resolution = ?, validation_status = ?, validation_message = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        name !== undefined ? name : existing.name,
        server || existing.server,
        port || existing.port,
        username || existing.username,
        passwordEncrypted,
        targetDirectory || existing.target_directory,
        localPath !== undefined ? localPath : existing.local_path,
        backupPath !== undefined ? backupPath : existing.backup_path,
        syncMode || existing.sync_mode,
        secure !== undefined ? (secure ? 1 : 0) : existing.secure,
        syncDeletions !== undefined ? (syncDeletions ? 1 : 0) : existing.sync_deletions,
        parallelConnections !== undefined ? Math.max(1, Math.min(10, parallelConnections)) : (existing.parallel_connections || 3),
        bufferSize !== undefined ? bufferSize : (existing.buffer_size || 16),
        protocol || existing.protocol || 'ftp',
        privateKeyVal,
        excludePaths !== undefined ? excludePaths : (existing.exclude_paths || ''),
        conflictResolution || existing.conflict_resolution || 'overwrite',
        validationStatus !== undefined ? validationStatus : existing.validation_status,
        validationMessage !== undefined ? validationMessage : existing.validation_message,
        id
      ]
    );

    res.json({ message: 'Updated successfully' });

    // Clear active session so next usage picks up new config
    syncManager.clearSession(parseInt(id));

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

    // Clear active session
    syncManager.clearSession(parseInt(id));

    res.json({ message: 'Deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

import { TransferClientFactory } from '../services/transfer/TransferClientFactory.js';

// Test connection
router.post('/test', async (req: Request, res: Response) => {
  let { server, port, username, password, id, secure, protocol, privateKey } = req.body;
  let finalPassword = password;

  if (id && !password && !privateKey) {
    try {
      const db = await getDb();
      const conn = await db.get('SELECT server, port, username, password_hash, secure, protocol, private_key FROM ftp_connections WHERE id = ?', id);
      if (!conn) return res.status(404).json({ error: 'Connection not found' });

      if (conn.password_hash) {
        finalPassword = decrypt(conn.password_hash);
      }

      if (!server) server = conn.server;
      if (!port) port = conn.port;
      if (!username) username = conn.username;
      if (secure === undefined) secure = !!conn.secure;
      if (!protocol) protocol = conn.protocol || 'ftp';
      if (!privateKey) privateKey = conn.private_key;

    } catch (err: any) {
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
  } catch (error: any) {
    res.status(200).json({ success: false, message: `Error: ${error.message}` });
  } finally {
    client.close();
  }
});

// Get .ftpignore content for a connection
router.get('/:id/ignore', async (req: Request, res: Response) => {
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update .ftpignore content for a connection
router.put('/:id/ignore', async (req: Request, res: Response) => {
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Export connections
router.post('/export', async (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Backup password must be at least 4 characters long' });
  }

  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM ftp_connections');
    
    const verification = encryptWithPassword('ftp-sync-verification', password);
    
    const connections = rows.map(row => {
      const plaintextPassword = row.password_hash ? decrypt(row.password_hash) : '';
      const encryptedPassword = plaintextPassword ? encryptWithPassword(plaintextPassword, password) : '';
      const encryptedPrivateKey = row.private_key ? encryptWithPassword(row.private_key, password) : '';

      return {
        name: row.name,
        server: row.server,
        port: row.port,
        username: row.username,
        password: encryptedPassword,
        targetDirectory: row.target_directory,
        localPath: row.local_path,
        backupPath: row.backup_path,
        syncMode: row.sync_mode,
        secure: !!row.secure,
        syncDeletions: !!row.sync_deletions,
        parallelConnections: row.parallel_connections,
        bufferSize: row.buffer_size,
        protocol: row.protocol,
        privateKey: encryptedPrivateKey,
        conflictResolution: row.conflict_resolution,
        excludePaths: row.exclude_paths
      };
    });

    res.json({
      version: 1,
      verification,
      connections
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Import connections
router.post('/import', async (req: Request, res: Response) => {
  const { connections, password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (!connections || !Array.isArray(connections)) {
    return res.status(400).json({ error: 'Invalid connections data' });
  }

  try {
    const db = await getDb();

    // Verify password if verification block is present
    const firstConnWithCreds = connections.find(c => c.password || c.privateKey);
    const verificationBlock = req.body.verification;

    if (verificationBlock) {
      try {
        const check = decryptWithPassword(verificationBlock, password);
        if (check !== 'ftp-sync-verification') {
          return res.status(400).json({ error: 'Incorrect backup password' });
        }
      } catch (e) {
        return res.status(400).json({ error: 'Incorrect backup password' });
      }
    } else if (firstConnWithCreds) {
      // Fallback: try to decrypt the first credential to verify password
      try {
        const testCrypt = firstConnWithCreds.password || firstConnWithCreds.privateKey;
        decryptWithPassword(testCrypt, password);
      } catch (e) {
        return res.status(400).json({ error: 'Incorrect backup password' });
      }
    }

    let importCount = 0;
    const warnings: string[] = [];
    for (const conn of connections) {
      let passwordPlain = '';
      if (conn.password) {
        try {
          passwordPlain = decryptWithPassword(conn.password, password);
        } catch (e) {
          // Skip or error. Since we verified above, it shouldn't fail unless corrupt
          continue;
        }
      }

      let privateKeyPlain = null;
      if (conn.privateKey) {
        try {
          privateKeyPlain = decryptWithPassword(conn.privateKey, password);
        } catch (e) {
          continue;
        }
      }

      const passwordEncrypted = passwordPlain ? encrypt(passwordPlain) : '';

      // Generate unique name (Option C: Duplicate with (Imported))
      let uniqueName = conn.name || 'Connection';
      let nameExists = await db.get('SELECT id FROM ftp_connections WHERE name = ?', uniqueName);
      if (nameExists) {
        uniqueName = `${uniqueName} (Imported)`;
        let checkExists = await db.get('SELECT id FROM ftp_connections WHERE name = ?', uniqueName);
        let counter = 1;
        while (checkExists) {
          uniqueName = `${conn.name || 'Connection'} (Imported) (${counter})`;
          checkExists = await db.get('SELECT id FROM ftp_connections WHERE name = ?', uniqueName);
          counter++;
        }
      }

      await db.run(
        `INSERT INTO ftp_connections (name, server, port, username, password_hash, target_directory, local_path, backup_path, sync_mode, secure, sync_deletions, parallel_connections, buffer_size, protocol, private_key, exclude_paths, conflict_resolution) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uniqueName,
          conn.server,
          conn.port || (conn.protocol === 'sftp' ? 22 : 21),
          conn.username,
          passwordEncrypted,
          conn.targetDirectory || '/',
          conn.localPath || '',
          conn.backupPath || '',
          conn.syncMode || 'bi_directional',
          conn.secure ? 1 : 0,
          conn.syncDeletions ? 1 : 0,
          conn.parallelConnections || 3,
          conn.bufferSize || 16,
          conn.protocol || 'ftp',
          privateKeyPlain,
          conn.excludePaths || '',
          conn.conflictResolution || 'overwrite'
        ]
      );

      // Check if credentials are missing
      const hasCredentials = (passwordPlain && passwordPlain.trim() !== '') || (privateKeyPlain && privateKeyPlain.trim() !== '');
      if (!hasCredentials) {
        warnings.push(uniqueName);
      }

      importCount++;
    }

    res.json({ success: true, count: importCount, warnings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
