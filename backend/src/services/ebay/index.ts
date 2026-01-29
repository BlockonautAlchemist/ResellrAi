/**
 * eBay Services Module
 *
 * Exports all eBay integration services.
 */

// Auth service
export { EbayAuthService, getEbayAuthService } from './auth.js';

// Comps service
export { EbayCompsService, getEbayCompsService } from './comps.js';

// Policy service
export { EbayPolicyService, getEbayPolicyService } from './policy.js';

// Location service (required for publishing - EBAY_SOURCE_OF_TRUTH.md Section 7)
export { EbayLocationService, getEbayLocationService } from './location.js';

// Listing service
export { EbayListingService, getEbayListingService } from './listing.js';

// API client
export { EbayApiClient, getEbayClient, isEbayAvailable, type EbayTokenResponse } from './client.js';

// Token encryption utilities
export {
  encryptToken,
  decryptToken,
  generateOAuthState,
  isEncryptionConfigured,
  validateEncryptionKey,
} from './token-crypto.js';

// Error handling utilities
export {
  EBAY_ERROR_CODES,
  EBAY_ERROR_MESSAGES,
  buildEbayError,
  createErrorResponse,
  isRetryableError,
  requiresReauth,
  classifyEbayError,
  logEbayError,
  type EbayErrorCode,
} from './errors.js';
