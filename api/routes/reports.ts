import { Router } from 'express';
import { logStore } from '../services/LogStore.js';
import syncManager from '../services/SyncService.js';

const router = Router();

router.get('/logs/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { limit = 200 } = req.query;

    const logs = logStore.getLogs(parseInt(connectionId), parseInt(limit as string));

    res.json({ logs, total: logs.length });
  } catch (error) {
    console.error('Failed to fetch logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

router.post('/logs/clear/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    logStore.clearLogs(parseInt(connectionId));
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to clear logs:', error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

router.get('/stats/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;

    const stats = logStore.getStats(parseInt(connectionId));

    res.json(stats);
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/sessions/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { limit = 50 } = req.query;
    const sessions = logStore.getSyncSessions(parseInt(connectionId), parseInt(limit as string));
    res.json({ sessions });
  } catch (error) {
    console.error('Failed to fetch sync sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sync sessions' });
  }
});

router.post('/sessions/clear/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    logStore.clearSyncSessions(parseInt(connectionId));
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to clear sync sessions:', error);
    res.status(500).json({ error: 'Failed to clear sync sessions' });
  }
});

router.get('/heatmap/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const data = logStore.getHeatmapData(parseInt(connectionId));
    res.json(data);
  } catch (error) {
    console.error('Failed to fetch heatmap data:', error);
    res.status(500).json({ error: 'Failed to fetch heatmap data' });
  }
});

router.post('/sessions/restore', async (req, res) => {
  try {
    const { connectionId, sessionId, relPath } = req.body;
    await syncManager.restoreFileVersion(parseInt(connectionId), sessionId, relPath);
    res.json({ success: true, message: 'File restored and synced successfully' });
  } catch (error: any) {
    console.error('Failed to restore file version:', error);
    res.status(500).json({ error: error.message || 'Failed to restore file version' });
  }
});

export default router;