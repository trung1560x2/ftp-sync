import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { logStore } from '../services/LogStore.js';

describe('LogStore Service', () => {
  const testBaseDir = path.resolve(process.cwd(), 'scratch/test_logstore');

  beforeAll(() => {
    // Set environment variable to route LogStore files to test directory
    process.env.DB_PATH = path.join(testBaseDir, 'ftp_manager_test.sqlite');
  });

  beforeEach(async () => {
    await fs.ensureDir(testBaseDir);
    // Reset internal state by clearing arrays (using private property access or methods)
    (logStore as any).logs = [];
    (logStore as any).stats = [];
    (logStore as any).syncSessions = [];
    (logStore as any).logIdCounter = 0;
    (logStore as any).statIdCounter = 0;
    (logStore as any).initialized = false;
  });

  afterEach(async () => {
    // Cancel any debounced saves
    if ((logStore as any).saveDebounceTimer) {
      clearTimeout((logStore as any).saveDebounceTimer);
    }
    await fs.remove(testBaseDir);
  });

  it('should successfully add and retrieve logs', () => {
    const connId = 999;
    logStore.addLog(connId, 'info', 'Connecting to server...');
    logStore.addLog(connId, 'success', 'Connected successfully.');

    const logs = logStore.getLogs(connId);
    expect(logs).toHaveLength(2);
    expect(logs[0].type).toBe('success');
    expect(logs[0].message).toBe('Connected successfully.');
    expect(logs[1].type).toBe('info');
    expect(logs[1].message).toBe('Connecting to server...');
  });

  it('should cap logs to 1000 per connection', () => {
    const connId = 777;
    // Add 1050 logs
    for (let i = 1; i <= 1050; i++) {
      logStore.addLog(connId, 'info', `Log message ${i}`);
    }

    const logs = logStore.getLogs(connId, 1000);
    expect(logs).toHaveLength(1000);
    // The logs array is unshifted, so the first element (index 0) is the newest one (1050)
    expect(logs[0].message).toBe('Log message 1050');
    // The last element is the oldest kept (51st log)
    expect(logs[999].message).toBe('Log message 51');
  });

  it('should record transfer stats and aggregate total stats', () => {
    const connId = 123;
    logStore.addTransferStat(connId, 5000, 'upload');
    logStore.addTransferStat(connId, 15000, 'download');
    logStore.addTransferStat(connId, 3000, 'upload');

    const { totalStats, dailyStats } = logStore.getStats(connId);
    expect(totalStats.total_uploaded).toBe(8000);
    expect(totalStats.total_downloaded).toBe(15000);

    // Verify daily stats grouping
    expect(dailyStats.length).toBeGreaterThan(0);
    const uploadToday = dailyStats.find((s: any) => s.direction === 'upload');
    expect(uploadToday?.total_bytes).toBe(8000);
  });

  it('should generate heatmap data correctly', () => {
    const connId = 456;
    const session = {
      id: 'session-1',
      connection_id: connId,
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      duration: 120,
      files: [
        { name: 'file1.txt', path: '/file1.txt', size: 1024, direction: 'upload' as const, status: 'success' as const },
        { name: 'file2.txt', path: '/file2.txt', size: 2048, direction: 'upload' as const, status: 'success' as const }
      ]
    };

    logStore.addSyncSession(session);
    const heatmap = logStore.getHeatmapData(connId);
    expect(heatmap).toHaveLength(1);
    expect(heatmap[0].count).toBe(2);
    expect(heatmap[0].bytes).toBe(3072);
  });
});
