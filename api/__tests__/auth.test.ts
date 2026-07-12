import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import app from '../app.js';
import { getDb, closeDb } from '../db.js';

describe('Vault Authentication API', () => {
  const testBaseDir = path.resolve(process.cwd(), 'scratch/test_auth');
  const testDbPath = path.join(testBaseDir, 'test.sqlite');
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Isolate test database
    await fs.ensureDir(testBaseDir);
    if (await fs.pathExists(testDbPath)) {
      await fs.remove(testDbPath);
    }
    process.env.DB_PATH = testDbPath;

    // Reset DB connection pool to ensure it opens the new test file
    await closeDb();
    const db = await getDb();
    // Run baseline migrations
    const currentVersion = await db.get<{ version: number }>('SELECT MAX(version) as version FROM schema_version');
    expect(currentVersion?.version).toBeGreaterThanOrEqual(2); // verified both migrations run

    // Start Express server on random port
    return new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'string' ? 0 : addr?.port || 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDb();
    await fs.remove(testBaseDir);
  });

  it('should return onboarded=false on startup', async () => {
    const res = await fetch(`${baseUrl}/api/auth/status`);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.onboarded).toBe(false);
  });

  it('should reject access to protected endpoint without token', async () => {
    const res = await fetch(`${baseUrl}/api/ftp-connections`);
    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.success).toBe(false);
    expect(data.error).toContain('token provided');
  });

  it('should complete master user onboarding registration', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'my-secure-master-password' })
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();

    // Verify onboarded status is now true
    const statusRes = await fetch(`${baseUrl}/api/auth/status`);
    const statusData = await statusRes.json() as any;
    expect(statusData.onboarded).toBe(true);
  });

  it('should reject registration once onboarded', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'another-password-123' })
    });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.success).toBe(false);
    expect(data.error).toContain('Onboarding already completed');
  });

  it('should login successfully with the correct password', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'my-secure-master-password' })
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();

    // Verify token validity
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${data.token}` }
    });
    const verifyData = await verifyRes.json() as any;
    expect(verifyData.success).toBe(true);
    expect(verifyData.valid).toBe(true);
  });

  it('should reject login with wrong password and decrement attempts', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password-fails' })
    });
    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.success).toBe(false);
    expect(data.error).toContain('attempts remaining');
  });

  it('should invalidate token on logout', async () => {
    // First login to get a token
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'my-secure-master-password' })
    });
    const { token } = await loginRes.json() as any;

    // Logout
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(logoutRes.status).toBe(200);

    // Verify token is now invalid
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const verifyData = await verifyRes.json() as any;
    expect(verifyData.valid).toBe(false);
  });
});
