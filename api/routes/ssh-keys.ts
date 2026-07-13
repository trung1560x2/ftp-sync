import { Router, Request, Response } from 'express';
import { sshKeyService } from '../services/SSHKeyService.js';
import { decrypt } from '../utils/encryption.js';
import { getDb } from '../db.js';

const router = Router();

// Get all managed SSH keys
router.get('/', async (req: Request, res: Response) => {
  try {
    const keys = await sshKeyService.getAllKeys();
    res.json({ success: true, keys });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate a new key pair
router.post('/generate', async (req: Request, res: Response) => {
  const { name, type } = req.body;
  if (!name || !type) {
    res.status(400).json({ success: false, error: 'Name and type (rsa/ed25519) are required' });
    return;
  }
  try {
    const key = await sshKeyService.generateKeyPair(name, type);
    res.json({ success: true, key });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import an existing private key
router.post('/import', async (req: Request, res: Response) => {
  const { name, privateKey } = req.body;
  if (!name || !privateKey) {
    res.status(400).json({ success: false, error: 'Name and privateKey are required' });
    return;
  }
  try {
    const key = await sshKeyService.importPrivateKey(name, privateKey);
    res.json({ success: true, key });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a managed key
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await sshKeyService.deleteKey(parseInt(id));
    res.json({ success: true, message: 'Key deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Install managed key to remote authorized_keys
router.post('/:id/install', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { connectionId, host, port, username, password, privateKey } = req.body;

  let finalHost = host;
  let finalPort = port;
  let finalUsername = username;
  let finalPassword = password;
  let finalPrivateKey = privateKey;

  // If connectionId is provided, load settings from database
  if (connectionId) {
    try {
      const db = await getDb();
      const conn = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
      if (conn) {
        finalHost = conn.server;
        finalPort = conn.port;
        finalUsername = conn.username;
        if (conn.password) {
          finalPassword = decrypt(conn.password);
        }
        if (conn.private_key) {
          finalPrivateKey = decrypt(conn.private_key);
        }
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to load connection details: ' + err.message });
      return;
    }
  }

  if (!finalHost || !finalUsername) {
    res.status(400).json({ success: false, error: 'Host and Username are required to install key' });
    return;
  }

  try {
    await sshKeyService.installPublicKey(parseInt(id), {
      server: finalHost,
      port: finalPort,
      username: finalUsername,
      password: finalPassword,
      privateKey: finalPrivateKey
    });
    res.json({ success: true, message: 'SSH Key installed successfully to remote host' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
