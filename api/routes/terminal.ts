import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import sshTerminalService from '../services/SSHTerminalService.js';
import { getDb } from '../db.js';
import { webSocketService } from '../services/WebSocketService.js';

// Multer storage for browser uploads into temp directory
const terminalUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tmpDir = path.join(os.tmpdir(), 'omnisync-terminal-uploads');
    fs.ensureDirSync(tmpDir);
    cb(null, tmpDir);
  },
  filename: (_req, file, cb) => {
    // Preserve original filename
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const terminalUpload = multer({ storage: terminalUploadStorage });

const router = Router();

// --- Terminal Sessions ---

router.get('/sessions', (_req: Request, res: Response) => {
  const sessions = sshTerminalService.listSessions();
  res.json({ success: true, sessions });
});

router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const { connectionId, host, port, username, password, privateKey } = req.body;

    let result: { sessionId: string; connectionName: string };

    if (connectionId) {
      // Saved connection mode
      result = await sshTerminalService.createSession(connectionId);
    } else if (host && username) {
      // Quick connect mode — no DB entry needed
      result = sshTerminalService.createQuickSession({
        host,
        port: port || 22,
        username,
        password: password || undefined,
        privateKey: privateKey || undefined,
      });
    } else {
      res.status(400).json({ success: false, message: 'Provide connectionId or host+username' });
      return;
    }

    res.json({ success: true, sessionId: result.sessionId, connectionName: result.connectionName });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/sessions/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  sshTerminalService.closeSession(sessionId);
  res.json({ success: true, message: 'Session closed' });
});

router.get('/sessions/:sessionId/cwd', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const cwd = await sshTerminalService.getCwd(sessionId);
    res.json({ success: true, cwd });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/sessions/:sessionId/ping', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const start = Date.now();
    const success = await sshTerminalService.ping(sessionId);
    if (success) {
      res.json({ success: true, latency: Date.now() - start });
    } else {
      res.status(500).json({ success: false, message: 'Ping failed' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/sessions/:sessionId/upload', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { paths, remoteDir } = req.body;

  if (!paths || !Array.isArray(paths) || paths.length === 0 || !remoteDir) {
    res.status(400).json({ success: false, message: 'Provide paths (array) and remoteDir' });
    return;
  }

  // Respond immediately so UI can display progress asynchronously
  res.json({ success: true, message: 'Upload started' });

  try {
    webSocketService.sendToTerminalOwner(sessionId, {
      type: 'terminal:upload-progress',
      sessionId,
      status: 'started',
    });

    await sshTerminalService.uploadFiles(sessionId, paths, remoteDir, (fileName, transferred, total) => {
      webSocketService.sendToTerminalOwner(sessionId, {
        type: 'terminal:upload-progress',
        sessionId,
        status: 'progress',
        fileName,
        transferredBytes: transferred,
        totalBytes: total,
      });
    });

    webSocketService.sendToTerminalOwner(sessionId, {
      type: 'terminal:upload-progress',
      sessionId,
      status: 'completed',
    });
  } catch (error: any) {
    console.error(`[Terminal Upload] Error uploading for session ${sessionId}:`, error.message);
    webSocketService.sendToTerminalOwner(sessionId, {
      type: 'terminal:upload-progress',
      sessionId,
      status: 'failed',
      error: error.message,
    });
  }
});

// Browser file upload (multipart FormData) - for environments where file.path is not available
router.post('/sessions/:sessionId/upload-files', terminalUpload.array('files'), async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const remoteDir = req.body.remoteDir;
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0 || !remoteDir) {
    res.status(400).json({ success: false, message: 'Provide files and remoteDir' });
    return;
  }

  // Respond immediately so UI can display progress asynchronously
  res.json({ success: true, message: 'Upload started' });

  // Map multer temp paths for SFTP upload
  const localPaths = files.map(f => f.path);

  try {
    webSocketService.sendToTerminalOwner(sessionId, {
      type: 'terminal:upload-progress',
      sessionId,
      status: 'started',
    });

    // Upload using original filenames by renaming temp files
    const renamedPaths: string[] = [];
    for (const f of files) {
      const renamedPath = path.join(path.dirname(f.path), f.originalname);
      await fs.rename(f.path, renamedPath);
      renamedPaths.push(renamedPath);
    }

    await sshTerminalService.uploadFiles(sessionId, renamedPaths, remoteDir, (fileName, transferred, total) => {
      webSocketService.sendToTerminalOwner(sessionId, {
        type: 'terminal:upload-progress',
        sessionId,
        status: 'progress',
        fileName,
        transferredBytes: transferred,
        totalBytes: total,
      });
    });

    webSocketService.sendToTerminalOwner(sessionId, {
      type: 'terminal:upload-progress',
      sessionId,
      status: 'completed',
    });

    // Cleanup temp files
    for (const p of renamedPaths) {
      fs.remove(p).catch(() => {});
    }
  } catch (error: any) {
    console.error(`[Terminal Upload] Browser upload error for session ${sessionId}:`, error.message);
    webSocketService.sendToTerminalOwner(sessionId, {
      type: 'terminal:upload-progress',
      sessionId,
      status: 'failed',
      error: error.message,
    });
    // Cleanup temp files on error
    for (const p of localPaths) {
      fs.remove(p).catch(() => {});
    }
  }
});

router.get('/sessions/:sessionId/file', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const filePath = req.query.path as string;
  const useSudo = req.query.useSudo === 'true';

  if (!filePath) {
    res.status(400).json({ success: false, message: 'path query parameter is required' });
    return;
  }

  try {
    const content = await sshTerminalService.getFile(sessionId, filePath, useSudo);
    res.json({ success: true, content });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/sessions/:sessionId/file', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { path: filePath, content, useSudo } = req.body;

  if (!filePath || content === undefined) {
    res.status(400).json({ success: false, message: 'path and content are required' });
    return;
  }

  try {
    await sshTerminalService.saveFile(sessionId, filePath, content, !!useSudo);
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Download remote file as binary (browser "Save As")
router.get('/sessions/:sessionId/download', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const filePath = req.query.path as string;

  if (!filePath) {
    res.status(400).json({ success: false, message: 'path query parameter is required' });
    return;
  }

  try {
    // Resolve relative paths using CWD
    let resolvedPath = filePath;
    if (!resolvedPath.startsWith('/')) {
      const cwd = await sshTerminalService.getCwd(sessionId);
      resolvedPath = cwd.endsWith('/') ? cwd + resolvedPath : cwd + '/' + resolvedPath;
    }

    const { buffer, size } = await sshTerminalService.downloadFile(sessionId, resolvedPath);
    const fileName = path.basename(resolvedPath);

    // Determine MIME type from extension
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.xml': 'application/xml',
      '.csv': 'text/csv',
      '.md': 'text/markdown',
      '.py': 'text/x-python',
      '.sh': 'text/x-shellscript',
      '.yml': 'text/yaml',
      '.yaml': 'text/yaml',
      '.log': 'text/plain',
      '.conf': 'text/plain',
      '.cfg': 'text/plain',
      '.ini': 'text/plain',
      '.sql': 'application/sql',
      '.zip': 'application/zip',
      '.gz': 'application/gzip',
      '.tar': 'application/x-tar',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', size.toString());
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- SFTP File Browser ---

// List directory
router.get('/sessions/:sessionId/ls', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const dirPath = (req.query.path as string) || '/';

  try {
    let resolvedPath = dirPath;
    if (!resolvedPath.startsWith('/')) {
      const cwd = await sshTerminalService.getCwd(sessionId);
      resolvedPath = cwd.endsWith('/') ? cwd + resolvedPath : cwd + '/' + resolvedPath;
    }

    const items = await sshTerminalService.listDir(sessionId, resolvedPath);
    res.json({ success: true, path: resolvedPath, items });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stat file/directory
router.get('/sessions/:sessionId/stat', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const filePath = req.query.path as string;

  if (!filePath) {
    res.status(400).json({ success: false, message: 'path query parameter is required' });
    return;
  }

  try {
    const info = await sshTerminalService.statPath(sessionId, filePath);
    res.json({ success: true, ...info });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create directory
router.post('/sessions/:sessionId/mkdir', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { path: dirPath, useSudo } = req.body;

  if (!dirPath) {
    res.status(400).json({ success: false, message: 'path is required' });
    return;
  }

  try {
    await sshTerminalService.mkdirRemote(sessionId, dirPath, !!useSudo);
    res.json({ success: true, message: 'Directory created' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete file
router.delete('/sessions/:sessionId/rm', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const filePath = req.query.path as string;
  const useSudo = req.query.useSudo === 'true';

  if (!filePath) {
    res.status(400).json({ success: false, message: 'path query parameter is required' });
    return;
  }

  try {
    await sshTerminalService.rmFile(sessionId, filePath, useSudo);
    res.json({ success: true, message: 'File deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Remove directory
router.delete('/sessions/:sessionId/rmdir', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const filePath = req.query.path as string;
  const useSudo = req.query.useSudo === 'true';

  if (!filePath) {
    res.status(400).json({ success: false, message: 'path query parameter is required' });
    return;
  }

  try {
    await sshTerminalService.rmdirRemote(sessionId, filePath, useSudo);
    res.json({ success: true, message: 'Directory removed' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Rename / move
router.post('/sessions/:sessionId/rename', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { oldPath, newPath, useSudo } = req.body;

  if (!oldPath || !newPath) {
    res.status(400).json({ success: false, message: 'oldPath and newPath are required' });
    return;
  }

  try {
    await sshTerminalService.renamePath(sessionId, oldPath, newPath, !!useSudo);
    res.json({ success: true, message: 'Renamed successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Chmod Permissions
router.post('/sessions/:sessionId/chmod', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { path: remotePath, mode, recursive } = req.body;
  if (!remotePath || mode === undefined) {
    res.status(400).json({ success: false, message: 'path and mode are required' });
    return;
  }
  try {
    const octalMode = typeof mode === 'string' ? parseInt(mode, 8) : mode;
    await sshTerminalService.chmodRemote(sessionId, remotePath, octalMode, !!recursive);
    res.json({ success: true, message: 'Permissions updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Archive (Compression)
router.post('/sessions/:sessionId/archive', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { folderPath, archivePath, type } = req.body; // type: 'zip' | 'tar'
  if (!folderPath || !archivePath) {
    res.status(400).json({ success: false, message: 'folderPath and archivePath are required' });
    return;
  }
  try {
    const parentDir = path.posix.dirname(folderPath);
    const baseName = path.posix.basename(folderPath);
    let cmd = '';
    if (type === 'tar') {
      cmd = `cd "${parentDir}" && tar -czf "${archivePath}" "${baseName}"`;
    } else {
      cmd = `cd "${parentDir}" && zip -r "${archivePath}" "${baseName}"`;
    }
    await sshTerminalService.execCommand(sessionId, cmd);
    res.json({ success: true, message: 'Archived successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Extract (Decompression)
router.post('/sessions/:sessionId/extract', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { archivePath, extractPath } = req.body;
  if (!archivePath || !extractPath) {
    res.status(400).json({ success: false, message: 'archivePath and extractPath are required' });
    return;
  }
  try {
    let cmd = '';
    if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
      cmd = `tar -xzf "${archivePath}" -C "${extractPath}"`;
    } else {
      cmd = `unzip -o "${archivePath}" -d "${extractPath}"`;
    }
    await sshTerminalService.execCommand(sessionId, cmd);
    res.json({ success: true, message: 'Extracted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Bulk Rename
router.post('/sessions/:sessionId/bulk-rename', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { dirPath, items } = req.body; // items: { oldName: string, newName: string }[]
  if (!dirPath || !items || !Array.isArray(items)) {
    res.status(400).json({ success: false, message: 'dirPath and items array are required' });
    return;
  }
  try {
    for (const item of items) {
      const oldFullPath = path.posix.join(dirPath, item.oldName);
      const newFullPath = path.posix.join(dirPath, item.newName);
      await sshTerminalService.renamePath(sessionId, oldFullPath, newFullPath, false);
    }
    res.json({ success: true, message: 'Bulk rename completed successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Directory Size Cache and Endpoint
const dirSizeCache = new Map<string, { size: number; count: number; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

router.get('/sessions/:sessionId/dir-size', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const dirPath = req.query.path as string;
  const force = req.query.force === 'true';

  if (!dirPath) {
    res.status(400).json({ success: false, message: 'path parameter is required' });
    return;
  }

  const cacheKey = `${sessionId}:${dirPath}`;
  if (!force) {
    const cached = dirSizeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      res.json({ success: true, ...cached, fromCache: true });
      return;
    }
  }

  try {
    const result = await sshTerminalService.getRemoteDirSize(sessionId, dirPath);
    dirSizeCache.set(cacheKey, { ...result, timestamp: Date.now() });
    res.json({ success: true, ...result, fromCache: false });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- Command Snippets ---

router.get('/snippets', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const connectionId = req.query.connectionId
      ? parseInt(req.query.connectionId as string)
      : null;

    let snippets;
    if (connectionId) {
      snippets = await db.all(
        'SELECT * FROM command_snippets WHERE connection_id = ? OR connection_id IS NULL ORDER BY use_count DESC',
        connectionId
      );
    } else {
      snippets = await db.all('SELECT * FROM command_snippets ORDER BY use_count DESC');
    }
    res.json({ success: true, snippets });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/snippets', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { connection_id, name, command, description, tags } = req.body;
    const result = await db.run(
      'INSERT INTO command_snippets (connection_id, name, command, description, tags) VALUES (?, ?, ?, ?, ?)',
      connection_id || null,
      name,
      command,
      description || '',
      tags || ''
    );
    res.json({ success: true, id: result.lastID });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/snippets/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { name, command, description, tags } = req.body;
    await db.run(
      'UPDATE command_snippets SET name = ?, command = ?, description = ?, tags = ?, updated_at = datetime("now") WHERE id = ?',
      name,
      command,
      description || '',
      tags || '',
      req.params.id
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/snippets/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM command_snippets WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/snippets/:id/use', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    await db.run(
      'UPDATE command_snippets SET use_count = use_count + 1 WHERE id = ?',
      req.params.id
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Accept a host fingerprint and save to known_hosts
router.post('/known-hosts', async (req: Request, res: Response) => {
  const { host, keyType, fingerprint } = req.body;
  if (!host || !keyType || !fingerprint) {
    res.status(400).json({ success: false, message: 'host, keyType, and fingerprint are required' });
    return;
  }

  try {
    const db = await getDb();
    // Use INSERT OR REPLACE so that mismatch updates work
    await db.run(
      `INSERT OR REPLACE INTO known_hosts (host, key_type, fingerprint)
       VALUES (?, ?, ?)`,
      [host, keyType, fingerprint]
    );

    res.json({ success: true, message: 'Host fingerprint accepted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper: Parse SSH config content
function parseSshConfig(content: string): any[] {
  const lines = content.split(/\r?\n/);
  const connections: any[] = [];
  let currentHost: any = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([a-zA-Z0-9_]+)\s*=?\s*(.+)$/);
    if (!match) continue;

    const key = match[1].toLowerCase();
    const val = match[2].trim().replace(/^"(.*)"$/, '$1');

    if (key === 'host') {
      if (val === '*') continue;
      
      if (currentHost && currentHost.server) {
        connections.push(currentHost);
      }
      
      currentHost = {
        name: val,
        server: '',
        port: 22,
        username: 'root',
        protocol: 'sftp',
        ssh_port: 22,
        ssh_username: 'root',
        ssh_auth_mode: 'password',
        ssh_private_key: '',
        password_hash: '',
        ssh_password_hash: ''
      };
    } else if (currentHost) {
      if (key === 'hostname') {
        currentHost.server = val;
      } else if (key === 'port') {
        const portNum = parseInt(val) || 22;
        currentHost.port = portNum;
        currentHost.ssh_port = portNum;
      } else if (key === 'user') {
        currentHost.username = val;
        currentHost.ssh_username = val;
      } else if (key === 'identityfile') {
        currentHost.ssh_auth_mode = 'key';
        let keyPath = val;
        if (keyPath.startsWith('~/')) {
          keyPath = path.join(os.homedir(), keyPath.slice(2));
        } else if (keyPath.startsWith('~')) {
          keyPath = path.join(os.homedir(), keyPath.slice(1));
        }
        
        try {
          if (fs.existsSync(keyPath)) {
            currentHost.ssh_private_key = fs.readFileSync(keyPath, 'utf8');
          } else {
            currentHost.ssh_private_key = `# IdentityFile: ${val}`;
          }
        } catch (e) {
          currentHost.ssh_private_key = `# IdentityFile (unreadable): ${val}`;
        }
      }
    }
  }

  if (currentHost && currentHost.server) {
    connections.push(currentHost);
  }

  return connections;
}

// Import SSH config file
router.post('/ssh-config/import', terminalUpload.single('file'), async (req: Request, res: Response) => {
  try {
    let content = '';
    if (req.file) {
      content = await fs.readFile(req.file.path, 'utf8');
      await fs.remove(req.file.path);
    } else if (req.body.configText) {
      content = req.body.configText;
    } else {
      res.status(400).json({ success: false, message: 'Provide file upload or configText' });
      return;
    }

    const imported = parseSshConfig(content);
    if (imported.length === 0) {
      res.json({ success: true, message: 'No valid Host configurations found in file.', count: 0 });
      return;
    }

    const db = await getDb();
    let importedCount = 0;
    
    await db.exec('BEGIN TRANSACTION;');
    try {
      for (const conn of imported) {
        const existing = await db.get(
          'SELECT id FROM ftp_connections WHERE server = ? AND username = ?',
          [conn.server, conn.username]
        );
        if (existing) continue;

        await db.run(
          `INSERT INTO ftp_connections (name, server, port, username, protocol, ssh_port, ssh_username, ssh_auth_mode, ssh_private_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            conn.name,
            conn.server,
            conn.port,
            conn.username,
            conn.protocol,
            conn.ssh_port,
            conn.ssh_username,
            conn.ssh_auth_mode,
            conn.ssh_private_key
          ]
        );
        importedCount++;
      }
      await db.exec('COMMIT;');
    } catch (err: any) {
      await db.exec('ROLLBACK;');
      throw err;
    }

    res.json({ success: true, message: `Successfully imported ${importedCount} connections`, count: importedCount });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Process List (Process Tree View)
router.get('/sessions/:sessionId/processes', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const stdout = await sshTerminalService.execCommand(sessionId, 'ps axo pid,ppid,user,%cpu,%mem,comm --no-headers');
    const lines = stdout.split('\n');
    const processes = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 6) continue;
      const pid = parseInt(parts[0], 10);
      const ppid = parseInt(parts[1], 10);
      const user = parts[2];
      const cpu = parseFloat(parts[3]);
      const mem = parseFloat(parts[4]);
      const name = parts.slice(5).join(' ');
      processes.push({ pid, ppid, user, cpu, mem, name });
    }
    res.json({ success: true, processes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/sessions/:sessionId/processes/kill', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { pid } = req.body;
  if (!pid) {
    res.status(400).json({ success: false, message: 'PID is required' });
    return;
  }
  try {
    await sshTerminalService.execCommand(sessionId, `kill -9 ${pid}`);
    res.json({ success: true, message: `Process ${pid} killed successfully` });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Environment Variables Viewer & editor
router.get('/sessions/:sessionId/env-vars', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const stdout = await sshTerminalService.execCommand(sessionId, 'printenv');
    const lines = stdout.split('\n');
    const envVars = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx);
      const value = trimmed.substring(eqIdx + 1);
      envVars.push({ key, value });
    }
    res.json({ success: true, envVars });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/sessions/:sessionId/env-vars', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { key, value } = req.body;
  if (!key) {
    res.status(400).json({ success: false, message: 'Key is required' });
    return;
  }
  try {
    const escapedVal = (value || '').replace(/"/g, '\\"');
    // Save permanently in ~/.bashrc or ~/.profile
    const cmd = `if [ -f ~/.bashrc ]; then if grep -q "export ${key}=" ~/.bashrc; then sed -i 's|export ${key}=.*|export ${key}="${escapedVal}"|' ~/.bashrc; else echo 'export ${key}="${escapedVal}"' >> ~/.bashrc; fi; else echo 'export ${key}="${escapedVal}"' >> ~/.profile; fi`;
    await sshTerminalService.execCommand(sessionId, cmd);
    res.json({ success: true, message: 'Environment variable saved' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/sessions/:sessionId/env-vars/:key', async (req: Request, res: Response) => {
  const { sessionId, key } = req.params;
  try {
    const cmd = `if [ -f ~/.bashrc ]; then sed -i '/export ${key}=/d' ~/.bashrc; fi; if [ -f ~/.profile ]; then sed -i '/export ${key}=/d' ~/.profile; fi`;
    await sshTerminalService.execCommand(sessionId, cmd);
    res.json({ success: true, message: 'Environment variable deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Uptime & Load History
router.get('/sessions/:sessionId/uptime', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const stdout = await sshTerminalService.execCommand(sessionId, 'uptime');
    const trimmed = stdout.trim();
    const loadMatch = trimmed.match(/load average:\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/i);
    const loads = loadMatch ? [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])] : [0, 0, 0];
    
    let uptimeStr = '';
    const upIndex = trimmed.indexOf('up');
    if (upIndex !== -1) {
      const commaIndex = trimmed.indexOf(',', upIndex);
      if (commaIndex !== -1) {
        const nextCommaIndex = trimmed.indexOf(',', commaIndex + 1);
        if (nextCommaIndex !== -1 && trimmed.includes('day')) {
          uptimeStr = trimmed.substring(upIndex + 2, nextCommaIndex).trim();
        } else {
          uptimeStr = trimmed.substring(upIndex + 2, commaIndex).trim();
        }
      }
    }
    if (!uptimeStr) uptimeStr = 'Unknown';
    res.json({ success: true, uptime: uptimeStr, loadAverage: loads });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
