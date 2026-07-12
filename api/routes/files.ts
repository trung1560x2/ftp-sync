import { Router, Request, Response } from 'express';
import { Client } from 'basic-ftp';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { execFile } from 'child_process';
import util from 'util';
import { fileURLToPath } from 'url';
import { getDb } from '../db.js';
import { decrypt } from '../utils/encryption.js';
import SyncManager from '../services/SyncService.js';
import { TransferClientFactory } from '../services/transfer/TransferClientFactory.js';
import { TransferClient } from '../services/transfer/TransferClient.js';
import { scanRemote, scanLocal, scanLocalCached, calculateDiff } from '../services/DiffScanner.js';

const execFileAsync = util.promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Middleware to sanitize ID (remove quotes which might be sent by some clients)
router.param('id', (req, res, next, id) => {
  if (id) {
    req.params.id = id.replace(/^['"]|['"]$/g, '');
  }
  next();
});

// Configure multer for uploads
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      const connectionId = req.params.id;
      const subDir = (req.query.subDir as string) || '';
      
      const localRoot = await getLocalRoot(connectionId);
      const dest = path.resolve(localRoot, subDir);

      // Security check: prevent directory traversal
      if (!dest.startsWith(localRoot)) {
        return cb(new Error('Invalid destination path (directory traversal prevention)'), localRoot);
      }

      await fs.ensureDir(dest);
      cb(null, dest);
    } catch (err: any) {
      cb(err, '');
    }
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });


// Constants for Diff
const IGNORED_FOLDERS = new Set([
  '.git', 'node_modules', 'vendor', '.idea', '.vscode',
  'storage', 'bootstrap/cache', 'dist', 'build', 'coverage'
]);
const MAX_DEPTH = 8;

// Helper to get FTP client (Basic FTP for simple listing)
async function getFtpClient(connectionId: string) {
  const db = await getDb();
  const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
  if (!config) throw new Error('Connection not found');

  const password = decrypt(config.password_hash);
  if (!password) throw new Error('Cannot decrypt password');

  const client = new Client();
  await client.access({
    host: config.server,
    user: config.username,
    password: password,
    port: config.port || 21,
    secure: false
  });
  return { client, config };
}

// Helper to get connection config
async function getConnectionConfig(connectionId: string) {
  const db = await getDb();
  const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
  return config;
}

// Helper to determine local root
async function getLocalRoot(connectionId: string, config?: any) {
  if (!config || !config.local_path) {
    const db = await getDb();
    config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
  }

  if (!config) throw new Error('Connection not found');

  if (config.local_path && config.local_path.trim() !== '') {
    return config.local_path;
  }
  return path.resolve(process.cwd(), 'sync_data', connectionId);
}

// --- Recursive Scan Helpers (Imported from DiffScanner) ---


// --- Routes ---

// List FTP Files (Simple)
router.get('/ftp/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const dirPath = req.query.path as string || '/';

  try {
    const config = await getConnectionConfig(id);
    if (!config) return res.status(404).json({ error: 'Connection not found' });
    const targetDir = (req.query.path) ? dirPath : (config.target_directory || '/');

    const files = await SyncManager.runWithClient(parseInt(id), async (client) => {
      const list = await client.list(targetDir);
      return list.map(item => ({
        name: item.name,
        isDirectory: item.isDirectory,
        size: item.size,
        modifiedAt: item.modifiedAt,
        path: path.posix.join(targetDir, item.name)
      }));
    }, true); // isInteractive = true

    res.json({ files, currentPath: targetDir });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List Local Files
router.get('/local/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const localRoot = await getLocalRoot(id);
    if (!fs.existsSync(localRoot)) {
      return res.json({ files: [] });
    }
    const items = await fs.readdir(localRoot);
    const files = [];
    for (const item of items) {
      const itemPath = path.join(localRoot, item);
      const stats = await fs.stat(itemPath);
      files.push({
        name: item,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime
      });
    }
    res.json({ files });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Upload File
router.post('/upload/:id', upload.array('files'), (req: Request, res: Response) => {
  res.json({ success: true, message: 'Files uploaded successfully' });
});

// Import local files (Electron Drag & Drop direct path copy)
router.post('/import-local/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { items, subDir = '', remoteDir = '' } = req.body; // items: { srcPath: string, destName: string }[]

  try {
    const config = await getConnectionConfig(id);
    const localRoot = await getLocalRoot(id, config);
    if (!fs.existsSync(localRoot)) {
      return res.status(404).json({ error: 'Local root directory does not exist' });
    }

    let resolvedSubDir = subDir;

    if (remoteDir) {
      const remoteRoot = config.target_directory || '/';
      const normRemote = remoteDir.replace(/\\/g, '/');
      const normRoot = remoteRoot.replace(/\\/g, '/');

      if (normRoot === '/' || normRoot === '') {
        resolvedSubDir = normRemote.startsWith('/') ? normRemote.substring(1) : normRemote;
      } else if (normRemote.startsWith(normRoot)) {
        resolvedSubDir = normRemote.substring(normRoot.length);
        if (resolvedSubDir.startsWith('/')) resolvedSubDir = resolvedSubDir.substring(1);
      } else {
        resolvedSubDir = normRemote.startsWith('/') ? normRemote.substring(1) : normRemote;
      }
    }

    const subDirPath = path.resolve(localRoot, resolvedSubDir);
    // Security check: prevent directory traversal
    if (!subDirPath.startsWith(localRoot)) {
      return res.status(400).json({ error: 'Invalid destination directory (directory traversal prevention)' });
    }

    await fs.ensureDir(subDirPath);

    for (const item of items) {
      const { srcPath, destName } = item;
      if (!srcPath || !destName) continue;

      const destPath = path.resolve(subDirPath, destName);
      // Security check: prevent directory traversal
      if (!destPath.startsWith(localRoot)) {
        console.warn(`[Import] Blocked potential directory traversal to ${destPath}`);
        continue;
      }

      if (!fs.existsSync(srcPath)) {
        console.warn(`[Import] Source path does not exist: ${srcPath}`);
        continue;
      }

      await fs.copy(srcPath, destPath, { overwrite: true });
    }

    res.json({ 
      success: true, 
      message: 'Files imported successfully',
      relativePath: resolvedSubDir 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});



// Visual Diff (Main Thread Implementation)
router.get('/diff/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const dirPath = req.query.path as string || '/';

  let attempts = 0;
  const MAX_ATTEMPTS = 3;

  while (attempts < MAX_ATTEMPTS) {
    try {
      attempts++;
      const config = await getConnectionConfig(id);
      if (!config) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      // 1. Determine Paths
      const targetDir = (req.query.path) ? dirPath : (config.target_directory || '/');
      const localRoot = await getLocalRoot(id, config);
      const isRecursive = req.query.recursive === 'true';

      // Calculate correctly scoped local directory
      const remoteRoot = config.target_directory || '/';
      let relativePath = '';

      const normRemote = targetDir.replace(/\\/g, '/');
      const normRoot = remoteRoot.replace(/\\/g, '/');

      if (normRoot === '/' || normRoot === '') {
        relativePath = normRemote.startsWith('/') ? normRemote.substring(1) : normRemote;
      } else if (normRemote.startsWith(normRoot)) {
        relativePath = normRemote.substring(normRoot.length);
        if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
      } else {
        relativePath = normRemote.startsWith('/') ? normRemote.substring(1) : normRemote;
      }

      const localDir = relativePath ? path.join(localRoot, relativePath.split('/').join(path.sep)) : localRoot;

      const tStart = Date.now();
      if (attempts === 1) console.log('[Diff] Target:', targetDir, 'Local:', localDir, 'Recursive:', isRecursive);

      // 2. Scan using single connection for remote to avoid connection pooling bottlenecks
      const tScanStart = Date.now();
      const connIdNum = parseInt(id);
      const isCacheWarmed = SyncManager.isCacheWarmed(connIdNum);

      const [remoteFiles, localFiles] = await Promise.all([
        SyncManager.runWithClient(connIdNum, async (client) => {
          const tRemoteStart = Date.now();
          const res = await scanRemote(client, targetDir, targetDir, isRecursive);
          console.log(`[Diff] Remote scan took ${Date.now() - tRemoteStart}ms, returned ${res.length} files`);
          return res;
        }, true), // isInteractive = true
        (async () => {
          const tLocalStart = Date.now();
          if (isCacheWarmed) {
            const res = await scanLocalCached(connIdNum, relativePath, isRecursive);
            console.log(`[Diff] Local scan (SQLite cache) took ${Date.now() - tLocalStart}ms, returned ${res.length} files`);
            return res;
          } else {
            const res = await scanLocal(localDir, localDir, isRecursive);
            console.log(`[Diff] Local scan (live scan fallback) took ${Date.now() - tLocalStart}ms, returned ${res.length} files`);
            return res;
          }
        })()
      ]);
      console.log(`[Diff] Total scan took ${Date.now() - tScanStart}ms (Attempts: ${attempts})`);

      const diffs = calculateDiff(remoteFiles, localFiles, isRecursive);

      res.json({ diffs, currentPath: targetDir });
      return; // Success, exit function

    } catch (error: any) {
      console.error(`[Diff Route Error] Attempt ${attempts} failed:`, error.message);


      // Don't retry on auth/config errors
      const isAuthError = error.message.includes('decrypt') ||
        error.message.includes('password') ||
        error.message.includes('Login') ||
        error.message.includes('authentication');

      if (isAuthError) {
        res.status(500).json({ error: 'Cannot connect: Password decryption failed. Please re-enter your FTP password in connection settings.' });
        return;
      }

      // Retry only on connection-related errors
      const isConnectionError = error.message.includes('FIN packet') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('Timed out');

      if (attempts >= MAX_ATTEMPTS || !isConnectionError) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Wait before retry (exponential backoff: 500, 1000, 2000...)
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempts - 1)));
    }
  } // end while
});

export default router;
