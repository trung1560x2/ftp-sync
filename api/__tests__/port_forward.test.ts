import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, initDb, closeDb } from '../db.js';
import { portForwardService } from '../services/PortForwardService.js';
import fs from 'fs-extra';
import path from 'path';

describe('Port Forwarding tunnels tests', () => {
  beforeAll(async () => {
    // Initialize temporary database for tests
    process.env.DB_PATH = path.resolve(process.cwd(), 'api/test_port_forward.db');
    await fs.remove(process.env.DB_PATH);
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
    if (process.env.DB_PATH) {
      await fs.remove(process.env.DB_PATH);
    }
  });

  it('should create and retrieve a port forward configuration successfully', async () => {
    const id = await portForwardService.createForward({
      connectionId: 1,
      type: 'local',
      localHost: '127.0.0.1',
      localPort: 8888,
      remoteHost: '127.0.0.1',
      remotePort: 80,
      description: 'test postgres tunnel',
      autoStart: false
    });

    expect(id).toBeGreaterThan(0);

    const forward = await portForwardService.getForwardById(id);
    expect(forward).not.toBeNull();
    expect(forward!.localPort).toBe(8888);
    expect(forward!.description).toBe('test postgres tunnel');
    expect(forward!.status).toBe('disconnected');

    // Update configuration
    await portForwardService.updateForward(id, {
      description: 'updated description',
      localPort: 9999
    });

    const updated = await portForwardService.getForwardById(id);
    expect(updated!.localPort).toBe(9999);
    expect(updated!.description).toBe('updated description');

    // Delete configuration
    await portForwardService.deleteForward(id);
    const deleted = await portForwardService.getForwardById(id);
    expect(deleted).toBeNull();
  });
});
