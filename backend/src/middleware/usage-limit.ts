/**
 * Usage Limit Middleware
 *
 * Enforces free-tier usage limits on expensive endpoints.
 * Reads anonymous device ID from `x-anon-id` header.
 */

import { Request, Response, NextFunction } from 'express';
import { checkUsage } from '../services/usage.js';
import type { AuthenticatedRequest } from './auth.js';

/** Extract the anonymous user key from the request. */
export function getUserKey(req: Request): string | null {
  const authReq = req as AuthenticatedRequest;
  if (authReq.userId) {
    return authReq.userId;
  }
  const anonId = req.headers['x-anon-id'];
  if (typeof anonId === 'string' && anonId.length > 0) {
    return anonId;
  }
  return null;
}

/**
 * Returns middleware that checks usage limits for the given action.
 *
 * On success, attaches `req.userKey` and calls `next()`.
 * On limit exceeded, responds with 429.
 * On missing header, responds with 400.
 */
export function requireUsageLimit(action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userKey = getUserKey(req);

    if (!userKey) {
      return res.status(400).json({
        error: {
          code: 'MISSING_ANON_ID',
          message: 'x-anon-id header is required',
        },
      });
    }

    try {
      const usage = await checkUsage(userKey, action);

      if (!usage.allowed) {
        return res.status(429).json({
          error: {
            code: 'USAGE_LIMIT_EXCEEDED',
            limitType: usage.limitType,
            dailyUsed: usage.dailyUsed,
            dailyLimit: usage.dailyLimit,
            monthlyUsed: usage.monthlyUsed,
            monthlyLimit: usage.monthlyLimit,
            resetAt: usage.resetAt,
          },
        });
      }

      // Attach userKey for downstream use
      (req as any).userKey = userKey;
      next();
    } catch (err) {
      console.error('[UsageLimit] middleware error:', err);
      // Fail-open: don't block requests if usage check fails
      (req as any).userKey = userKey;
      next();
    }
  };
}
