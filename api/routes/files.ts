import { Router, Request, Response } from 'express';
import { Client } from 'basic-ftp';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { getDb } from '../db.js';
import { decrypt } from '../utils/encryption.js';
import SyncManager from '../services/SyncService.js';
import { TransferClientFactory } from '../services/transfer/TransferClientFactory.js';
import { TransferClient } from '../services/transfer/TransferClient.js';

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
    const connectionId = req.params.id;
    const dest = path.resolve(process.cwd(), 'sync_data', connectionId);
    await fs.ensureDir(dest);
    cb(null, dest);
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

// --- Recursive Scan Helpers (Main Thread) ---

const scanRemote = async (client: TransferClient, dir: string, base: string, recursive: boolean, ignoredFolders: Set<string>, depth: number = 0): Promise<any[]> => {
  if (depth > MAX_DEPTH) return [];
  try {
    const files = await client.list(dir);
    let results: any[] = [];

    const currentLevel = files.map(f => ({
      name: f.name,
      size: f.size,
      modifiedAt: f.modifiedAt,
      isDirectory: f.isDirectory,
      type: (f as any).type,
      relPath: path.posix.join(path.posix.relative(base, dir).split(path.sep).join('/'), f.name),
      fullPath: path.posix.join(dir, f.name),
      isDirectChild: dir === base
    }));

    results = results.concat(currentLevel);

    if (recursive) {
      for (const f of files) {
        if (f.isDirectory && f.name !== '.' && f.name !== '..') {
          if (ignoredFolders.has(f.name)) continue;

          const subDir = path.posix.join(dir, f.name);
          const subFiles = await scanRemote(client, subDir, base, true, ignoredFolders, depth + 1);
          results = results.concat(subFiles);
        }
      }
    }
    return results;
  } catch (e: any) {
    console.error(`[Diff] Remote scan failed for ${dir}:`, e.message);
    return [];
  }
};

const scanLocal = async (dir: string, base: string, recursive: boolean, ignoredFolders: Set<string>, depth: number = 0): Promise<any[]> => {
  if (depth > MAX_DEPTH) return [];
  try {
    // Check if dir exists
    if (!fs.existsSync(dir)) return [];

    const entries = await fs.readdir(dir, { withFileTypes: true });
    let results: any[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (recursive && entry.isDirectory() && ignoredFolders.has(entry.name)) continue;

      let stats;
      try { stats = await fs.stat(fullPath); } catch { continue; }

      const relPathFromBase = path.relative(base, fullPath).replace(/\\/g, '/');

      results.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime,
        relPath: relPathFromBase,
        isDirectChild: dir === base
      });

      if (recursive && entry.isDirectory()) {
        const subFiles = await scanLocal(fullPath, base, true, ignoredFolders, depth + 1);
        results = results.concat(subFiles);
      }
    }
    return results;
  } catch (e: any) {
    console.error(`[Diff] Local scan failed for ${dir}:`, e.message);
    return [];
  }
};


// --- Routes ---

// List FTP Files (Simple)
router.get('/ftp/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const dirPath = req.query.path as string || '/';

  let client;
  try {
    const { client: ftpClient, config } = await getFtpClient(id);
    client = ftpClient;
    const targetDir = (req.query.path) ? dirPath : (config.target_directory || '/');

    const list = await client.list(targetDir);

    const files = list.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory,
      size: item.size,
      modifiedAt: item.modifiedAt,
      path: path.posix.join(targetDir, item.name)
    }));

    res.json({ files, currentPath: targetDir });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  } finally {
    if (client) client.close();
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


// Helper for robust connection
const connectClient = async (configOverride?: any) => {
  // ... logic to connect ...
}

// Visual Diff (Main Thread Implementation)
router.get('/diff/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const dirPath = req.query.path as string || '/';

  let attempts = 0;
  const MAX_ATTEMPTS = 3;

  while (attempts < MAX_ATTEMPTS) {
    let client: TransferClient | null = null;
    try {
      attempts++;
      const config = await getConnectionConfig(id);

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

      if (attempts === 1) console.log('[Diff] Target:', targetDir, 'Local:', localDir, 'Recursive:', isRecursive);

      // 2. Connect
      const protocol = config.protocol || 'ftp';
      client = TransferClientFactory.createClient(protocol, 60000); // 60s timeout
      const password = decrypt(config.password_hash);

      await client.connect({
        host: config.server,
        username: config.username,
        password: password,
        port: config.port || (config.protocol === 'sftp' ? 22 : 21),
        secure: config.secure ? true : false,
        secureOptions: config.secure ? { rejectUnauthorized: false } : undefined,
        privateKey: config.private_key
      });

      // 3. Scan (Parallel)
      const [remoteFiles, localFiles] = await Promise.all([
        scanRemote(client, targetDir, targetDir, isRecursive, IGNORED_FOLDERS),
        scanLocal(localDir, localDir, isRecursive, IGNORED_FOLDERS)
      ]);

      // 4. Compare
      const diffMap = new Map<string, any>();
      const getKey = (p: string) => p.toLowerCase();

      // Process Remote
      remoteFiles.forEach(r => {
        const key = getKey(r.relPath);
        diffMap.set(key, {
          ...r,
          localName: null,
          status: 'missing_local',
          remote: { size: r.size, modifiedAt: r.modifiedAt },
          local: null
        });
      });

      // Process Local
      localFiles.forEach(l => {
        const key = getKey(l.relPath);
        if (diffMap.has(key)) {
          const item = diffMap.get(key);
          item.local = { size: l.size, modifiedAt: l.modifiedAt };
          item.localName = l.name;

          if (item.isDirectory) {
            item.status = 'synchronized'; // Folders exist on both sides
          } else {
            const TIME_TOLERANCE = 2000;
            const rTime = item.remote.modifiedAt instanceof Date ? item.remote.modifiedAt.getTime() : new Date(item.remote.modifiedAt).getTime();
            const lTime = new Date(l.modifiedAt).getTime();

            if (l.size !== item.size) item.status = 'different_size';
            else if (lTime > rTime + TIME_TOLERANCE) item.status = 'newer_local';
            else if (rTime > lTime + TIME_TOLERANCE) item.status = 'newer_remote';
            else item.status = 'synchronized';
          }
        } else {
          // New local item
          diffMap.set(key, {
            name: l.name,
            localName: l.name,
            isDirectory: l.isDirectory,
            size: l.size,
            modifiedAt: l.modifiedAt,
            local: { size: l.size, modifiedAt: l.modifiedAt },
            remote: null,
            status: 'missing_remote',
            relPath: l.relPath,
            isDirectChild: l.isDirectChild
          });
        }
      });

      // 5. Aggregate Changes (for Deep Scan)
      if (isRecursive) {
        diffMap.forEach((item, key) => {
          if (item.status !== 'synchronized') {
            const parts = item.relPath.split('/');
            if (parts.length > 1) {
              // Check top-level parent (direct child of comparison root)
              const topLevelName = parts[0];
              const topLevelKey = getKey(topLevelName);
              const parent = diffMap.get(topLevelKey);
              if (parent && parent.isDirectory) {
                parent.containsChanges = true;
              }
            }
          }
        });
      }

      // 6. Filter & Sort
      const diffs = Array.from(diffMap.values())
        .filter(item => item.isDirectChild)
        .sort((a, b) => {
          if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
          return a.isDirectory ? -1 : 1;
        });

      res.json({ diffs, currentPath: targetDir });
      return; // Success, exit function

    } catch (error: any) {
      console.error(`[Diff Route Error] Attempt ${attempts} failed:`, error.message);

      // Cleanup client inside loop before retrying
      if (client) {
        try { client.close(); } catch { }
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
