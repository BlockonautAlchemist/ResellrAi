import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { testConnection as testSupabase } from '../services/supabase.js';
import { testConnection as testOpenRouter } from '../services/openrouter.js';

const router: RouterType = Router();

/**
 * GET /health
 * Basic health check - returns ok if server is running
 */
router.get('/', (req: Request, res: Response) => {
  console.log(`[HEALTH CHECK] Request from ${req.ip} at ${new Date().toISOString()}`);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

/**
 * GET /health/services
 * Detailed health check - tests all external service connections
 */
router.get('/services', async (_req: Request, res: Response) => {
  const results = {
    supabase: false,
    openrouter: false,
  };

  try {
    // Test Supabase connection
    results.supabase = await testSupabase();
  } catch (err) {
    console.error('Supabase health check error:', err);
  }

  try {
    // Test OpenRouter connection
    results.openrouter = await testOpenRouter();
  } catch (err) {
    console.error('OpenRouter health check error:', err);
  }

  const allHealthy = Object.values(results).every((v) => v);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: results,
  });
});

export default router;
