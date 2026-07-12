import express, { Request, Response } from 'express';
import { logStore } from '../services/LogStore.js';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db.js';
import syncServiceModule from '../services/SyncService.js';

const router = express.Router();

// Perform data cleanup based on retention days
router.post('/cleanup', requireAuth, async (req: Request, res: Response) => {
  try {
    const { retentionDays } = req.body;
    
    if (typeof retentionDays !== 'number' || retentionDays <= 0) {
      res.status(400).json({ error: 'Invalid retentionDays value' });
      return;
    }
    
    await logStore.cleanupOldData(retentionDays);
    res.json({ success: true, message: `Cleaned up log history older than ${retentionDays} days.` });
  } catch (err: any) {
    console.error('Settings cleanup route failed:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Clear all local file index cache
router.post('/cache/clear', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM local_file_cache');
    
    // Invalidate caches in active sessions
    syncServiceModule.clearAllCacheWarmed();
    
    res.json({ success: true, message: 'Local file index cache cleared successfully.' });
  } catch (err: any) {
    console.error('Settings clear cache failed:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

export default router;
