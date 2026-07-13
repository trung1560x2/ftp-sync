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

// List directory files (including files and folders)
router.post('/list-directory-files', async (req: Request, res: Response) => {
  const { path: dirPath } = req.body;
  
  try {
    const currentPath = dirPath || (os.platform() === 'win32' ? 'C:\\' : '/');
    
    if (!fs.existsSync(currentPath)) {
        return res.status(404).json({ error: 'Directory not found' });
    }

    const items = await fs.readdir(currentPath, { withFileTypes: true });
    
    const results = [];
    for (const item of items) {
      try {
        const itemPath = path.join(currentPath, item.name);
        const stats = await fs.stat(itemPath);
        results.push({
          name: item.name,
          path: itemPath,
          isDirectory: item.isDirectory(),
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        });
      } catch (err) {
        // Skip inaccessible files
      }
    }
        
    res.json({ 
        currentPath, 
        files: results,
        parentPath: path.dirname(currentPath)
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Local Rename
router.post('/rename', async (req: Request, res: Response) => {
  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath are required' });
  try {
    await fs.rename(oldPath, newPath);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Local Delete
router.post('/delete', async (req: Request, res: Response) => {
  const { path: itemPath } = req.body;
  if (!itemPath) return res.status(400).json({ error: 'path is required' });
  try {
    await fs.remove(itemPath);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Local Create Folder
router.post('/mkdir', async (req: Request, res: Response) => {
  const { path: dirPath } = req.body;
  if (!dirPath) return res.status(400).json({ error: 'path is required' });
  try {
    await fs.ensureDir(dirPath);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Local Bulk Rename
router.post('/bulk-rename', async (req: Request, res: Response) => {
  const { dirPath, items } = req.body; // items: { oldName: string, newName: string }[]
  if (!dirPath || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'dirPath and items array are required' });
  }
  try {
    for (const item of items) {
      await fs.rename(path.join(dirPath, item.oldName), path.join(dirPath, item.newName));
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Local Directory Size Calculation
router.get('/dir-size', async (req: Request, res: Response) => {
  const dirPath = req.query.path as string;
  if (!dirPath) return res.status(400).json({ error: 'path parameter is required' });

  try {
    let size = 0;
    let count = 0;
    const traverse = async (currentPath: string) => {
      const stats = await fs.stat(currentPath);
      if (stats.isDirectory()) {
        const files = await fs.readdir(currentPath);
        for (const file of files) {
          await traverse(path.join(currentPath, file));
        }
      } else {
        size += stats.size;
        count++;
      }
    };
    await traverse(dirPath);
    res.json({ success: true, size, count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
