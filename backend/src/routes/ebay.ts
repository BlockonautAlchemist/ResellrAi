/**
 * eBay Integration Routes
 *
 * Handles:
 * - OAuth flow (start, callback)
 * - Account connection status
 * - Account disconnection
 *
 * Security:
 * - Tokens never exposed to client
 * - State parameter validated for CSRF protection
 * - All token operations server-side only
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import {
  getEbayAuthService,
  getEbayCompsService,
  getEbayPolicyService,
  getEbayListingService,
  isEbayAvailable,
  createErrorResponse,
  EBAY_ERROR_CODES,
  logEbayError,
} from '../services/ebay/index.js';
import {
  EbayConnectedAccountSchema,
  EbayCompsQuerySchema,
  EbayCompsResultSchema,
  EbayUserPoliciesSchema,
  EbayPublishResultSchema,
  PublishToEbayRequestSchema,
  getCompsSourceMessage,
} from '../types/ebay-schemas.js';

const router = Router();

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Check if eBay integration is available
 */
function requireEbayConfig(req: Request, res: Response, next: () => void) {
  if (!isEbayAvailable()) {
    res.status(503).json({
      error: {
        code: 'EBAY_NOT_CONFIGURED',
        message: 'eBay integration is not configured',
      },
    });
    return;
  }
  next();
}

/**
 * Temporary user ID extraction
 * TODO: Replace with proper auth middleware when auth is implemented
 */
function getUserId(req: Request): string | null {
  // For now, accept user_id from query param or header
  // In production, this should come from authenticated session
  const userId = req.query.user_id || req.headers['x-user-id'];
  return typeof userId === 'string' ? userId : null;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/ebay/status
 * Check if eBay integration is available and configured
 */
router.get('/status', (req: Request, res: Response) => {
  const authService = getEbayAuthService();

  res.json({
    available: isEbayAvailable(),
    configured: authService.isConfigured(),
    environment: env.EBAY_ENVIRONMENT,
  });
});

/**
 * GET /api/v1/ebay/oauth/start
 * Start OAuth flow - returns authorization URL
 *
 * Query params:
 * - user_id: User ID (required, temporary - will come from auth)
 * - redirect_context: 'mobile' or 'web' (default: 'mobile')
 */
router.get('/oauth/start', requireEbayConfig, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'User authentication required to connect eBay account',
        },
      });
      return;
    }

    const redirectContext = req.query.redirect_context === 'web' ? 'web' : 'mobile';

    const authService = getEbayAuthService();
    const result = await authService.startOAuth(userId, redirectContext);

    res.json(result);
  } catch (error) {
    console.error('[eBay Routes] OAuth start error:', error);
    res.status(500).json({
      error: {
        code: 'OAUTH_START_FAILED',
        message: error instanceof Error ? error.message : 'Failed to start OAuth flow',
      },
    });
  }
});

/**
 * GET /api/v1/ebay/oauth/callback
 * OAuth callback handler - exchanges code for tokens
 *
 * Query params:
 * - code: Authorization code from eBay
 * - state: State parameter for CSRF validation
 * - error: Error code if user denied access
 * - error_description: Error details
 */
router.get('/oauth/callback', requireEbayConfig, async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle user denial
    if (error) {
      console.log(`[eBay Routes] OAuth denied: ${error} - ${error_description}`);

      // Redirect to mobile app with error
      const deepLink = `${env.MOBILE_DEEP_LINK_SCHEME}://ebay-callback?error=${encodeURIComponent(String(error))}&message=${encodeURIComponent(String(error_description || 'Access denied'))}`;

      res.send(generateCallbackPage(false, 'eBay connection was denied', deepLink));
      return;
    }

    // Validate required params
    if (!code || !state) {
      res.status(400).send(
        generateCallbackPage(false, 'Missing authorization code or state', null)
      );
      return;
    }

    // Exchange code for tokens
    const authService = getEbayAuthService();
    const result = await authService.handleCallback(String(code), String(state));

    // Generate success deep link
    const deepLink = `${env.MOBILE_DEEP_LINK_SCHEME}://ebay-callback?success=true`;

    res.send(generateCallbackPage(true, 'eBay account connected successfully!', deepLink));
  } catch (error) {
    console.error('[eBay Routes] OAuth callback error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Connection failed';
    const deepLink = `${env.MOBILE_DEEP_LINK_SCHEME}://ebay-callback?error=callback_failed&message=${encodeURIComponent(errorMessage)}`;

    res.send(generateCallbackPage(false, errorMessage, deepLink));
  }
});

/**
 * GET /api/v1/ebay/account
 * Get connected eBay account status
 *
 * Query params:
 * - user_id: User ID (required, temporary - will come from auth)
 */
router.get('/account', requireEbayConfig, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'User authentication required',
        },
      });
      return;
    }

    const authService = getEbayAuthService();
    const account = await authService.getConnectedAccount(userId);

    // Validate response against schema
    const validated = EbayConnectedAccountSchema.parse(account);

    res.json(validated);
  } catch (error) {
    console.error('[eBay Routes] Get account error:', error);
    res.status(500).json({
      error: {
        code: 'ACCOUNT_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get account status',
      },
    });
  }
});

/**
 * DELETE /api/v1/ebay/account
 * Disconnect eBay account
 *
 * Query params:
 * - user_id: User ID (required, temporary - will come from auth)
 */
router.delete('/account', requireEbayConfig, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'User authentication required',
        },
      });
      return;
    }

    const authService = getEbayAuthService();
    const success = await authService.disconnect(userId);

    if (!success) {
      res.status(500).json({
        error: {
          code: 'DISCONNECT_FAILED',
          message: 'Failed to disconnect eBay account',
        },
      });
      return;
    }

    res.json({ success: true, message: 'eBay account disconnected' });
  } catch (error) {
    console.error('[eBay Routes] Disconnect error:', error);
    res.status(500).json({
      error: {
        code: 'DISCONNECT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to disconnect',
      },
    });
  }
});

// =============================================================================
// PRICING COMPS ROUTES
// =============================================================================

/**
 * GET /api/v1/ebay/comps
 * Get pricing comparables for a search query
 *
 * Query params:
 * - keywords: Search keywords (required)
 * - category_id: eBay category ID (optional)
 * - condition: NEW, LIKE_NEW, VERY_GOOD, GOOD, ACCEPTABLE (optional)
 * - brand: Brand name filter (optional)
 * - limit: Max results (default: 20, max: 50)
 *
 * Response includes:
 * - source: "sold" | "active" | "none" (ALWAYS check this!)
 * - stats: { median, average, min, max, sample_size, confidence }
 * - limitations: Array of caveats about the data
 * - data: Array of comparable items
 */
router.get('/comps', async (req: Request, res: Response) => {
  try {
    // Parse and validate query params
    const query = EbayCompsQuerySchema.parse({
      keywords: req.query.keywords,
      category_id: req.query.category_id || undefined,
      condition: req.query.condition || undefined,
      brand: req.query.brand || undefined,
      limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 20,
      marketplace_id: req.query.marketplace_id || 'EBAY_US',
    });

    // Fetch comps
    const compsService = getEbayCompsService();
    const result = await compsService.getComps(query);

    // Validate response
    const validated = EbayCompsResultSchema.parse(result);

    // Add UI message for source
    const responseWithMessage = {
      ...validated,
      source_message: getCompsSourceMessage(validated.source, validated.stats.sample_size),
    };

    res.json(responseWithMessage);
  } catch (error) {
    console.error('[eBay Routes] Comps error:', error);

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.errors,
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code: 'COMPS_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch pricing comps',
      },
    });
  }
});

// =============================================================================
// POLICY ROUTES
// =============================================================================

/**
 * GET /api/v1/ebay/policies
 * Get user's eBay business policies (fulfillment, payment, return)
 *
 * Requires connected eBay account.
 * Users manage policies in eBay Seller Hub - we only display them for selection.
 */
router.get('/policies', requireEbayConfig, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'User authentication required',
        },
      });
      return;
    }

    // Check if eBay is connected
    const authService = getEbayAuthService();
    const account = await authService.getConnectedAccount(userId);

    if (!account.connected) {
      res.status(403).json({
        error: {
          code: 'EBAY_NOT_CONNECTED',
          message: 'Please connect your eBay account first',
        },
      });
      return;
    }

    // Fetch policies
    const policyService = getEbayPolicyService();
    const policies = await policyService.getUserPolicies(userId);

    // Validate response
    const validated = EbayUserPoliciesSchema.parse(policies);

    // Check if user has required policies
    const { valid, missing } = await policyService.hasRequiredPolicies(userId);

    res.json({
      ...validated,
      has_required_policies: valid,
      missing_policies: missing,
    });
  } catch (error) {
    console.error('[eBay Routes] Policies error:', error);
    res.status(500).json({
      error: {
        code: 'POLICIES_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch policies',
      },
    });
  }
});

// =============================================================================
// LISTING PUBLISH ROUTES
// =============================================================================

/**
 * POST /api/v1/ebay/listings/:id/publish
 * Publish a listing to eBay
 *
 * Requires:
 * - Connected eBay account
 * - Valid business policies
 * - Listing must exist and be in 'ready' status
 *
 * Body:
 * - policies.fulfillment_policy_id: string
 * - policies.payment_policy_id: string
 * - policies.return_policy_id: string
 * - price_override?: number (optional, overrides listing price)
 */
router.post('/listings/:id/publish', requireEbayConfig, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'User authentication required',
        },
      });
      return;
    }

    const listingId = req.params.id;

    // Validate request body
    const body = PublishToEbayRequestSchema.parse(req.body);

    if (!body.policies) {
      res.status(400).json({
        error: {
          code: 'POLICIES_REQUIRED',
          message: 'Business policies are required. Fetch from GET /api/v1/ebay/policies',
        },
      });
      return;
    }

    // Get listing from database
    // Note: This would typically come from the listings service
    // For now, we'll require the listing data in the request or fetch it
    const listingData = req.body.listing_data;

    if (!listingData) {
      res.status(400).json({
        error: {
          code: 'LISTING_DATA_REQUIRED',
          message: 'Listing data is required in request body',
        },
      });
      return;
    }

    // Build draft from listing data
    const listingService = getEbayListingService();
    const draft = listingService.buildDraftFromListing(
      listingId,
      listingData.listing_draft,
      listingData.photo_urls,
      body.price_override || listingData.pricing_suggestion?.midPrice || 0
    );

    // Validate draft has required fields
    if (!draft.title || !draft.description || draft.price.value <= 0) {
      res.status(400).json({
        error: {
          code: 'INVALID_LISTING',
          message: 'Listing must have title, description, and valid price',
        },
      });
      return;
    }

    if (draft.image_urls.length === 0) {
      res.status(400).json({
        error: {
          code: 'IMAGES_REQUIRED',
          message: 'At least one image is required',
        },
      });
      return;
    }

    // Publish to eBay
    const result = await listingService.publishListing(userId, draft, body.policies);

    // Validate response
    const validated = EbayPublishResultSchema.parse(result);

    if (validated.success) {
      res.json(validated);
    } else {
      res.status(400).json(validated);
    }
  } catch (error) {
    console.error('[eBay Routes] Publish error:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code: 'PUBLISH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to publish listing',
      },
    });
  }
});

/**
 * GET /api/v1/ebay/listings/:id/status
 * Get the eBay status of a published listing
 */
router.get('/listings/:id/status', requireEbayConfig, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'User authentication required',
        },
      });
      return;
    }

    const ebayListingId = req.params.id;

    const listingService = getEbayListingService();
    const status = await listingService.getListingStatus(userId, ebayListingId);

    res.json(status);
  } catch (error) {
    console.error('[eBay Routes] Status error:', error);
    res.status(500).json({
      error: {
        code: 'STATUS_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get listing status',
      },
    });
  }
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate HTML page for OAuth callback
 * This page displays status and triggers mobile deep link
 */
function generateCallbackPage(
  success: boolean,
  message: string,
  deepLink: string | null
): string {
  const statusColor = success ? '#22c55e' : '#ef4444';
  const statusIcon = success ? '&#10003;' : '&#10007;';
  const statusText = success ? 'Success' : 'Error';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ResellrAI - eBay Connection</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 40px;
      max-width: 400px;
    }
    .icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${statusColor};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 40px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #94a3b8;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .button {
      display: inline-block;
      background: #3b82f6;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      transition: background 0.2s;
    }
    .button:hover {
      background: #2563eb;
    }
    .auto-redirect {
      margin-top: 16px;
      font-size: 14px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${statusIcon}</div>
    <h1>${statusText}</h1>
    <p>${message}</p>
    ${deepLink ? `
      <a href="${deepLink}" class="button">Return to App</a>
      <p class="auto-redirect">Redirecting automatically...</p>
      <script>
        setTimeout(function() {
          window.location.href = "${deepLink}";
        }, 1500);
      </script>
    ` : `
      <p>You can close this window.</p>
    `}
  </div>
</body>
</html>
  `.trim();
}

export default router;
