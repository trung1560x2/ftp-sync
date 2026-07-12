import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { logStore } from '../services/LogStore.js';
import { getDb, closeDb } from '../db.js';

describe('LogStore Service (SQLite)', () => {
  const testBaseDir = path.resolve(process.cwd(), 'scratch/test_logstore');
  const testDbPath = path.join(testBaseDir, 'ftp_manager_test.sqlite');

  beforeAll(async () => {
    await fs.ensureDir(testBaseDir);
    process.env.DB_PATH = testDbPath;
    await closeDb();
    
    // Initialize DB & run migrations
    const db = await getDb();
    // Verify migrations ran
    const row = await db.get<{ version: number }>('SELECT MAX(version) as version FROM schema_version');
    expect(row?.version).toBeGreaterThanOrEqual(3);
  });

  afterAll(async () => {
    await closeDb();
    await fs.remove(testBaseDir);
  });

  beforeEach(async () => {
    const db = await getDb();
    // Clean tables before each test
    await db.run('DELETE FROM sync_logs');
    await db.run('DELETE FROM transfer_stats');
    await db.run('DELETE FROM sync_sessions');
    
    // Reset LogStore initialization flag so it can re-init
    (logStore as any).initialized = false;
  });

  it('should successfully add and retrieve logs', async () => {
    const connId = 999;
    await logStore.addLog(connId, 'info', 'Connecting to server...');
    await logStore.addLog(connId, 'success', 'Connected successfully.');

    const logs = await logStore.getLogs(connId);
    expect(logs).toHaveLength(2);
    expect(logs[0].type).toBe('success');
    expect(logs[0].message).toBe('Connected successfully.');
    expect(logs[1].type).toBe('info');
    expect(logs[1].message).toBe('Connecting to server...');
  });

  it('should cap logs to 1000 per connection', async () => {
    const connId = 777;
    // Add 1050 logs
    for (let i = 1; i <= 1050; i++) {
      await logStore.addLog(connId, 'info', `Log message ${i}`);
    }

    const logs = await logStore.getLogs(connId, 1000);
    expect(logs).toHaveLength(1000);
    // The logs are ordered by id DESC in SQLite, so index 0 is newest (1050)
    expect(logs[0].message).toBe('Log message 1050');
    // The last element is the oldest kept (51st log)
    expect(logs[999].message).toBe('Log message 51');
  });

  it('should record transfer stats and aggregate total stats', async () => {
    const connId = 123;
    await logStore.addTransferStat(connId, 5000, 'upload');
    await logStore.addTransferStat(connId, 15000, 'download');
    await logStore.addTransferStat(connId, 3000, 'upload');

    const { totalStats, dailyStats } = await logStore.getStats(connId);
    expect(totalStats.total_uploaded).toBe(8000);
    expect(totalStats.total_downloaded).toBe(15000);

    // Verify daily stats grouping
    expect(dailyStats.length).toBeGreaterThan(0);
    const uploadToday = dailyStats.find((s: any) => s.direction === 'upload');
    expect(uploadToday?.total_bytes).toBe(8000);
  });

  it('should generate heatmap data correctly', async () => {
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

    await logStore.addSyncSession(session);
    const heatmap = await logStore.getHeatmapData(connId);
    expect(heatmap).toHaveLength(1);
    expect(heatmap[0].count).toBe(2);
    expect(heatmap[0].bytes).toBe(3072);
  });
});
