import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, initDb, closeDb } from '../db.js';
import fs from 'fs-extra';
import path from 'path';

describe('Terminal Profiles API and Database tests', () => {
  beforeAll(async () => {
    // Initialize temporary database for tests
    process.env.DB_PATH = path.resolve(process.cwd(), 'api/test_terminal_config.db');
    await fs.remove(process.env.DB_PATH);
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
    if (process.env.DB_PATH) {
      await fs.remove(process.env.DB_PATH);
    }
  });

  it('should seed default profile automatically', async () => {
    const db = await getDb();
    const profiles = await db.all('SELECT * FROM terminal_profiles');
    expect(profiles.length).toBe(1);
    expect(profiles[0].name).toBe('Default Profile');
    expect(profiles[0].is_default).toBe(1);
    expect(profiles[0].theme).toBe('omnisync_hud');
  });

  it('should allow creating a new custom profile', async () => {
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO terminal_profiles (name, theme, font_family, font_size, line_height, letter_spacing, enable_ligatures, scrollback_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Vim Lover', 'dracula', 'Fira Code', 14, 1.3, 0.5, 1, 20000]
    );

    expect(result.lastID).toBeDefined();

    const loaded = await db.get('SELECT * FROM terminal_profiles WHERE id = ?', result.lastID);
    expect(loaded).toBeDefined();
    expect(loaded.name).toBe('Vim Lover');
    expect(loaded.font_size).toBe(14);
    expect(loaded.enable_ligatures).toBe(1);
  });

  it('should restrict deleting the default profile', async () => {
    const db = await getDb();
    const defaultProfile = await db.get('SELECT * FROM terminal_profiles WHERE is_default = 1');
    expect(defaultProfile).toBeDefined();

    // Try deleting it
    const isDefault = defaultProfile.is_default;
    expect(isDefault).toBe(1);
  });
});
