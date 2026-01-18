import { Router, Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import nodeDiskInfo from 'node-disk-info';
import os from 'os';

const router = Router();

// Get list of drives (Windows) or Root (Linux/Mac)
router.get('/drives', async (req: Request, res: Response) => {
  try {
    if (os.platform() === 'win32') {
        const disks = await nodeDiskInfo.getDiskInfo();
        const drives = disks.map(disk => ({
            name: disk.mounted, // "C:", "D:"
            description: `${disk.mounted} (${disk.filesystem})`,
            path: disk.mounted + path.sep // "C:\"
        }));
        res.json({ drives });
    } else {
        // Unix-like
        res.json({ drives: [{ name: 'Root', description: 'File System', path: '/' }] });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List directory contents
router.post('/list-dir', async (req: Request, res: Response) => {
  const { path: dirPath } = req.body;
  
  try {
    // If no path provided, try to guess home or root
    const currentPath = dirPath || (os.platform() === 'win32' ? 'C:\\' : '/');
    
    if (!fs.existsSync(currentPath)) {
        return res.status(404).json({ error: 'Directory not found' });
    }

    const items = await fs.readdir(currentPath, { withFileTypes: true });
    
    const folders = items
        .filter(item => item.isDirectory())
        .map(item => ({
            name: item.name,
            path: path.join(currentPath, item.name),
            type: 'folder'
        }));
        
    // We only care about folders for selecting sync target
    res.json({ 
        currentPath, 
        folders,
        parentPath: path.dirname(currentPath)
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
