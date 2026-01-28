import "dotenv/config";
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import healthRouter from './routes/health.js';
import listingsRouter from './routes/listings.js';
import ebayRouter from './routes/ebay.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased for base64 photos
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/health', healthRouter);
app.use('/api/v1/listings', listingsRouter);
app.use('/api/v1/ebay', ebayRouter);

// Root route
app.get('/', (_req, res) => {
  res.json({
    name: 'ResellrAI API',
    version: '0.3.0',
    docs: '/health for status',
    endpoints: {
      health: '/health',
      listings: '/api/v1/listings',
      ebay: '/api/v1/ebay',
    },
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server - listen on all interfaces (0.0.0.0) to accept connections from host
app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════╗
║           ResellrAI API Server            ║
╠═══════════════════════════════════════════╣
║  Status:  Running                         ║
║  Port:    ${String(env.PORT).padEnd(33)}║
║  Mode:    ${env.NODE_ENV.padEnd(33)}║
║  Host:    0.0.0.0 (accessible from network)║
╚═══════════════════════════════════════════╝

Endpoints:
  GET  /                              - API info
  GET  /health                        - Health check
  GET  /health/services               - Service status
  POST /api/v1/listings/generate      - Generate listing
  GET  /api/v1/listings/:id           - Get listing
  PATCH /api/v1/listings/:id          - Update listing
  POST /api/v1/listings/:id/regenerate - Regenerate field
  POST /api/v1/listings/:id/export    - Export listing

eBay Integration:
  GET  /api/v1/ebay/status            - Check eBay config status
  GET  /api/v1/ebay/oauth/start       - Start OAuth flow
  GET  /api/v1/ebay/oauth/callback    - OAuth callback handler
  GET  /api/v1/ebay/account           - Get connected account
  DELETE /api/v1/ebay/account         - Disconnect account
  GET  /api/v1/ebay/comps             - Get pricing comparables
  GET  /api/v1/ebay/policies          - Get user's eBay policies
  POST /api/v1/ebay/listings/:id/publish - Publish listing to eBay
  GET  /api/v1/ebay/listings/:id/status  - Get eBay listing status

Ready to receive requests...
  `);
});
