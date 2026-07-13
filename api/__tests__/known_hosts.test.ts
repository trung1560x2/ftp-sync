import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, initDb, closeDb } from '../db.js';
import fs from 'fs-extra';
import path from 'path';

describe('Known Hosts Verification tests', () => {
  beforeAll(async () => {
    process.env.DB_PATH = path.resolve(process.cwd(), 'api/test_known_hosts.db');
    await fs.remove(process.env.DB_PATH);
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
    if (process.env.DB_PATH) {
      await fs.remove(process.env.DB_PATH);
    }
  });

  it('should start with an empty known_hosts table', async () => {
    const db = await getDb();
    const hosts = await db.all('SELECT * FROM known_hosts');
    expect(hosts.length).toBe(0);
  });

  it('should allow saving and verified hosts', async () => {
    const db = await getDb();
    
    // Insert a known host key
    await db.run(
      `INSERT OR REPLACE INTO known_hosts (host, key_type, fingerprint)
       VALUES (?, ?, ?)`,
      ['1.2.3.4', 'ssh-ed25519', 'SHA256:abcd1234']
    );

    const loaded = await db.get('SELECT * FROM known_hosts WHERE host = ? AND key_type = ?', ['1.2.3.4', 'ssh-ed25519']);
    expect(loaded).toBeDefined();
    expect(loaded.fingerprint).toBe('SHA256:abcd1234');
  });

  it('should prevent inserting duplicate fingerprints for same host and key type via unique constraint', async () => {
    const db = await getDb();
    
    // Attempt duplicate insert - since we use INSERT OR REPLACE in API, it should succeed by replacing the old key
    await db.run(
      `INSERT OR REPLACE INTO known_hosts (host, key_type, fingerprint)
       VALUES (?, ?, ?)`,
      ['1.2.3.4', 'ssh-ed25519', 'SHA256:newkey5678']
    );

    const count = await db.get('SELECT COUNT(*) as cnt FROM known_hosts WHERE host = ?', ['1.2.3.4']);
    expect(count.cnt).toBe(1);

    const loaded = await db.get('SELECT * FROM known_hosts WHERE host = ? AND key_type = ?', ['1.2.3.4', 'ssh-ed25519']);
    expect(loaded.fingerprint).toBe('SHA256:newkey5678');
  });
});
