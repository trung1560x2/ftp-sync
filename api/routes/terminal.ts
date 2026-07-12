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

export default router;
