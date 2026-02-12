import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * Extract and verify Supabase JWT from Authorization header.
 * Attaches req.userId when present and valid.
 */
export async function attachAuthUser(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string') {
    return next();
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return next();
  }

  const token = match[1];
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) {
      return next();
    }
    req.userId = data.user.id;
  } catch {
    // Fail open - treat as unauthenticated if verification fails
  }

  next();
}

/**
 * Require authenticated user.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.userId) {
    return res.status(401).json({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
    });
  }
  next();
}
