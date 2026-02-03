/**
 * eBay Error Handling Utilities
 *
 * Provides:
 * - Standardized error codes and messages
 * - Error classification for recovery actions
 * - Structured error responses
 * - Retry decision logic
 */

import {
  type EbayApiError,
  type EbayErrorRecoveryAction,
} from '../../types/ebay-schemas.js';

// =============================================================================
// ERROR CODES
// =============================================================================

export const EBAY_ERROR_CODES = {
  // Authentication errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  EBAY_NOT_CONNECTED: 'EBAY_NOT_CONNECTED',
  EBAY_REAUTH_REQUIRED: 'EBAY_REAUTH_REQUIRED',
  OAUTH_START_FAILED: 'OAUTH_START_FAILED',
  OAUTH_CALLBACK_FAILED: 'OAUTH_CALLBACK_FAILED',
  OAUTH_DENIED: 'OAUTH_DENIED',
  OAUTH_STATE_INVALID: 'OAUTH_STATE_INVALID',
  OAUTH_STATE_EXPIRED: 'OAUTH_STATE_EXPIRED',
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Configuration errors
  EBAY_NOT_CONFIGURED: 'EBAY_NOT_CONFIGURED',
  ENCRYPTION_NOT_CONFIGURED: 'ENCRYPTION_NOT_CONFIGURED',

  // Policy errors
  POLICIES_REQUIRED: 'POLICIES_REQUIRED',
  POLICIES_FETCH_FAILED: 'POLICIES_FETCH_FAILED',
  POLICIES_MISSING: 'POLICIES_MISSING',

  // Listing errors
  LISTING_NOT_FOUND: 'LISTING_NOT_FOUND',
  LISTING_INVALID: 'LISTING_INVALID',
  IMAGES_REQUIRED: 'IMAGES_REQUIRED',
  INVENTORY_ITEM_FAILED: 'INVENTORY_ITEM_FAILED',
  OFFER_CREATE_FAILED: 'OFFER_CREATE_FAILED',
  OFFER_PUBLISH_FAILED: 'OFFER_PUBLISH_FAILED',
  PUBLISH_ERROR: 'PUBLISH_ERROR',

  // Location errors (per EBAY_SOURCE_OF_TRUTH.md Section 7)
  LOCATION_REQUIRED: 'LOCATION_REQUIRED',
  LOCATION_CREATE_FAILED: 'LOCATION_CREATE_FAILED',
  LOCATION_INVALID: 'LOCATION_INVALID',
  LOCATIONS_FETCH_FAILED: 'LOCATIONS_FETCH_FAILED',
  EBAY_ADDRESS_INCOMPLETE: 'EBAY_ADDRESS_INCOMPLETE',
  LOCATION_NOT_ENABLED: 'LOCATION_NOT_ENABLED',

  // Validation errors (publish pre-validation)
  VALIDATION_TITLE_REQUIRED: 'VALIDATION_TITLE_REQUIRED',
  VALIDATION_TITLE_TOO_LONG: 'VALIDATION_TITLE_TOO_LONG',
  VALIDATION_DESCRIPTION_REQUIRED: 'VALIDATION_DESCRIPTION_REQUIRED',
  VALIDATION_DESCRIPTION_TOO_LONG: 'VALIDATION_DESCRIPTION_TOO_LONG',
  VALIDATION_NO_IMAGES: 'VALIDATION_NO_IMAGES',
  VALIDATION_TOO_MANY_IMAGES: 'VALIDATION_TOO_MANY_IMAGES',
  VALIDATION_INVALID_CONDITION: 'VALIDATION_INVALID_CONDITION',
  VALIDATION_CATEGORY_REQUIRED: 'VALIDATION_CATEGORY_REQUIRED',
  VALIDATION_INVALID_PRICE: 'VALIDATION_INVALID_PRICE',
  VALIDATION_INVALID_QUANTITY: 'VALIDATION_INVALID_QUANTITY',
  VALIDATION_POLICIES_INCOMPLETE: 'VALIDATION_POLICIES_INCOMPLETE',
  VALIDATION_LOCATION_REQUIRED: 'VALIDATION_LOCATION_REQUIRED',

  // eBay business errors (per EBAY_SOURCE_OF_TRUTH.md Section 9)
  SELLING_LIMIT_EXCEEDED: 'SELLING_LIMIT_EXCEEDED',
  CATEGORY_RESTRICTED: 'CATEGORY_RESTRICTED',
  DUPLICATE_LISTING: 'DUPLICATE_LISTING',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',

  // Comps errors
  COMPS_FETCH_FAILED: 'COMPS_FETCH_FAILED',

  // API errors
  RATE_LIMITED: 'RATE_LIMITED',
  EBAY_API_ERROR: 'EBAY_API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Generic errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type EbayErrorCode = typeof EBAY_ERROR_CODES[keyof typeof EBAY_ERROR_CODES];

// =============================================================================
// ERROR MESSAGES
// =============================================================================

export const EBAY_ERROR_MESSAGES: Record<EbayErrorCode, string> = {
  // Authentication
  AUTH_REQUIRED: 'User authentication required',
  EBAY_NOT_CONNECTED: 'Please connect your eBay account first',
  EBAY_REAUTH_REQUIRED: 'Your eBay session has expired. Please reconnect your account.',
  OAUTH_START_FAILED: 'Failed to start eBay authorization',
  OAUTH_CALLBACK_FAILED: 'Failed to complete eBay authorization',
  OAUTH_DENIED: 'eBay authorization was denied',
  OAUTH_STATE_INVALID: 'Invalid authorization state. Please try again.',
  OAUTH_STATE_EXPIRED: 'Authorization session expired. Please try again.',
  TOKEN_REFRESH_FAILED: 'Failed to refresh eBay session',
  TOKEN_EXPIRED: 'eBay session expired',

  // Configuration
  EBAY_NOT_CONFIGURED: 'eBay integration is not configured on this server',
  ENCRYPTION_NOT_CONFIGURED: 'Token encryption is not configured',

  // Policies
  POLICIES_REQUIRED: 'Business policies are required to publish. Select from your eBay policies.',
  POLICIES_FETCH_FAILED: 'Failed to fetch your eBay business policies',
  POLICIES_MISSING: 'Missing required business policies. Please configure them in eBay Seller Hub.',

  // Listing
  LISTING_NOT_FOUND: 'Listing not found',
  LISTING_INVALID: 'Listing is missing required fields',
  IMAGES_REQUIRED: 'At least one image is required',
  INVENTORY_ITEM_FAILED: 'Failed to create item on eBay',
  OFFER_CREATE_FAILED: 'Failed to create offer on eBay',
  OFFER_PUBLISH_FAILED: 'Failed to publish listing to eBay',
  PUBLISH_ERROR: 'An error occurred while publishing',

  // Location (per EBAY_SOURCE_OF_TRUTH.md Section 7)
  LOCATION_REQUIRED: 'Please set up a shipping location before listing',
  LOCATION_CREATE_FAILED: 'Failed to create shipping location on eBay',
  LOCATION_INVALID: 'Invalid location address. Please provide city/state or postal code.',
  LOCATIONS_FETCH_FAILED: 'Failed to fetch shipping locations',
  EBAY_ADDRESS_INCOMPLETE: 'US locations require city, state, AND postal code',
  LOCATION_NOT_ENABLED: 'Inventory location exists but is not ENABLED. Please enable it in eBay Seller Hub.',

  // Validation errors
  VALIDATION_TITLE_REQUIRED: 'Title is required',
  VALIDATION_TITLE_TOO_LONG: 'Title exceeds maximum length of 80 characters',
  VALIDATION_DESCRIPTION_REQUIRED: 'Description is required',
  VALIDATION_DESCRIPTION_TOO_LONG: 'Description exceeds maximum length of 4000 characters',
  VALIDATION_NO_IMAGES: 'At least one image is required',
  VALIDATION_TOO_MANY_IMAGES: 'Maximum 12 images allowed',
  VALIDATION_INVALID_CONDITION: 'Invalid condition value',
  VALIDATION_CATEGORY_REQUIRED: 'Category ID is required',
  VALIDATION_INVALID_PRICE: 'Price must be greater than 0',
  VALIDATION_INVALID_QUANTITY: 'Quantity must be at least 1',
  VALIDATION_POLICIES_INCOMPLETE: 'All 3 policy IDs are required (fulfillment, payment, return)',
  VALIDATION_LOCATION_REQUIRED: 'Merchant location key is required',

  // eBay business errors (per EBAY_SOURCE_OF_TRUTH.md Section 9)
  SELLING_LIMIT_EXCEEDED: "You've reached your eBay selling limit. Request higher limits in eBay Seller Hub.",
  CATEGORY_RESTRICTED: 'This category requires approval. Check eBay Seller Hub for requirements.',
  DUPLICATE_LISTING: 'You already have a similar listing active. Use multi-quantity instead of duplicates.',
  ACCOUNT_SUSPENDED: 'Your eBay selling privileges are restricted. Check your eBay account status.',

  // Comps
  COMPS_FETCH_FAILED: 'Failed to fetch pricing comparables',

  // API
  RATE_LIMITED: 'Too many requests. Please wait and try again.',
  EBAY_API_ERROR: 'eBay service error',
  NETWORK_ERROR: 'Network connection error',
  TIMEOUT_ERROR: 'Request timed out',

  // Validation
  VALIDATION_ERROR: 'Invalid request data',

  // Generic
  INTERNAL_ERROR: 'An internal error occurred',
  UNKNOWN_ERROR: 'An unknown error occurred',
};

// =============================================================================
// RECOVERY ACTIONS
// =============================================================================

const RECOVERY_ACTIONS: Record<EbayErrorCode, EbayErrorRecoveryAction> = {
  // Auth errors - need reauth
  AUTH_REQUIRED: 'reauth',
  EBAY_NOT_CONNECTED: 'reauth',
  EBAY_REAUTH_REQUIRED: 'reauth',
  OAUTH_DENIED: 'reauth',
  OAUTH_STATE_INVALID: 'reauth',
  OAUTH_STATE_EXPIRED: 'reauth',
  TOKEN_REFRESH_FAILED: 'reauth',
  TOKEN_EXPIRED: 'reauth',

  // Retry-able errors
  OAUTH_START_FAILED: 'retry',
  OAUTH_CALLBACK_FAILED: 'retry',
  RATE_LIMITED: 'retry',
  NETWORK_ERROR: 'retry',
  TIMEOUT_ERROR: 'retry',
  EBAY_API_ERROR: 'retry',
  COMPS_FETCH_FAILED: 'retry',

  // User action needed
  POLICIES_REQUIRED: 'none',
  POLICIES_MISSING: 'none',
  LISTING_INVALID: 'none',
  IMAGES_REQUIRED: 'none',
  VALIDATION_ERROR: 'none',

  // Non-recoverable
  EBAY_NOT_CONFIGURED: 'contact_support',
  ENCRYPTION_NOT_CONFIGURED: 'contact_support',
  LISTING_NOT_FOUND: 'none',
  POLICIES_FETCH_FAILED: 'retry',
  INVENTORY_ITEM_FAILED: 'retry',
  OFFER_CREATE_FAILED: 'retry',
  OFFER_PUBLISH_FAILED: 'retry',
  PUBLISH_ERROR: 'retry',
  INTERNAL_ERROR: 'contact_support',
  UNKNOWN_ERROR: 'contact_support',

  // Location errors
  LOCATION_REQUIRED: 'none', // User must set up location
  LOCATION_CREATE_FAILED: 'retry',
  LOCATION_INVALID: 'none', // User must fix address
  LOCATIONS_FETCH_FAILED: 'retry',
  EBAY_ADDRESS_INCOMPLETE: 'none', // User must provide complete address
  LOCATION_NOT_ENABLED: 'none', // User must enable via eBay Seller Hub

  // Business errors - user must resolve via eBay
  SELLING_LIMIT_EXCEEDED: 'none',
  CATEGORY_RESTRICTED: 'none',
  DUPLICATE_LISTING: 'none',
  ACCOUNT_SUSPENDED: 'none',

  // Validation errors - user must fix input
  VALIDATION_TITLE_REQUIRED: 'none',
  VALIDATION_TITLE_TOO_LONG: 'none',
  VALIDATION_DESCRIPTION_REQUIRED: 'none',
  VALIDATION_DESCRIPTION_TOO_LONG: 'none',
  VALIDATION_NO_IMAGES: 'none',
  VALIDATION_TOO_MANY_IMAGES: 'none',
  VALIDATION_INVALID_CONDITION: 'none',
  VALIDATION_CATEGORY_REQUIRED: 'none',
  VALIDATION_INVALID_PRICE: 'none',
  VALIDATION_INVALID_QUANTITY: 'none',
  VALIDATION_POLICIES_INCOMPLETE: 'none',
  VALIDATION_LOCATION_REQUIRED: 'none',
};

// =============================================================================
// ERROR BUILDER
// =============================================================================

/**
 * Build a standardized eBay API error response
 */
export function buildEbayError(
  code: EbayErrorCode,
  customMessage?: string,
  ebayErrorId?: string,
  retryAfter?: number
): EbayApiError {
  const message = customMessage || EBAY_ERROR_MESSAGES[code];
  const action = RECOVERY_ACTIONS[code];

  const error: EbayApiError = {
    error: {
      code,
      message,
      ebay_error_id: ebayErrorId,
    },
    request_id: generateRequestId(),
    timestamp: new Date().toISOString(),
  };

  // Add recovery info
  if (action !== 'none') {
    error.recovery = {
      action,
      retry_after: action === 'retry' ? (retryAfter || getDefaultRetryAfter(code)) : undefined,
      message: getRecoveryMessage(code, action),
    };
  }

  return error;
}

/**
 * Create an error response object for Express
 */
export function createErrorResponse(
  code: EbayErrorCode,
  customMessage?: string,
  details?: Record<string, unknown>
): { error: EbayApiError['error']; recovery?: EbayApiError['recovery']; details?: Record<string, unknown> } {
  const ebayError = buildEbayError(code, customMessage);

  return {
    error: ebayError.error,
    recovery: ebayError.recovery,
    details,
  };
}

// =============================================================================
// RETRY LOGIC
// =============================================================================

/**
 * Determine if an error is retryable
 */
export function isRetryableError(code: EbayErrorCode): boolean {
  return RECOVERY_ACTIONS[code] === 'retry';
}

/**
 * Determine if an error requires re-authentication
 */
export function requiresReauth(code: EbayErrorCode): boolean {
  return RECOVERY_ACTIONS[code] === 'reauth';
}

/**
 * Get default retry delay for an error code
 */
function getDefaultRetryAfter(code: EbayErrorCode): number {
  switch (code) {
    case 'RATE_LIMITED':
      return 60; // 1 minute
    case 'NETWORK_ERROR':
    case 'TIMEOUT_ERROR':
      return 5; // 5 seconds
    case 'EBAY_API_ERROR':
      return 10; // 10 seconds
    default:
      return 5;
  }
}

/**
 * Get recovery message for user
 */
function getRecoveryMessage(code: EbayErrorCode, action: EbayErrorRecoveryAction): string {
  switch (action) {
    case 'reauth':
      return 'Please reconnect your eBay account';
    case 'retry':
      return 'Please try again in a few moments';
    case 'contact_support':
      return 'Please contact support if this issue persists';
    default:
      return '';
  }
}

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

// =============================================================================
// ERROR CLASSIFICATION FROM EBAY RESPONSES
// =============================================================================

/**
 * Map eBay error codes to our internal codes
 *
 * Per EBAY_SOURCE_OF_TRUTH.md Section 9, specific error codes:
 * - 21919188: Monthly selling limit exceeded
 * - 21916013: Item selling limit exceeded
 * - 25003: merchantLocationKey required
 */
export function classifyEbayError(
  ebayErrorId: string,
  httpStatus: number
): EbayErrorCode {
  // HTTP status based classification
  if (httpStatus === 401) return 'TOKEN_EXPIRED';
  if (httpStatus === 403) return 'EBAY_REAUTH_REQUIRED';
  if (httpStatus === 429) return 'RATE_LIMITED';
  if (httpStatus >= 500) return 'EBAY_API_ERROR';

  // Specific eBay error ID mappings (per EBAY_SOURCE_OF_TRUTH.md Section 9)
  const EBAY_ERROR_ID_MAP: Record<string, EbayErrorCode> = {
    // Selling limit errors
    '21919188': 'SELLING_LIMIT_EXCEEDED', // Monthly limit
    '21916013': 'SELLING_LIMIT_EXCEEDED', // Item limit
    '21919144': 'RATE_LIMITED', // Call rate limit (seller-level)

    // Inventory/location errors
    '25003': 'LOCATION_REQUIRED', // merchantLocationKey missing

    // Duplicate listing
    '21916012': 'DUPLICATE_LISTING',

    // Category/policy restrictions
    '21916014': 'CATEGORY_RESTRICTED',
    '21916289': 'POLICIES_MISSING',
  };

  // Check for specific error IDs first
  if (EBAY_ERROR_ID_MAP[ebayErrorId]) {
    return EBAY_ERROR_ID_MAP[ebayErrorId];
  }

  // Fall back to range-based classification
  const errorIdNum = parseInt(ebayErrorId, 10);

  // Auth errors (1xxx)
  if (errorIdNum >= 1000 && errorIdNum < 2000) return 'EBAY_REAUTH_REQUIRED';

  // Validation errors (2xxx)
  if (errorIdNum >= 2000 && errorIdNum < 3000) return 'VALIDATION_ERROR';

  // Business logic errors (25xxx) - inventory/offer related
  if (errorIdNum >= 25000 && errorIdNum < 26000) return 'LISTING_INVALID';

  // Selling limit errors (21919xxx range)
  if (errorIdNum >= 21919000 && errorIdNum < 21920000) return 'SELLING_LIMIT_EXCEEDED';

  return 'EBAY_API_ERROR';
}

// =============================================================================
// LOGGING
// =============================================================================

/**
 * Log an error with context
 */
export function logEbayError(
  context: string,
  code: EbayErrorCode,
  error?: unknown,
  metadata?: Record<string, unknown>
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    context,
    code,
    message: EBAY_ERROR_MESSAGES[code],
    error: error instanceof Error ? error.message : error,
    metadata,
  };

  console.error(`[eBay Error] ${context}:`, JSON.stringify(logEntry, null, 2));
}

// =============================================================================
// EBAY ERROR PARSING
// =============================================================================

/**
 * eBay API error response structure
 */
interface EbayErrorBody {
  errors?: Array<{
    errorId: string;
    domain?: string;
    category?: string;
    message: string;
    longMessage?: string;
    parameters?: Array<{ name: string; value: string }>;
  }>;
}

/**
 * Parsed eBay error with our internal code
 */
export interface ParsedEbayError {
  code: EbayErrorCode;
  message: string;
  ebayErrorId?: string;
  ebayMessage?: string;
  action: string;
}

/**
 * Parse eBay API error response body and map to our internal codes
 */
export function parseEbayErrorBody(
  body: unknown,
  statusCode: number
): ParsedEbayError {
  // Default error
  const defaultError: ParsedEbayError = {
    code: 'EBAY_API_ERROR',
    message: `eBay API returned HTTP ${statusCode}`,
    action: 'retry',
  };

  if (!body || typeof body !== 'object') {
    return defaultError;
  }

  const errorBody = body as EbayErrorBody;
  if (!errorBody.errors || errorBody.errors.length === 0) {
    return defaultError;
  }

  const firstError = errorBody.errors[0];
  const ebayErrorId = firstError.errorId;
  const ebayMessage = firstError.longMessage || firstError.message;

  // Map eBay error ID to our internal code
  const internalCode = classifyEbayError(ebayErrorId, statusCode);
  const action = RECOVERY_ACTIONS[internalCode] || 'none';

  return {
    code: internalCode,
    message: EBAY_ERROR_MESSAGES[internalCode] || ebayMessage,
    ebayErrorId,
    ebayMessage,
    action,
  };
}

/**
 * Common eBay error ID to our code mappings
 * Per EBAY_SOURCE_OF_TRUTH.md Section 9
 */
export const EBAY_ERROR_ID_MAPPINGS: Record<string, { code: EbayErrorCode; action: string }> = {
  '25003': { code: 'LOCATION_REQUIRED', action: 'create_location' },
  '2004': { code: 'EBAY_ADDRESS_INCOMPLETE', action: 'needs_location' },
  '21919188': { code: 'SELLING_LIMIT_EXCEEDED', action: 'contact_support' },
  '21916012': { code: 'DUPLICATE_LISTING', action: 'none' },
  '21916013': { code: 'SELLING_LIMIT_EXCEEDED', action: 'contact_support' },
  '21916014': { code: 'CATEGORY_RESTRICTED', action: 'none' },
  '21916289': { code: 'POLICIES_MISSING', action: 'none' },
};

/**
 * Build a structured publish error response
 */
export function buildPublishError(
  code: EbayErrorCode,
  message: string,
  traceId: string,
  ebayErrorId?: string
): {
  error: {
    code: string;
    message: string;
    action: string;
    ebay_error_id?: string;
  };
  traceId: string;
} {
  const action = RECOVERY_ACTIONS[code] || 'none';
  const actionString = action === 'none' ? 'check_details' : action;

  return {
    error: {
      code,
      message,
      action: actionString,
      ...(ebayErrorId && { ebay_error_id: ebayErrorId }),
    },
    traceId,
  };
}
