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


router.get('/status/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const status = await syncManager.getStatus(parseInt(id));
  res.json(status);
});

router.get('/progress/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const progress = syncManager.getProgress(parseInt(id));
  res.json(progress || { activeUploads: [], queueLength: 0, totalFilesInBatch: 0, completedFiles: 0 });
});

router.get('/stream/:id', (req: Request, res: Response) => {
  const connectionId = parseInt(req.params.id);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const initialProgress = syncManager.getProgress(connectionId);
  res.write(`data: ${JSON.stringify(initialProgress || { activeUploads: [], queueLength: 0, totalFilesInBatch: 0, completedFiles: 0 })}\n\n`);

  const onProgress = (id: number, data: any) => {
    if (id === connectionId) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  syncManager.on('progress', onProgress);

  const heartbeatTimer = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    syncManager.off('progress', onProgress);
    res.end();
  });
});

router.post('/upload-file', async (req: Request, res: Response) => {
  const { id, filename, remoteName } = req.body;
  try {
    // filename: local file name (e.g., 'http' on Windows)
    // remoteName: optional, the name to use on remote server (e.g., 'Http' on Linux)
    // Pre-warm connection pool for faster transfer
    await syncManager.ensureConnected(id);
    await syncManager.manualUpload(id, filename, remoteName);
    res.json({ success: true, message: 'File uploaded' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/download-file', async (req: Request, res: Response) => {
  const { id, remotePath } = req.body;
  try {
    // Pre-warm connection pool for faster transfer
    await syncManager.ensureConnected(id);
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

router.get('/interrupted', async (req: Request, res: Response) => {
  try {
    const sessions = await syncManager.getInterruptedSessions();
    res.json({ success: true, sessions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/resume-interrupted', async (req: Request, res: Response) => {
  const { id } = req.body;
  try {
    // Start resume in background
    syncManager.resumeInterruptedSync(parseInt(id));
    res.json({ success: true, message: 'Recovery resume started' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/discard-interrupted', async (req: Request, res: Response) => {
  const { id } = req.body;
  try {
    await syncManager.discardInterruptedSync(parseInt(id));
    res.json({ success: true, message: 'Interrupted session discarded' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
