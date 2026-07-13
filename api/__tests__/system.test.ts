import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import app from '../app.js';
import { getDb, closeDb } from '../db.js';

describe('System Directory Files API', () => {
  const testBaseDir = path.resolve(process.cwd(), 'scratch/test_system');
  const testDbPath = path.join(testBaseDir, 'test.sqlite');
  let server: http.Server;
  let baseUrl: string;
  let authToken: string;

  beforeAll(async () => {
    // Isolate test database
    await fs.ensureDir(testBaseDir);
    if (await fs.pathExists(testDbPath)) {
      await fs.remove(testDbPath);
    }
    process.env.DB_PATH = testDbPath;

    // Reset DB connection pool
    await closeDb();
    await getDb();

    // Start Express server on random port
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'string' ? 0 : addr?.port || 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Onboard and get token
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'my-secure-master-password' })
    });
    const data = await res.json() as any;
    authToken = data.token;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDb();
    await fs.remove(testBaseDir);
  });

  it('should list folders and files in a directory', async () => {
    const dummyDir = path.join(testBaseDir, 'dummy_project');
    await fs.ensureDir(dummyDir);
    await fs.ensureDir(path.join(dummyDir, 'src'));
    await fs.writeFile(path.join(dummyDir, 'package.json'), '{}');

    const res = await fetch(`${baseUrl}/api/system/list-directory-files`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ path: dummyDir })
    });
    
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.currentPath).toBe(dummyDir);
    expect(data.files).toBeDefined();
    
    const srcFolder = data.files.find((f: any) => f.name === 'src');
    expect(srcFolder).toBeDefined();
    expect(srcFolder.isDirectory).toBe(true);

    const packageJson = data.files.find((f: any) => f.name === 'package.json');
    expect(packageJson).toBeDefined();
    expect(packageJson.isDirectory).toBe(false);
  });

  it('should return 404 for non-existent directory', async () => {
    const nonExistent = path.join(testBaseDir, 'does-not-exist');
    const res = await fetch(`${baseUrl}/api/system/list-directory-files`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ path: nonExistent })
    });
    
    expect(res.status).toBe(404);
  });
});
