import { Router, Request, Response } from 'express';
import deploymentService from '../services/DeploymentService.js';

const router = Router();

// Get Deployment Status
router.get('/:id/status', (req: Request, res: Response) => {
    const { id } = req.params;
    const status = deploymentService.getStatus(parseInt(id));
    res.json(status || { status: 'idle' });
});

// List Backups
router.get('/:id/backups', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const backups = await deploymentService.getBackups(parseInt(id));
        res.json({ backups });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Start Deployment
router.post('/:id/deploy', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        // Run in background
        deploymentService.deploy(parseInt(id)).catch(console.error);
        res.json({ success: true, message: 'Deployment started' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Start Rollback
router.post('/:id/rollback', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { backupName } = req.body;
    try {
        // Run in background
        deploymentService.rollback(parseInt(id), backupName).catch(console.error);
        res.json({ success: true, message: 'Rollback started' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
