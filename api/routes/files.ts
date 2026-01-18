import { Router, Request, Response } from 'express';
import { Client } from 'basic-ftp';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { getDb } from '../db.js';
import { decrypt } from '../utils/encryption.js';

const router = Router();

// Configure multer for uploads
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const connectionId = req.params.id;
    const dest = path.resolve(process.cwd(), 'sync_data', connectionId);
    await fs.ensureDir(dest);
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    // Keep original filename
    // Note: Buffer handling for utf-8 filenames might be needed depending on OS
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// Helper to get FTP client
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

// List FTP Files
router.get('/ftp/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const dirPath = req.query.path as string || '/';

  let client;
  try {
    const { client: ftpClient, config } = await getFtpClient(id);
    client = ftpClient;

    // Normalize path. If relative, prepend target directory
    // But usually FTP paths are absolute. 
    // If user provided a path, use it. If not, use target_directory from config.
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
    const localRoot = path.resolve(process.cwd(), 'sync_data', id);
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

// Upload File (Browser -> Server Local Sync Folder)
router.post('/upload/:id', upload.array('files'), (req: Request, res: Response) => {
  // Multer handles the upload. 
  // Once uploaded to sync_data/{id}, the SyncService Watcher (if running) 
  // will automatically detect and push to FTP.
  res.json({ success: true, message: 'Files uploaded successfully' });
});

export default router;
