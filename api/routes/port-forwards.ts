import { Router, Request, Response } from 'express';
import { portForwardService } from '../services/PortForwardService.js';

const router = Router();

// Get all port forwards
router.get('/', async (req: Request, res: Response) => {
  try {
    const forwards = await portForwardService.getAllForwards();
    res.json({ success: true, forwards });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new port forward config
router.post('/', async (req: Request, res: Response) => {
  const { connectionId, type, localHost, localPort, remoteHost, remotePort, description, autoStart } = req.body;
  if (!connectionId || !type || !localPort || !remotePort) {
    res.status(400).json({ success: false, error: 'connectionId, type, localPort, and remotePort are required' });
    return;
  }
  try {
    const id = await portForwardService.createForward({
      connectionId: parseInt(connectionId),
      type,
      localHost: localHost || '127.0.0.1',
      localPort: parseInt(localPort),
      remoteHost: remoteHost || '127.0.0.1',
      remotePort: parseInt(remotePort),
      description: description || '',
      autoStart: !!autoStart
    });
    res.json({ success: true, id, message: 'Port forward config created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update an existing port forward config
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { connectionId, type, localHost, localPort, remoteHost, remotePort, description, autoStart } = req.body;
  try {
    await portForwardService.updateForward(parseInt(id), {
      connectionId: connectionId ? parseInt(connectionId) : undefined,
      type,
      localHost,
      localPort: localPort ? parseInt(localPort) : undefined,
      remoteHost,
      remotePort: remotePort ? parseInt(remotePort) : undefined,
      description,
      autoStart
    });
    res.json({ success: true, message: 'Port forward config updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a port forward config
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await portForwardService.deleteForward(parseInt(id));
    res.json({ success: true, message: 'Port forward deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start a port forward tunnel
router.post('/:id/start', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await portForwardService.startTunnel(parseInt(id));
    res.json({ success: true, message: 'Tunnel started successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop a port forward tunnel
router.post('/:id/stop', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await portForwardService.stopTunnel(parseInt(id));
    res.json({ success: true, message: 'Tunnel stopped successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
