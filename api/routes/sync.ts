import { Router, Request, Response } from 'express';
import syncManager from '../services/SyncService.js';

const router = Router();

router.post('/start', async (req: Request, res: Response) => {
  const { id } = req.body;
  try {
    await syncManager.startSync(id);
    res.json({ success: true, message: 'Sync started' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/stop', async (req: Request, res: Response) => {
  const { id } = req.body;
  try {
    await syncManager.stopSync(id);
    res.json({ success: true, message: 'Sync stopped' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});


router.get('/status/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const status = syncManager.getStatus(parseInt(id));
  res.json(status);
});

router.get('/progress/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const progress = syncManager.getProgress(parseInt(id));
  res.json(progress || { activeUploads: [], queueLength: 0, totalFilesInBatch: 0, completedFiles: 0 });
});

router.post('/upload-file', async (req: Request, res: Response) => {
  const { id, filename, remoteName } = req.body;
  try {
    // filename: local file name (e.g., 'http' on Windows)
    // remoteName: optional, the name to use on remote server (e.g., 'Http' on Linux)
    await syncManager.manualUpload(id, filename, remoteName);
    res.json({ success: true, message: 'File uploaded' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/download-file', async (req: Request, res: Response) => {
  const { id, remotePath } = req.body;
  try {
    await syncManager.manualDownload(id, remotePath);
    res.json({ success: true, message: 'File downloaded' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/content-diff', async (req: Request, res: Response) => {
  const { id, filename, remoteName } = req.body;
  try {
    const diffData = await syncManager.getContentDiff(id, filename, remoteName);
    res.json({ success: true, data: diffData });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/bulk', async (req: Request, res: Response) => {
  const { id, items, basePath } = req.body;
  try {
    // items: { path: string, direction: 'upload'|'download', isDirectory: boolean }[]
    await syncManager.processBulkSync(id, items, basePath || '/');
    res.json({ success: true, message: 'Bulk sync started' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
