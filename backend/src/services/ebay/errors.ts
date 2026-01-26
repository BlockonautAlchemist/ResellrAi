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

  // eBay error ID based classification
  const errorIdNum = parseInt(ebayErrorId, 10);

  // Auth errors (1xxx)
  if (errorIdNum >= 1000 && errorIdNum < 2000) return 'EBAY_REAUTH_REQUIRED';

  // Validation errors (2xxx)
  if (errorIdNum >= 2000 && errorIdNum < 3000) return 'VALIDATION_ERROR';

  // Business logic errors (25xxx)
  if (errorIdNum >= 25000 && errorIdNum < 26000) return 'LISTING_INVALID';

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
