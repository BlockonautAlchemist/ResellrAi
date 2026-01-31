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
  getEbayLocationService,
  getEbayTaxonomyService,
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
  CreateLocationRequestSchema,
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
 * GET /api/v1/ebay/connection
 * Get per-user eBay connection status
 *
 * Query params:
 * - user_id: User ID (required, temporary - will come from auth)
 *
 * Returns:
 * - 200 { connected: false } if no connected account
 * - 200 { connected: true, environment, ebay_username, scopes, last_connected_at } if connected
 * - Never returns 500 for "not connected" - that's a normal state
 */
router.get('/connection', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      // Without a user ID, we can't check connection - return not connected
      res.json({ connected: false });
      return;
    }

    // Check if eBay integration is even configured
    if (!isEbayAvailable()) {
      res.json({ connected: false, reason: 'ebay_not_configured' });
      return;
    }

    const authService = getEbayAuthService();
    const account = await authService.getConnectedAccount(userId);

    if (!account.connected) {
      res.json({ connected: false });
      return;
    }

    // Return connection details
    res.json({
      connected: true,
      environment: env.EBAY_ENVIRONMENT,
      ebay_username: account.ebay_username || null,
      scopes: ['sell', 'read'], // Simplified scope representation
      last_connected_at: account.connected_at,
      needs_reauth: account.needs_reauth || false,
    });
  } catch (error) {
    // Log but don't fail - "not connected" is a valid state
    console.warn('[eBay Routes] Connection check error:', error);
    res.json({ connected: false });
  }
});

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
 * GET /api/v1/ebay/debug
 * Debug endpoint to verify OAuth configuration (dev only)
 * Shows configuration status without exposing secrets
 */
router.get('/debug', (req: Request, res: Response) => {
  // Only allow in development
  if (env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Debug endpoint not available in production' });
    return;
  }

  const hasClientId = !!env.EBAY_CLIENT_ID;
  const hasClientSecret = !!env.EBAY_CLIENT_SECRET;
  const hasRuName = !!env.EBAY_RUNAME;
  const hasEncryptionKey = !!env.EBAY_TOKEN_ENCRYPTION_KEY;

  const expectedCallbackUrl = `${env.APP_BASE_URL}/api/v1/ebay/oauth/callback`;

  res.json({
    configuration: {
      environment: env.EBAY_ENVIRONMENT,
      client_id_set: hasClientId,
      client_id_preview: hasClientId ? `${env.EBAY_CLIENT_ID!.substring(0, 8)}...` : null,
      client_secret_set: hasClientSecret,
      runame_set: hasRuName,
      runame_preview: hasRuName ? env.EBAY_RUNAME : null,
      encryption_key_set: hasEncryptionKey,
      app_base_url: env.APP_BASE_URL,
      deep_link_scheme: env.MOBILE_DEEP_LINK_SCHEME,
    },
    oauth_urls: {
      authorize: `https://auth.${env.EBAY_ENVIRONMENT === 'sandbox' ? 'sandbox.' : ''}ebay.com/oauth2/authorize`,
      token: `https://api.${env.EBAY_ENVIRONMENT === 'sandbox' ? 'sandbox.' : ''}ebay.com/identity/v1/oauth2/token`,
    },
    setup_checklist: {
      '1_credentials': hasClientId && hasClientSecret
        ? 'OK - Client ID and Secret configured'
        : 'MISSING - Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET',
      '2_runame': hasRuName
        ? 'OK - RuName configured'
        : 'MISSING - Set EBAY_RUNAME (get from eBay Developer Portal)',
      '3_encryption': hasEncryptionKey
        ? 'OK - Token encryption key configured'
        : 'MISSING - Generate with: openssl rand -hex 32',
      '4_callback_url': `Ensure eBay RuName "Auth Accepted URL" is set to: ${expectedCallbackUrl}`,
    },
    troubleshooting: {
      issue: 'User sees eBay "Thank You" page instead of being redirected',
      cause: 'RuName Auth Accepted URL is not configured correctly in eBay Developer Portal',
      solution: `Set "Auth Accepted URL" to: ${expectedCallbackUrl}`,
    },
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
  const timestamp = new Date().toISOString();
  console.log(`[eBay Routes] OAuth callback received at ${timestamp}`);
  console.log(`[eBay Routes] Query params:`, {
    code: req.query.code ? `${String(req.query.code).substring(0, 20)}...` : undefined,
    state: req.query.state ? `${String(req.query.state).substring(0, 8)}...` : undefined,
    error: req.query.error,
  });

  // Check for auto-redirect query param (defaults to true)
  const autoRedirect = req.query.redirect !== 'false';

  try {
    const { code, state, error, error_description } = req.query;

    // Handle user denial
    if (error) {
      console.log(`[eBay Routes] OAuth denied: ${error} - ${error_description}`);

      // Generate deep link for mobile app
      const deepLink = buildOAuthDeepLink({
        success: false,
        error: String(error),
        message: String(error_description || 'Access denied'),
      });

      // Try automatic redirect first, fall back to HTML page
      if (autoRedirect && deepLink) {
        console.log(`[eBay Routes] Redirecting to: ${deepLink}`);
        res.redirect(302, deepLink);
        return;
      }

      res.send(generateCallbackPage(
        false,
        'You declined to connect your eBay account. You can try again from the app.',
        deepLink,
        { error: String(error), timestamp }
      ));
      return;
    }

    // Validate required params
    if (!code || !state) {
      console.error('[eBay Routes] Missing code or state in callback');
      res.status(400).send(
        generateCallbackPage(
          false,
          'Missing authorization data. This may happen if the redirect URL is not configured correctly in eBay Developer Portal.',
          null,
          { error: 'Missing code or state parameter', timestamp }
        )
      );
      return;
    }

    // Exchange code for tokens
    const authService = getEbayAuthService();
    const result = await authService.handleCallback(String(code), String(state));

    console.log(`[eBay Routes] OAuth success for user ${result.userId}`);

    // Generate success deep link
    const deepLink = buildOAuthDeepLink({ success: true });

    // Try automatic redirect first (302), fall back to HTML page
    if (autoRedirect && deepLink) {
      console.log(`[eBay Routes] Redirecting to: ${deepLink}`);
      res.redirect(302, deepLink);
      return;
    }

    res.send(generateCallbackPage(
      true,
      'Your eBay account is now connected! You can list items directly to eBay from the app.',
      deepLink,
      { userId: result.userId, timestamp }
    ));
  } catch (error) {
    console.error('[eBay Routes] OAuth callback error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Connection failed';
    const deepLink = buildOAuthDeepLink({
      success: false,
      error: 'callback_failed',
      message: errorMessage,
    });

    // Try automatic redirect for errors too
    if (autoRedirect && deepLink) {
      console.log(`[eBay Routes] Redirecting to: ${deepLink}`);
      res.redirect(302, deepLink);
      return;
    }

    res.send(generateCallbackPage(
      false,
      errorMessage,
      deepLink,
      { error: errorMessage, timestamp }
    ));
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
 * Requires connected eBay account (user access token used for Browse API).
 *
 * Query params:
 * - user_id: User ID (required, same as /api/v1/ebay/connection)
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
 *
 * Returns 401 { error: "ebay_not_connected", needs_reauth: true } if no token or refresh fails.
 */
router.get('/comps', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        error: 'ebay_not_connected',
        message: 'User authentication required',
        needs_reauth: true,
      });
      return;
    }

    // Parse and validate query params
    const query = EbayCompsQuerySchema.parse({
      keywords: req.query.keywords,
      category_id: req.query.category_id || undefined,
      condition: req.query.condition || undefined,
      brand: req.query.brand || undefined,
      limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 20,
      marketplace_id: req.query.marketplace_id || 'EBAY_US',
    });

    // Resolve user's access token (lookup, decrypt, refresh if expired)
    const authService = getEbayAuthService();
    let accessToken: string;
    try {
      accessToken = await authService.getAccessTokenForComps(userId);
    } catch (tokenError) {
      const message = tokenError instanceof Error ? tokenError.message : 'ebay_not_connected';
      if (message === 'ebay_not_connected') {
        res.status(401).json({
          error: 'ebay_not_connected',
          message: 'Please connect your eBay account to view pricing comps',
          needs_reauth: true,
        });
        return;
      }
      throw tokenError;
    }

    // Fetch comps with valid access token
    const compsService = getEbayCompsService();
    const result = await compsService.getComps(query, accessToken);

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
// CATEGORY SUGGESTION ROUTES
// =============================================================================

/**
 * GET /api/v1/ebay/categories/suggest
 * Get AI-powered category suggestions based on item attributes
 *
 * Requires connected eBay account (user access token used for Taxonomy API).
 *
 * Query params:
 * - user_id: User ID (required)
 * - query, q, or keywords: Search query (item title, keywords, brand) - required
 * - marketplace: eBay marketplace ID (default: EBAY_US)
 *
 * Response:
 * - suggestions: Array of { categoryId, categoryName, categoryPath, relevance }
 * - cached: boolean
 * - cacheAge: number (seconds since cached, if cached)
 *
 * Returns 401 { error: "ebay_not_connected", needs_reauth: true } if no token or refresh fails.
 *
 * Example curl:
 *   curl "https://<host>/api/v1/ebay/categories/suggest?query=harley%20davidson%20shirt" \
 *     -H "x-user-id: <user-id>"
 */
router.get('/categories/suggest', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        error: 'ebay_not_connected',
        message: 'User authentication required',
        needs_reauth: true,
      });
      return;
    }

    // Accept query, q, or keywords (eBay-style API compatibility)
    const query = (req.query.query ?? req.query.q ?? req.query.keywords) as string | undefined;

    if (!query || query.trim().length === 0) {
      res.status(400).json({
        error: {
          code: 'QUERY_REQUIRED',
          message: 'Provide ?query= or ?q= with a search term',
        },
      });
      return;
    }

    const marketplace = (req.query.marketplace as string) || 'EBAY_US';

    // Resolve user's access token (lookup, decrypt, refresh if expired)
    const authService = getEbayAuthService();
    let accessToken: string;
    try {
      accessToken = await authService.getAccessToken(userId);
    } catch (tokenError) {
      const message = tokenError instanceof Error ? tokenError.message : 'ebay_not_connected';
      if (message === 'No connected eBay account' || message === 'ebay_not_connected') {
        res.status(401).json({
          error: 'ebay_not_connected',
          message: 'Please connect your eBay account to get category suggestions',
          needs_reauth: true,
        });
        return;
      }
      throw tokenError;
    }

    const taxonomyService = getEbayTaxonomyService();
    const result = await taxonomyService.getCategorySuggestions(query, marketplace, accessToken);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[eBay Routes] Category suggest error:', error);
    res.status(500).json({
      error: {
        code: 'CATEGORY_SUGGEST_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get category suggestions',
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
// INVENTORY LOCATION ROUTES
// =============================================================================

/**
 * GET /api/v1/ebay/locations
 * Get user's inventory locations
 *
 * Per EBAY_SOURCE_OF_TRUTH.md Section 7:
 * "eBay requires that inventory items be assigned to an inventory location"
 */
router.get('/locations', requireEbayConfig, async (req: Request, res: Response) => {
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

    // Fetch locations
    const locationService = getEbayLocationService();
    const result = await locationService.getInventoryLocations(userId);

    if (!result.success) {
      res.status(500).json({
        error: {
          code: 'LOCATIONS_FETCH_FAILED',
          message: result.error || 'Failed to fetch locations',
        },
      });
      return;
    }

    res.json({
      locations: result.locations,
      total: result.total,
    });
  } catch (error) {
    console.error('[eBay Routes] Locations error:', error);
    res.status(500).json({
      error: {
        code: 'LOCATIONS_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch locations',
      },
    });
  }
});

/**
 * POST /api/v1/ebay/locations
 * Create an inventory location
 *
 * Body:
 * - name?: string (optional, defaults to "Default Shipping Location")
 * - addressLine1?: string
 * - city?: string
 * - stateOrProvince?: string
 * - postalCode?: string
 * - country?: string (default: "US")
 *
 * Per EBAY_SOURCE_OF_TRUTH.md Section 7:
 * "You need to supply an address (country, and either city+state or postal code)"
 */
router.post('/locations', requireEbayConfig, async (req: Request, res: Response) => {
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

    // Validate request body
    const locationData = CreateLocationRequestSchema.parse(req.body);

    // Validate that we have enough address info
    const hasPostalCode = !!locationData.postalCode;
    const hasCityState = !!locationData.city && !!locationData.stateOrProvince;

    if (!hasPostalCode && !hasCityState) {
      res.status(400).json({
        error: {
          code: 'ADDRESS_REQUIRED',
          message: 'Please provide either postalCode OR (city and stateOrProvince)',
        },
      });
      return;
    }

    // Create location
    const locationService = getEbayLocationService();
    const result = await locationService.createInventoryLocation(userId, locationData);

    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'LOCATION_CREATE_FAILED',
          message: result.error || 'Failed to create location',
        },
      });
      return;
    }

    res.status(201).json({
      success: true,
      location: result.location,
    });
  } catch (error) {
    console.error('[eBay Routes] Create location error:', error);

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
        code: 'LOCATION_CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create location',
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
 * Build OAuth deep link URL for mobile app
 *
 * Supports two modes:
 * 1. Expo Go development: Uses exp://host:port/--/oauth/success format
 *    (requires EXPO_DEV_URL env var, e.g., exp://192.168.1.50:8081)
 * 2. Production/custom builds: Uses resellrai://ebay-callback format
 *
 * The /--/ path segment is required for Expo Go to route deep links correctly.
 */
function buildOAuthDeepLink(params: {
  success: boolean;
  error?: string;
  message?: string;
}): string {
  const queryParams = new URLSearchParams();

  if (params.success) {
    queryParams.set('success', 'true');
  } else {
    if (params.error) queryParams.set('error', params.error);
    if (params.message) queryParams.set('message', params.message);
  }
  queryParams.set('provider', 'ebay');

  // Use Expo Go compatible URL if EXPO_DEV_URL is set
  if (env.EXPO_DEV_URL) {
    // Format: exp://192.168.1.50:8081/--/oauth/success?provider=ebay&success=true
    // The /--/ is required for Expo Go to recognize deep link paths
    const expoBase = env.EXPO_DEV_URL.replace(/\/$/, ''); // Remove trailing slash
    return `${expoBase}/--/oauth/success?${queryParams.toString()}`;
  }

  // Fallback to custom scheme (works in production builds)
  return `${env.MOBILE_DEEP_LINK_SCHEME}://oauth/success?${queryParams.toString()}`;
}

/**
 * Generate HTML page for OAuth callback
 * This page displays status and triggers mobile deep link
 *
 * Features:
 * - Auto-redirect via deep link with multiple attempts
 * - Clear status message and visual feedback
 * - Debug info for developers (collapsible)
 * - Fallback instructions if redirect fails
 */
function generateCallbackPage(
  success: boolean,
  message: string,
  deepLink: string | null,
  debugInfo?: { userId?: string; timestamp?: string; error?: string }
): string {
  const statusColor = success ? '#22c55e' : '#ef4444';
  const statusIcon = success ? '&#10003;' : '&#10007;';
  const statusText = success ? 'Connected!' : 'Connection Failed';
  const timestamp = new Date().toISOString();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ResellrAI - eBay ${success ? 'Connected' : 'Error'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container { text-align: center; padding: 40px; max-width: 420px; }
    .icon {
      width: 80px; height: 80px; border-radius: 50%;
      background: ${statusColor};
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 24px; font-size: 40px;
      animation: ${success ? 'pulse' : 'shake'} 0.5s ease-out;
    }
    @keyframes pulse {
      0% { transform: scale(0.8); opacity: 0; }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
    h1 { font-size: 28px; margin-bottom: 12px; }
    .message { color: #94a3b8; margin-bottom: 24px; line-height: 1.6; }
    .button {
      display: inline-block; background: #3b82f6; color: white;
      padding: 14px 28px; border-radius: 10px; text-decoration: none;
      font-weight: 600; font-size: 16px; transition: all 0.2s;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
    .button:hover { background: #2563eb; transform: translateY(-1px); }
    .button:active { transform: translateY(0); }
    .redirect-status {
      margin-top: 20px; padding: 12px 16px;
      background: rgba(255,255,255,0.1); border-radius: 8px;
      font-size: 14px; color: #cbd5e1;
    }
    .spinner {
      display: inline-block; width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff; border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 8px; vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .fallback {
      margin-top: 24px; padding-top: 24px;
      border-top: 1px solid rgba(255,255,255,0.1);
      font-size: 13px; color: #64748b;
    }
    .debug-toggle {
      margin-top: 32px; font-size: 12px; color: #475569;
      cursor: pointer; user-select: none;
    }
    .debug-toggle:hover { color: #64748b; }
    .debug-info {
      display: none; margin-top: 12px; padding: 12px;
      background: rgba(0,0,0,0.3); border-radius: 8px;
      text-align: left; font-family: monospace; font-size: 11px;
      color: #94a3b8; word-break: break-all;
    }
    .debug-info.show { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${statusIcon}</div>
    <h1>${statusText}</h1>
    <p class="message">${message}</p>

    ${deepLink ? `
      <a href="${deepLink}" class="button" id="openAppBtn">Open ResellrAI</a>

      <div class="redirect-status" id="redirectStatus">
        <span class="spinner"></span>
        <span id="statusText">Returning to app...</span>
      </div>

      <div class="fallback" id="fallback" style="display: none;">
        <p>If the app doesn't open automatically:</p>
        <p style="margin-top: 8px;">1. Tap the button above, or</p>
        <p>2. Switch back to the ResellrAI app manually</p>
      </div>

      <script>
        (function() {
          var deepLink = "${deepLink}";
          var attempts = 0;
          var maxAttempts = 3;
          var redirected = false;

          function tryRedirect() {
            attempts++;
            console.log('[OAuth Callback] Redirect attempt ' + attempts);

            // Try to open the deep link
            window.location.href = deepLink;

            // Check if we're still here after a delay
            setTimeout(function() {
              if (!redirected && attempts < maxAttempts) {
                document.getElementById('statusText').textContent =
                  'Trying again... (attempt ' + (attempts + 1) + ')';
                tryRedirect();
              } else if (!redirected) {
                // Show fallback after all attempts
                document.getElementById('redirectStatus').innerHTML =
                  'Automatic redirect may not have worked.';
                document.getElementById('fallback').style.display = 'block';
              }
            }, 2000);
          }

          // Start redirect after brief delay (allows page to render)
          setTimeout(function() {
            tryRedirect();
          }, 800);

          // Also detect if page becomes hidden (redirect worked)
          document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
              redirected = true;
              console.log('[OAuth Callback] Page hidden - redirect likely succeeded');
            }
          });
        })();
      </script>
    ` : `
      <p class="message">You can close this browser tab and return to the app.</p>
      <div class="fallback">
        <p>${success ? 'Your connection should be active when you return to the app.' : 'Please try connecting again from within the app.'}</p>
      </div>
    `}

    <div class="debug-toggle" onclick="toggleDebug()">
      Developer Info ▼
    </div>
    <div class="debug-info" id="debugInfo">
      <div>Status: ${success ? 'SUCCESS' : 'ERROR'}</div>
      <div>Timestamp: ${timestamp}</div>
      ${deepLink ? `<div>Deep Link: ${deepLink}</div>` : ''}
      ${debugInfo?.userId ? `<div>User ID: ${debugInfo.userId}</div>` : ''}
      ${debugInfo?.error ? `<div>Error: ${debugInfo.error}</div>` : ''}
      <div style="margin-top: 8px; color: #64748b;">
        If redirect fails, ensure RuName is configured correctly in eBay Developer Portal.
        Auth Accepted URL should point to: /api/v1/ebay/oauth/callback
      </div>
    </div>

    <script>
      function toggleDebug() {
        var info = document.getElementById('debugInfo');
        info.classList.toggle('show');
      }
    </script>
  </div>
</body>
</html>
  `.trim();
}

export default router;
