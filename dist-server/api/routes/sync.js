import { Router } from 'express';
import syncManager from '../services/SyncService.js';
const router = Router();
router.post('/start', async (req, res) => {
    const { id } = req.body;
    try {
        await syncManager.startSync(id);
        res.json({ success: true, message: 'Sync started' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
router.post('/stop', async (req, res) => {
    const { id } = req.body;
    try {
        await syncManager.stopSync(id);
        res.json({ success: true, message: 'Sync stopped' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
router.get('/status/:id', (req, res) => {
    const { id } = req.params;
    const status = syncManager.getStatus(parseInt(id));
    res.json(status);
});
router.post('/upload-file', async (req, res) => {
    const { id, filename } = req.body;
    try {
        await syncManager.manualUpload(id, filename);
        res.json({ success: true, message: 'File uploaded' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
router.post('/download-file', async (req, res) => {
    const { id, remotePath } = req.body;
    try {
        await syncManager.manualDownload(id, remotePath);
        res.json({ success: true, message: 'File downloaded' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
export default router;
