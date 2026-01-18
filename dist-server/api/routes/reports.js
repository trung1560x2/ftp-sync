import { Router } from 'express';
import { logStore } from '../services/LogStore.js';
const router = Router();
router.get('/logs/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { limit = 200 } = req.query;
        const logs = logStore.getLogs(parseInt(connectionId), parseInt(limit));
        res.json({ logs, total: logs.length });
    }
    catch (error) {
        console.error('Failed to fetch logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});
router.get('/stats/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        const stats = logStore.getStats(parseInt(connectionId));
        res.json(stats);
    }
    catch (error) {
        console.error('Failed to fetch stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});
export default router;
