import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// In-memory rate limiting state
let failedAttempts = 0;
let lockUntil: number | null = null;

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

/**
 * Get Authentication Status (is onboarded?)
 * GET /api/auth/status
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDb();
    const userRow = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM users');
    const onboarded = (userRow?.count || 0) > 0;
    res.json({ success: true, onboarded });
  } catch (error: any) {
    console.error('[Auth Status] Error:', error);
    res.status(500).json({ success: false, error: 'Database query failure' });
  }
});

/**
 * Register Master Password
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters long' });
      return;
    }

    const db = await getDb();
    const userRow = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM users');
    if (userRow && userRow.count > 0) {
      res.status(400).json({ success: false, error: 'Onboarding already completed' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const createdAt = new Date().toISOString();

    const result = await db.run(
      'INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)',
      'master',
      passwordHash,
      salt,
      createdAt
    );

    const userId = result.lastID;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    await db.run(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
      token,
      userId,
      expiresAt
    );

    res.status(201).json({ success: true, token });
  } catch (error: any) {
    console.error('[Auth Register] Error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

/**
 * Verify Session Token
 * GET /api/auth/verify
 */
router.get('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.json({ success: true, valid: false });
      return;
    }

    const token = authHeader.substring(7);
    const db = await getDb();
    const session = await db.get(
      'SELECT user_id, expires_at FROM sessions WHERE token = ?',
      token
    );

    if (!session || new Date(session.expires_at).getTime() < Date.now()) {
      res.json({ success: true, valid: false });
      return;
    }

    res.json({ success: true, valid: true });
  } catch (error: any) {
    console.error('[Auth Verify] Error:', error);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

/**
 * User Login
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== 'string') {
      res.status(400).json({ success: false, error: 'Password required' });
      return;
    }

    // Check brute force lockout
    if (lockUntil && Date.now() < lockUntil) {
      const remainingSec = Math.ceil((lockUntil - Date.now()) / 1000);
      res.status(429).json({
        success: false,
        error: `Too many failed login attempts. Locked for ${remainingSec} seconds.`
      });
      return;
    }

    const db = await getDb();
    const user = await db.get<{ id: number; password_hash: string; salt: string }>(
      'SELECT id, password_hash, salt FROM users WHERE username = ?',
      'master'
    );

    if (!user) {
      res.status(400).json({ success: false, error: 'Master account not configured. Please onboard first.' });
      return;
    }

    const isValid = hashPassword(password, user.salt) === user.password_hash;

    if (!isValid) {
      failedAttempts++;
      if (failedAttempts >= 5) {
        lockUntil = Date.now() + 30 * 1000; // 30 second lock
        failedAttempts = 0;
        res.status(429).json({
          success: false,
          error: 'Too many failed login attempts. Account locked for 30 seconds.'
        });
      } else {
        res.status(401).json({
          success: false,
          error: `Invalid master password. ${5 - failedAttempts} attempts remaining.`
        });
      }
      return;
    }

    // Reset rate limiter on successful login
    failedAttempts = 0;
    lockUntil = null;

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    await db.run(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
      token,
      user.id,
      expiresAt
    );

    res.json({ success: true, token });
  } catch (error: any) {
    console.error('[Auth Login] Error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

/**
 * User Logout
 * POST /api/auth/logout
 */
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const db = await getDb();
      await db.run('DELETE FROM sessions WHERE token = ?', token);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Auth Logout] Error:', error);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

/**
 * Change Master Password
 * POST /api/auth/change-password
 */
router.post('/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'New password must be at least 8 characters long' });
      return;
    }

    const db = await getDb();
    const user = await db.get<{ id: number; password_hash: string; salt: string }>(
      'SELECT id, password_hash, salt FROM users WHERE username = ?',
      'master'
    );

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const isValid = hashPassword(currentPassword, user.salt) === user.password_hash;
    if (!isValid) {
      res.status(401).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    const newPasswordHash = hashPassword(newPassword, newSalt);

    await db.run(
      'UPDATE users SET password_hash = ?, salt = ? WHERE username = ?',
      newPasswordHash,
      newSalt,
      'master'
    );

    // Revoke all other sessions when password is changed
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const currentToken = authHeader.substring(7);
      await db.run('DELETE FROM sessions WHERE token != ? AND user_id = ?', currentToken, user.id);
    }

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('[Auth Change Password] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});

export default router;
