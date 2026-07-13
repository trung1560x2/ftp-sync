import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import app from '../app.js';
import { getDb, closeDb } from '../db.js';

describe('Roadmap 2 Part B Advanced APIs', () => {
  const testBaseDir = path.resolve(process.cwd(), 'scratch/test_roadmap_b');
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

  describe('Local File Operations API', () => {
    it('should create local directory (mkdir)', async () => {
      const targetDir = path.join(testBaseDir, 'new_dir');
      const res = await fetch(`${baseUrl}/api/system/mkdir`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ path: targetDir })
      });
      expect(res.status).toBe(200);
      expect(await fs.pathExists(targetDir)).toBe(true);
    });

    it('should rename local files', async () => {
      const srcFile = path.join(testBaseDir, 'src_file.txt');
      const destFile = path.join(testBaseDir, 'dest_file.txt');
      await fs.writeFile(srcFile, 'hello');

      const res = await fetch(`${baseUrl}/api/system/rename`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ oldPath: srcFile, newPath: destFile })
      });
      expect(res.status).toBe(200);
      expect(await fs.pathExists(destFile)).toBe(true);
      expect(await fs.pathExists(srcFile)).toBe(false);
    });

    it('should delete local files', async () => {
      const fileToDelete = path.join(testBaseDir, 'to_delete.txt');
      await fs.writeFile(fileToDelete, 'delete me');

      const res = await fetch(`${baseUrl}/api/system/delete`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ path: fileToDelete })
      });
      expect(res.status).toBe(200);
      expect(await fs.pathExists(fileToDelete)).toBe(false);
    });

    it('should perform local bulk rename', async () => {
      const fileA = path.join(testBaseDir, 'fileA.txt');
      const fileB = path.join(testBaseDir, 'fileB.txt');
      await fs.writeFile(fileA, 'A');
      await fs.writeFile(fileB, 'B');

      const res = await fetch(`${baseUrl}/api/system/bulk-rename`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          dirPath: testBaseDir,
          items: [
            { oldName: 'fileA.txt', newName: 'fileA_new.txt' },
            { oldName: 'fileB.txt', newName: 'fileB_new.txt' }
          ]
        })
      });

      expect(res.status).toBe(200);
      expect(await fs.pathExists(path.join(testBaseDir, 'fileA_new.txt'))).toBe(true);
      expect(await fs.pathExists(path.join(testBaseDir, 'fileB_new.txt'))).toBe(true);
    });

    it('should calculate local directory size', async () => {
      const subDir = path.join(testBaseDir, 'calc_dir');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(subDir, 'file1.txt'), 'abc'); // 3 bytes
      await fs.writeFile(path.join(subDir, 'file2.txt'), 'defgh'); // 5 bytes

      const res = await fetch(`${baseUrl}/api/system/dir-size?path=${encodeURIComponent(subDir)}`, {
        headers: { 
          'Authorization': `Bearer ${authToken}`
        }
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.size).toBe(8);
      expect(data.count).toBe(2);
    });
  });

  describe('SSH Terminal File Operations API', () => {
    it('should return error for invalid session id', async () => {
      const res = await fetch(`${baseUrl}/api/terminal/sessions/invalid-session/chmod`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ path: '/some/path', mode: '755' })
      });
      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.success).toBe(false);
      expect(data.message).toContain('Session not found');
    });
  });
});
