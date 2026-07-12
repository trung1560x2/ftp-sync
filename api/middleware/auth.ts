import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db.js';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    const db = await getDb();
    const session = await db.get(
      'SELECT user_id, expires_at FROM sessions WHERE token = ?',
      token
    );

    if (!session) {
      res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
      return;
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      // Invalidate expired session
      await db.run('DELETE FROM sessions WHERE token = ?', token);
      res.status(401).json({ success: false, error: 'Unauthorized: Session expired' });
      return;
    }

    req.userId = session.user_id;
    next();
  } catch (error: any) {
    console.error('[Auth Middleware] Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error during authentication' });
  }
};
