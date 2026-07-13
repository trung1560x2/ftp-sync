import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, initDb, closeDb } from '../db.js';
import fs from 'fs-extra';
import path from 'path';

describe('Terminal Tabs Persistence and Restoration tests', () => {
  beforeAll(async () => {
    process.env.DB_PATH = path.resolve(process.cwd(), 'api/test_terminal_tabs.db');
    await fs.remove(process.env.DB_PATH);
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
    if (process.env.DB_PATH) {
      await fs.remove(process.env.DB_PATH);
    }
  });

  it('should start with an empty terminal_tabs table', async () => {
    const db = await getDb();
    const tabs = await db.all('SELECT * FROM terminal_tabs');
    expect(tabs.length).toBe(0);
  });

  it('should allow saving and loading a tab session', async () => {
    const db = await getDb();
    
    // Insert a test tab
    await db.run(
      `INSERT INTO terminal_tabs (id, connection_id, title, cwd, color, split_mode, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['tab-1234', 1, 'Prod Server', '/var/log', '#ef4444', 'none', 0]
    );

    const loaded = await db.get('SELECT * FROM terminal_tabs WHERE id = ?', 'tab-1234');
    expect(loaded).toBeDefined();
    expect(loaded.title).toBe('Prod Server');
    expect(loaded.cwd).toBe('/var/log');
    expect(loaded.color).toBe('#ef4444');
    expect(loaded.split_mode).toBe('none');
    expect(loaded.position).toBe(0);
  });

  it('should handle clearing tabs on sync', async () => {
    const db = await getDb();
    
    // Clear all tabs
    await db.run('DELETE FROM terminal_tabs');
    
    const count = await db.get('SELECT COUNT(*) as cnt FROM terminal_tabs');
    expect(count.cnt).toBe(0);
  });
});
